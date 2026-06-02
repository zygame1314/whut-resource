const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { distDir } = require('./config');
function calculateHash(content) {
    return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
}
function cleanDist() {
    if (fs.existsSync(distDir)) {
        console.log('正在清理 dist 目录...');
        fs.rmSync(distDir, { recursive: true, force: true });
    }
    fs.mkdirSync(distDir);
}
function copyFile(src, dest) {
    fs.copyFileSync(src, dest);
}
function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
module.exports = {
    calculateHash,
    cleanDist,
    copyFile,
    copyDir
};
