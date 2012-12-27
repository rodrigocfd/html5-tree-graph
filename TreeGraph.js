/**
 * Description: tree graph with JavaScript and HTML5.
 * Dependencies: none.
 * Author: Rodrigo Cesar de Freitas Dias.
 * Date: Sep 17, 2012.
 * Source: https://github.com/rodrigocfd/javascript-tree-graph
 * License: you can use it wherever you want, as long as you keep this header intact.
 */

function TreeGraph(divId) {
	TreeGraph.nextIndex = 0;
	this.rootNode = null;
	this.visibleMatrix = []; // rebuilt each redraw
	this.maxDepth = 0; // set once by _setupNode()
	document.getElementById(divId) // create DIV inside user DIV
		.appendChild(this.div = document.createElement('div'));
	this.div.style.position = 'relative';
	this.div.style.width = '100%';
	this.div.style.height = '100%';
	this.div.style.overflow = 'auto';
	this.div.appendChild(this.canvas = document.createElement('canvas'));
	this.context = this.canvas.getContext('2d'); // just to speed up drawing
	this.callbacks = { ctrlClick:null, noChildren:null }; // user callbacks
	this.interNodeXRoom = 40;
	this.interNodeYRoom = 8;
	this.interBranchYGap = 10;
	this.cssStuff = {
		textColor: '#333',
		lineColor: '#B6B6B6',
		nodeDivPadding: 2,
		nodeDivBorder: 1,
		nodeDivBorderColor: '#B0B0B0',
		iconSize: 18
	};
}

TreeGraph.prototype.load = function(treeObj) {
	// The treeObj is the root node of the tree.
	// node = { name,tooltip,color,image,nodes[],data };
	// - image is a full URL.
	// - nodes[] is the array of all child nodes.
	// - data holds any user data.
	this.rootNode = treeObj;
	this._setupNode(this.rootNode); // unique IDs on all nodes, and more
	TreeGraph.nextIndex = 0; // so that nodes will receive same ID upon subsequent reloads
	var storName = this.div.parentNode.id + '_rootNode';
	if(localStorage.getItem(storName) !== null) { // we previously stored this tree
		var oldTree = JSON.parse(localStorage.getItem(storName));
		if(this._isSameTree(this.rootNode, oldTree)) // being reloaded, so reload the node folding
			this._copyNodeFolding(this.rootNode, oldTree);
	}
	localStorage.setItem(storName, JSON.stringify(this.rootNode)); // store our tree
	this.redraw();
}

TreeGraph.prototype.redraw = function(_baseNode) {
	if(_baseNode === undefined) { // redraw whole tree
		this.visibleMatrix = []; // rebuild
		for(var i = 0; i <= this.maxDepth; ++i)
			this.visibleMatrix.push(this._findVisibleNodes(i));
		this.redraw(this.rootNode); // halt
		this._adjustInternalNodes();
		this._increaseBranchGap();
		this._adjustHorizontally();
		this._fitIntoCanvas();
		this._applyCoordinates();
		this._drawLines();
	}
	else { // initial static arrangement
		var siblings = this.visibleMatrix[_baseNode.depth]; // column to which we belong
		var iSib = this._findNodeIndexWithinArray(siblings, _baseNode);
		var div = this._newDiv(0, 0, _baseNode); // create physical DIV stuck in corner
		var sz = this._computeSize(div);
		_baseNode.cx = sz.cx; _baseNode.cy = sz.cy;
		_baseNode.roomy = _baseNode.cy + this.interNodeYRoom;
		_baseNode.x = _baseNode.depth * 60; // arbitrary
		var yAccum = 0;
		for(var i = 0; i < iSib; ++i) yAccum += siblings[i].roomy;
		_baseNode.setBaseY(yAccum);
		if(_baseNode.isExpanded)
			for(var i = 0; i < _baseNode.nodes.length; ++i)
				this.redraw(_baseNode.nodes[i]);
	}
}

TreeGraph.prototype.countNodes = function(_baseNode) {
	if(_baseNode === undefined) _baseNode = this.rootNode;
	var count = 1;
	for(var i = 0; i < _baseNode.nodes.length; ++i)
		count += this.countNodes(_baseNode.nodes[i]);
	return count;
}

TreeGraph.prototype.expandAll = function(_baseNode) {
	if(_baseNode === undefined) {
		this.expandAll(this.rootNode);
		localStorage.setItem(this.div.parentNode.id + '_rootNode', JSON.stringify(this.rootNode)); // store our tree state
		this.redraw();
	}
	else {
		_baseNode.isExpanded = true;
		for(var i = 0; i < _baseNode.nodes.length; ++i)
			this.expandAll(_baseNode.nodes[i]);
	}
}

TreeGraph.prototype.collapseAll = function() {
	for(var i = 0; i < this.visibleMatrix.length; ++i)
		for(var j = 0; j < this.visibleMatrix[i].length; ++j)
			this.visibleMatrix[i][j].isExpanded = false;
	for(var i = 0; i < this.visibleMatrix[1].length; ++i)
		this._removeDiv(this.visibleMatrix[1][i]);
	localStorage.setItem(this.div.parentNode.id + '_rootNode', JSON.stringify(this.rootNode)); // store our tree state
	this.redraw();
}

TreeGraph.prototype.onCtrlClick = function(callback) {
	// Pass callback(nodeObj) to set; pass null to remove.
	this.callbacks.ctrlClick = callback;
}

TreeGraph.prototype.onNoChildren = function(callback) {
	// Pass callback(nodeObj) to set; pass null to remove.
	this.callbacks.noChildren = callback;
}

TreeGraph.prototype._setupNode = function(baseNode, _depth) {
	baseNode.id = this.div.parentNode.id + '_' + TreeGraph.nextIndex++; // using global indexer
	baseNode.isExpanded = false;
	baseNode.depth = _depth === undefined ? 0 : _depth; // zero-based
	if(this.maxDepth < baseNode.depth) this.maxDepth = baseNode.depth;
	baseNode.x = baseNode.y = baseNode.cx = baseNode.cy = baseNode.roomy = 0;
	var _this = this;
	baseNode.getBaseY = function() { return this.y + this.cy / 2 - this.roomy / 2; };
	baseNode.setBaseY = function(y) { this.y = y - this.cy / 2 + this.roomy / 2; };
	baseNode.setY = function(y) { this.y = y - this.cy / 2; };
	for(var i = 0; i < baseNode.nodes.length; ++i)
		this._setupNode(baseNode.nodes[i], baseNode.depth + 1);
}

TreeGraph.prototype._applyCoordinates = function() {
	for(var i = 0; i < this.visibleMatrix.length; ++i) {
		for(var j = 0; j < this.visibleMatrix[i].length; ++j) {
			var div = document.getElementById(this.visibleMatrix[i][j].id);
			div.style.left = this.visibleMatrix[i][j].x + 'px';
			div.style.top = this.visibleMatrix[i][j].y + 'px'; // relative to container DIV
		}
	}
}

TreeGraph.prototype._fitIntoCanvas = function() {
	var ymin = 0; // topmost Y plotting point
	for(var i = 0; i <= this.maxDepth; ++i) {
		var siblings = this.visibleMatrix[i]; // nodes of column i
		if(!siblings.length) break;
		var y = siblings[0].getBaseY();
		if(ymin > y) ymin = y;
	}
	this._moveNodesDown(this.rootNode, -ymin);
	var ymax = 0; // bottommost Y plotting point
	for(var i = 0; i <= this.maxDepth; ++i) {
		var siblings = this.visibleMatrix[i];
		if(!siblings.length) break;
		var y = siblings[siblings.length - 1].getBaseY()
			+ siblings[siblings.length - 1].roomy;
		if(ymax < y) ymax = y;
	}
	this.canvas.height = ymax;
	var xmax = 0; // rightmost X plotting point
	for(var i = this.maxDepth; i >= 0; --i) {
		var siblings = this.visibleMatrix[i];
		if(!siblings.length) continue;
		for(var j = 0; j < siblings.length; ++j)
			if(siblings[j].x + siblings[j].cx > xmax)
				xmax = siblings[j].x + siblings[j].cx;
		break;
	}
	this.canvas.width = xmax + 5;
}

TreeGraph.prototype._removeDiv = function(node) {
	for(var i = 0; i < node.nodes.length; ++i) {
		var child = document.getElementById(node.nodes[i].id);
		if(child !== null)
			this._removeDiv(node.nodes[i]);
	}
	var div = document.getElementById(node.id);
	div.parentNode.removeChild(div);
}

TreeGraph.prototype._adjustInternalNodes = function() {
	for(var iDep = this.maxDepth - 1; iDep >= 0; --iDep) { // bypass deepmost level
		var siblings = this.visibleMatrix[iDep]; // nodes of column iDep
		var iLastParent = -1;
		for(var iSib = 0; iSib < siblings.length; ++iSib) { // each node of column
			if(siblings[iSib].nodes.length && siblings[iSib].isExpanded) { // parent, not internal leaf
				this._alignToChildren(siblings[iSib]);
				if(iLastParent == -1) { // we're 1st parent of this column
					var yAccum = siblings[iSib].getBaseY();
					for(var i = iSib - 1; i >= 0; --i) { // leaf nodes above 1st parent
						yAccum -= siblings[i].roomy;
						siblings[i].setBaseY(yAccum);
					}
				}
				else if(iLastParent > -1) { // parent node, but not 1st; fail-safe when root
					var yTop = siblings[iLastParent].getBaseY() + siblings[iLastParent].roomy;
					var yBot = siblings[iSib].getBaseY();
					var yMinRoom = 0;
					for(var i = iLastParent + 1; i < iSib; ++i) yMinRoom += siblings[i].roomy;
					if(yMinRoom > yBot - yTop)
						for(var i = iSib; i < siblings.length; ++i) // everyone beyond moves down
							this._moveNodesDown(siblings[i], yMinRoom - (yBot - yTop));
					for(var i = iLastParent + 1; i < iSib; ++i) { // internal leaves
						var yPercent = siblings[i].roomy / yMinRoom;
						siblings[i].setY(yTop + yPercent * Math.max(yMinRoom, yBot - yTop) / 2);
						yTop += yPercent * Math.max(yMinRoom, yBot - yTop);
					}
				}
				iLastParent = iSib; // we're last parent now
			}
		}
		if(iLastParent > -1) { // fail-safe when root
			var yAccum = siblings[iLastParent].getBaseY() + siblings[iLastParent].roomy;
			for(var i = iLastParent + 1; i < siblings.length; ++i) { // leaf nodes beyond bottom parent
				siblings[i].setBaseY(yAccum);
				yAccum += siblings[i].roomy;
			}
		}
	}
}

TreeGraph.prototype._increaseBranchGap = function(_baseNode) {
	if(_baseNode === undefined) _baseNode = this.rootNode;
	var yMoved = 0;
	var firstParent = true;
	for(var i = 0; i < _baseNode.nodes.length; ++i) {
		var child = _baseNode.nodes[i];
		if(child.nodes.length && child.isExpanded) { // parent, not leaf
			if(firstParent) firstParent = false; // skip 1st parent
			else {
				for(var n = i; n < _baseNode.nodes.length; ++n)
					this._moveNodesDown(_baseNode.nodes[n], this.interBranchYGap); // move down us and beyond
				yMoved += this.interBranchYGap;
			}
			var yInc = this._increaseBranchGap(child);
			for(var n = i + 1; n < _baseNode.nodes.length; ++n)
				this._moveNodesDown(_baseNode.nodes[n], yInc); // move down again, everyone beyond
			yMoved += yInc;
		}
	}
	this._alignToChildren(_baseNode);
	return yMoved;
}

TreeGraph.prototype._adjustHorizontally = function() {
	for(var iDep = 1; iDep <= this.maxDepth; ++iDep) {
		var ourNodes = this.visibleMatrix[iDep];
		if(!ourNodes.length) break;
		var off = 0;
		var prevNodes = this.visibleMatrix[iDep - 1];
		var xNodeGap = this.interNodeXRoom;
		for(var i = 0; i < prevNodes.length; ++i) {
			if(off < prevNodes[i].x + prevNodes[i].cx + xNodeGap)
				off = prevNodes[i].x + prevNodes[i].cx + xNodeGap;
		}
		for(var i = 0; i < ourNodes.length; ++i)
			ourNodes[i].x = off;
	}
}

TreeGraph.prototype._moveNodesDown = function(baseNode, inc) {
	baseNode.y += inc;
	if(baseNode.isExpanded)
		for(var i = 0; i < baseNode.nodes.length; ++i)
			this._moveNodesDown(baseNode.nodes[i], inc);
}

TreeGraph.prototype._alignToChildren = function(node) {
	if(!node.nodes.length || !node.isExpanded) return;
	var yTop = node.nodes[0].getBaseY();
	var yBot = node.nodes[node.nodes.length - 1].getBaseY()
		+ node.nodes[node.nodes.length - 1].roomy;
	node.setY(yTop + (yBot - yTop) / 2);
}

TreeGraph.prototype._findVisibleNodes = function(depth, _baseNode) {
	if(_baseNode === undefined) _baseNode = this.rootNode;
	var nodes = [];
	if(_baseNode.depth === depth) nodes.push(_baseNode);
	else if(_baseNode.isExpanded)
		for(var i = 0; i < _baseNode.nodes.length; ++i)
			nodes = nodes.concat(this._findVisibleNodes(depth, _baseNode.nodes[i]));
	return nodes;
}

TreeGraph.prototype._findNodeIndexWithinArray = function(nodesArray, node) {
	for(var i = 0; i < nodesArray.length; ++i)
		if(nodesArray[i].id === node.id)
			return i;
	return -1;
}

TreeGraph.prototype._drawLines = function(_node) {
	var context = this.canvas.getContext('2d');
	if(_node === undefined) {
		context.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this._line(this.rootNode, this.rootNode); // first-redraw fail workaround
		context.clearRect(0, 0, this.canvas.width, this.canvas.height);
		_node = this.rootNode;
	}
	if(_node.isExpanded) {
		for(var i = 0; i < _node.nodes.length; ++i) {
			this._line(_node, _node.nodes[i]); // parent to child
			this._drawLines(_node.nodes[i]);
		}
	}
	else if(_node.nodes.length) {
		context.strokeStyle = this.cssStuff.lineColor;
		context.beginPath();
		context.arc(_node.x + _node.cx - 1, _node.y + _node.cy / 2,
			4, Math.PI * 0.5, Math.PI * 1.5, true);
		context.stroke();
	}
}

TreeGraph.prototype._newDiv = function(x, y, node) {
	var newd = document.getElementById(node.id);
	if(newd === null) { // not created yet?
		newd = document.createElement('div');
		newd.id = node.id;
		newd.innerHTML = (node.image === undefined || node.image === null || node.image == '') ?
			node.name :
			('<table style="border-collapse:collapse;">' +
			'<tr><td><img src="' + node.image + '" width="' + this.cssStuff.iconSize + '" ' +
				'height="' + this.cssStuff.iconSize + '"/></td>' +
			'<td style="color:' + this.cssStuff.textColor + ';">' + node.name + '</td></tr></table>');
		if(node.tooltip !== undefined && node.tooltip !== null) newd.title = node.tooltip;
		newd.style.textAlign = 'center';
		newd.style.whiteSpace = 'nowrap';
		newd.style.color = this.cssStuff.nodeDivColor;
		newd.style.padding = this.cssStuff.nodeDivPadding + 'px';
		newd.style.border = this.cssStuff.nodeDivBorder + 'px solid ' + this.cssStuff.nodeDivBorderColor;
		newd.style.cursor = 'pointer';
		newd.style.position = 'absolute';
		this.div.appendChild(newd);
		var _this = this;
		newd.addEventListener('click', function(ev) { _this._onClick(ev, node); }, false);
	}
	newd.style.background = node.color;
	newd.style.left = x + 'px';
	newd.style.top = y + 'px';
	return newd; // return DIV object
}

TreeGraph.prototype._computeSize = function(div) {
	var padding = 2 * this.cssStuff.nodeDivPadding;
	var border = 2 * this.cssStuff.nodeDivBorder;
	var comps = window.getComputedStyle(div, null);
	return {
		cx: parseInt(comps.width) + padding + border,
		cy: parseInt(comps.height) + padding + border
	};
}

TreeGraph.prototype._isSameTree = function(root1, root2) {
	if(root1.name != root2.name || root1.nodes.length != root2.nodes.length)
		return false;
	else
		for(var i = 0; i < root1.nodes.length; ++i)
			if(!this._isSameTree(root1.nodes[i], root2.nodes[i]))
				return false;
	return true;
}

TreeGraph.prototype._copyNodeFolding = function(destNode, srcNode) {
	destNode.isExpanded = srcNode.isExpanded;
	for(var i = 0; i < destNode.nodes.length; ++i) // supposedly the same tree
		this._copyNodeFolding(destNode.nodes[i], srcNode.nodes[i]);
}

TreeGraph.prototype._line = function(node1, node2) {
	this.context.strokeStyle = this.cssStuff.lineColor;
	this.context.beginPath();
	this.context.moveTo(node1.x + node1.cx - 1, node1.y + node1.cy / 2);
	this.context.bezierCurveTo(
		node1.x + node1.cx + 18, node1.y + node1.cy / 2,
		node2.x - 18, node2.y + node2.cy / 2,
		node2.x, node2.y + node2.cy / 2);
	this.context.stroke();
}

TreeGraph.prototype._buildReturnNodeObj = function(baseNode) {
	var ret = { // node object to be returned to user on Ctrl+click event
		name: baseNode.name,
		data: baseNode.data,
		color: baseNode.color,
		depth: baseNode.depth,
		image: baseNode.image,
		isExpanded: baseNode.isExpanded,
		nodes:[]
	};
	for(var i = 0; i < baseNode.nodes.length; ++i)
		ret.nodes.push(this._buildReturnNodeObj(baseNode.nodes[i]));
	return ret;
}

TreeGraph.prototype._onClick = function(ev, node) {
	window.getSelection().removeAllRanges(); // clear any accidental text selection
	if(ev.ctrlKey && this.callbacks.ctrlClick !== null)
		this.callbacks.ctrlClick(this._buildReturnNodeObj(node)); // invoke user callback, pass node
	else {
		if(!node.nodes.length) {
			if(this.callbacks.noChildren === null)
				alert('This node has no child nodes to be expanded.');
			else
				this.callbacks.noChildren(this._buildReturnNodeObj(node)); // invoke user callback, pass node
		}
		node.isExpanded = !node.isExpanded;
		if(!node.isExpanded)
			for(var i = 0; i < node.nodes.length; ++i)
				this._removeDiv(node.nodes[i]); // remove children if collapsed
		localStorage.setItem(this.div.parentNode.id + '_rootNode', JSON.stringify(this.rootNode)); // store our tree state
		this.redraw();
	}
}