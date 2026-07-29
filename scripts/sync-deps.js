const fs = require('fs');
const path = require('path');
const { minify: minifyJs } = require('terser');
const rootDir = path.resolve(__dirname, '../');
const libDir = path.join(rootDir, 'lib');
const deps = [
    {
        name: 'katex',
        src: 'node_modules/katex/dist',
        files: ['katex.min.js', 'katex.min.css', 'fonts']
    },
    {
        name: 'fontawesome',
        src: 'node_modules/@fortawesome/fontawesome-free',
        files: ['css/all.min.css', 'webfonts']
    },
    {
        name: 'marked',
        src: 'node_modules/marked',
        files: ['marked.min.js']
    },
    {
        name: 'highlight.js',
        src: 'node_modules/highlight.js/styles',
        files: ['github-dark.min.css']
    },
    {
        name: 'marked-highlight',
        src: 'node_modules/marked-highlight/lib',
        files: ['index.umd.js']
    },
    {
        name: 'marked-katex-extension',
        src: 'node_modules/marked-katex-extension/lib',
        files: ['index.umd.js']
    },
    {
        name: 'marked-footnote',
        src: 'node_modules/marked-footnote/dist',
        files: [
            { src: 'index.umd.js', dest: 'index.umd.min.js' }
        ]
    },
    {
        name: 'dompurify',
        src: 'node_modules/dompurify/dist',
        files: ['purify.min.js']
    },
    {
        name: 'shepherd.js',
        src: 'node_modules/shepherd.js/dist',
        files: ['js/shepherd.min.js', 'css/shepherd.css']
    },
    {
        name: 'jszip',
        src: 'node_modules/jszip/dist',
        files: ['jszip.min.js']
    },
    {
        name: 'pdf-lib',
        src: 'node_modules/pdf-lib/dist',
        files: ['pdf-lib.min.js']
    },
    {
        name: 'pdfjs',
        src: 'node_modules/pdfjs-dist/build',
        files: ['pdf.min.js', 'pdf.worker.min.js']
    }
];
function buildHighlightBundle() {
    const hljsDir = path.join(rootDir, 'node_modules', 'highlight.js', 'lib');
    const commonPath = path.join(hljsDir, 'common.js');
    const destPath = path.join(libDir, 'highlight.js', 'highlight.min.js');
    if (!fs.existsSync(commonPath)) {
        console.warn('[SKIP] 未找到 highlight.js/common.js，跳过打包');
        return Promise.resolve();
    }
    console.log('[BUILD] 正在从 node_modules 打包 highlight.min.js ...');
    const langDir = path.join(hljsDir, 'languages');
    let common = fs.readFileSync(commonPath, 'utf8');
    const core = fs.readFileSync(path.join(hljsDir, 'core.js'), 'utf8');
    const coreInlined = core.replace(/module\.exports = highlight;/, 'var hljs = highlight;').replace(/highlight\.HighlightJS = highlight;/, 'hljs.HighlightJS = hljs;');
    common = common.replace(/var hljs = require\('\.\/core'\);/, () => coreInlined);
    common = common.replace(/require\('\.\/languages\/([^']+)'\)/g, (match, langName) => {
        const langPath = path.join(langDir, `${langName}.js`);
        if (!fs.existsSync(langPath)) return match;
        const code = fs.readFileSync(langPath, 'utf8');
        return `(function(){var module={exports:{}};${code}\nreturn module.exports;})()`;
    });
    let bundle = '(function(){' + common.replace(/hljs\.HighlightJS = hljs;/, '').replace(/hljs\.default = hljs;/, '').replace(/module\.exports = hljs;/, '') + 'window.hljs=hljs;})();';
    if (!fs.existsSync(path.dirname(destPath))) fs.mkdirSync(path.dirname(destPath), { recursive: true });
    return minifyJs(bundle, { compress: true, mangle: true }).then(result => {
        fs.writeFileSync(destPath, result.code || bundle);
        const kb = Math.round((result.code || bundle).length / 1024 * 10) / 10;
        console.log(`[OK] highlight.min.js 已打包并压缩 (${kb} KB, 37 种常用语言)`);
    }).catch(e => {
        fs.writeFileSync(destPath, bundle);
        console.warn('[WARN] 压缩失败，使用未压缩版本:', e.message);
    });
}
function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach((childItemName) => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(src, dest);
    }
}
async function sync() {
    console.log('--- 正在同步依赖到 lib 目录 ---');
    if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true });
    }
    for (const dep of deps) {
        const depTargetDir = path.join(libDir, dep.name);
        if (!fs.existsSync(depTargetDir)) {
            fs.mkdirSync(depTargetDir, { recursive: true });
        }
        for (const file of dep.files) {
            const isObj = typeof file === 'object';
            const srcName = isObj ? file.src : file;
            const destName = isObj ? file.dest : file;

            const srcPath = path.join(rootDir, dep.src, srcName);
            const destPath = path.join(depTargetDir, destName);
            if (fs.existsSync(srcPath)) {
                copyRecursiveSync(srcPath, destPath);
                console.log(`[OK] 复制 ${dep.name}/${destName}`);
            } else {
                console.warn(`[SKIP] 未找到: ${srcPath}`);
            }
        }
    }
    await buildHighlightBundle();
    console.log('--- 依赖同步完成！ ---');
}
sync();
