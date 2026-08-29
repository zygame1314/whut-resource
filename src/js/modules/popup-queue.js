(function () {
    'use strict';
    if (window.PopupQueue) return;

    const GAP_BETWEEN_POPUPS = 1000;

    const pending = [];
    let running = null;
    let pumpTimer = null;
    let lastClosedAt = 0;
    let seqCounter = 0;

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function runItem(item) {
        let result = null;
        try {
            result = item.show();
        } catch (error) {
            console.error('[PopupQueue] 弹窗展示失败:', error);
        }
        try {
            if (result && typeof result.then === 'function') {
                await result;
            } else if (typeof item.isFinished === 'function') {
                await item.isFinished(result);
            }
        } catch (error) {
            console.error('[PopupQueue] 等待弹窗关闭失败:', error);
        }
        lastClosedAt = Date.now();
        if (item.resolve) {
            item.resolve(result);
        }
        return result;
    }

    function pump() {
        if (pumpTimer) {
            clearTimeout(pumpTimer);
            pumpTimer = null;
        }
        if (running) return;
        pending.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
        const now = Date.now();
        const index = pending.findIndex(item => now >= item.readyAt);
        if (index === -1) {
            if (pending.length) {
                const soonest = Math.min(...pending.map(item => item.readyAt));
                pumpTimer = setTimeout(pump, Math.max(soonest - now, 0));
            }
            return;
        }
        const next = pending.splice(index, 1)[0];
        running = runItem(next).finally(() => {
            running = null;
            pump();
        });
    }

    function enqueue(showFn, options = {}) {
        let resolveItem;
        const finished = new Promise(resolve => {
            resolveItem = resolve;
        });
        const item = {
            show: showFn,
            isFinished: typeof options.isFinished === 'function' ? options.isFinished : null,
            priority: Number(options.priority) || 0,
            readyAt: Date.now() + (Number(options.delay) || 0),
            seq: ++seqCounter,
            resolve: resolveItem
        };
        pending.push(item);
        pump();
        return finished;
    }

    function waitForDetach(element) {
        return new Promise(resolve => {
            if (!element || !element.isConnected) {
                resolve();
                return;
            }
            const usesVisibleClass = element.classList.contains('visible');
            if (usesVisibleClass) {
                const classObserver = new MutationObserver(() => {
                    if (!element.classList.contains('visible')) {
                        classObserver.disconnect();
                        detachObserver.disconnect();
                        resolve();
                    }
                });
                classObserver.observe(element, { attributes: true, attributeFilter: ['class'] });
                const detachObserver = new MutationObserver(() => {
                    if (!element.isConnected) {
                        classObserver.disconnect();
                        detachObserver.disconnect();
                        resolve();
                    }
                });
                detachObserver.observe(document.body, { childList: true });
                return;
            }
            const parent = element.parentNode || document.body;
            const observer = new MutationObserver(() => {
                if (!element.isConnected) {
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(parent, { childList: true });
        });
    }

    window.PopupQueue = { enqueue, waitForDetach };
})();