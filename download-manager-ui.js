/** DEV MODE - Generated at 22:32:41 */
// --- Module: modules/download-manager-ui.js ---
(function () {
    'use strict';
    const CONTAINER_ID = 'download-manager-container';
    const FAB_ID = 'download-manager-fab';
    const PANEL_ID = 'download-manager-panel';
    let isPanelOpen = false;
    function init() {
        if (document.getElementById(CONTAINER_ID)) return;
        createContainer();
        bindEvents();
    }
    function createContainer() {
        const container = document.createElement('div');
        container.id = CONTAINER_ID;
        container.className = 'download-manager-container';
        container.innerHTML = `
            <button id="${FAB_ID}" class="download-manager-fab" style="display: none;" title="下载调度器">
                <i class="fas fa-download"></i>
                <span class="fab-badge" style="display: none;">0</span>
            </button>
            <div id="${PANEL_ID}" class="download-manager-panel">
                <div class="dm-panel-header">
                    <div class="dm-header-left">
                        <i class="fas fa-tasks"></i>
                        <span>下载任务</span>
                    </div>
                    <div class="dm-header-right">
                        <button class="dm-close-btn" id="dm-close-panel" title="收起面板">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                </div>
                <div class="dm-panel-body" id="dm-task-list">
                    <div class="dm-empty-state">
                        <i class="fas fa-inbox"></i>
                        <span>暂无下载任务</span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);
    }
    function bindEvents() {
        document.getElementById(FAB_ID).addEventListener('click', togglePanel);
        document.getElementById('dm-close-panel').addEventListener('click', closePanel);
        if (window.DownloadManager) {
            const dm = window.DownloadManager;
            dm.on('taskAdded', onTaskAdded);
            dm.on('taskStarted', onTaskUpdated);
            dm.on('taskProgress', onTaskUpdated);
            dm.on('taskPaused', onTaskUpdated);
            dm.on('taskResumed', onTaskUpdated);
            dm.on('taskCompleted', onTaskCompleted);
            dm.on('taskError', onTaskUpdated);
            dm.on('taskCancelled', onTaskUpdated);
            dm.on('taskRemoved', onTaskRemoved);
        }
    }
    function togglePanel() {
        isPanelOpen = !isPanelOpen;
        const container = document.getElementById(CONTAINER_ID);
        if (isPanelOpen) {
            container.classList.add('expanded');
        } else {
            container.classList.remove('expanded');
        }
    }
    function closePanel() {
        isPanelOpen = false;
        const container = document.getElementById(CONTAINER_ID);
        container.classList.remove('expanded');
    }
    function onTaskAdded({ task }) {
        showFab();
        renderTaskList();
        updateFabBadge();
        if (!isPanelOpen) {
            togglePanel();
        }
    }
    function onTaskUpdated({ task }) {
        updateTaskItem(task);
        updateFabBadge();
    }
    function onTaskCompleted({ task }) {
        updateTaskItem(task);
        updateFabBadge();
    }
    function onTaskRemoved({ taskId }) {
        const item = document.getElementById(`dm-task-${taskId}`);
        if (item) {
            item.classList.add('dm-task-exit');
            setTimeout(() => {
                item.remove();
                checkEmptyState();
            }, 300);
        }
        updateFabBadge();
        checkHideFab();
    }
    function showFab() {
        const fab = document.getElementById(FAB_ID);
        if (fab) {
            fab.style.display = 'flex';
        }
    }
    function checkHideFab() {
        const dm = window.DownloadManager;
        if (!dm) return;
        const tasks = dm.getTasks();
        if (tasks.length === 0) {
            const fab = document.getElementById(FAB_ID);
            if (fab) {
                fab.style.display = 'none';
            }
            closePanel();
        }
    }
    function updateFabBadge() {
        const dm = window.DownloadManager;
        if (!dm) return;
        const activeCount = dm.getActiveCount();
        const badge = document.querySelector('.fab-badge');
        if (badge) {
            if (activeCount > 0) {
                badge.textContent = activeCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }
    function renderTaskList() {
        const dm = window.DownloadManager;
        if (!dm) return;
        const container = document.getElementById('dm-task-list');
        const tasks = dm.getTasks();
        if (tasks.length === 0) {
            container.innerHTML = `
                <div class="dm-empty-state">
                    <i class="fas fa-inbox"></i>
                    <span>暂无下载任务</span>
                </div>
            `;
            return;
        }
        container.innerHTML = tasks.map(task => createTaskItemHTML(task)).join('');
        tasks.forEach(task => {
            bindTaskEvents(task.id);
        });
    }
    function createTaskItemHTML(task) {
        const status = window.DownloadTaskStatus;
        const statusClass = getStatusClass(task.status);
        const statusIcon = getStatusIcon(task.status);
        const statusText = getStatusText(task.status);
        const speed = task.status === status.DOWNLOADING ? formatSpeed(task.speed) : '';
        const progress = Math.round(task.progress);
        let actionButtons = '';
        if (task.status === status.DOWNLOADING) {
            actionButtons = `
                <button class="dm-action-btn dm-pause-btn" data-task-id="${task.id}" title="暂停">
                    <i class="fas fa-pause"></i>
                </button>
                <button class="dm-action-btn dm-cancel-btn" data-task-id="${task.id}" title="取消">
                    <i class="fas fa-times"></i>
                </button>
            `;
        } else if (task.status === status.PAUSED) {
            actionButtons = `
                <button class="dm-action-btn dm-resume-btn" data-task-id="${task.id}" title="继续">
                    <i class="fas fa-play"></i>
                </button>
                <button class="dm-action-btn dm-cancel-btn" data-task-id="${task.id}" title="取消">
                    <i class="fas fa-times"></i>
                </button>
            `;
        } else if (task.status === status.PENDING) {
            actionButtons = `
                <button class="dm-action-btn dm-cancel-btn" data-task-id="${task.id}" title="取消">
                    <i class="fas fa-times"></i>
                </button>
            `;
        }
        return `
            <div class="dm-task-item ${statusClass}" id="dm-task-${task.id}" data-status="${task.status}">
                <div class="dm-task-info">
                    <div class="dm-task-name" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</div>
                    <div class="dm-task-meta">
                        <span class="dm-task-status">
                            <i class="${statusIcon}"></i>
                            ${statusText}
                        </span>
                        ${speed ? `<span class="dm-task-speed">${speed}</span>` : ''}
                        <span class="dm-task-progress-text">${progress}%</span>
                    </div>
                </div>
                <div class="dm-task-progress">
                    <div class="dm-progress-bar">
                        <div class="dm-progress-fill ${statusClass}" style="width: ${progress}%"></div>
                    </div>
                </div>
                <div class="dm-task-actions">
                    ${actionButtons}
                </div>
            </div>
        `;
    }
    function updateTaskItem(task) {
        let item = document.getElementById(`dm-task-${task.id}`);
        if (!item) {
            const container = document.getElementById('dm-task-list');
            const emptyState = container.querySelector('.dm-empty-state');
            if (emptyState) emptyState.remove();
            container.insertAdjacentHTML('beforeend', createTaskItemHTML(task));
            bindTaskEvents(task.id);
            return;
        }
        const status = window.DownloadTaskStatus;
        const statusClass = getStatusClass(task.status);
        const statusIcon = getStatusIcon(task.status);
        const statusText = getStatusText(task.status);
        const speed = task.status === status.DOWNLOADING ? formatSpeed(task.speed) : '';
        const progress = Math.round(task.progress);
        const currentStatus = item.dataset.status;
        const statusChanged = currentStatus !== task.status;
        if (statusChanged) {
            item.classList.remove(
                'status-pending', 'status-downloading', 'status-paused',
                'status-packing', 'status-completed', 'status-error', 'status-cancelled'
            );
            if (statusClass) item.classList.add(statusClass);
            const statusEl = item.querySelector('.dm-task-status');
            if (statusEl) {
                statusEl.innerHTML = `<i class="${statusIcon}"></i> ${statusText}`;
            }
            const actionsContainer = item.querySelector('.dm-task-actions');
            if (actionsContainer) {
                let actionButtons = '';
                if (task.status === status.DOWNLOADING) {
                    actionButtons = `
                        <button class="dm-action-btn dm-pause-btn" data-task-id="${task.id}" title="暂停">
                            <i class="fas fa-pause"></i>
                        </button>
                        <button class="dm-action-btn dm-cancel-btn" data-task-id="${task.id}" title="取消">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                } else if (task.status === status.PAUSED) {
                    actionButtons = `
                        <button class="dm-action-btn dm-resume-btn" data-task-id="${task.id}" title="继续">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="dm-action-btn dm-cancel-btn" data-task-id="${task.id}" title="取消">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                } else if (task.status === status.PENDING) {
                    actionButtons = `
                        <button class="dm-action-btn dm-cancel-btn" data-task-id="${task.id}" title="取消">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                }
                actionsContainer.innerHTML = actionButtons;
                if (actionButtons) {
                    bindTaskEvents(task.id);
                }
            }
            item.dataset.status = task.status;
        }
        const progressBarFill = item.querySelector('.dm-progress-fill');
        if (progressBarFill) {
            progressBarFill.style.width = `${progress}%`;
            if (statusChanged) {
                progressBarFill.className = `dm-progress-fill ${statusClass}`;
            }
        }
        const progressText = item.querySelector('.dm-task-progress-text');
        if (progressText) {
            if (progressText.textContent !== `${progress}%`) {
                progressText.textContent = `${progress}%`;
            }
        }
        let speedEl = item.querySelector('.dm-task-speed');
        if (speed) {
            if (!speedEl) {
                const metaEl = item.querySelector('.dm-task-meta');
                if (metaEl) {
                    speedEl = document.createElement('span');
                    speedEl.className = 'dm-task-speed';
                    const statusNode = item.querySelector('.dm-task-status');
                    metaEl.insertBefore(speedEl, statusNode.nextSibling);
                }
            }
            if (speedEl && speedEl.textContent !== speed) {
                speedEl.textContent = speed;
            }
        } else if (speedEl) {
            speedEl.remove();
        }
    }
    function bindTaskEvents(taskId) {
        const dm = window.DownloadManager;
        if (!dm) return;
        const pauseBtn = document.querySelector(`[data-task-id="${taskId}"].dm-pause-btn`);
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => dm.pauseTask(taskId));
        }
        const resumeBtn = document.querySelector(`[data-task-id="${taskId}"].dm-resume-btn`);
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => dm.resumeTask(taskId));
        }
        const cancelBtn = document.querySelector(`[data-task-id="${taskId}"].dm-cancel-btn`);
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => dm.cancelTask(taskId));
        }
    }
    function checkEmptyState() {
        const container = document.getElementById('dm-task-list');
        if (!container.querySelector('.dm-task-item')) {
            container.innerHTML = `
                <div class="dm-empty-state">
                    <i class="fas fa-inbox"></i>
                    <span>暂无下载任务</span>
                </div>
            `;
        }
    }
    function getStatusClass(status) {
        const statusMap = {
            [window.DownloadTaskStatus.PENDING]: 'status-pending',
            [window.DownloadTaskStatus.DOWNLOADING]: 'status-downloading',
            [window.DownloadTaskStatus.PAUSED]: 'status-paused',
            [window.DownloadTaskStatus.PACKING]: 'status-packing',
            [window.DownloadTaskStatus.COMPLETED]: 'status-completed',
            [window.DownloadTaskStatus.ERROR]: 'status-error',
            [window.DownloadTaskStatus.CANCELLED]: 'status-cancelled'
        };
        return statusMap[status] || '';
    }
    function getStatusIcon(status) {
        const iconMap = {
            [window.DownloadTaskStatus.PENDING]: 'fas fa-clock',
            [window.DownloadTaskStatus.DOWNLOADING]: 'fas fa-spinner fa-spin',
            [window.DownloadTaskStatus.PAUSED]: 'fas fa-pause',
            [window.DownloadTaskStatus.PACKING]: 'fas fa-file-archive',
            [window.DownloadTaskStatus.COMPLETED]: 'fas fa-check-circle',
            [window.DownloadTaskStatus.ERROR]: 'fas fa-exclamation-circle',
            [window.DownloadTaskStatus.CANCELLED]: 'fas fa-ban'
        };
        return iconMap[status] || 'fas fa-question';
    }
    function getStatusText(status) {
        const textMap = {
            [window.DownloadTaskStatus.PENDING]: '等待中',
            [window.DownloadTaskStatus.DOWNLOADING]: '下载中',
            [window.DownloadTaskStatus.PAUSED]: '已暂停',
            [window.DownloadTaskStatus.PACKING]: '打包中',
            [window.DownloadTaskStatus.COMPLETED]: '已完成',
            [window.DownloadTaskStatus.ERROR]: '下载失败',
            [window.DownloadTaskStatus.CANCELLED]: '已取消'
        };
        return textMap[status] || '未知';
    }
    function formatSpeed(bytesPerSecond) {
        if (bytesPerSecond < 1024) {
            return `${bytesPerSecond.toFixed(0)} B/s`;
        } else if (bytesPerSecond < 1024 * 1024) {
            return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
        } else {
            return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
        }
    }
    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();


