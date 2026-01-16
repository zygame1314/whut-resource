class KnowledgeGraph {
    constructor() {
        this.nodes = [];
        this.links = [];
        this.svg = null;
        this.g = null;
        this.tooltip = null;
        this.width = 0;
        this.height = 0;
        this.nodeElements = null;
        this.linkElements = null;
        this.simulation = {
            alpha: 1,
            alphaTarget: 0,
            alphaDecay: 0.02,
            velocityDecay: 0.3,
            maxVelocity: 50,
            active: false
        };
        this.zoomState = {
            scale: 1,
            translateX: 0,
            translateY: 0
        };
        this.searchTerm = '';
        this.highlightedNode = null;
        this.colorScale = [
            '#2E8B57',
            '#40E0D0',
            '#7B68EE',
            '#FF6B6B',
            '#FFD93D',
            '#6BCB77',
            '#4D96FF',
            '#FF6F91',
        ];
    }
    async init() {
        this.createModal();
        this.bindEvents();
    }
    createModal() {
        const modal = document.createElement('div');
        modal.id = 'graph-modal';
        modal.className = 'graph-modal-overlay';
        modal.innerHTML = `
            <div class="graph-container">
                <div class="graph-header">
                    <div class="graph-header-left">
                        <div class="graph-title">
                            <i class="fas fa-project-diagram"></i>
                            <span>知识图谱</span>
                        </div>
                        <span class="graph-subtitle">可视化文件夹关系网络</span>
                    </div>
                    <div class="graph-controls">
                        <div class="graph-search-box">
                            <i class="fas fa-search"></i>
                            <input type="text" class="graph-search-input" placeholder="搜索文件夹..." id="graph-search-input">
                        </div>
                        <button class="graph-btn" id="graph-reset-btn" title="重置视图">
                            <i class="fas fa-undo"></i>
                        </button>
                        <button class="graph-btn" id="graph-fullscreen-btn" title="全屏">
                            <i class="fas fa-expand"></i>
                        </button>
                        <button class="graph-btn graph-close-btn" id="graph-close-btn" title="关闭">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="graph-canvas-area" id="graph-canvas">
                    <div class="graph-loading" id="graph-loading">
                        <div class="loading-spinner"></div>
                        <span class="graph-loading-text">正在构建知识图谱...</span>
                    </div>
                    <div class="graph-tooltip" id="graph-tooltip">
                        <div class="graph-tooltip-title">
                            <i class="fas fa-folder"></i>
                            <span id="tooltip-name"></span>
                        </div>
                        <div class="graph-tooltip-path" id="tooltip-path"></div>
                        <div class="graph-tooltip-meta">
                            <span><i class="fas fa-layer-group"></i> 层级: <span id="tooltip-depth"></span></span>
                            <span><i class="fas fa-code-branch"></i> 子节点: <span id="tooltip-children"></span></span>
                        </div>
                    </div>
                    <div class="graph-stats" id="graph-stats">
                        <span><i class="fas fa-folder-tree"></i> 文件夹: <span id="stats-nodes">0</span></span>
                        <span><i class="fas fa-link"></i> 连接: <span id="stats-links">0</span></span>
                    </div>
                    <div class="graph-legend">
                        <div class="graph-legend-title">层级图例</div>
                        <div class="graph-legend-item">
                            <span class="graph-legend-color" style="background: #2E8B57;"></span>
                            <span>根目录</span>
                        </div>
                        <div class="graph-legend-item">
                            <span class="graph-legend-color" style="background: #40E0D0;"></span>
                            <span>一级目录</span>
                        </div>
                        <div class="graph-legend-item">
                            <span class="graph-legend-color" style="background: #7B68EE;"></span>
                            <span>二级目录</span>
                        </div>
                        <div class="graph-legend-item">
                            <span class="graph-legend-color" style="background: #FF6B6B;"></span>
                            <span>三级及更深</span>
                        </div>
                    </div>
                    <div class="graph-zoom-controls">
                        <button class="graph-btn" id="graph-zoom-in" title="放大">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="graph-btn" id="graph-zoom-out" title="缩小">
                            <i class="fas fa-minus"></i>
                        </button>
                        <button class="graph-btn" id="graph-fit-btn" title="适应屏幕">
                            <i class="fas fa-compress-arrows-alt"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.modal = modal;
        this.tooltip = document.getElementById('graph-tooltip');
    }
    bindEvents() {
        document.getElementById('graph-close-btn').addEventListener('click', () => this.close());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('visible')) {
                this.close();
            }
        });
        let mouseDownTarget = null;
        this.modal.addEventListener('mousedown', (e) => {
            mouseDownTarget = e.target;
        });
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal && mouseDownTarget === this.modal) {
                this.close();
            }
        });
        document.getElementById('graph-reset-btn').addEventListener('click', () => this.resetView());
        document.getElementById('graph-zoom-in').addEventListener('click', () => this.zoom(1.2));
        document.getElementById('graph-zoom-out').addEventListener('click', () => this.zoom(1 / 1.2));
        document.getElementById('graph-fit-btn').addEventListener('click', () => this.fitToScreen(true));
        document.getElementById('graph-fullscreen-btn').addEventListener('click', () => this.toggleFullscreen());
        const searchInput = document.getElementById('graph-search-input');
        searchInput.addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.updateHighlight();
        });
        window.addEventListener('resize', () => {
            if (this.modal.classList.contains('visible')) {
                this.updateDimensions();
                this.hotStart();
            }
        });
    }
    async open() {
        this.modal.classList.add('visible');
        document.body.style.overflow = 'hidden';
        if (this.nodes.length === 0) {
            await this.loadData();
        } else {
            this.updateDimensions();
            this.hotStart();
        }
    }
    close() {
        this.modal.classList.remove('visible');
        document.body.style.overflow = '';
        this.hideTooltip();
        this.stopSimulation();
        if (document.fullscreenElement) {
            document.exitFullscreen?.() || document.webkitExitFullscreen?.();
        }
    }
    async loadData() {
        const loading = document.getElementById('graph-loading');
        loading.style.display = 'flex';
        try {
            const token = localStorage.getItem('authToken');
            if (!token) throw new Error('请先登录');
            const response = await fetch(`${API_ENDPOINTS.files}?action=listAllDirs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || '获取目录数据失败');
            this.processData(result.directories);
            this.render();
            document.getElementById('stats-nodes').textContent = this.nodes.length;
            document.getElementById('stats-links').textContent = this.links.length;
        } catch (error) {
            console.error('加载图谱数据失败:', error);
            if (typeof showNotification === 'function') {
                showNotification(`加载图谱失败: ${error.message}`, 'error');
            }
        } finally {
            loading.style.display = 'none';
        }
    }
    processData(directories) {
        const nodeMap = new Map();
        const rootNode = { id: 'root', name: '资源库', path: '', depth: 0, childCount: 0, isRoot: true };
        nodeMap.set('', rootNode);
        directories.forEach(dirPath => {
            const parts = dirPath.split('/').filter(Boolean);
            let currentPath = '';
            parts.forEach((part, index) => {
                const parentPath = currentPath;
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                if (!nodeMap.has(currentPath)) {
                    nodeMap.set(currentPath, {
                        id: currentPath,
                        name: part,
                        path: currentPath,
                        depth: index + 1,
                        childCount: 0,
                        isRoot: false
                    });
                }
                const parentNode = nodeMap.get(parentPath);
                if (parentNode) parentNode.childCount++;
            });
        });
        this.nodes = Array.from(nodeMap.values());
        this.links = [];
        this.nodes.forEach(node => {
            if (node.isRoot) return;
            const parts = node.path.split('/');
            const parentPath = parts.slice(0, -1).join('/');
            if (nodeMap.has(parentPath)) {
                this.links.push({
                    source: nodeMap.get(parentPath),
                    target: node
                });
            } else if (parts.length === 1) {
                this.links.push({
                    source: rootNode,
                    target: node
                });
            }
        });
    }
    render() {
        const canvas = document.getElementById('graph-canvas');
        this.width = canvas.clientWidth;
        this.height = canvas.clientHeight;
        const existingSvg = canvas.querySelector('svg');
        if (existingSvg) existingSvg.remove();
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.setAttribute('width', '100%');
        this.svg.setAttribute('height', '100%');
        canvas.appendChild(this.svg);
        this.g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.svg.appendChild(this.g);
        const linksGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        linksGroup.setAttribute('class', 'links-layer');
        this.g.appendChild(linksGroup);
        const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodesGroup.setAttribute('class', 'nodes-layer');
        this.g.appendChild(nodesGroup);
        this.linkElements = [];
        this.links.forEach(link => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('class', 'graph-link');
            linksGroup.appendChild(line);
            this.linkElements.push({ element: line, data: link });
        });
        this.nodeElements = [];
        this.nodes.forEach(node => {
            const nodeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            nodeG.setAttribute('class', 'graph-node');
            nodeG.dataset.id = node.id;
            const radius = node.isRoot ? 25 : Math.max(8, 16 - node.depth * 2);
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('r', radius);
            circle.setAttribute('fill', this.getNodeColor(node.depth));
            circle.setAttribute('stroke', this.getNodeColor(node.depth));
            circle.setAttribute('stroke-opacity', '0.5');
            nodeG.appendChild(circle);
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.textContent = node.name.length > 15 ? node.name.substring(0, 15) + '...' : node.name;
            text.setAttribute('dy', radius + 15);
            text.setAttribute('text-anchor', 'middle');
            nodeG.appendChild(text);
            nodesGroup.appendChild(nodeG);
            node.radius = radius;
            this.nodeElements.push({ element: nodeG, circle, data: node });
            this.setupNodeInteraction(nodeG, node);
        });
        this.initLayout();
        this.initCanvasInteraction();
        this.startSimulation();
    }
    initLayout() {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        this.nodes.forEach((node, i) => {
            if (node.isRoot) {
                node.x = centerX;
                node.y = centerY;
            } else {
                const angle = (i / this.nodes.length) * 2 * Math.PI;
                const radius = 50 + node.depth * 100;
                node.x = centerX + Math.cos(angle) * (radius + Math.random() * 50);
                node.y = centerY + Math.sin(angle) * (radius + Math.random() * 50);
            }
            node.vx = 0;
            node.vy = 0;
        });
        setTimeout(() => this.fitToScreen(false), 50);
    }
    startSimulation() {
        if (this.simulation.active) return;
        this.simulation.active = true;
        this.simulation.alpha = 1;
        const tick = () => {
            if (!this.simulation.active) return;
            this.calculateForces();
            this.updateNodePositions();
            this.updateDomPositions();
            if (this.simulation.alphaTarget < this.simulation.alpha) {
                this.simulation.alpha += (this.simulation.alphaTarget - this.simulation.alpha) * this.simulation.alphaDecay;
            }
            if (this.simulation.alpha > 0.001) {
                requestAnimationFrame(tick);
            } else {
                this.simulation.active = false;
            }
        };
        requestAnimationFrame(tick);
    }
    hotStart() {
        this.simulation.alpha = 1;
        if (!this.simulation.active) {
            this.startSimulation();
        }
    }
    stopSimulation() {
        this.simulation.active = false;
    }
    calculateForces() {
        const alpha = this.simulation.alpha;
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        this.nodes.forEach(node => {
            if (node.fx != null) return;
            if (node.isRoot) {
                node.vx += (centerX - node.x) * 0.05 * alpha;
                node.vy += (centerY - node.y) * 0.05 * alpha;
                return;
            }
            node.vx += (centerX - node.x) * 0.002 * alpha;
            node.vy += (centerY - node.y) * 0.002 * alpha;
        });
        const chargeStrength = 200;
        const softening = 30;
        for (let i = 0; i < this.nodes.length; i++) {
            const na = this.nodes[i];
            if (na.fx != null) continue;
            for (let j = i + 1; j < this.nodes.length; j++) {
                const nb = this.nodes[j];
                const dx = nb.x - na.x;
                const dy = nb.y - na.y;
                const distSq = dx * dx + dy * dy;
                if (distSq > 250000) continue;
                const dist = Math.sqrt(distSq + softening * softening);
                const force = (chargeStrength * alpha) / (dist * dist);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                na.vx -= fx;
                na.vy -= fy;
                if (nb.fx == null) {
                    nb.vx += fx;
                    nb.vy += fy;
                }
            }
        }
        this.links.forEach(link => {
            const { source, target } = link;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq) || 1;
            const targetDist = 100;
            const strength = 0.03 * alpha;
            const delta = (dist - targetDist) * strength;
            const fx = (dx / dist) * delta;
            const fy = (dy / dist) * delta;
            if (source.fx == null) {
                source.vx += fx;
                source.vy += fy;
            }
            if (target.fx == null) {
                target.vx -= fx;
                target.vy -= fy;
            }
        });
    }
    updateNodePositions() {
        const vDecay = 1 - this.simulation.velocityDecay;
        const maxV = this.simulation.maxVelocity;
        this.nodes.forEach(node => {
            if (node.fx != null) {
                node.x = node.fx;
                node.y = node.fy;
                node.vx = 0;
                node.vy = 0;
            } else {
                node.vx *= vDecay;
                node.vy *= vDecay;
                const speedSq = node.vx * node.vx + node.vy * node.vy;
                const maxVSq = maxV * maxV;
                if (speedSq > maxVSq) {
                    const scale = maxV / Math.sqrt(speedSq);
                    node.vx *= scale;
                    node.vy *= scale;
                }
                node.x += node.vx;
                node.y += node.vy;
            }
        });
    }
    updateDomPositions() {
        this.linkElements.forEach(({ element, data }) => {
            element.setAttribute('x1', data.source.x);
            element.setAttribute('y1', data.source.y);
            element.setAttribute('x2', data.target.x);
            element.setAttribute('y2', data.target.y);
        });
        this.nodeElements.forEach(({ element, data }) => {
            element.setAttribute('transform', `translate(${data.x}, ${data.y})`);
        });
    }
    setupNodeInteraction(element, node) {
        element.addEventListener('mouseenter', (e) => this.showTooltip(node, e));
        element.addEventListener('mouseleave', () => this.hideTooltip());
        const startDrag = (clientX, clientY) => {
            node.fx = node.x;
            node.fy = node.y;
            this.dragStartPos = { x: clientX, y: clientY };
            this.dragStartTime = Date.now();
            this.tooltip.classList.remove('visible');
            this.draggedNode = node;
            this.highlightNode(node);
            this.simulation.alphaTarget = 0.3;
            this.hotStart();
        };
        const moveDrag = (clientX, clientY) => {
            const p = this.getSvgPoint(clientX, clientY);
            node.fx = p.x;
            node.fy = p.y;
        };
        const endDrag = (clientX, clientY) => {
            node.fx = null;
            node.fy = null;
            this.draggedNode = null;
            this.simulation.alphaTarget = 0;
            const dragDuration = Date.now() - this.dragStartTime;
            const dx = clientX - this.dragStartPos.x;
            const dy = clientY - this.dragStartPos.y;
            const dragDistance = Math.sqrt(dx * dx + dy * dy);
            if (dragDuration < 300 && dragDistance < 10) {
                this.onNodeClick(node);
            }
        };
        element.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            startDrag(e.clientX, e.clientY);
            const moveHandler = (moveEvent) => moveDrag(moveEvent.clientX, moveEvent.clientY);
            const upHandler = (upEvent) => {
                document.removeEventListener('mousemove', moveHandler);
                document.removeEventListener('mouseup', upHandler);
                endDrag(upEvent.clientX, upEvent.clientY);
            };
            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('mouseup', upHandler);
        });
    }
    initCanvasInteraction() {
        let isPanning = false;
        let startX, startY;
        let startTranslateX, startTranslateY;
        this.svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom(delta, e.clientX, e.clientY);
        }, { passive: false });
        this.svg.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'svg' || e.target === this.g) {
                isPanning = true;
                startX = e.clientX;
                startY = e.clientY;
                startTranslateX = this.zoomState.translateX;
                startTranslateY = this.zoomState.translateY;
                this.svg.style.cursor = 'grabbing';
            }
        });
        document.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            this.zoomState.translateX = startTranslateX + dx;
            this.zoomState.translateY = startTranslateY + dy;
            this.updateTransform();
        });
        document.addEventListener('mouseup', () => {
            if (isPanning) {
                isPanning = false;
                this.svg.style.cursor = 'grab';
            }
        });
    }
    getSvgPoint(clientX, clientY) {
        const svgRect = this.svg.getBoundingClientRect();
        const x = clientX - svgRect.left;
        const y = clientY - svgRect.top;
        return {
            x: (x - this.zoomState.translateX) / this.zoomState.scale,
            y: (y - this.zoomState.translateY) / this.zoomState.scale
        };
    }
    zoom(factor, centerX, centerY) {
        const oldScale = this.zoomState.scale;
        const newScale = Math.min(Math.max(oldScale * factor, 0.1), 8);
        if (!centerX) {
            const rect = this.svg.getBoundingClientRect();
            centerX = rect.width / 2 + rect.left;
            centerY = rect.height / 2 + rect.top;
        }
        const rect = this.svg.getBoundingClientRect();
        const mouseX = centerX - rect.left;
        const mouseY = centerY - rect.top;
        this.zoomState.translateX = mouseX - (mouseX - this.zoomState.translateX) * (newScale / oldScale);
        this.zoomState.translateY = mouseY - (mouseY - this.zoomState.translateY) * (newScale / oldScale);
        this.zoomState.scale = newScale;
        this.updateTransform();
    }
    updateTransform() {
        this.g.setAttribute('transform', `translate(${this.zoomState.translateX}, ${this.zoomState.translateY}) scale(${this.zoomState.scale})`);
    }
    fitToScreen() {
        if (!this.nodes.length) return;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        this.nodes.forEach(node => {
            minX = Math.min(minX, node.x);
            maxX = Math.max(maxX, node.x);
            minY = Math.min(minY, node.y);
            maxY = Math.max(maxY, node.y);
        });
        const padding = 50;
        const graphWidth = maxX - minX + padding * 2;
        const graphHeight = maxY - minY + padding * 2;
        if (graphWidth <= 0 || graphHeight <= 0) return;
        const scale = Math.min(
            this.width / graphWidth,
            this.height / graphHeight,
            1.2
        ) * 0.9;
        const translateX = (this.width - graphWidth * scale) / 2 - minX * scale + padding * scale;
        const translateY = (this.height - graphHeight * scale) / 2 - minY * scale + padding * scale;
        this.zoomState.scale = scale;
        this.zoomState.translateX = translateX;
        this.zoomState.translateY = translateY;
        this.updateTransform();
    }
    getNodeColor(depth) {
        return this.colorScale[Math.min(depth || 0, this.colorScale.length - 1)];
    }
    showTooltip(node, event, force = false) {
        if (this.draggedNode && !force) return;
        document.getElementById('tooltip-name').textContent = node.name;
        document.getElementById('tooltip-path').textContent = node.path || '根目录';
        document.getElementById('tooltip-depth').textContent = node.depth;
        document.getElementById('tooltip-children').textContent = node.childCount;
        const canvas = document.getElementById('graph-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        const tooltipWidth = 280;
        const tooltipHeight = 150;
        const offset = 15;
        let x = event.clientX - canvasRect.left + offset;
        let y = event.clientY - canvasRect.top + offset;
        if (x + tooltipWidth > canvasRect.width) {
            x = event.clientX - canvasRect.left - tooltipWidth - offset;
        }
        if (y + tooltipHeight > canvasRect.height) {
            y = event.clientY - canvasRect.top - tooltipHeight - offset;
        }
        if (x < 10) x = 10;
        if (y < 10) y = 10;
        x = Math.min(x, canvasRect.width - tooltipWidth - 10);
        y = Math.min(y, canvasRect.height - tooltipHeight - 10);
        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
        this.tooltip.classList.add('visible');
        this.highlightNode(node);
    }
    hideTooltip() {
        if (this.draggedNode) return;
        this.tooltip.classList.remove('visible');
        this.clearHighlight();
    }
    highlightNode(node) {
        const connectedIds = new Set([node.id]);
        this.links.forEach(link => {
            if (link.source.id === node.id) connectedIds.add(link.target.id);
            if (link.target.id === node.id) connectedIds.add(link.source.id);
        });
        this.nodeElements.forEach(({ element, data }) => {
            if (data.id === node.id) {
                element.classList.add('highlighted');
                element.classList.remove('dimmed');
            } else if (connectedIds.has(data.id)) {
                element.classList.remove('highlighted', 'dimmed');
            } else {
                element.classList.add('dimmed');
                element.classList.remove('highlighted');
            }
        });
        this.linkElements.forEach(({ element, data }) => {
            if (data.source.id === node.id || data.target.id === node.id) {
                element.classList.add('highlighted');
                element.classList.remove('dimmed');
            } else {
                element.classList.add('dimmed');
                element.classList.remove('highlighted');
            }
        });
    }
    clearHighlight() {
        this.nodeElements.forEach(({ element }) => element.classList.remove('highlighted', 'dimmed'));
        this.linkElements.forEach(({ element }) => element.classList.remove('highlighted', 'dimmed'));
        if (this.searchTerm) this.updateHighlight();
    }
    updateHighlight() {
        if (!this.searchTerm) {
            this.clearHighlight();
            return;
        }
        const matchedIds = new Set();
        this.nodes.forEach(node => {
            if (node.name.toLowerCase().includes(this.searchTerm) || node.path.toLowerCase().includes(this.searchTerm)) {
                matchedIds.add(node.id);
            }
        });
        this.nodeElements.forEach(({ element, data }) => {
            if (matchedIds.has(data.id)) {
                element.classList.add('highlighted');
                element.classList.remove('dimmed');
            } else {
                element.classList.remove('highlighted');
                element.classList.add('dimmed');
            }
        });
        this.linkElements.forEach(({ element, data }) => {
            if (matchedIds.has(data.source.id) && matchedIds.has(data.target.id)) {
                element.classList.remove('dimmed');
            } else {
                element.classList.add('dimmed');
            }
        });
    }
    onNodeClick(node) {
        if (node.isRoot) {
            if (typeof fetchAndDisplayFiles === 'function') fetchAndDisplayFiles('');
        } else {
            if (typeof fetchAndDisplayFiles === 'function') fetchAndDisplayFiles(node.path + '/');
        }
        this.close();
        if (typeof showNotification === 'function') {
            showNotification(`已导航到: ${node.name}`, 'success');
        }
    }
    updateDimensions() {
        const canvas = document.getElementById('graph-canvas');
        if (!canvas) return;
        this.width = canvas.clientWidth;
        this.height = canvas.clientHeight;
        if (this.svg) {
            this.svg.setAttribute('width', '100%');
            this.svg.setAttribute('height', '100%');
        }
    }
    toggleFullscreen() {
        const container = document.querySelector('.graph-container');
        if (!document.fullscreenElement) {
            container.requestFullscreen?.() || container.webkitRequestFullscreen?.();
        } else {
            document.exitFullscreen?.() || document.webkitExitFullscreen?.();
        }
    }
    resetView() {
        this.nodes = [];
        this.loadData();
    }
}
let knowledgeGraph = null;
function initKnowledgeGraph() {
    if (!knowledgeGraph) {
        knowledgeGraph = new KnowledgeGraph();
        knowledgeGraph.init();
    }
}
function openKnowledgeGraph() {
    if (!knowledgeGraph) initKnowledgeGraph();
    knowledgeGraph.open();
}
document.addEventListener('DOMContentLoaded', () => { setTimeout(initKnowledgeGraph, 500); });
