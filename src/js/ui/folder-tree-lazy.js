function LazyFolderTree(options) {
    this.treeData = null;
    this.container = options.container;
    this.nodeClassName = options.nodeClassName || 'folder-tree-node';
    this.itemClassName = options.itemClassName || 'folder-tree-item';
    this.listClassName = options.listClassName || 'folder-tree-list';
    this.toggleClassName = options.toggleClassName || 'folder-toggle-icon';
    this.nameClassName = options.nameClassName || 'folder-name';
    this.folderIconClass = options.folderIconClass || 'fas fa-folder folder-icon';
    this.rootIconClass = options.rootIconClass || '';
    this.rootLabel = options.rootLabel || '';
    this.showGoToBtn = options.showGoToBtn || false;
    this.selectionMode = options.selectionMode || false;
    this.onSelect = options.onSelect || null;
    this.onToggle = options.onToggle || null;
    this.onGoTo = options.onGoTo || null;
    this.useTransformToggle = options.useTransformToggle || false;
    this.scrollWrapper = options.scrollWrapper || false;
}

LazyFolderTree._escapeHtml = function(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

LazyFolderTree._getPathParts = function(path) {
    if (!path) return [];
    var raw = path.endsWith('/') ? path.slice(0, -1) : path;
    var parts = [];
    var current = '';
    var balance = 0;
    for (var i = 0; i < raw.length; i++) {
        var ch = raw[i];
        if (ch === '(' || ch === '\uFF08') {
            balance++;
            current += ch;
        } else if (ch === ')' || ch === '\uFF09') {
            balance = Math.max(0, balance - 1);
            current += ch;
        } else if (ch === '/' && balance === 0) {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    parts.push(current);
    return parts;
};

LazyFolderTree.prototype.buildTree = function(paths) {
    var tree = {};
    var self = this;
    paths.forEach(function(path) {
        var currentLevel = tree;
        var parts = LazyFolderTree._getPathParts(path).filter(function(p) { return p; });
        parts.forEach(function(part) {
            if (!currentLevel[part]) {
                currentLevel[part] = {};
            }
            currentLevel = currentLevel[part];
        });
    });
    this.treeData = tree;
    return tree;
};

LazyFolderTree.prototype.render = function(directories) {
    if (!this.container) return;
    this.container.innerHTML = '';
    var tree = this.buildTree(directories);
    this.treeData = tree;

    var listEl = document.createElement('ul');
    listEl.className = this.listClassName;

    var self = this;

    if (this.rootLabel) {
        listEl.classList.add('root');
        var rootNode = this._createNode(this.rootLabel, tree, '', true);
        listEl.appendChild(rootNode);
        this.container.appendChild(listEl);
    } else {
        var keys = Object.keys(tree).sort();

        if (this.scrollWrapper) {
            var scrollContainer = document.createElement('div');
            scrollContainer.className = 'folder-tree-scroll-wrapper';
            var scrollIndicator = document.createElement('div');
            scrollIndicator.className = 'folder-tree-scroll-indicator';
            scrollIndicator.innerHTML = '<i class="fas fa-folder-tree"></i> <span class="folder-tree-scroll-indicator-text"></span> <i class="fas fa-chevron-up folder-tree-scroll-collapse-icon"></i>';
            scrollContainer.appendChild(scrollIndicator);

            keys.forEach(function(key) {
                listEl.appendChild(self._createNode(key, tree[key], ''));
            });

            scrollContainer.appendChild(listEl);
            this.container.appendChild(scrollContainer);

            if (typeof updateFolderTreeScrollIndicator === 'function') {
                scrollContainer.addEventListener('scroll', function() {
                    updateFolderTreeScrollIndicator(scrollContainer, scrollIndicator);
                });
                scrollIndicator.addEventListener('click', function() {
                    var currentPath = scrollIndicator.dataset.currentPath;
                    if (!currentPath) return;
                    var targetItem = self.container.querySelector('.folder-tree-item[data-path="' + CSS.escape(currentPath) + '"]');
                    if (!targetItem) return;
                    var node = targetItem.closest('.folder-tree-node');
                    var sublist = node ? node.querySelector(':scope > .folder-tree-list') : null;
                    var toggleIcon = node ? node.querySelector(':scope > .folder-tree-item .folder-toggle-icon') : null;
                    if (sublist) {
                        sublist.style.display = 'none';
                        if (toggleIcon) toggleIcon.classList.remove('expanded');
                    }
                    requestAnimationFrame(function() {
                        updateFolderTreeScrollIndicator(scrollContainer, scrollIndicator);
                    });
                });
            }
        } else {
            keys.forEach(function(key) {
                listEl.appendChild(self._createNode(key, tree[key], ''));
            });
            this.container.appendChild(listEl);
        }
    }
};

LazyFolderTree.prototype._getIconSelectorClass = function(iconClass) {
    var parts = iconClass.split(' ');
    for (var i = parts.length - 1; i >= 0; i--) {
        if (parts[i] && parts[i].indexOf('fa-') === 0 && parts[i] !== 'fas' && parts[i] !== 'far' && parts[i] !== 'fab') {
            return '.' + parts[i];
        }
    }
    return '.' + (parts[parts.length - 1] || 'folder-icon');
};

LazyFolderTree.prototype._createNode = function(name, nodeData, parentPath, isRoot) {
    var li = document.createElement('li');
    li.className = this.nodeClassName;

    var fullPath = isRoot ? '' : (parentPath ? parentPath + name + '/' : name + '/');
    var hasChildren = Object.keys(nodeData).length > 0;

    var nodeContent = document.createElement('div');
    nodeContent.className = this.itemClassName;
    nodeContent.dataset.path = fullPath;
    nodeContent.dataset.hasChildren = hasChildren ? 'true' : 'false';
    nodeContent.dataset.expanded = 'false';

    var iconClass = (isRoot && this.rootIconClass) ? this.rootIconClass : this.folderIconClass;
    var toggleVisibility = hasChildren ? '' : (this.useTransformToggle ? 'invisible' : 'hidden');
    var folderIconSelectorClass = this._getIconSelectorClass(iconClass);

    var goToBtnHtml = this.showGoToBtn ? '<button class="go-to-folder-btn" title="' + LazyFolderTree._escapeHtml('进入文件夹') + '"><i class="fas fa-arrow-right"></i></button>' : '';

    nodeContent.innerHTML =
        '<span class="folder-item-main">' +
            '<i class="fas fa-chevron-right ' + this.toggleClassName + ' ' + toggleVisibility + '"></i>' +
            '<i class="' + iconClass + '"></i>' +
            '<span class="' + this.nameClassName + '" title="' + LazyFolderTree._escapeHtml(name) + '">' + LazyFolderTree._escapeHtml(name) + '</span>' +
        '</span>' +
        goToBtnHtml;

    var self = this;
    nodeContent.addEventListener('click', function(e) {
        if (self.selectionMode) {
            var toggleIcon = e.target.closest('.' + self.toggleClassName);
            var folderIconEl = e.target.closest(folderIconSelectorClass);
            var actAsToggle = false;
            if (toggleIcon && !toggleIcon.classList.contains('invisible') && !toggleIcon.classList.contains('hidden')) {
                actAsToggle = true;
            } else if (folderIconEl && hasChildren) {
                var siblingToggle = nodeContent.querySelector('.' + self.toggleClassName);
                if (siblingToggle && !siblingToggle.classList.contains('invisible') && !siblingToggle.classList.contains('hidden')) {
                    actAsToggle = true;
                }
            }
            if (actAsToggle && hasChildren) {
                e.stopPropagation();
                self._toggleNode(li, nodeContent);
            } else if (self.onSelect) {
                self.onSelect(nodeContent, fullPath, e);
            }
        } else {
            if (hasChildren) {
                self._toggleNode(li, nodeContent);
            }
            if (self.onToggle) {
                self.onToggle(li, nodeContent, fullPath, e);
            }
        }
    });

    if (this.showGoToBtn) {
        var goToBtn = nodeContent.querySelector('.go-to-folder-btn');
        if (goToBtn) {
            goToBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (self.onGoTo) self.onGoTo(fullPath, nodeContent);
            });
        }
    }

    li.appendChild(nodeContent);

    if (hasChildren) {
        var sublist = document.createElement('ul');
        sublist.className = this.listClassName;
        sublist.style.display = isRoot ? 'block' : 'none';
        li.appendChild(sublist);
    }

    return li;
};

LazyFolderTree.prototype._toggleNode = function(li, nodeContent) {
    var sublist = li.querySelector(':scope > .' + this.listClassName);
    if (!sublist) return;

    var isExpanded = nodeContent.dataset.expanded === 'true';

    if (isExpanded) {
        sublist.style.display = 'none';
        nodeContent.dataset.expanded = 'false';
        var toggleIcon = nodeContent.querySelector('.' + this.toggleClassName);
        if (toggleIcon) {
            if (this.useTransformToggle) {
                toggleIcon.style.transform = '';
            } else {
                toggleIcon.classList.remove('expanded');
            }
        }
    } else {
        if (sublist.children.length === 0) {
            this._renderChildren(li, sublist);
        }
        sublist.style.display = 'block';
        nodeContent.dataset.expanded = 'true';
        var toggleIcon = nodeContent.querySelector('.' + this.toggleClassName);
        if (toggleIcon) {
            if (this.useTransformToggle) {
                toggleIcon.style.transform = 'rotate(90deg)';
            } else {
                toggleIcon.classList.add('expanded');
            }
        }
    }

    if (!this.useTransformToggle && !this.rootLabel && typeof updateFolderTreeScrollIndicator === 'function') {
        requestAnimationFrame(function() {
            var scrollEl = li.closest('.folder-tree-scroll-wrapper');
            var indicatorEl = scrollEl ? scrollEl.querySelector('.folder-tree-scroll-indicator') : null;
            if (scrollEl && indicatorEl) {
                updateFolderTreeScrollIndicator(scrollEl, indicatorEl);
            }
        });
    }
};

LazyFolderTree.prototype._renderChildren = function(parentLi, sublist) {
    var path = parentLi.querySelector(':scope > .' + this.itemClassName).dataset.path;
    var nodeData = this._getNodeByPath(path);
    if (!nodeData) return;

    var keys = Object.keys(nodeData).sort();
    var self = this;
    keys.forEach(function(key) {
        sublist.appendChild(self._createNode(key, nodeData[key], path, false));
    });
};

LazyFolderTree.prototype._getNodeByPath = function(path) {
    if (!this.treeData) return null;
    if (!path) return this.treeData;
    var parts = LazyFolderTree._getPathParts(path).filter(function(p) { return p; });
    var current = this.treeData;
    for (var i = 0; i < parts.length; i++) {
        if (current[parts[i]]) {
            current = current[parts[i]];
        } else {
            return null;
        }
    }
    return current;
};

LazyFolderTree.prototype.expandToPath = function(targetPath) {
    if (!targetPath || !this.container) return;
    if (this.rootLabel) {
        var rootItem = this.container.querySelector('.' + this.itemClassName + '[data-path=""]');
        if (rootItem) {
            var rootLi = rootItem.closest('.' + this.nodeClassName);
            if (rootLi && rootItem.dataset.expanded !== 'true' && rootItem.dataset.hasChildren === 'true') {
                this._toggleNode(rootLi, rootItem);
            }
        }
    }
    var parts = LazyFolderTree._getPathParts(targetPath).filter(function(p) { return p; });
    var currentPath = '';
    for (var i = 0; i < parts.length; i++) {
        currentPath += (i === 0 ? '' : '/') + parts[i];
        var searchPath = currentPath + '/';
        var item = this.container.querySelector('.' + this.itemClassName + '[data-path="' + CSS.escape(searchPath) + '"]');
        if (item) {
            var li = item.closest('.' + this.nodeClassName);
            if (li && item.dataset.expanded !== 'true' && item.dataset.hasChildren === 'true') {
                this._toggleNode(li, item);
            }
        }
    }
};

LazyFolderTree.prototype.ensureAllRendered = function() {
    if (!this.container || !this.treeData) return;
    var self = this;
    var needsMore = true;
    while (needsMore) {
        needsMore = false;
        var items = this.container.querySelectorAll('.' + this.itemClassName + '[data-has-children="true"][data-expanded="false"]');
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var li = item.closest('.' + this.nodeClassName);
            if (li) {
                this._toggleNode(li, item);
                needsMore = true;
            }
        }
    }
};