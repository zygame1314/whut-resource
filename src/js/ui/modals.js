function showConfirmation({
    title,
    message,
    confirmText = '确认',
    cancelText = '取消',
    confirmClass = ''
}) {
    return new Promise((resolve) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'confirmation-modal-overlay';
        modalOverlay.innerHTML = `
            <div class="confirmation-modal">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirmation-buttons">
                    <button class="confirm-btn-cancel">${cancelText}</button>
                    <button class="confirm-btn ${confirmClass}">${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
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
        modalOverlay.querySelector('.confirm-btn-cancel').addEventListener('click', () => closeModal(false));
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
    rows = 4
}) {
    return new Promise((resolve, reject) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'confirmation-modal-overlay';
        const inputHtml = useTextarea
            ? `<textarea id="prompt-input" placeholder="${escapeHtml(placeholder)}" rows="${rows}">${escapeHtml(initialValue)}</textarea>`
            : `<input type="text" id="prompt-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(initialValue)}">`;
        modalOverlay.innerHTML = `
            <div class="confirmation-modal">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="prompt-input-container">
                    ${inputHtml}
                </div>
                <div class="confirmation-buttons">
                    <button class="confirm-btn-cancel">${cancelText}</button>
                    <button class="confirm-btn">${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const input = modalOverlay.querySelector('#prompt-input');
        input.focus();
        if (!useTextarea) {
            input.select();
        } else {
            input.setSelectionRange(input.value.length, input.value.length);
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
