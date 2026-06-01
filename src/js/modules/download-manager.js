(function () {
    'use strict';
    const TaskStatus = {
        PENDING: 'pending',
        DOWNLOADING: 'downloading',
        PAUSED: 'paused',
        PACKING: 'packing',
        COMPLETED: 'completed',
        ERROR: 'error',
        CANCELLED: 'cancelled'
    };
    const CONFIG = {
        MAX_CONCURRENT: 3,
        CHUNK_SIZE: 1024 * 1024,
        SPEED_UPDATE_INTERVAL: 500,
    };
    class DownloadTask {
        constructor(id, files, options = {}) {
            this.id = id;
            this.files = files;
            this.options = options;
            this.status = TaskStatus.PENDING;
            this.progress = 0;
            this.downloadedBytes = 0;
            this.totalBytes = 0;
            this.speed = 0;
            this.error = null;
            this.abortController = null;
            this.fileData = new Map();
            this.createdAt = Date.now();
            this.name = options.name || this._generateName();
        }
        _generateName() {
            if (this.files.length === 1) {
                return this.files[0].filename;
            }
            return `批量下载 (${this.files.length} 个文件)`;
        }
    }
    class DownloadManager {
        constructor() {
            this.tasks = new Map();
            this.taskIdCounter = 0;
            this.activeDownloads = 0;
            this.eventListeners = new Map();
            this.jszip = null;
        }
        addTask(files, options = {}) {
            const taskId = `task_${++this.taskIdCounter}_${Date.now()}`;
            const task = new DownloadTask(taskId, files, options);
            this.tasks.set(taskId, task);
            this._emit('taskAdded', { task });
            if (options.autoStart !== false) {
                this._processQueue();
            }
            return taskId;
        }
        pauseTask(taskId) {
            const task = this.tasks.get(taskId);
            if (!task) return false;
            if (task.status === TaskStatus.DOWNLOADING) {
                if (task.abortController) {
                    task.abortController.abort();
                }
                task.status = TaskStatus.PAUSED;
                this.activeDownloads--;
                this._emit('taskPaused', { task });
                return true;
            }
            return false;
        }
        resumeTask(taskId) {
            const task = this.tasks.get(taskId);
            if (!task) return false;
            if (task.status === TaskStatus.PAUSED) {
                task.status = TaskStatus.PENDING;
                this._emit('taskResumed', { task });
                this._processQueue();
                return true;
            }
            return false;
        }
        cancelTask(taskId) {
            const task = this.tasks.get(taskId);
            if (!task) return false;
            if (task.abortController) {
                task.abortController.abort();
            }
            if (task.status === TaskStatus.DOWNLOADING) {
                this.activeDownloads--;
            }
            task.status = TaskStatus.CANCELLED;
            task.fileData.clear();
            this._emit('taskCancelled', { task });
            setTimeout(() => {
                this.tasks.delete(taskId);
                this._emit('taskRemoved', { taskId });
            }, 300);
            return true;
        }
        getTasks() {
            return Array.from(this.tasks.values());
        }
        getActiveCount() {
            return Array.from(this.tasks.values()).filter(
                t => t.status === TaskStatus.DOWNLOADING ||
                    t.status === TaskStatus.PENDING ||
                    t.status === TaskStatus.PACKING
            ).length;
        }
        on(event, callback) {
            if (!this.eventListeners.has(event)) {
                this.eventListeners.set(event, []);
            }
            this.eventListeners.get(event).push(callback);
        }
        off(event, callback) {
            const listeners = this.eventListeners.get(event);
            if (listeners) {
                const index = listeners.indexOf(callback);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        }
        _emit(event, data) {
            const listeners = this.eventListeners.get(event);
            if (listeners) {
                listeners.forEach(callback => {
                    try {
                        callback(data);
                    } catch (e) {
                        console.error('Event listener error:', e);
                    }
                });
            }
        }
        async _processQueue() {
            while (this.activeDownloads < CONFIG.MAX_CONCURRENT) {
                const pendingTask = Array.from(this.tasks.values()).find(
                    t => t.status === TaskStatus.PENDING
                );
                if (!pendingTask) break;
                this.activeDownloads++;
                this._startDownload(pendingTask);
            }
        }
        async _startDownload(task) {
            task.status = TaskStatus.DOWNLOADING;
            task.abortController = new AbortController();
            this._emit('taskStarted', { task });
            const token = localStorage.getItem('authToken');
            if (!token) {
                task.status = TaskStatus.ERROR;
                task.error = '未登录，请先登录后再试';
                this.activeDownloads--;
                this._emit('taskError', { task });
                return;
            }
            try {
                const isSingleFile = task.files.length === 1;
                const downloadedFiles = [];
                task._lastSpeedTime = Date.now();
                task._lastSpeedBytes = 0;
                for (let i = 0; i < task.files.length; i++) {
                    if (task.status === TaskStatus.PAUSED || task.status === TaskStatus.CANCELLED) {
                        return;
                    }
                    const file = task.files[i];
                    const fileData = await this._downloadFile(task, file, i);
                    if (fileData) {
                        downloadedFiles.push({
                            filename: file.filename,
                            data: fileData
                        });
                    }
                }
                if (task.status === TaskStatus.PAUSED || task.status === TaskStatus.CANCELLED) return;
                if (isSingleFile && downloadedFiles.length === 1) {
                    this._triggerBrowserDownload(
                        downloadedFiles[0].data,
                        downloadedFiles[0].filename
                    );
                } else if (downloadedFiles.length > 0) {
                    task.status = TaskStatus.PACKING;
                    task.progress = 90;
                    task.speed = 0;
                    this._emit('taskProgress', { task });
                    const zipBlob = await this._createZip(downloadedFiles, task);
                    const zipName = task.options.zipName || `批量下载_${this._formatDate()}.zip`;
                    this._triggerBrowserDownload(zipBlob, zipName);
                }
                task.status = TaskStatus.COMPLETED;
                task.progress = 100;
                task.fileData.clear();
                this.activeDownloads--;
                this._emit('taskCompleted', { task });
                setTimeout(() => {
                    if (this.tasks.has(task.id)) {
                        this.tasks.delete(task.id);
                        this._emit('taskRemoved', { taskId: task.id });
                    }
                }, 3000);
                this._processQueue();
            } catch (error) {
                if (error.name === 'AbortError') {
                    return;
                }
                console.error("Task failed:", error);
                task.status = TaskStatus.ERROR;
                task.error = error.message || '下载失败';
                this.activeDownloads--;
                this._emit('taskError', { task });
                this._processQueue();
            }
        }
        async _downloadFile(task, file, index) {
            let fileInfo = task.fileData.get(file.key);
            if (!fileInfo) {
                fileInfo = { chunks: [], savedSize: 0, totalSize: 0, completed: false };
                task.fileData.set(file.key, fileInfo);
            }
            if (fileInfo.completed) {
                return new Blob(fileInfo.chunks);
            }
            const downloadUrl = `${API_BASE}${file.urlPath}`;
            const headers = {};
            if (fileInfo.savedSize > 0) {
                headers['Range'] = `bytes=${fileInfo.savedSize}-`;
            }
            const response = await fetch(downloadUrl, {
                headers: headers,
                signal: task.abortController.signal
            });
            if (!response.ok) {
                let errMsg = `下载失败: ${response.status}`;
                try {
                    const errData = await response.json();
                    if (errData && errData.error) errMsg = errData.error;
                } catch (_) { }
                throw new Error(errMsg);
            }
            if (response.status === 200 && fileInfo.savedSize > 0) {
                fileInfo.chunks = [];
                fileInfo.savedSize = 0;
            }
            const contentLength = response.headers.get('content-length');
            const currentContentSize = contentLength ? parseInt(contentLength, 10) : 0;
            if (fileInfo.totalSize === 0) {
                if (response.status === 206) {
                    const contentRange = response.headers.get('content-range');
                    if (contentRange) {
                        const match = contentRange.match(/\/(\d+)$/);
                        if (match) {
                            fileInfo.totalSize = parseInt(match[1], 10);
                        }
                    } else {
                        fileInfo.totalSize = fileInfo.savedSize + currentContentSize;
                    }
                } else {
                    fileInfo.totalSize = currentContentSize;
                }
            }
            task.totalBytes = this._calculateTotalBytes(task);
            const reader = response.body.getReader();
            if (!task._lastSpeedTime) {
                task._lastSpeedTime = Date.now();
                task._lastSpeedBytes = this._calculateTotalDownloaded(task);
            }
            let lastEmittedProgress = task.progress;
            const completedCount = index;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                fileInfo.chunks.push(value);
                fileInfo.savedSize += value.length;
                const totalDownloaded = this._calculateTotalDownloaded(task);
                task.downloadedBytes = totalDownloaded;
                let currentFileProgress = 0;
                if (fileInfo.totalSize > 0) {
                    currentFileProgress = fileInfo.savedSize / fileInfo.totalSize;
                }
                const downloadWeight = task.files.length > 1 ? 90 : 100;
                const totalProgress = ((completedCount + currentFileProgress) / task.files.length) * downloadWeight;
                task.progress = Math.min(downloadWeight - 1, Math.floor(totalProgress));
                const now = Date.now();
                const timeDiff = now - task._lastSpeedTime;
                if (timeDiff >= CONFIG.SPEED_UPDATE_INTERVAL) {
                    const bytesDiff = totalDownloaded - task._lastSpeedBytes;
                    const instantSpeed = (bytesDiff / timeDiff) * 1000;
                    if (task.speed === 0) {
                        task.speed = instantSpeed;
                    } else {
                        task.speed = (instantSpeed * 0.2) + (task.speed * 0.8);
                    }
                    task._lastSpeedTime = now;
                    task._lastSpeedBytes = totalDownloaded;
                }
                if (task.progress !== lastEmittedProgress) {
                    lastEmittedProgress = task.progress;
                    this._emit('taskProgress', { task });
                }
            }
            const endTime = Date.now();
            const elapsed = endTime - task._lastSpeedTime;
            if (elapsed > 100) {
                const totalDownloaded = this._calculateTotalDownloaded(task);
                const bytesDiff = totalDownloaded - task._lastSpeedBytes;
                const instantSpeed = (bytesDiff / elapsed) * 1000;
                if (task.speed === 0) {
                    task.speed = instantSpeed;
                } else {
                    task.speed = (instantSpeed * 0.2) + (task.speed * 0.8);
                }
                task._lastSpeedTime = endTime;
                task._lastSpeedBytes = totalDownloaded;
            }
            this._emit('taskProgress', { task });
            fileInfo.completed = true;
            const blob = new Blob(fileInfo.chunks);
            return blob;
        }
        _calculateTotalDownloaded(task) {
            let total = 0;
            for (const info of task.fileData.values()) {
                total += info.savedSize;
            }
            return total;
        }
        _calculateTotalBytes(task) {
            let total = 0;
            for (const info of task.fileData.values()) {
                total += info.totalSize;
            }
            return total;
        }
        async _createZip(files, task) {
            if (typeof JSZip === 'undefined') {
                throw new Error('JSZip 未加载，请刷新页面重试');
            }
            const zip = new JSZip();
            for (const file of files) {
                zip.file(file.filename, file.data);
            }
            const zipBlob = await zip.generateAsync(
                {
                    type: 'blob',
                    compression: 'DEFLATE',
                    compressionOptions: { level: 6 }
                },
                (metadata) => {
                    task.progress = 90 + Math.round(metadata.percent * 0.1);
                    this._emit('taskProgress', { task });
                }
            );
            return zipBlob;
        }
        _triggerBrowserDownload(blob, filename) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 1000);
        }
        _formatDate() {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            const h = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            return `${y}${m}${d}_${h}${min}`;
        }
    }
    window.DownloadManager = new DownloadManager();
    window.DownloadTaskStatus = TaskStatus;
})();
