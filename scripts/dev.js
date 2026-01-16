const fs = require('fs');
const path = require('path');
const { jsSrcDir, cssSrcDir, jsBundles, cssBundles } = require('./build/config');

const rootDir = path.resolve(__dirname, '../');

const jsTasks = Object.entries(jsBundles).map(([name, modules]) => ({ name, modules, type: 'js' }));
const cssTasks = Object.entries(cssBundles).map(([name, modules]) => ({ name, modules, type: 'css' }));
const allTasks = [...jsTasks, ...cssTasks];

function bundleFile(task) {
    const outputName = task.name;
    const srcDir = task.type === 'js' ? jsSrcDir : cssSrcDir;
    console.log(`[DEV] 正在合并 ${outputName}...`);

    let content = '';
    content += `/** DEV MODE - Generated at ${new Date().toLocaleTimeString()} */\n`;

    for (const module of task.modules) {
        const modulePath = path.join(srcDir, module);
        try {
            if (fs.existsSync(modulePath)) {
                if (task.type === 'js') {
                    content += `// --- Module: ${module} ---\n`;
                } else {
                    content += `/* --- Module: ${module} --- */\n`;
                }
                content += fs.readFileSync(modulePath, 'utf8') + '\n\n';
            } else {
                console.warn(`[WARN] 模块未找到: ${module}`);
            }
        } catch (e) {
            console.error(`[ERROR] 读取模块 ${module} 失败:`, e.message);
        }
    }

    try {
        const destPath = path.join(rootDir, outputName);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        fs.writeFileSync(destPath, content);
        console.log(`[SUCCESS] 已更新 ${outputName}`);
    } catch (e) {
        console.error(`[ERROR] 写入文件 ${outputName} 失败:`, e.message);
    }
}

function runDev() {
    console.log('启动开发监听模式...');
    console.log(`监听 JS 目录: ${jsSrcDir}`);
    console.log(`监听 CSS 目录: ${cssSrcDir}`);

    allTasks.forEach(bundleFile);

    let jsTimeout = null;
    let cssTimeout = null;

    fs.watch(jsSrcDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        if (!filename.endsWith('.js')) return;
        if (jsTimeout) clearTimeout(jsTimeout);

        jsTimeout = setTimeout(() => {
            console.log(`\n[CHANGE] JS变更: ${filename}`);
            jsTasks.forEach(bundleFile);
        }, 100);
    });

    if (fs.existsSync(cssSrcDir)) {
        fs.watch(cssSrcDir, { recursive: true }, (eventType, filename) => {
            if (!filename) return;
            if (!filename.endsWith('.css')) return;
            if (cssTimeout) clearTimeout(cssTimeout);

            cssTimeout = setTimeout(() => {
                console.log(`\n[CHANGE] CSS变更: ${filename}`);
                cssTasks.forEach(bundleFile);
            }, 100);
        });
    } else {
        console.warn(`[WARN] CSS 目录不存在: ${cssSrcDir}`);
    }
}

runDev();
