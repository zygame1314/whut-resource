// --- Module: search-history.js ---
// 搜索历史：localStorage 存储，搜索框聚焦时下拉展示，支持重搜、单条删除与清空全部。
(function () {
    const STORAGE_KEY = 'searchHistory';
    const MAX_HISTORY = 15;

    const searchInputEl = document.getElementById('search-input');
    const searchButtonEl = document.getElementById('search-button');
    if (!searchInputEl || !searchButtonEl) return;

    const searchBox = searchInputEl.closest('.search-box');
    if (!searchBox) return;

    let dropdown = null;

    function loadHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function saveHistory(arr) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
        } catch (e) { /* ignore quota errors */ }
    }

    function addSearchHistory(term) {
        const trimmed = (term || '').trim();
        if (!trimmed) return;
        let arr = loadHistory();
        arr = arr.filter(t => t !== trimmed);
        arr.unshift(trimmed);
        if (arr.length > MAX_HISTORY) arr = arr.slice(0, MAX_HISTORY);
        saveHistory(arr);
    }

    function removeSearchHistory(term) {
        saveHistory(loadHistory().filter(t => t !== term));
        renderDropdown();
    }

    function clearSearchHistory() {
        saveHistory([]);
        renderDropdown();
    }

    function runSearch(term) {
        const value = (term || '').trim();
        if (!value) return;
        searchInputEl.value = value;
        searchInputEl.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof fetchAndDisplayFiles === 'function') {
            fetchAndDisplayFiles('', value, 1);
        }
        hideDropdown();
    }

    function buildDropdown() {
        if (dropdown) return dropdown;
        dropdown = document.createElement('div');
        dropdown.className = 'search-history-dropdown';
        dropdown.addEventListener('mousedown', (e) => e.preventDefault());
        searchBox.appendChild(dropdown);
        return dropdown;
    }

    function renderDropdown() {
        const el = buildDropdown();
        const history = loadHistory();
        if (history.length === 0) {
            el.innerHTML = `
                <div class="search-history-empty">
                    <i class="fas fa-clock-rotate-left"></i>
                    <span>暂无搜索历史</span>
                </div>`;
            return;
        }
        let html = `
            <div class="search-history-header">
                <span class="search-history-title"><i class="fas fa-clock-rotate-left"></i> 搜索历史</span>
                <button type="button" class="search-history-clear-btn" title="清空全部历史">
                    <i class="fas fa-trash-can"></i> 清空
                </button>
            </div>
            <ul class="search-history-list">`;
        history.forEach((term) => {
            const safe = term.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            html += `
                <li class="search-history-item">
                    <button type="button" class="search-history-term" data-term="${safe}">
                        <i class="fas fa-magnifying-glass"></i>
                        <span class="search-history-text">${safe}</span>
                    </button>
                    <button type="button" class="search-history-remove" data-term="${safe}" title="删除该历史">
                        <i class="fas fa-xmark"></i>
                    </button>
                </li>`;
        });
        html += `</ul>`;
        el.innerHTML = html;

        el.querySelector('.search-history-clear-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            clearSearchHistory();
        });
        el.querySelectorAll('.search-history-term').forEach((btn) => {
            btn.addEventListener('click', () => runSearch(btn.getAttribute('data-term')));
        });
        el.querySelectorAll('.search-history-remove').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeSearchHistory(btn.getAttribute('data-term'));
            });
        });
    }

    function showDropdown() {
        renderDropdown();
        if (!dropdown) return;
        dropdown.classList.add('open');
    }

    function hideDropdown() {
        if (dropdown) dropdown.classList.remove('open');
    }

    searchInputEl.addEventListener('focus', () => showDropdown());
    searchInputEl.addEventListener('input', () => {
        if (!searchInputEl.value.trim()) showDropdown();
        else hideDropdown();
    });
    document.addEventListener('click', (e) => {
        if (!searchBox.contains(e.target)) hideDropdown();
    });
    searchInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideDropdown();
    });

    function recordSearch() {
        const value = searchInputEl.value.trim();
        if (value) addSearchHistory(value);
    }

    searchButtonEl.addEventListener('click', recordSearch);
    searchInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') recordSearch();
    });
})();