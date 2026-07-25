let _pinnedCarouselBound = false;
let _pinnedAnimId = 0;
function renderPinnedGuestbook() {
    const pinnedArea = document.getElementById('guestbook-pinned-area');
    const pinnedTrack = document.getElementById('guestbook-pinned-track');
    const pinnedDots = document.getElementById('guestbook-pinned-dots');
    if (!pinnedArea || !pinnedTrack) return;
    if (pinnedGuestbookMessages.length > 0) {
        pinnedArea.style.display = '';
        pinnedTrack.innerHTML = pinnedGuestbookMessages.map((msg, i) =>
            `<div class="guestbook-pinned-item" data-pinned-index="${i}" style="display:${i === pinnedCarouselIndex ? 'block' : 'none'}">${renderGuestbookItem(msg)}</div>`
        ).join('');
        if (pinnedDots) {
            if (pinnedGuestbookMessages.length > 1) {
                pinnedDots.style.display = '';
                pinnedDots.innerHTML = pinnedGuestbookMessages.map((_, i) =>
                    `<button class="guestbook-pinned-dot${i === pinnedCarouselIndex ? ' active' : ''}" onclick="pinnedCarouselGoTo(${i})"></button>`
                ).join('');
            } else {
                pinnedDots.style.display = 'none';
            }
        }
        startPinnedCarousel();
        bindPinnedCarouselEvents(pinnedArea);
        if (!_pinnedObserver) initPinnedCarouselObserver();
    } else {
        pinnedArea.style.display = 'none';
        stopPinnedCarousel();
    }
}

function updatePinnedCarouselView(direction) {
    const track = document.getElementById('guestbook-pinned-track');
    if (!track) return;
    const items = track.querySelectorAll('.guestbook-pinned-item');
    if (!items.length) return;
    const dots = document.querySelectorAll('#guestbook-pinned-dots .guestbook-pinned-dot');
    dots.forEach((dot, i) => dot.classList.toggle('active', i === pinnedCarouselIndex));
    if (direction === 0) {
        items.forEach((item, i) => { item.style.display = i === pinnedCarouselIndex ? 'block' : 'none'; });
        return;
    }
    _pinnedAnimId++;
    const animId = _pinnedAnimId;
    const currentItem = [...items].find(el => el.style.display !== 'none');
    const nextItem = items[pinnedCarouselIndex];
    if (!currentItem || !nextItem || currentItem === nextItem) return;
    const outClass = direction > 0 ? 'pinned-slide-out-left' : 'pinned-slide-out-right';
    const inClass = direction > 0 ? 'pinned-slide-in-right' : 'pinned-slide-in-left';
    currentItem.classList.add(outClass);
    setTimeout(() => {
        if (_pinnedAnimId !== animId) return;
        currentItem.style.display = 'none';
        currentItem.classList.remove(outClass);
        nextItem.style.display = 'block';
        nextItem.classList.add(inClass);
        setTimeout(() => {
            if (_pinnedAnimId !== animId) return;
            nextItem.classList.remove(inClass);
        }, 250);
    }, 250);
}

function bindPinnedCarouselEvents(pinnedArea) {
    if (_pinnedCarouselBound) return;
    const carouselEl = pinnedArea.querySelector('.guestbook-pinned-carousel');
    if (!carouselEl) return;
    carouselEl.addEventListener('mouseenter', stopPinnedCarousel);
    carouselEl.addEventListener('mouseleave', function () {
        clearTimeout(_pinnedRestartTimer);
        _pinnedRestartTimer = setTimeout(startPinnedCarousel, 300);
    });
    carouselEl.addEventListener('touchstart', stopPinnedCarousel, { passive: true });
    carouselEl.addEventListener('touchend', function () {
        clearTimeout(_pinnedRestartTimer);
        _pinnedRestartTimer = setTimeout(startPinnedCarousel, 1000);
    }, { passive: true });
    pinnedArea.addEventListener('focusin', function () {
        stopPinnedCarousel();
        clearTimeout(_pinnedRestartTimer);
    });
    pinnedArea.addEventListener('focusout', function (e) {
        if (!pinnedArea.contains(e.relatedTarget)) {
            clearTimeout(_pinnedRestartTimer);
            _pinnedRestartTimer = setTimeout(startPinnedCarousel, 1000);
        }
    });
    _pinnedCarouselBound = true;
}

function renderGuestbook(messages) {
    if (!guestbookList) return;
    if (!messages || messages.length === 0) {
        guestbookList.innerHTML = '<div class="empty-state-small"><i class="far fa-comment-dots" style="font-size:2rem;opacity:0.4;display:block;margin-bottom:0.5rem;"></i>暂无留言，快来发布第一条心愿吧！</div>';
        return;
    }
    guestbookList.innerHTML = messages.map(msg => renderGuestbookItem(msg)).join('');
}
function renderGuestbookReply(reply, ctx) {
    const { isAdmin, currentUserId } = ctx;
    const replyNickname = reply.nickname || '匿名用户';
    const replySafeNickname = escapeHtml(replyNickname);
    const replyAvatarChar = replySafeNickname.charAt(0).toUpperCase();
    const replyAvatarColor = getAvatarColor(replyNickname);
    const likedClass = reply.has_liked ? 'active' : '';
    const likeAction = reply.has_liked ? `unlikeGuestbook(${reply.id}, this)` : `likeGuestbook(${reply.id}, this)`;
    const likeIcon = reply.has_liked ? 'fas fa-heart' : 'far fa-heart';
    let replyAdminControls = '';
    let replyAuthorControls = '';
    if (isAdmin) {
        const replyEncodedContent = btoa(encodeURIComponent(reply.content));
        replyAdminControls = `
        <div class="guestbook-admin-controls">
            <button class="icon-btn small" onclick="editGuestbook(${reply.id}, '${replyEncodedContent}')" title="编辑回复">
                <i class="fas fa-edit"></i>
            </button>
            <button class="icon-btn small danger" onclick="deleteGuestbook(${reply.id})" title="删除回复">
                <i class="fas fa-trash"></i>
            </button>
        </div>`;
    }
    if (currentUserId === reply.user_id && !isAdmin) {
        const replyEncodedContent = btoa(encodeURIComponent(reply.content));
        replyAuthorControls = `
        <div class="guestbook-author-controls">
            <button class="icon-btn small" onclick="editGuestbook(${reply.id}, '${replyEncodedContent}')" title="编辑回复">
                <i class="fas fa-edit"></i>
            </button>
            <button class="icon-btn small danger" onclick="deleteGuestbook(${reply.id})" title="删除回复">
                <i class="fas fa-trash"></i>
            </button>
        </div>`;
    }
    return `
        <div class="guestbook-reply-item" data-reply-id="${reply.id}" id="gb-${reply.id}">
            <div class="guestbook-reply-avatar">
                <div class="user-avatar-placeholder reply-avatar" style="background: ${replyAvatarColor}">${reply.isAdmin ? `<i class="fas fa-${reply.isSuperAdmin ? 'crown' : 'shield-alt'} avatar-role-icon reply-role-icon${reply.isSuperAdmin ? ' super' : ''}"></i>` : ''}${replyAvatarChar}</div>
            </div>
            <div class="guestbook-reply-main">
                <div class="guestbook-header">
                    <div class="guestbook-user-info">
                        <div class="user-info-top">
                            <div class="nickname-wrapper">
                                <span class="nickname" title="${replySafeNickname}">${replySafeNickname}</span>
                                <span class="reply-indicator"><i class="fas fa-reply"></i></span>
                            </div>
                            <span class="timestamp">${formatDateLocal(reply.created_at)}</span>
                        </div>
                    </div>
                    ${replyAdminControls}${replyAuthorControls}
                </div>
                <div class="guestbook-content">${escapeHtml(reply.content)}</div>
                <div class="guestbook-footer">
                    <button class="like-btn ${likedClass}" onclick="${likeAction}">
                        <i class="${likeIcon}"></i> <span>${reply.likes}</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}
function renderGuestbookItem(msg) {
    const isAdmin = isGuestbookAdmin(window.currentUser);
    const isSuperAdmin = isGuestbookSuperAdmin(window.currentUser);
    const currentUserId = window.currentUser ? window.currentUser.id : null;
    const isAuthor = currentUserId === msg.user_id;
        const likedClass = msg.has_liked ? 'active' : '';
        const likeAction = msg.has_liked ? `unlikeGuestbook(${msg.id}, this)` : `likeGuestbook(${msg.id}, this)`;
        const likeIcon = msg.has_liked ? 'fas fa-heart' : 'far fa-heart';
        let adminControls = '';
        let authorControls = '';
        if (isAdmin) {
            const visibilityIcon = msg.is_hidden ? 'fas fa-eye-slash' : 'fas fa-eye';
            const visibilityTitle = msg.is_hidden ? '取消隐藏' : '隐藏留言';
            const visibilityClass = msg.is_hidden ? 'status-hidden' : '';
            const pinIcon = msg.is_pinned ? 'fas fa-thumbtack' : 'fas fa-thumbtack';
            const pinTitle = msg.is_pinned ? '取消置顶' : '置顶留言';
            const pinClass = msg.is_pinned ? 'active' : '';
            const pinAction = msg.is_pinned ? 'unpin' : 'pin';
            const statusIcon = msg.status === 'resolved' ? 'fas fa-check-circle' : 'far fa-check-circle';
            const statusTitle = msg.status === 'resolved' ? '标记为未解决' : '标记为已解决';
            const statusClass = msg.status === 'resolved' ? 'success' : '';
            const rejectIcon = msg.status === 'rejected' ? 'fas fa-times-circle' : 'far fa-times-circle';
            const rejectTitle = msg.status === 'rejected' ? '取消驳回' : '驳回留言';
            const rejectClass = msg.status === 'rejected' ? 'danger' : '';
            const encodedContent = btoa(encodeURIComponent(msg.content));
            adminControls = `
                <div class="guestbook-admin-controls">
                    <button class="icon-btn small ai-btn" onclick="aiProcessGuestbook(${msg.id})" title="AI 分析处理">
                        <i class="fas fa-robot"></i>
                    </button>
                    <button class="icon-btn small ${pinClass}" onclick="handleGuestbookAction(${msg.id}, '${pinAction}')" title="${pinTitle}">
                        <i class="${pinIcon}"></i>
                    </button>
                    <button class="icon-btn small ${statusClass}" onclick="${msg.status === 'resolved' ? `handleGuestbookAction(${msg.id}, 'unresolve')` : `resolveGuestbook(${msg.id})`}" title="${statusTitle}">
                        <i class="${statusIcon}"></i>
                    </button>
                    <button class="icon-btn small ${rejectClass}" onclick="${msg.status === 'rejected' ? `handleGuestbookAction(${msg.id}, 'unreject')` : `rejectGuestbook(${msg.id})`}" title="${rejectTitle}">
                        <i class="${rejectIcon}"></i>
                    </button>
                    <button class="icon-btn small ${visibilityClass}" onclick="toggleGuestbookVisibility(${msg.id}, ${msg.is_hidden})" title="${visibilityTitle}">
                        <i class="${visibilityIcon}"></i>
                    </button>
                    <button class="icon-btn small" onclick="editGuestbook(${msg.id}, '${encodedContent}')" title="编辑留言">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${msg.is_banned ? `
                    <button class="icon-btn small success" onclick="confirmUnbanUser(${msg.id})" title="解封用户${!isSuperAdmin ? '（需审批）' : ''}">
                        <i class="fas fa-user-check"></i>
                    </button>
                    ` : `
                    <button class="icon-btn small danger" onclick="confirmBanUser(${msg.id})" title="封禁用户${!isSuperAdmin ? '（需审批）' : ''}">
                        <i class="fas fa-user-slash"></i>
                    </button>
                    `}
                    <button class="icon-btn small danger" onclick="deleteGuestbook(${msg.id})" title="删除留言">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }
        if (isAuthor && !isAdmin) {
            const encodedContent = btoa(encodeURIComponent(msg.content));
            authorControls = `
                <div class="guestbook-author-controls">
                    <button class="icon-btn small" onclick="editGuestbook(${msg.id}, '${encodedContent}')" title="编辑留言">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="icon-btn small danger" onclick="deleteGuestbook(${msg.id})" title="删除留言">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }
        const nickname = msg.nickname || '匿名用户';
        const safeNickname = escapeHtml(nickname);
        const avatarChar = getAvatarChars(nickname);
        const avatarColor = getAvatarColor(nickname);
        let statusBadge = '';
        let rejectReasonHtml = '';
        let resolveNoteHtml = '';
        if (msg.status === 'resolved') {
            if (msg.resolve_note) {
                const rn = renderResolveNote(msg.resolve_note);
                resolveNoteHtml = rn.html;
                if (rn.partial) {
                    statusBadge = '<span class="status-badge partial"><i class="fas fa-circle-half-stroke"></i> 部分解决</span>';
                } else {
                    statusBadge = '<span class="status-badge resolved"><i class="fas fa-check"></i> 已解决</span>';
                }
            } else {
                statusBadge = '<span class="status-badge resolved"><i class="fas fa-check"></i> 已解决</span>';
            }
        } else if (msg.status === 'rejected') {
            statusBadge = '<span class="status-badge rejected"><i class="fas fa-times"></i> 已驳回</span>';
            if (msg.reject_reason) {
                rejectReasonHtml = `<div class="reject-reason"><div class="reject-reason-header"><i class="fas fa-comment-slash"></i><span>驳回原因</span></div><div class="reject-reason-text">${escapeHtml(msg.reject_reason)}</div></div>`;
            }
        } else {
            statusBadge = '<span class="status-badge unresolved">未解决</span>';
        }
        if (msg.is_hidden && msg.status !== 'rejected') {
            statusBadge = '<span class="status-badge auditing"><i class="fas fa-hourglass-half"></i> 审核中</span>';
        }
        let pinnedBadge = '';
        if (msg.is_pinned) {
            pinnedBadge = '<span class="pinned-badge"><i class="fas fa-thumbtack"></i> 置顶</span>';
        }
        let repliesHtml = '';
        if (msg.replies && msg.replies.length > 0) {
            const replies = msg.replies.map(reply => renderGuestbookReply(reply, { isAdmin, currentUserId })).join('');
            const meta = msg.replyMeta;
            let loadMoreHtml = '';
            if (meta && meta.hasMore) {
                const remaining = (meta.total != null ? meta.total : 0) - msg.replies.length;
                const remainingText = remaining > 0 ? `（还有 ${remaining} 条）` : '';
                loadMoreHtml = `<button class="guestbook-replies-load-more" onclick="loadMoreReplies(${msg.id})"><i class="fas fa-chevron-down"></i> 加载更多回复${remainingText}</button>`;
            }
            repliesHtml = `<div class="guestbook-replies" id="replies-${msg.id}">${replies}${loadMoreHtml}</div>`;
        }
        return `
            <div class="guestbook-item ${msg.is_hidden ? 'is-hidden' : ''} ${msg.is_pinned ? 'is-pinned' : ''}" id="gb-${msg.id}">
                <div class="guestbook-left">
                    <div class="user-avatar-placeholder" style="background: ${avatarColor}">${msg.isAdmin ? `<i class="fas fa-${msg.isSuperAdmin ? 'crown' : 'shield-alt'} avatar-role-icon${msg.isSuperAdmin ? ' super' : ''}"></i>` : ''}${avatarChar}</div>
                </div>
                <div class="guestbook-main">
                    <div class="guestbook-header">
                        <div class="guestbook-user-info">
                            <div class="user-info-top">
                                <div class="nickname-wrapper">
                                    <span class="nickname" title="${safeNickname}">${safeNickname}</span>
                                    ${msg.isAdmin ? `<span class="admin-badge${msg.isSuperAdmin ? ' super' : ''}"><i class="fas fa-${msg.isSuperAdmin ? 'crown' : 'shield-alt'}"></i> ${msg.isSuperAdmin ? '超级管理员' : '管理员'}</span>` : ''}
                                </div>
                                <span class="timestamp">${formatDateLocal(msg.created_at)}</span>
                            </div>
                            <div class="user-badges">
                                ${pinnedBadge}
                                ${statusBadge}
                            </div>
                        </div>
                        ${adminControls}${authorControls}
                    </div>
                    <div class="guestbook-content">${escapeHtml(msg.content)}</div>
                    ${rejectReasonHtml}
                    ${resolveNoteHtml}
                    <div class="guestbook-footer">
                        <button class="like-btn ${likedClass}" onclick="${likeAction}">
                            <i class="${likeIcon}"></i> <span>${msg.likes}</span>
                        </button>
                        <button class="reply-btn" onclick="showReplyForm(${msg.id})">
                            <i class="fas fa-reply"></i> 回复
                        </button>
                    </div>
                    <div id="reply-form-${msg.id}" class="reply-form-container" style="display: none;">
                        <div class="reply-form-wrapper">
                            <textarea id="reply-input-${msg.id}" placeholder="写回复..." maxlength="500"></textarea>
                            <div class="reply-form-actions">
                                <button class="secondary-btn small" onclick="hideReplyForm(${msg.id})">取消</button>
                                <button class="primary-btn small" onclick="submitReply(${msg.id})">发送回复</button>
                            </div>
                        </div>
                    </div>
                    ${repliesHtml}
                </div>
            </div>
        `;
}
function renderResolveNote(note) {
    if (!note) return { html: '', partial: false };
    let paths = [];
    let remark = null;
    let partial = false;
    let parsedOk = false;
    try {
        if (note.trim().startsWith('{')) {
            const obj = JSON.parse(note);
            if (typeof obj === 'object' && obj !== null) {
                const rawPaths = Array.isArray(obj.paths) ? obj.paths : (obj.path ? [obj.path] : []);
                paths = rawPaths.map(p => String(p).trim()).filter(p => p);
                remark = obj.note;
                partial = obj.partial === true;
                parsedOk = true;
            }
        }
    } catch (e) {
    }
    if (parsedOk) {
        let html = '';
        if (paths.length > 0) {
            const items = paths.map((p) => {
                const escapedPath = p.replace(/'/g, "\\'").replace(/"/g, '\\"');
                const safePath = escapeHtml(p);
                return `<a href="javascript:void(0)" class="resolve-note-link resolve-note-path-item" onclick="navigateToPath('${escapedPath}')" title="点击跳转到该目录">${safePath}</a>`;
            }).join('');
            html += `<div class="resolve-note resolve-note-paths"><div class="resolve-note-paths-header"><i class="fas fa-folder-open"></i><span>资源位置</span></div><div class="resolve-note-paths-list">${items}</div></div>`;
        }
        if (remark) {
            html += `<div class="resolve-note resolve-note-text"><div class="resolve-note-text-header"><i class="fas fa-info-circle"></i><span>管理员备注</span></div><div class="resolve-note-text-body">${escapeHtml(remark)}</div></div>`;
        }
        return { html, partial };
    }
    const safeNote = escapeHtml(note);
    const isLikelyPath = /^[\u4e00-\u9fa5a-zA-Z0-9_\-\.()（）\s]+(?:\/[\u4e00-\u9fa5a-zA-Z0-9_\-\.()（）\s]+)*\/?$/.test(note.trim());
    if (isLikelyPath) {
        const escapedPath = note.trim().replace(/'/g, "\\'").replace(/"/g, '\\"');
        return { html: `<div class="resolve-note"><i class="fas fa-folder-open"></i> 资源位置：<a href="javascript:void(0)" class="resolve-note-link" onclick="navigateToPath('${escapedPath}')" title="点击跳转到该目录">${safeNote}</a></div>`, partial: false };
    } else {
        return { html: `<div class="resolve-note resolve-note-text"><i class="fas fa-info-circle"></i> 管理员备注：${safeNote}</div>`, partial: false };
    }
}
function renderGuestbookPagination(hasMore, hasPrev) {
    if (!guestbookPagination) return;
    let totalLoaded = 0;
    for (const page of guestbookCursorStack) {
        if (page.messages) totalLoaded += page.messages.length;
    }
    if (!hasMore && !hasPrev && totalLoaded <= GUESTBOOK_PER_PAGE) {
        guestbookPagination.innerHTML = totalLoaded > 0
            ? `<span class="guestbook-loaded-count" style="color:var(--text-secondary);font-size:0.85rem;">已加载 ${totalLoaded} 条</span>`
            : '';
        guestbookPagination.style.display = totalLoaded > 0 ? 'flex' : 'none';
        return;
    }
    guestbookPagination.style.display = 'flex';
    guestbookPagination.innerHTML = `
        ${hasPrev ? `<button class="secondary-btn small" onclick="changeGuestbookPage('prev')"><i class="fas fa-chevron-left"></i> <span class="pagination-btn-text">上一页</span></button>` : ''}
        <span class="guestbook-loaded-count" style="color:var(--text-secondary);font-size:0.85rem;">已加载 ${totalLoaded} 条</span>
        ${hasMore ? `<button class="secondary-btn small" onclick="changeGuestbookPage('next')"><span class="pagination-btn-text">下一页</span> <i class="fas fa-chevron-right"></i></button>` : ''}
    `;
}
