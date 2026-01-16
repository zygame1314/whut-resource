const fs = require('fs');
const path = require('path');
const { jsSrcDir, jsBundles } = require('./build/config');

const rootDir = path.resolve(__dirname, '../');

const tasks = Object.entries(jsBundles).map(([name, modules]) => ({ name, modules }));

function bundleFile(task) {
    const outputName = task.name;
    console.log(`[DEV] 正在合并 ${outputName}...`);

    let content = '';
    content += `/** DEV MODE - Generated at ${new Date().toLocaleTimeString()} */\n`;

    for (const module of task.modules) {
        const modulePath = path.join(jsSrcDir, module);
        try {
            if (fs.existsSync(modulePath)) {
                content += `// --- Module: ${module} ---\n`;
                content += fs.readFileSync(modulePath, 'utf8') + '\n\n';
            } else {
                console.warn(`[WARN] 模块未找到: ${module}`);
            }
        } catch (e) {
            console.error(`[ERROR] 读取模块 ${module} 失败:`, e.message);
        }
    }

    try {
        fs.writeFileSync(path.join(rootDir, outputName), content);
        console.log(`[SUCCESS] 已更新 ${outputName}`);
    } catch (e) {
        console.error(`[ERROR] 写入文件 ${outputName} 失败:`, e.message);
    }
}

function runDev() {
    console.log('启动开发监听模式...');
    console.log(`监听目录: ${jsSrcDir}`);
    const fileNames = tasks.map(t => t.name).join(', ');
    console.log(`修改 src/js 下的文件将自动更新根目录的: ${fileNames}\n`);

    tasks.forEach(bundleFile);

    let timeout = null;

    fs.watch(jsSrcDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        if (!filename.endsWith('.js')) return;
        if (timeout) clearTimeout(timeout);

        timeout = setTimeout(() => {
            console.log(`\n[CHANGE] 检测到文件变更: ${filename}`);
            tasks.forEach(bundleFile);
        }, 100);
    });
}

runDev();
