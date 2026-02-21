function showConfirmation({
    title,
    message,
    confirmText = '确认',
    cancelText = '取消',
    confirmClass = '',
    onShow = null
}) {
    return new Promise((resolve) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'confirmation-modal-overlay';
        modalOverlay.innerHTML = `
            <div class="confirmation-modal">
                <h3>${title}</h3>
                <div class="modal-message" style="margin: 1rem 0; line-height: 1.6; color: var(--text-secondary);">${message}</div>
                <div class="confirmation-buttons">
                    ${cancelText ? `<button class="confirm-btn-cancel">${cancelText}</button>` : ''}
                    <button class="confirm-btn ${confirmClass}">${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        if (typeof onShow === 'function') {
            requestAnimationFrame(() => {
                onShow();
            });
        }
        const closeModal = (result) => {
            modalOverlay.classList.add('closing');
            modalOverlay.addEventListener('animationend', () => {
                if (modalOverlay.parentNode) {
                    document.body.removeChild(modalOverlay);
                }
                resolve(result);
            }, {
                once: true
            });
        };
        modalOverlay.querySelector('.confirm-btn').addEventListener('click', () => closeModal(true));
        if (cancelText) {
            modalOverlay.querySelector('.confirm-btn-cancel').addEventListener('click', () => closeModal(false));
        }
        modalOverlay.addEventListener('mousedown', (e) => {
            if (e.target === modalOverlay) {
                closeModal(false);
            }
        });
    });
}
function showPrompt({
    title,
    message,
    initialValue = '',
    placeholder = '',
    confirmText = '确认',
    cancelText = '取消',
    useTextarea = false,
    rows = 4,
    showPreview = false
}) {
    return new Promise((resolve, reject) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'confirmation-modal-overlay';
        let promptContent = '';
        if (showPreview && useTextarea) {
            promptContent = `
                <div class="prompt-tabs">
                    <button class="prompt-tab-btn active" data-tab="edit">编辑</button>
                    <button class="prompt-tab-btn" data-tab="preview">预览</button>
                </div>
                <div class="prompt-input-wrapper">
                    <textarea id="prompt-input" placeholder="${escapeHtml(placeholder)}" rows="${rows}">${escapeHtml(initialValue)}</textarea>
                    <div id="prompt-preview" class="prompt-preview markdown-body" style="display: none; height: ${rows * 2}em; overflow-y: auto;"></div>
                </div>
            `;
        } else {
            const inputHtml = useTextarea
                ? `<textarea id="prompt-input" placeholder="${escapeHtml(placeholder)}" rows="${rows}">${escapeHtml(initialValue)}</textarea>`
                : `<input type="text" id="prompt-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(initialValue)}">`;
            promptContent = `<div class="prompt-input-container">${inputHtml}</div>`;
        }
        modalOverlay.innerHTML = `
            <div class="confirmation-modal ${showPreview ? 'modal-large' : ''}">
                <h3>${title}</h3>
                <p>${message}</p>
                ${promptContent}
                <div class="confirmation-buttons">
                    <button class="confirm-btn-cancel">${cancelText}</button>
                    <button class="confirm-btn">${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const input = modalOverlay.querySelector('#prompt-input');
        const previewEl = modalOverlay.querySelector('#prompt-preview');
        const tabBtns = modalOverlay.querySelectorAll('.prompt-tab-btn');
        input.focus();
        if (!useTextarea) {
            input.select();
        } else {
            input.setSelectionRange(input.value.length, input.value.length);
        }
        if (showPreview && useTextarea) {
            const updatePreview = () => {
                if (typeof renderMarkdown === 'function') {
                    previewEl.innerHTML = renderMarkdown(input.value) || '<p style="color: var(--text-secondary); font-style: italic;">暂无内容预览...</p>';
                } else {
                    previewEl.textContent = input.value;
                }
            };
            tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const tab = btn.dataset.tab;
                    tabBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    if (tab === 'preview') {
                        input.style.display = 'none';
                        previewEl.style.display = 'block';
                        updatePreview();
                    } else {
                        input.style.display = 'block';
                        previewEl.style.display = 'none';
                        input.focus();
                    }
                });
            });
            input.addEventListener('input', () => {
                if (previewEl.style.display === 'block') {
                    updatePreview();
                }
            });
        }
        const closeModal = (value) => {
            modalOverlay.classList.add('closing');
            modalOverlay.addEventListener('animationend', () => {
                if (modalOverlay.parentNode) {
                    document.body.removeChild(modalOverlay);
                }
                if (value !== null) {
                    resolve(value);
                } else {
                    reject(new Error('User cancelled'));
                }
            }, {
                once: true
            });
        };
        modalOverlay.querySelector('.confirm-btn').addEventListener('click', () => closeModal(input.value));
        modalOverlay.querySelector('.confirm-btn-cancel').addEventListener('click', () => closeModal(null));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal(null);
            } else if (e.key === 'Enter' && !useTextarea) {
                closeModal(input.value);
            }
        });
        modalOverlay.addEventListener('mousedown', (e) => {
            if (e.target === modalOverlay) {
                closeModal(null);
            }
        });
    });
}
