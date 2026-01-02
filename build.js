const fs = require('fs');
const path = require('path');
const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const { minify: minifyJs } = require('terser');
const srcDir = __dirname;
const distDir = path.join(__dirname, 'dist');
const excludeDirs = [
    '.git',
    'node_modules',
    'dist',
    'functions',
    '.vscode',
    '.agent',
    '.idea'
];
const excludeFiles = [
    'package.json',
    'package-lock.json',
    'build.js',
    'wrangler.toml',
    '.gitignore',
    'README.md',
    'LICENSE'
];
function cleanDist() {
    if (fs.existsSync(distDir)) {
        console.log('Cleaning dist directory...');
        fs.rmSync(distDir, { recursive: true, force: true });
    }
    fs.mkdirSync(distDir);
}
function copyFile(src, dest) {
    fs.copyFileSync(src, dest);
}
async function processDirectory(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(currentDir, entry.name);
        const relPath = path.relative(srcDir, srcPath);
        if (currentDir === srcDir && excludeDirs.includes(entry.name)) continue;
        const destPath = path.join(distDir, relPath);
        if (entry.isDirectory()) {
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true });
            }
            await processDirectory(srcPath);
        } else {
            if (currentDir === srcDir && excludeFiles.includes(entry.name)) continue;
            const ext = path.extname(entry.name).toLowerCase();
            try {
                if (ext === '.html') {
                    const content = fs.readFileSync(srcPath, 'utf8');
                    const minified = await minifyHtml(content, {
                        collapseWhitespace: true,
                        removeComments: true,
                        minifyCSS: true,
                        minifyJS: true,
                        ignoreCustomFragments: [/<%.*?%>/]
                    });
                    fs.writeFileSync(destPath, minified);
                    console.log(`Minified HTML: ${relPath}`);
                } else if (ext === '.css') {
                    const content = fs.readFileSync(srcPath, 'utf8');
                    const output = new CleanCSS({}).minify(content);
                    fs.writeFileSync(destPath, output.styles);
                    console.log(`Minified CSS: ${relPath}`);
                } else if (ext === '.js') {
                    const content = fs.readFileSync(srcPath, 'utf8');
                    const minified = await minifyJs(content, {
                        compress: true,
                        mangle: true
                    });
                    fs.writeFileSync(destPath, minified.code || content);
                    console.log(`Minified JS: ${relPath}`);
                } else {
                    copyFile(srcPath, destPath);
                }
            } catch (e) {
                console.error(`Error processing ${relPath}, falling back to copy:`, e.message);
                copyFile(srcPath, destPath);
            }
        }
    }
}
async function build() {
    console.log('Starting build...');
    const startTime = Date.now();
    try {
        cleanDist();
        await processDirectory(srcDir);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`Build complete in ${duration}s! Output directory: ./dist`);
    } catch (e) {
        console.error('Build failed:', e);
        process.exit(1);
    }
}
build();
