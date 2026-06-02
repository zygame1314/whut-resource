const path = require('path');
const { srcDir, distDir } = require('./scripts/build/config');
const { cleanDist, copyDir } = require('./scripts/build/utils');
const {
    processAssetsAndBuildMap,
    buildScripts,
    buildCss,
    processHtmlAndOthers,
    processServiceWorker
} = require('./scripts/build/tasks');
async function build() {
    console.log('开始构建...');
    const startTime = Date.now();
    const fileHashMap = {};
    try {
        cleanDist();
        await processAssetsAndBuildMap(srcDir, fileHashMap);
        await buildScripts(fileHashMap);
        await buildCss(fileHashMap);
        copyDir(path.join(srcDir, 'lib'), path.join(distDir, 'lib'));
        await processHtmlAndOthers(srcDir, fileHashMap);
        await processServiceWorker(fileHashMap);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`构建完成，耗时 ${duration}s！输出目录：./dist`);
        console.log('Hash Map (Sample):', Object.keys(fileHashMap).slice(0, 5));
    } catch (e) {
        console.error('构建失败:', e);
        process.exit(1);
    }
}
build();
