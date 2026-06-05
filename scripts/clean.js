const fs = require('fs');
const path = require('path');
const rootDir = path.resolve(__dirname, '..');
const pathsToRemove = [
    'dist',
    'script.js',
    'upload.js',
    'auth.js',
    'config.js',
    'announcements.js',
    'guestbook.js',
    'graph.js',
    'tutorial.js',
    'browser-guide.js',
    'site-stats.js',
    'download-log.js',
    'donation-popup.js',
    'download-manager.js',
    'download-manager-ui.js',
    'oauth.js',
    'page-viewer.js',
    'npm-debug.log',
    'yarn-debug.log',
    'yarn-error.log',
    'pnpm-debug.log'
];
console.log('正在清理临时文件...');
pathsToRemove.forEach(item => {
    const fullPath = path.join(rootDir, item);
    try {
        if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log(`已删除: ${item}`);
        }
    } catch (err) {
        console.error(`删除失败 ${item}:`, err.message);
    }
});
const cssDir = path.join(rootDir, 'css');
if (fs.existsSync(cssDir)) {
    try {
        const files = fs.readdirSync(cssDir);
        files.forEach(file => {
            if (file.endsWith('.css')) {
                fs.unlinkSync(path.join(cssDir, file));
                console.log(`已删除: css/${file}`);
            }
        });
    } catch (err) {
        console.error('清理 css 目录失败:', err.message);
    }
}
console.log('清理完成！');
