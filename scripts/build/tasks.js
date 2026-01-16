const fs = require('fs');
const path = require('path');
const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const { minify: minifyJs } = require('terser');
const { srcDir, distDir, jsSrcDir, excludeDirs, excludeFiles, jsBundles } = require('./config');
const { calculateHash, copyFile } = require('./utils');
async function processAssetsAndBuildMap(currentDir, fileHashMap) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(currentDir, entry.name);
        const relPath = path.relative(srcDir, srcPath);
        if (currentDir === srcDir && excludeDirs.includes(entry.name)) continue;
        if (currentDir === srcDir && excludeFiles.includes(entry.name)) continue;
        if (entry.isDirectory()) {
            await processAssetsAndBuildMap(srcPath, fileHashMap);
        } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === '.css' || (ext === '.js' && entry.name !== 'sw.js')) {
                try {
                    let content = fs.readFileSync(srcPath, 'utf8');
                    let output = content;
                    if (ext === '.css') {
                        output = new CleanCSS({}).minify(content).styles;
                    } else if (ext === '.js') {
                        const minified = await minifyJs(content, { compress: true, mangle: true });
                        output = minified.code || content;
                    }
                    const hash = calculateHash(output);
                    const parsedPath = path.parse(relPath);
                    const originalName = relPath.replace(/\\/g, '/');
                    const hashedName = path.join(parsedPath.dir, `${parsedPath.name}.${hash}${parsedPath.ext}`).replace(/\\/g, '/');
                    fileHashMap[originalName] = hashedName;
                    const destPath = path.join(distDir, hashedName);
                    const destDir = path.dirname(destPath);
                    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
                    fs.writeFileSync(destPath, output);
                    console.log(`已处理并哈希: ${originalName} -> ${hashedName}`);
                } catch (e) {
                    console.error(`处理资产 ${relPath} 失败:`, e);
                }
            }
        }
    }
}
async function buildScripts(fileHashMap) {
    const buildBundle = async (modules, outputName) => {
        console.log(`正在打包 ${outputName}...`);
        let content = '';
        for (const module of modules) {
            const modulePath = path.join(jsSrcDir, module);
            try {
                if (fs.existsSync(modulePath)) {
                    content += fs.readFileSync(modulePath, 'utf8') + '\n';
                } else {
                    console.error(`警告：未在 ${modulePath} 找到模块 (for ${outputName}) ${module}`);
                }
            } catch (e) {
                console.error(`读取模块失败: ${modulePath}`, e);
            }
        }
        try {
            const minified = await minifyJs(content, { compress: true, mangle: true, sourceMap: false });
            const output = minified.code || content;
            const hash = calculateHash(output);
            const hashedName = `${path.parse(outputName).name}.${hash}.js`;
            fileHashMap[outputName] = hashedName;
            fs.writeFileSync(path.join(distDir, hashedName), output);
            console.log(`已打包并哈希: ${outputName} -> ${hashedName}`);
        } catch (e) {
            console.error(`打包 ${outputName} 时出错:`, e);
            fs.writeFileSync(path.join(distDir, outputName), content);
            fileHashMap[outputName] = outputName;
        }
    };
    for (const [outputName, modules] of Object.entries(jsBundles)) {
        await buildBundle(modules, outputName);
    }
}
async function processHtmlAndOthers(currentDir, fileHashMap) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(currentDir, entry.name);
        const relPath = path.relative(srcDir, srcPath);
        if (currentDir === srcDir && excludeDirs.includes(entry.name)) continue;
        if (currentDir === srcDir && excludeFiles.includes(entry.name)) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if ((ext === '.css' || (ext === '.js' && entry.name !== 'sw.js'))) continue;
        const destPath = path.join(distDir, relPath);
        if (entry.isDirectory()) {
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true });
            }
            await processHtmlAndOthers(srcPath, fileHashMap);
        } else {
            if (ext === '.html') {
                try {
                    let content = fs.readFileSync(srcPath, 'utf8');
                    for (const [original, hashed] of Object.entries(fileHashMap)) {
                        const regex = new RegExp(original.replace(/\./g, '\\.'), 'g');
                        content = content.replace(regex, hashed);
                    }
                    const minified = await minifyHtml(content, {
                        collapseWhitespace: true,
                        removeComments: true,
                        minifyCSS: true,
                        minifyJS: true,
                        ignoreCustomFragments: [/<%.*?%>/]
                    });
                    if (!fs.existsSync(path.dirname(destPath))) fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    fs.writeFileSync(destPath, minified);
                    console.log(`已处理 HTML (引用替换): ${relPath}`);
                } catch (e) {
                    console.error(`处理 HTML ${relPath} 失败:`, e);
                    if (!fs.existsSync(path.dirname(destPath))) fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    copyFile(srcPath, destPath);
                }
            } else {
                if (!fs.existsSync(path.dirname(destPath))) fs.mkdirSync(path.dirname(destPath), { recursive: true });
                copyFile(srcPath, destPath);
            }
        }
    }
}
async function processServiceWorker(fileHashMap) {
    const swPath = path.join(srcDir, 'sw.js');
    if (!fs.existsSync(swPath)) return;
    console.log('正在处理 sw.js (引用替换与版本更新)...');
    try {
        let content = fs.readFileSync(swPath, 'utf8');
        for (const [original, hashed] of Object.entries(fileHashMap)) {
            const regex = new RegExp(original.replace(/\./g, '\\.'), 'g');
            content = content.replace(regex, hashed);
        }
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        content = content.replace(
            /const CACHE_NAME = ['"].*?['"];/,
            `const CACHE_NAME = 'whut-resource-${timestamp}';`
        );
        const minified = await minifyJs(content, { compress: true, mangle: true });
        fs.writeFileSync(path.join(distDir, 'sw.js'), minified.code || content);
        console.log(`已更新并打包: sw.js (版本: ${timestamp})`);
    } catch (e) {
        console.error('处理 sw.js 失败:', e);
        fs.copyFileSync(swPath, path.join(distDir, 'sw.js'));
    }
}
module.exports = {
    processAssetsAndBuildMap,
    buildScripts,
    processHtmlAndOthers,
    processServiceWorker
};
