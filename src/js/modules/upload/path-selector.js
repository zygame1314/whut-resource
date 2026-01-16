let pathDataCache = null;
let currentSelectedPath = '';
const uploadPathSelector = document.getElementById('upload-path-selector');
const uploadPathBtn = document.getElementById('upload-path-btn');
const uploadPathDropdown = document.getElementById('upload-path-dropdown');
const pathTreeContainer = document.getElementById('path-tree-container');
const selectedPathSpan = document.querySelector('.selected-path');
function updateSelectedPathDisplay() {
    if (selectedPathSpan) {
        selectedPathSpan.textContent = currentSelectedPath ? currentSelectedPath : '根目录';
        selectedPathSpan.title = currentSelectedPath ? currentSelectedPath : '根目录';
    }
}
function updateUrlPath() {
    const url = new URL(window.location);
    if (currentSelectedPath) {
        url.searchParams.set('path', currentSelectedPath);
    } else {
        url.searchParams.delete('path');
    }
    window.history.replaceState({}, '', url);
}
async function fetchDirectories() {
    const token = localStorage.getItem('authToken');
    if (!token) return [];
    try {
        const response = await fetch(`${API_ENDPOINTS.files}?action=listAllDirs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (response.ok && result.success) {
            return result.directories;
        }
        return [];
    } catch (e) {
        console.error('Fetch directories failed:', e);
        return [];
    }
}
function buildDirectoryTree(paths) {
    const tree = {};
    paths.forEach(pathVal => {
        let currentLevel = tree;
        const parts = pathVal.split('/').filter(p => p);
        parts.forEach(part => {
            if (!currentLevel[part]) {
                currentLevel[part] = {};
            }
            currentLevel = currentLevel[part];
        });
    });
    return tree;
}
function renderPathTreeNode(name, children, parentPath, isRoot = false) {
    const node = document.createElement('div');
    node.className = 'path-tree-node';
    const fullPath = isRoot ? '' : (parentPath ? `${parentPath}${name}/` : `${name}/`);
    const hasChildren = Object.keys(children).length > 0;
    const itemDiv = document.createElement('div');
    itemDiv.className = 'path-tree-item';
    if (fullPath === currentSelectedPath) {
        itemDiv.classList.add('active');
    }
    itemDiv.innerHTML = `
        <span class="path-tree-toggle ${hasChildren ? '' : 'is-empty'}">
            <i class="fas fa-caret-right"></i>
        </span>
        <span class="path-tree-icon">
            <i class="fas fa-folder"></i>
        </span>
        <span class="path-tree-name">${name}</span>
    `;
    itemDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.path-tree-item.active').forEach(el => el.classList.remove('active'));
        itemDiv.classList.add('active');
        currentSelectedPath = fullPath;
        updateSelectedPathDisplay();
        updateUrlPath();
        uploadPathDropdown.classList.remove('show');
    });
    const toggleBtn = itemDiv.querySelector('.path-tree-toggle');
    if (hasChildren) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const childrenContainer = node.querySelector('.path-tree-children');
            if (childrenContainer) {
                const isExpanded = childrenContainer.style.display !== 'none';
                childrenContainer.style.display = isExpanded ? 'none' : 'block';
                toggleBtn.classList.toggle('expanded', !isExpanded);
            }
        });
    }
    node.appendChild(itemDiv);
    if (hasChildren) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'path-tree-children';
        childrenContainer.style.display = 'none';
        Object.keys(children).sort().forEach(childName => {
            childrenContainer.appendChild(renderPathTreeNode(childName, children[childName], fullPath));
        });
        node.appendChild(childrenContainer);
    }
    return node;
}
async function initUploadPathSelector() {
    if (!uploadPathSelector) return;
    const urlParams = new URLSearchParams(window.location.search);
    const initialPath = urlParams.get('path');
    if (initialPath) currentSelectedPath = initialPath;
    updateSelectedPathDisplay();
    uploadPathBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        uploadPathDropdown.classList.toggle('show');
        if (uploadPathDropdown.classList.contains('show') && !pathDataCache) {
            pathTreeContainer.innerHTML = '<div class="loading-spinner"></div>';
            const dirs = await fetchDirectories();
            pathDataCache = buildDirectoryTree(dirs);
            pathTreeContainer.innerHTML = '';
            const rootNode = renderPathTreeNode('根目录', pathDataCache, '', true);
            pathTreeContainer.appendChild(rootNode);
        }
    });
    document.addEventListener('click', (e) => {
        if (!uploadPathSelector.contains(e.target)) {
            uploadPathDropdown.classList.remove('show');
        }
    });
}
