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
module.exports = {
    calculateHash,
    cleanDist,
    copyFile
};
