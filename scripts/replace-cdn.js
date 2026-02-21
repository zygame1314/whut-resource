const fs = require('fs');
const path = require('path');
const rootDir = path.resolve(__dirname, '../');
const mapping = {
    'highlight.js@11.9.0/styles/github-dark.min.css': 'lib/highlight.js/github-dark.min.css',
    'katex@0.16.9/dist/katex.min.css': 'lib/katex/katex.min.css',
    '@fortawesome/fontawesome-free@6.4.0/css/all.min.css': 'lib/fontawesome/css/all.min.css',
    'shepherd.js@10.0.1/dist/css/shepherd.css': 'lib/shepherd.js/css/shepherd.css',
    'marked/marked.min.js': 'lib/marked/marked.min.js',
    'highlight.js@11.9.0/highlight.min.js': 'lib/highlight.js/highlight.min.js',
    'marked-highlight@2.1.0/lib/index.umd.js': 'lib/marked-highlight/index.umd.js',
    'katex@0.16.9/dist/katex.min.js': 'lib/katex/katex.min.js',
    'marked-katex-extension@5.1.7/lib/index.umd.js': 'lib/marked-katex-extension/index.umd.js',
    'marked-footnote@1.2.2/dist/index.umd.min.js': 'lib/marked-footnote/index.umd.min.js',
    'dompurify@3.0.5/dist/purify.min.js': 'lib/dompurify/purify.min.js',
    'shepherd.js@10.0.1/dist/js/shepherd.min.js': 'lib/shepherd.js/js/shepherd.min.js',
    'jszip@3.10.1/dist/jszip.min.js': 'lib/jszip/jszip.min.js',
    'pdf-lib@1.17.1/dist/pdf-lib.min.js': 'lib/pdf-lib/pdf-lib.min.js'
};
function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let hasChanged = false;
    const newContent = content.replace(/https:\/\/cdn\.jsdmirror\.com\/npm\/([^\s"']+)/g, (match, p1) => {
        if (mapping[p1]) {
            hasChanged = true;
            return mapping[p1];
        }
        for (const key in mapping) {
            if (p1.includes(key.split('@')[0]) && p1.includes(key.split('/').pop())) {
                hasChanged = true;
                return mapping[key];
            }
        }
        console.warn(`[WARN] 无法识别的 CDN 链接: ${match} 在文件 ${filePath}`);
        return match;
    });
    if (hasChanged) {
        fs.writeFileSync(filePath, newContent);
        console.log(`[OK] 已更新: ${filePath}`);
    }
}
function walk(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== 'dist' && file !== 'lib') {
                walk(fullPath);
            }
        } else if (file.endsWith('.html')) {
            processFile(fullPath);
        }
    });
}
console.log('--- 正在批量替换 HTML 中的 CDN 链接 ---');
walk(rootDir);
console.log('--- 替换完成 ---');
