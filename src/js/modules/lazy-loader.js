(function () {
    'use strict';

    const _loadPromises = {};

    function _loadScript(src) {
        if (_loadPromises[src]) return _loadPromises[src];
        const existing = document.querySelector(`script[src="${src}"]`) ||
            document.querySelector(`script[src="${src.replace(/^lib\//, '')}"]`);
        if (existing) {
            if (existing.readyState === 'complete' || existing.readyState === 'loaded') {
                return Promise.resolve();
            }
            _loadPromises[src] = new Promise((resolve, reject) => {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', () => {
                    delete _loadPromises[src];
                    reject(new Error('Failed to load script: ' + src));
                }, { once: true });
            });
            return _loadPromises[src];
        }
        _loadPromises[src] = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => {
                delete _loadPromises[src];
                reject(new Error('Failed to load script: ' + src));
            };
            document.body.appendChild(script);
        });
        return _loadPromises[src];
    }

    function _loadCSS(href) {
        const key = 'css:' + href;
        if (_loadPromises[key]) return _loadPromises[key];
        const existing = document.querySelector(`link[href="${href}"]`) ||
            document.querySelector(`link[href="${href.replace(/^lib\//, '')}"]`);
        if (existing) {
            return Promise.resolve();
        }
        _loadPromises[key] = new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = () => {
                delete _loadPromises[key];
                reject(new Error('Failed to load CSS: ' + href));
            };
            document.head.appendChild(link);
        });
        return _loadPromises[key];
    }

    async function loadMarkdownBase() {
        if (typeof marked !== 'undefined' && marked.__baseLoaded) return;
        if (typeof marked !== 'undefined') marked.__baseLoaded = true;
        await _loadScript('lib/marked/marked.min.js');
        marked.__baseLoaded = true;
        await _loadScript('lib/marked-footnote/index.umd.min.js');
        await _loadScript('lib/dompurify/purify.min.js');
    }

    async function loadHighlight() {
        if (typeof hljs !== 'undefined' && window.markedHighlight) return;
        if (typeof marked !== 'undefined' && marked.__highlightLoaded) return;
        await _loadCSS('lib/highlight.js/github-dark.min.css');
        await _loadScript('lib/highlight.js/highlight.min.js');
        await _loadScript('lib/marked-highlight/index.umd.js');
        if (typeof marked !== 'undefined') marked.__highlightLoaded = true;
    }

    async function loadKatex() {
        if (typeof katex !== 'undefined' && window.markedKatexExtension) return;
        if (typeof marked !== 'undefined' && marked.__katexLoaded) return;
        await _loadCSS('lib/katex/katex.min.css');
        await _loadScript('lib/katex/katex.min.js');
        await _loadScript('lib/marked-katex-extension/index.umd.js');
        if (typeof marked !== 'undefined') marked.__katexLoaded = true;
    }

    async function loadJSZip() {
        if (typeof JSZip !== 'undefined') return;
        await _loadScript('lib/jszip/jszip.min.js');
    }

    async function loadShepherd() {
        if (typeof Shepherd !== 'undefined') return;
        await _loadCSS('lib/shepherd.js/css/shepherd.css');
        await _loadScript('lib/shepherd.js/js/shepherd.min.js');
    }

    async function loadPDFLib() {
        if (typeof PDFLib !== 'undefined') return;
        await _loadScript('lib/pdf-lib/pdf-lib.min.js');
    }

    async function loadPDFJS() {
        if (window.pdfjsLib) return window.pdfjsLib;
        await _loadScript('lib/pdfjs/pdf.min.js');
        window.pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'] || window.pdfjs;
        if (!window.pdfjsLib) {
            throw new Error('pdf.js 加载失败：未找到 pdfjsLib 全局对象');
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdfjs/pdf.worker.min.js';
        return window.pdfjsLib;
    }

    window.LazyLoader = {
        loadMarkdownBase,
        loadHighlight,
        loadKatex,
        loadJSZip,
        loadShepherd,
        loadPDFLib,
        loadPDFJS,
        loadScript: _loadScript
    };
})();