const fs = require('fs');
const path = require('path');
const https = require('https');
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
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
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
    const hljsDest = path.join(libDir, 'highlight.js', 'highlight.min.js');
    if (!fs.existsSync(hljsDest)) {
        console.log('[DOWNLOADING] highlight.min.js (v11.9.0)...');
        try {
            await downloadFile('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js', hljsDest);
            console.log('[OK] highlight.min.js 已下载');
        } catch (e) {
            console.error('[ERROR] 下载 highlight.min.js 失败:', e.message);
        }
    }
    console.log('--- 依赖同步完成！ ---');
}
sync();
