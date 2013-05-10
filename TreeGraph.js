/*!
 * Tree graph with HTML5 and JavaScript.
 * Date: Sep 17, 2012.
 * Dependencies: none.
 * Source: https://github.com/rodrigocfd/html5-tree-graph
 *
 * Copyright (c) 2012 Rodrigo Cesar de Freitas Dias
 * Released under the MIT license, see license.txt for details.
 */

function TreeGraph(canvasId) {
	var CONSTANTS = {
		xBoxPadding: 4,
		yNodePadding: 5,
		xMinPadding: 30,
		yBranchGap: 10,
		xBezierRadius: 14,
		imgSize: 22, // if not null, will force size for all images
		font: '11pt "Times New Roman"',
		bgColor: 'rgba(255,255,255,0.5)', // default for nodes without color
		textColor: '#121212',
		borderColor: '#888',
		lineColor: '#AAA',
		animateTime: 100,
		storageKey: 'TreeGraph_' + canvasId
	};

	var Us = {
		retObj: { }, // object to be returned to TreeGraph() function caller
		context: document.getElementById(canvasId).getContext('2d'),
		rootNode: null,
		callbacks: { Click:null, CtrlClick:null },
		isRendering: false,
		isDragging: false,
		baseDragPos: null // when dragging, this is set
	};

	var Util = {
		AddPropertiesIfNotExist: function AddPropertiesIfNotExist(target, otherObj) {
			if(target === undefined) target = { };
			for(var prop in otherObj) { // http://stackoverflow.com/questions/12317003/something-like-jquery-extend-but-standalone
				if(target[prop] === undefined) {
					if(otherObj[prop] !== null && typeof otherObj[prop] === 'object') {
						if(otherObj[prop] instanceof Array) { // http://javascript.crockford.com/remedial.html
							target[prop] = [];
							for(var i = 0; i < otherObj[prop].length; ++i)
								target[prop].push(AddPropertiesIfNotExist({ }, otherObj[prop]));
						} else {
							AddPropertiesIfNotExist(target[prop], otherObj[prop]);
						}
					} else {
						target[prop] = otherObj[prop];
					}
				}
			}
			return target;
		},

		GetPos: function(obj) {
			// http://www.codingforums.com/showthread.php?t=126325
			var ret = { x:obj.offsetLeft, y:obj.offsetTop };
			while(obj.offsetParent) {
				if(obj === document.getElementsByTagName('body')[0]) {
					break;
				} else {
					ret.x += obj.offsetParent.offsetLeft;
					ret.y += obj.offsetParent.offsetTop;
					obj = obj.offsetParent;
				}
			}
			return ret;
		},

		CalcTextRect: function CalcTextRect(context, text) {
			if(CalcTextRect.cache === undefined)
				CalcTextRect.cache = []; // static variable to cache the calculated heights
			if(CalcTextRect.cache[context.font] === undefined) {
				var span = document.createElement('span'),
					body = document.getElementsByTagName('body')[0];
				span.style.font = context.font;
				span.textContent = 'gM'; // http://www.html5rocks.com/en/tutorials/canvas/texteffects/
				body.appendChild(span);
				CalcTextRect.cache[context.font] = span.offsetHeight;
				body.removeChild(span);
			}
			return {
				cx: context.measureText(text).width + CONSTANTS.xBoxPadding * 2,
				cy: CalcTextRect.cache[context.font]
			};
		},

		DrawRect: function(context, x, y, cx, cy, borderColor, bgColor) {
			x += 0.5; y += 0.5; // http://stackoverflow.com/questions/7545013/canvas-draws-lines-too-thick
			context.save();
			if(borderColor !== undefined && borderColor !== null)
				context.strokeStyle = borderColor;
			context.beginPath();
			context.rect(x, y, cx, cy);
			if(bgColor !== undefined && bgColor !== null) {
				context.fillStyle = bgColor;
				context.fill();
			}
			context.stroke();
			context.restore();
		},

		DrawBezier: function(context, x0, y0, x1, y1) {
			context.beginPath();
			context.moveTo(x0, y0);
			context.bezierCurveTo(x0 + CONSTANTS.xBezierRadius, y0,
				x1 - CONSTANTS.xBezierRadius, y1,
				x1, y1);
			context.stroke(); // use current strokeStyle
		},

		DrawHalfCircle: function(context, x, y) {
			context.beginPath();
			context.arc(x, y, 4, Math.PI * 0.5, Math.PI * 1.5, true);
			context.stroke(); // use current strokeStyle
		},

		Animate: function(duration, AnimateCallback, DoneCallback) {
			var RequestAnimationFrame = window.mozRequestAnimationFrame ||
				window.webkitRequestAnimationFrame;
			var t0 = window.mozAnimationStartTime || Date.now();
			var Redraw = function(timestamp) {
				var elapsed = (timestamp || Date.now()) - t0;
				var pct = elapsed / duration;
				if(pct > 1) pct = 1;
				AnimateCallback.call(window, pct);
				if(pct < 1)
					RequestAnimationFrame(Redraw);
				else if(DoneCallback !== undefined && DoneCallback !== null)
					DoneCallback.call(window);
			};
			RequestAnimationFrame(Redraw);
		}
	};

	var Node = {
		FlushToStorage: function() {
			function StripNode(node) {
				var ret = {
					text: node.text,
					isExpanded: node.isExpanded,
					pos: { x:node.rect.x, y:node.rect.y }, // current node position
					children: []
				};
				for(var i = 0; i < node.children.length; ++i)
					ret.children.push(StripNode(node.children[i]));
				return ret;
			}
			localStorage.setItem(CONSTANTS.storageKey,
				JSON.stringify( StripNode(Us.rootNode) ));
		},

		CheckStorage: function() {
			var oldTree = null;
			if(localStorage.getItem(CONSTANTS.storageKey) !== null) { // we previously stored this tree
				function IsSameTree(root1, root2) {
					if(root1 === null || root2 === null) {
						return false;
					} else if(root1.text !== root2.text || root1.children.length !== root2.children.length) {
						return false;
					} else {
						for(var i = 0; i < root1.children.length; ++i)
							if(!IsSameTree(root1.children[i], root2.children[i]))
								return false;
					}
					return true;
				}
				oldTree = JSON.parse(localStorage.getItem(CONSTANTS.storageKey));
				if(IsSameTree(Us.rootNode, oldTree)) { // we're reloading the tree, so copy the node folding
					function CopyNodeFolding(destNode, srcNode) {
						destNode.isExpanded = srcNode.isExpanded;
						for(var i = 0; i < destNode.children.length; ++i) // supposedly the same tree
							CopyNodeFolding(destNode.children[i], srcNode.children[i]);
					}
					CopyNodeFolding(Us.rootNode, oldTree);
				} else { // tree structure has changed
					oldTree = null;
					Node.FlushToStorage();
				}
			} else { // this tree never have been stored
				Node.FlushToStorage();
			}
			return oldTree;
		},

		Load: function(rootNode) {
			Us.context.save();
			Us.context.font = CONSTANTS.font;
			Us.rootNode = rootNode;
			Node.Init();
			var oldTree = Node.CheckStorage();
			Node.LoadImages(function() {
				var matrix = Node.VisibleMatrix(); // first positioning
				Placement.Calc(matrix);
				if(oldTree !== null) { // this tree is being reloaded
					function SetPosFromOldNode(destNode, srcNode) {
						destNode.posSch = { x:srcNode.pos.x, y:srcNode.pos.y }; // schedule
						for(var i = 0; i < destNode.children.length; ++i) // supposedly the same tree
							SetPosFromOldNode(destNode.children[i], srcNode.children[i]);
					}
					if(oldTree.pos.x == 0 && oldTree.pos.y == 0) Placement.ResetRootPos(matrix); // previous tree was neved moved
					else SetPosFromOldNode(Us.rootNode, oldTree);
				} else { // this tree has never been stored
					Placement.ResetRootPos(matrix);
				}
				Node.Render(matrix);
				var events = [ 'mousedown', 'mouseup', 'mouseout', 'mousemove', 'click', 'selectstart' ];
				var handlers = [ Events.MouseDown, Events.MouseUp, Events.MouseOut,
					Events.MouseMove, Events.Click, Events.SelectStart ];
				for(var i = 0; i < events.length; ++i) {
					Us.context.canvas.removeEventListener(events[i], handlers[i]);
					Us.context.canvas.addEventListener(events[i], handlers[i]);
				}
				Us.context.restore();
			});
		},

		Init: function Init() {
			if(Init.seq === undefined)
				Init.seq = 0; // static variable to hold the unique ID
			function SetupNode(node, depth, parent) {
				Util.AddPropertiesIfNotExist(node, { // these are the properties available to the user
					text: '(NO TEXT)',
					children: [],
					color: CONSTANTS.bgColor,
					image: null, // URL
					data: null // any user data, will be preserved when returning the node at events
				});
				node.id = Init.seq++;
				node.parent = function() { return parent; };
				node.depth = depth;
				node.isExpanded = false;
				node.imageObj = null; // created if an URL exists in 'image' property
				var rcText = Util.CalcTextRect(Us.context, node.text);
				node.rect = { x:0, y:0, cx:rcText.cx, cy:rcText.cy };
				node.posSch = null; // scheduled position to move to; {x,y}
				node.posTmp = null; // used within animation
				for(var i = 0; i < node.children.length; ++i)
					SetupNode(node.children[i], depth + 1, node);
			}
			SetupNode(Us.rootNode, 0, null);
		},

		LoadImages: function(OnComplete) {
			var total = 0; // how many images in the whole tree
			function CountImages(node) {
				total += (node.image === null) ? 0 : 1;
				for(var i = 0; i < node.children.length; ++i)
					CountImages(node.children[i]);
			}
			function CreateImageObj(node) {
				function ImageDone(status) {
					if(status.type === 'error') // won't affect the rendering, image just won't show
						console.log('Failed to load ' + status.target.src + '".');
					if(--total === 0 && OnComplete !== undefined)
						OnComplete();
				}
				if(node.image !== null) {
					node.imageObj = new Image();
					node.imageObj.src = node.image;
					node.imageObj.onload = function(status) { // image successfully loaded
						node.rect.cx += (CONSTANTS.imgSize !== null ? CONSTANTS.imgSize : node.imageObj.width) + 1;
						node.rect.cy = Math.max(node.rect.cy,
							(CONSTANTS.imgSize !== null ? CONSTANTS.imgSize : node.imageObj.height) + 1);
						ImageDone(status);
					};
					node.imageObj.onerror = function(status) { // image failed to load
						node.imageObj = null;
						ImageDone(status);
					};
				}
				for(var i = 0; i < node.children.length; ++i)
					CreateImageObj(node.children[i]);
			}
			CountImages(Us.rootNode);
			if(total === 0) { // no images to render
				if(OnComplete !== undefined) OnComplete();
			} else {
				CreateImageObj(Us.rootNode); // preload all images
			}
		},

		VisibleMatrix: function() {
			var matrix = []; // a linear view of the nodes that should be rendered
			function CreateMatrix(node) {
				if(matrix[node.depth] === undefined)
					matrix[node.depth] = [];
				matrix[node.depth].push(node);
				if(node.isExpanded)
					for(var i = 0; i < node.children.length; ++i)
						CreateMatrix(node.children[i]);
			}
			if(Us.rootNode !== null) CreateMatrix(Us.rootNode);
			return matrix;
		},

		Count: function() {
			function CountChildren(node) {
				var c = 1;
				for(var i = 0; i < node.children.length; ++i)
					c += CountChildren(node.children[i]);
				return c;
			}
			return CountChildren(Us.rootNode); // whole tree node count
		},

		AtPoint: function(x, y, visibleMatrix) {
			for(var i = 0; i < visibleMatrix.length; ++i) {
				for(var j = 0; j < visibleMatrix[i].length; ++j) {
					var node = visibleMatrix[i][j];
					if( (x >= node.rect.x) && (x < node.rect.x + node.rect.cx) &&
						(y >= node.rect.y) && (y < node.rect.y + node.rect.cy + 4) ) return node; // 4px adjustment, dunno why
				}
			}
			return null; // no node at given point
		},

		CollapseAll: function() {
			if(Us.isRendering) return;
			var matrix = Node.VisibleMatrix();
			for(var i = 0; i < matrix.length; ++i) {
				for(var j = 0; j < matrix[i].length; ++j) {
					matrix[i][j].posSch = { x:0, y:CONSTANTS.yNodePadding };
					matrix[i][j].isExpanded = false;
				}
			}
			Placement.ResetRootPos(matrix);
			Node.Render(matrix, function() {
				Us.rootNode.isExpanded = false;
				matrix = Node.VisibleMatrix();
				Placement.Calc(matrix);
				Placement.ResetRootPos(matrix);
				Node.Render(matrix, function() { // no animation, remove collapsed
					Node.FlushToStorage();
				});
			});
		},

		ExpandAll: function() {
			if(Us.isRendering) return;
			function MakeExpand(node) {
				if(node.children.length === 0) return;
				node.isExpanded = true;
				for(var i = 0; i < node.children.length; ++i)
					MakeExpand(node.children[i]);
			}
			MakeExpand(Us.rootNode);
			var matrix = Node.VisibleMatrix(); // will have all the nodes
			Placement.Calc(matrix);
			Placement.ResetRootPos(matrix);
			Node.Render(matrix, function() { Node.FlushToStorage(); });
		},

		FitParentContainer: function() {
			// Sample container that fills a whole page:
			// div#one { width:100%; height:100%; }
			Us.context.canvas.style.width = '100%';
			Us.context.canvas.style.height = '100%';
			Us.context.canvas.width = Us.context.canvas.offsetWidth;
			Us.context.canvas.height = Us.context.canvas.offsetHeight;
			Node.Render(Node.VisibleMatrix()); // redraw
		},

		Paint: function(visibleMatrix, pct) {
			Us.context.save();
			Us.context.clearRect(0, 0, Us.context.canvas.width, Us.context.canvas.height);
			Us.context.font = CONSTANTS.font;
			Us.context.textBaseline = 'middle';
			for(var i = 0; i < visibleMatrix.length; ++i) {
				for(var j = 0; j < visibleMatrix[i].length; ++j) {
					var node = visibleMatrix[i][j];
					node.posTmp = { x:node.rect.x, y:node.rect.y };
					if(node.posSch !== null) { // will move
						node.posTmp.x += (node.posSch.x - node.posTmp.x) * pct; // pct 0 to 1
						node.posTmp.y += (node.posSch.y - node.posTmp.y) * pct;
					}
					Us.context.save();
					Us.context.strokeStyle = CONSTANTS.lineColor;
					var parent = node.parent();
					if(parent !== null) {
						Util.DrawBezier(Us.context, // apply coordinate translation
							parent.posTmp.x + parent.rect.cx,
							parent.posTmp.y + parent.rect.cy / 2,
							node.posTmp.x,
							node.posTmp.y + node.rect.cy / 2);
					}
					if(node.children.length > 0 && !node.isExpanded) {
						Util.DrawHalfCircle(Us.context,
							node.posTmp.x + node.rect.cx + 1,
							node.posTmp.y + node.rect.cy / 2 + 1);
					}
					Us.context.restore();
					Util.DrawRect(Us.context,
						node.posTmp.x, node.posTmp.y,
						node.rect.cx, node.rect.cy,
						CONSTANTS.borderColor, node.color);
					if(node.imageObj !== null) {
						if(CONSTANTS.imgSize !== null) { // force image size
							Us.context.drawImage(node.imageObj,
								node.posTmp.x + 1, node.posTmp.y + 1,
								CONSTANTS.imgSize, CONSTANTS.imgSize);
						} else {
							Us.context.drawImage(node.imageObj,
								node.posTmp.x + 1, node.posTmp.y + 1);
						}
					}
					Us.context.save();
					Us.context.fillStyle = CONSTANTS.textColor;
					Us.context.fillText(node.text,
						node.posTmp.x + CONSTANTS.xBoxPadding +
							(node.imageObj !== null ?
								(CONSTANTS.imgSize !== null ? CONSTANTS.imgSize : node.imageObj.width) + 1
							: 0),
						node.posTmp.y + node.rect.cy / 2);
					Us.context.restore();
				}
			}
			Us.context.restore();
		},

		Render: function(visibleMatrix, OnComplete) {
			function HasMove(visibleMatrix) {
				for(var i = 0; i < visibleMatrix.length; ++i)
					for(var j = 0; j < visibleMatrix[i].length; ++j)
						if(visibleMatrix[i][j].posSch !== null)
							return true; // at least one node will be moved
				return false;
			}
			if(Us.isRendering) return;
			Us.isRendering = true; // set blocking flag
			if(HasMove(visibleMatrix)) {
				Util.Animate(CONSTANTS.animateTime, function(pct) {
					Node.Paint(visibleMatrix, pct);
				}, function() { // when animation is finished
					for(var i = 0; i < visibleMatrix.length; ++i) {
						for(var j = 0; j < visibleMatrix[i].length; ++j) {
							var node = visibleMatrix[i][j];
							if(node.posSch !== null) {
								node.rect.x = node.posSch.x; // scheduled pos is the current pos now
								node.rect.y = node.posSch.y;
								node.posSch = null; // remove pos scheduling
								node.posTmp = null;
							}
						}
					}
					Us.isRendering = false; // clear blocking flag
					if(OnComplete !== undefined) OnComplete();
				});
			} else {
				Node.Paint(visibleMatrix, 1); // no animation
				Us.isRendering = false;
				if(OnComplete !== undefined) OnComplete();
			}
		}
	};

	var Placement = {
		Calc: function(visibleMatrix) {
			Placement.PreliminarPos(visibleMatrix);
			Placement.AdjustInternalNodes(visibleMatrix);
			Placement.IncreaseBranchGap(visibleMatrix[0][0]);
			Placement.AdjustHorizontally(visibleMatrix);
			return visibleMatrix;
		},

		PreliminarPos: function(visibleMatrix) {
			for(var i = 0; i < visibleMatrix.length; ++i) {
				var yAccum = 0;
				for(var j = 0; j < visibleMatrix[i].length; ++j) {
					var node = visibleMatrix[i][j];
					node.posSch = { // schedule new positioning
						x:i * 80, // arbitrary
						y:yAccum + CONSTANTS.yNodePadding
					};
					yAccum += node.rect.cy + CONSTANTS.yNodePadding * 2;
				}
			}
		},

		AdjustInternalNodes: function(visibleMatrix) {
			for(var iDep = visibleMatrix.length - 2; iDep >= 0; --iDep) { // bypass deepmost level
				var siblings = visibleMatrix[iDep]; // nodes of column iDep
				var iLastParent = -1;
				for(var iSib = 0; iSib < siblings.length; ++iSib) { // each node of column
					if(siblings[iSib].children.length > 0 && siblings[iSib].isExpanded) { // parent, not internal leaf
						Placement.AlignToChildren(siblings[iSib]);
						if(iLastParent == -1) { // we're 1st parent of this column
							var yAccum = siblings[iSib].posSch.y - CONSTANTS.yNodePadding;
							for(var i = iSib - 1; i >= 0; --i) { // leaf nodes above 1st parent
								yAccum -= siblings[i].rect.cy + 2 * CONSTANTS.yNodePadding;
								siblings[i].posSch.y = CONSTANTS.yNodePadding + yAccum;
							}
						} else if(iLastParent > -1) { // parent node, but not 1st; fail-safe when root
							var yTop = siblings[iLastParent].posSch.y +
								siblings[iLastParent].rect.cy +
								CONSTANTS.yNodePadding;
							var yBot = siblings[iSib].posSch.y - CONSTANTS.yNodePadding;
							var yMinRoom = 0;
							for(var i = iLastParent + 1; i < iSib; ++i)
								yMinRoom += siblings[i].rect.cy + 2 * CONSTANTS.yNodePadding;
							if(yMinRoom > yBot - yTop)
								for(var i = iSib; i < siblings.length; ++i) // everyone beyond moves down
									Placement.MoveNodesDown(siblings[i], yMinRoom - (yBot - yTop));
							for(var i = iLastParent + 1; i < iSib; ++i) { // internal leaves
								var yPercent = (siblings[i].rect.cy + 2 * CONSTANTS.yNodePadding) / yMinRoom;
								siblings[i].posSch.y = Math.round(
									yTop +
									yPercent * Math.max(yMinRoom, yBot - yTop) / 2 -
									siblings[i].rect.cy / 2);
								yTop += yPercent * Math.max(yMinRoom, yBot - yTop);
							}
						}
						iLastParent = iSib; // we're last parent now
					}
				}
				if(iLastParent > -1) { // fail-safe when root
					var yAccum = siblings[iLastParent].posSch.y +
						siblings[iLastParent].rect.cy +
						CONSTANTS.yNodePadding;
					for(var i = iLastParent + 1; i < siblings.length; ++i) { // leaf nodes beyond bottom parent
						siblings[i].posSch.y = yAccum + CONSTANTS.yNodePadding;
						yAccum += siblings[i].rect.cy + 2 * CONSTANTS.yNodePadding;
					}
				}
			}
		},

		IncreaseBranchGap: function IncreaseBranchGap(node) {
			if(!node.isExpanded) return 0;
			var yMoved = 0; // how many pixels the node has moved down
			var firstParent = true;
			for(var i = 0; i < node.children.length; ++i) {
				var child = node.children[i];
				if(child.children.length && child.isExpanded) { // parent, not leaf
					if(firstParent) {
						firstParent = false; // skip 1st parent
					} else {
						for(var n = i; n < node.children.length; ++n)
							Placement.MoveNodesDown(node.children[n], CONSTANTS.yBranchGap); // move down us and beyond
						yMoved += CONSTANTS.yBranchGap;
					}
					var yInc = IncreaseBranchGap(child);
					for(var n = i + 1; n < node.children.length; ++n)
						Placement.MoveNodesDown(node.children[n], yInc); // move down again, everyone beyond
					yMoved += yInc;
				}
			}
			Placement.AlignToChildren(node);
			return yMoved;
		},

		AdjustHorizontally: function(visibleMatrix) {
			for(var iDep = 1; iDep < visibleMatrix.length; ++iDep) {
				var ourNodes = visibleMatrix[iDep];
				if(!ourNodes.length) break;
				var off = 0;
				var prevNodes = visibleMatrix[iDep - 1];
				for(var i = 0; i < prevNodes.length; ++i) {
					if(off < prevNodes[i].posSch.x + prevNodes[i].rect.cx + CONSTANTS.xMinPadding)
						off = prevNodes[i].posSch.x + prevNodes[i].rect.cx + CONSTANTS.xMinPadding;
				}
				for(var i = 0; i < ourNodes.length; ++i)
					ourNodes[i].posSch.x = off;
			}
		},

		AlignToChildren: function(node) {
			if(node.children.length === 0 || !node.isExpanded) return;
			var yTop = node.children[0].posSch.y - CONSTANTS.yNodePadding;
			var yBot = node.children[node.children.length - 1].posSch.y +
				node.children[node.children.length - 1].rect.cy +
				CONSTANTS.yNodePadding;
			node.posSch.y = Math.round(yTop + (yBot - yTop) / 2 - node.rect.cy / 2);
		},

		MoveNodesDown: function MoveNodesDown(node, inc) {
			node.posSch.y += inc;
			if(node.isExpanded)
				for(var i = 0; i < node.children.length; ++i)
					MoveNodesDown(node.children[i], inc);
		},

		ResetRootPos: function(visibleMatrix) {
			var difx = visibleMatrix[0][0].posSch.x - Math.round(Us.context.canvas.width / 10);
			var dify = visibleMatrix[0][0].posSch.y -
				Math.round(Us.context.canvas.height / 2 - visibleMatrix[0][0].rect.cy / 2);
			for(var i = 0; i < visibleMatrix.length; ++i) {
				for(var j = 0; j < visibleMatrix[i].length; ++j) {
					visibleMatrix[i][j].posSch.x -= difx; // schedule
					visibleMatrix[i][j].posSch.y -= dify;
				}
			}
			return visibleMatrix;
		}
	};

	var Events = {
		MouseDown: function(ev) {
			if(Us.isRendering) return;
			var canvasxy = Util.GetPos(Us.context.canvas);
			Us.baseDragPos = { x:ev.pageX - canvasxy.x,
				y:ev.pageY - canvasxy.y }; // we're ready to drag now
			Us.context.canvas.style.cursor = 'move';
			ev.preventDefault();
		},

		MouseUp: function(ev) {
			if(Us.baseDragPos !== null) { // if we're dragging
				window.setTimeout(function() { // little delay so click event won't get it
					Us.baseDragPos = null;
					Us.isDragging = false;
					Node.FlushToStorage();
				}, 40); // not dragging anymore
				var canvasxy = Util.GetPos(Us.context.canvas);
				Us.context.canvas.style.cursor =
					Node.AtPoint(ev.pageX - canvasxy.x, ev.pageY - canvasxy.y,
						Node.VisibleMatrix()) === null ? 'auto' : 'pointer';
				ev.preventDefault();
			}
		},

		MouseOut: function() {
			if(Us.baseDragPos !== null) {
				Us.baseDragPos = null;
				Us.isDragging = false;
				Node.FlushToStorage();
				Us.context.canvas.style.cursor = 'auto';
			}
		},

		MouseMove: function MouseMove(ev) {
			if(Us.isRendering) return;
			var canvasxy = Util.GetPos(Us.context.canvas);
			var pos = { x:ev.pageX - canvasxy.x,
				y:ev.pageY - canvasxy.y };
			var matrix = Node.VisibleMatrix();
			if(Us.baseDragPos === null) { // we're not dragging
				function SameNode(node1, node2) { // are the two nodes the same one?
					if(node1 === null && node2 === null) return true;
					if(node1 !== null || node2 !== null) return false;
					return node1.id === node2.id;
				}
				if(MouseMove.prev === undefined)
					MouseMove.prev = null; // static variable to hold previous hovered
				var target = Node.AtPoint(pos.x, pos.y, matrix);
				if(!SameNode(target, MouseMove.prev)) {
					MouseMove.prev = target;
					Us.context.canvas.style.cursor = (target !== null) ? 'pointer' : 'auto';
				}
			} else { // we're dragging
				Us.isDragging = true; // will abort click event after mouseup
				for(var i = 0; i < matrix.length; ++i) { // apply coordinates to all visible nodes
					for(var j = 0; j < matrix[i].length; ++j) {
						matrix[i][j].rect.x += pos.x - Us.baseDragPos.x;
						matrix[i][j].rect.y += pos.y - Us.baseDragPos.y;
					}
				}
				Us.baseDragPos = { x:pos.x, y:pos.y };
				Node.Paint(matrix, 1); // no animation
			}
			ev.preventDefault();
		},

		Click: function(ev) {
			if(Us.isRendering || Us.isDragging) return;
			var canvasxy = Util.GetPos(Us.context.canvas);
			var matrix = Node.VisibleMatrix(),
				cursorPt = { x:ev.pageX - canvasxy.x, y:ev.pageY - canvasxy.y },
				target = Node.AtPoint(cursorPt.x, cursorPt.y, matrix); // null if none
			if(target === null) return;
			if(ev.ctrlKey) { // Ctrl+click
				if(Us.callbacks.CtrlClick !== null)
					Us.callbacks.CtrlClick.call(Us.retObj, target, ev); // pass clicked node and event as arguments
			} else { // non-Ctrl click
				if(target.children.length > 0) { // clicked node has children
					function SetChildrenPos(node, pos, posSch) {
						for(var i = 0; i < node.children.length; ++i) {
							if(pos !== null) { // set current position
								node.children[i].rect.x = pos.x;
								node.children[i].rect.y = pos.y;
							}
							if(posSch !== undefined && posSch !== null) // set scheduled position
								node.children[i].posSch = { x:posSch.x, y:posSch.y };
							SetChildrenPos(node.children[i], pos, posSch);
						}
					}
					function CenterNodeAtPoint(x, y, node, visibleMatrix) {
						var off = {
							x: x - (node.posSch !== null ? node.posSch.x : node.rect.x) - (x - node.rect.x),
							y: y - (node.posSch !== null ? node.posSch.y : node.rect.y) - (y - node.rect.y)
						};
						for(var i = 0; i < visibleMatrix.length; ++i) {
							for(var j = 0; j < visibleMatrix[i].length; ++j) {
								var cur = visibleMatrix[i][j];
								if(cur.posSch !== null) { // set scheduled position
									cur.posSch.x += off.x;
									cur.posSch.y += off.y;
								} else { // set current (static) position
									cur.rect.x += off.x;
									cur.rect.y += off.y;
								}
							}
						}
						return visibleMatrix;
					}
					if(!target.isExpanded) { // node will be expanded
						target.isExpanded = true;
						SetChildrenPos(target, target.rect, null);
						matrix = Node.VisibleMatrix();
						Placement.Calc(matrix);
						CenterNodeAtPoint(cursorPt.x, cursorPt.y, target, matrix);
						Node.Render(matrix, function() {
							Node.FlushToStorage();
							if(Us.callbacks.Click !== null)
								Us.callbacks.Click.call(Us.retObj, target, ev);
						});
					} else { // node will be collapsed
						target.isExpanded = false;
						matrix = Placement.Calc(Node.VisibleMatrix()); // will calc final pos of clicked node (and above) only
						target.isExpanded = true;
						SetChildrenPos(target, null, target.posSch);
						matrix = Node.VisibleMatrix();
						CenterNodeAtPoint(cursorPt.x, cursorPt.y, target, matrix);
						Node.Render(matrix, function() {
							target.isExpanded = false;
							matrix = Node.VisibleMatrix();
							Placement.Calc(matrix);
							CenterNodeAtPoint(cursorPt.x, cursorPt.y, target, matrix);
							Node.Render(matrix, function() { // no animation, remove collapsed
								Node.FlushToStorage();
								if(Us.callbacks.Click !== null)
									Us.callbacks.Click.call(Us.retObj, target, ev);
							});
						});
					}
				} else { // clicked node has no children
					if(Us.callbacks.Click !== null)
						Us.callbacks.Click.call(Us.retObj, target, ev);
				}
			}
		},

		SelectStart: function(ev) {
			ev.preventDefault();
		}
	};

	return Util.AddPropertiesIfNotExist(Us.retObj, {
		click: function(Callback) { Us.callbacks.Click = Callback; return Us.retObj; },
		ctrlClick: function(Callback) { Us.callbacks.CtrlClick = Callback; return Us.retObj; },
		load: function(rootNode) { Node.Load(rootNode); return Us.retObj; },
		collapseAll: function() { Node.CollapseAll(); return Us.retObj; },
		expandAll: function() { Node.ExpandAll(); return Us.retObj; },
		countNodes: function() { return Node.Count(); },
		redraw: function() { Node.Render(Node.VisibleMatrix()); return Us.retObj; },
		clear: function() { Us.context.clearRect(0, 0, Us.context.canvas.width, Us.context.canvas.height); return Us.retObj; },
		fitParentContainer: function() { Node.FitParentContainer(); return Us.retObj; }
	});
}