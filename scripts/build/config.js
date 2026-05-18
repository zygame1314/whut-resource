const path = require('path');
const srcDir = path.resolve(__dirname, '../../');
const distDir = path.join(srcDir, 'dist');
const jsSrcDir = path.join(srcDir, 'src', 'js');
const cssSrcDir = path.join(srcDir, 'src', 'css');
const excludeDirs = [
    '.git',
    'node_modules',
    'dist',
    'functions',
    '.vscode',
    '.agent',
    '.idea',
    'src',
    'scripts'
];
const scriptModules = [
    'globals.js',
    'utils.js',
    'ui/modals.js',
    'ui/render.js',
    'modules/preview.js',
    'actions.js',
    'modules/batch.js',
    'core.js',
    'main.js'
];
const uploadModules = [
    'utils.js',
    'modules/upload/ui.js',
    'modules/upload/handlers.js',
    'modules/upload/path-selector.js',
    'modules/upload/links.js',
    'upload_main.js'
];
const authModules = [
    'modules/auth/state.js',
    'modules/auth/utils.js',
    'modules/auth/ui.js',
    'modules/auth/api-core.js',
    'modules/auth/api-admin.js',
    'modules/auth/modals/auth.js',
    'modules/auth/modals/profile.js',
    'modules/auth/modals/admin.js',
    'modules/auth/init.js'
];
const guestbookModules = [
    'modules/guestbook/state.js',
    'modules/guestbook/utils.js',
    'modules/guestbook/api.js',
    'modules/guestbook/render.js',
    'modules/guestbook/modals.js',
    'modules/guestbook/actions.js',
    'modules/guestbook/ai.js',
    'modules/guestbook/init.js'
];
const jsBundles = {
    'script.js': scriptModules,
    'upload.js': uploadModules,
    'auth.js': authModules,
    'guestbook.js': guestbookModules,
    'config.js': ['config.js'],
    'announcements.js': ['modules/announcements.js'],
    'graph.js': ['modules/graph.js'],
    'tutorial.js': ['modules/tutorial.js'],
    'download-manager.js': ['modules/download-manager.js'],
    'download-manager-ui.js': ['modules/download-manager-ui.js'],
    'download-log.js': ['modules/download-log.js']
};
const cssBundles = {
    'css/style.css': [
        'modules/base.css',
        'modules/animations.css',
        'modules/layout.css',
        'modules/components.css',
        'modules/pages.css',
        'modules/dynamic.css',
        'modules/tutorial.css'
    ],
    'css/graph.css': ['modules/graph.css']
};
const excludeFiles = [
    'package.json',
    'package-lock.json',
    'build.js',
    'wrangler.toml',
    '.gitignore',
    'README.md',
    'LICENSE',
    '.DS_Store',
    'Thumbs.db',
    ...Object.keys(jsBundles),
    ...Object.keys(cssBundles)
];
const copyFiles = [
    'manifest.json',
    'robots.txt',
    'sitemap.xml',
    'images',
    'lib'
];
module.exports = {
    srcDir,
    distDir,
    jsSrcDir,
    cssSrcDir,
    excludeDirs,
    excludeFiles,
    jsBundles,
    cssBundles,
    copyFiles
};
