const path = require('path');
const srcDir = path.resolve(__dirname, '../../');
const distDir = path.join(srcDir, 'dist');
const jsSrcDir = path.join(srcDir, 'src', 'js');
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
const excludeFiles = [
    'package.json',
    'package-lock.json',
    'build.js',
    'wrangler.toml',
    '.gitignore',
    'README.md',
    'LICENSE',
    'script.js',
    'upload.js',
    'auth.js'
];
const jsModules = [
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
    'modules/auth/modals/auth.js',
    'modules/auth/modals/profile.js',
    'modules/auth/modals/admin.js',
    'modules/auth/api-admin.js',
    'modules/auth/init.js'
];
module.exports = {
    srcDir,
    distDir,
    jsSrcDir,
    excludeDirs,
    excludeFiles: [
        'package.json',
        'package-lock.json',
        'build.js',
        'wrangler.toml',
        '.gitignore',
        'README.md',
        'LICENSE',
        'script.js',
        'upload.js',
        'auth.js'
    ],
    // 脚本模块定义 (相对于 src/js)
    jsModules: [
        'globals.js',
        'utils.js',
        'ui/modals.js',
        'ui/render.js',
        'modules/preview.js',
        'actions.js',
        'modules/batch.js',
        'core.js',
        'main.js'
    ],
    uploadModules: [
        'utils.js',
        'modules/upload/ui.js',
        'modules/upload/handlers.js',
        'modules/upload/path-selector.js',
        'modules/upload/links.js',
        'upload_main.js'
    ],
    authModules: [
        'modules/auth/state.js',
        'modules/auth/utils.js',
        'modules/auth/ui.js',
        'modules/auth/api-core.js',
        'modules/auth/api-admin.js',
        'modules/auth/modals/auth.js',
        'modules/auth/modals/profile.js',
        'modules/auth/modals/admin.js',
        'modules/auth/init.js'
    ],
    // 单文件模块 (即每个文件本身就是一个完整的模块，不需要合并)
    singleModules: {
        'config.js': ['config.js'],
        'announcements.js': ['modules/announcements.js'],
        'guestbook.js': ['modules/guestbook.js'],
        'graph.js': ['modules/graph.js'],
        'tutorial.js': ['modules/tutorial.js']
    },

    // 需要复制的文件或目录 (不进行合并/压缩处理)
    copyFiles: [
        'manifest.json',
        'robots.txt',
        'sitemap.xml',
        'images',
        'lib'
    ],

    // 构建时需要排除的文件
    excludeFiles: [
        '.DS_Store',
        'Thumbs.db'
    ]
};
