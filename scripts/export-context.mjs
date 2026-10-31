#!/usr/bin/env node
/**
 * 生成单文件 AI 分析上下文包。
 *
 * 用法:
 *   node scripts/export-context.mjs
 *   node scripts/export-context.mjs --mode balanced
 *   node scripts/export-context.mjs --mode code
 *   node scripts/export-context.mjs --mode full
 *   node scripts/export-context.mjs --out path/to/file.md --budget 150000
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
};

if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`生成 AI 分析上下文包

用法: node scripts/export-context.mjs [options]

  --mode <balanced|code|full>  输出档位（默认 balanced）
  --out <path>                输出文件路径
  --budget <tokens>           预算，超出时输出警告
  -h, --help                  显示帮助

档位:
  balanced  后端全文 + 前端核心全文 + 其余结构摘要（约 20 万 tokens）
  code      除 CSS 外的文本文件全文 + CSS 摘要（约 45 万 tokens）
  full      全部文本文件全文（含 CSS，约 59 万 tokens）`);
    process.exit(0);
}

const MODE = getArg('--mode', 'balanced');
const MODE_BUDGET = { balanced: 200000, code: 450000, full: 600000 };
const MODE_DESC = {
    balanced: '后端全文 + 前端核心全文 + 其余结构摘要',
    code: '除 CSS 外的文本文件全文 + CSS 摘要',
    full: '全部文本文件全文（含 CSS）'
};
if (!MODE_DESC[MODE]) {
    console.error(`未知模式: ${MODE}（可选: ${Object.keys(MODE_DESC).join(', ')}）`);
    process.exit(1);
}

const OUT = path.resolve(getArg('--out', path.join(
    ROOT,
    MODE === 'balanced' ? 'whut-resource-ai-context.md' : `whut-resource-ai-context.${MODE}.md`
)));
const BUDGET = Number(getArg('--budget', String(MODE_BUDGET[MODE])));
if (!Number.isFinite(BUDGET) || BUDGET <= 0) {
    console.error(`--budget 必须是正数，收到: ${getArg('--budget', '')}`);
    process.exit(1);
}

let acorn = null;
try {
    acorn = require('acorn');
} catch {
    console.warn('[context] 未安装 acorn，JS 摘要将回退为正则提取（npm install 后可获得更好的摘要）');
}

let tokenizer = null;
try {
    ({ encode: tokenizer } = await import('gpt-tokenizer'));
} catch {
    console.warn('[context] 未安装 gpt-tokenizer，token 数为字符估算值（npm install 后可获得精确值）');
}

const estimateTokens = text => {
    const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
    return Math.round(cjk / 1.4 + (text.length - cjk) / 3.8);
};
const tok = text => tokenizer ? tokenizer(text).length : estimateTokens(text);
const TOKEN_LABEL = tokenizer ? 'o200k 分词器' : '字符估算';

const EXCLUDE_DIRS = new Set(['.git', 'node_modules', '.wrangler', 'dist', 'lib', '.vscode', '.idea']);
const TEXT_EXTS = new Set(['.js', '.mjs', '.css', '.html', '.json', '.md', '.sql', '.toml', '.xml', '.txt']);
const BINARY_EXTS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.mp4', '.webm', '.woff', '.woff2', '.ttf', '.otf', '.pem']);
const OUT_BASE = path.basename(OUT);
const GENERATED_RE = /^whut-resource-ai-context(?:\.[a-z]+)?\.md$/i;
const SKIP_TEXT = new Set(['package-lock.json', 'jwt_private_key.pem']);

const all = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (EXCLUDE_DIRS.has(e.name)) continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs);
        else if (e.name !== OUT_BASE && !GENERATED_RE.test(e.name)) {
            all.push(path.relative(ROOT, abs).replace(/\\/g, '/'));
        }
    }
})(ROOT);
all.sort();

const EXTRA_TEXT = new Set(['_headers']);
const textFiles = all.filter(f =>
    (TEXT_EXTS.has(path.extname(f).toLowerCase()) || EXTRA_TEXT.has(f)) && !SKIP_TEXT.has(path.basename(f))
);
const binaryFiles = all.filter(f => BINARY_EXTS.has(path.extname(f).toLowerCase()));
const relSet = new Set(textFiles);

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const lineCount = s => s.split('\n').length;

const CONFIG_FULL = new Set([
    'package.json', 'build.js', 'wrangler.toml', 'sw.js', 'manifest.json', 'robots.txt', '_headers', 'sitemap.xml',
    'scripts/build/config.js', 'scripts/build/tasks.js', 'scripts/build/utils.js'
]);
const CORE_JS = new Set([
    'src/js/main.js', 'src/js/core.js', 'src/js/config.js', 'src/js/globals.js', 'src/js/theme-init.js'
]);
const ASN_FILE = 'functions/api/datacenter-asns.js';

function isFull(rel) {
    if (MODE === 'full') return true;
    if (MODE === 'code') return !rel.endsWith('.css');
    if (rel === ASN_FILE) return false;
    if (rel.startsWith('functions/') || rel.startsWith('worker')) return true;
    return CONFIG_FULL.has(rel) || CORE_JS.has(rel);
}

/* ---------- formatting helpers ---------- */
function fence(content, lang = '') {
    const runs = content.match(/`{3,}/g) || [];
    const size = Math.max(3, ...runs.map(r => r.length + 1));
    const f = '`'.repeat(size);
    return `${f}${lang}\n${content.replace(/\s+$/, '')}\n${f}`;
}

function langFor(rel) {
    if (rel === '_headers' || rel === 'robots.txt') return 'text';
    return ({
        '.js': 'js', '.mjs': 'js', '.json': 'json', '.toml': 'toml', '.xml': 'xml',
        '.md': 'markdown', '.sql': 'sql', '.html': 'html', '.css': 'css'
    })[path.extname(rel).toLowerCase()] || 'text';
}

function trunc(s, n = 70) {
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function paramList(params) {
    return params.map(p => {
        if (p.type === 'Identifier') return p.name;
        if (p.type === 'AssignmentPattern') return `${paramList([p.left])}=${shortNode(p.right, 24)}`;
        if (p.type === 'RestElement') return `...${paramList([p.argument])}`;
        if (p.type === 'ObjectPattern') return '{…}';
        if (p.type === 'ArrayPattern') return '[…]';
        return '?';
    }).join(', ');
}

function shortNode(node, n = 60) {
    if (!node) return '';
    switch (node.type) {
        case 'Literal': return trunc(typeof node.value === 'string' ? JSON.stringify(node.value) : String(node.value), n);
        case 'Identifier': return node.name;
        case 'TemplateLiteral': return '`…`';
        case 'ObjectExpression': return `{${node.properties.slice(0, 6).map(p => p.key?.name || p.key?.value || '…').join(', ')}${node.properties.length > 6 ? ', …' : ''}}`;
        case 'ArrayExpression': return `[${node.elements.length} items]`;
        case 'ArrowFunctionExpression': return `(${paramList(node.params)}) => …`;
        case 'FunctionExpression': return `function(${paramList(node.params)}) {…}`;
        case 'CallExpression': return `${shortNode(node.callee, 30)}(…)`;
        case 'MemberExpression': return `${shortNode(node.object, 20)}.${shortNode(node.property, 20)}`;
        case 'NewExpression': return `new ${shortNode(node.callee, 30)}(…)`;
        case 'AwaitExpression': return `await ${shortNode(node.argument, n)}`;
        case 'ConditionalExpression': return 'cond ? … : …';
        case 'LogicalExpression': return `${shortNode(node.left, 20)} ${node.operator} …`;
        case 'BinaryExpression': return `… ${node.operator} …`;
        case 'AssignmentExpression': return '… = …';
        default: return node.type;
    }
}

function methodSig(m) {
    let prefix = '';
    if (m.static) prefix += 'static ';
    if (m.kind === 'get' || m.kind === 'set') prefix += m.kind + ' ';
    return `${prefix}${m.key?.name || m.key?.value || '?'}(${paramList(m.value.params)})`;
}

function jsOutline(code) {
    if (!acorn) {
        const decls = [...code.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)]
            .map(m => m[1]).slice(0, 30);
        return `- [acorn 未安装，仅识别顶层名称] ${decls.join(', ') || '(未识别)'}`;
    }

    let ast;
    try {
        ast = acorn.parse(code, {
            ecmaVersion: 'latest', sourceType: 'module',
            allowHashBang: true, allowAwaitOutsideFunction: true, locations: true
        });
    } catch (e) {
        const decls = [...code.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)]
            .map(m => m[1]).slice(0, 30);
        return `- [解析失败: ${trunc(e.message, 60)}]\n- 顶层名称: ${decls.join(', ') || '(未识别)'}`;
    }

    const imports = [], exports = [], fns = [], classes = [], vars = [], assigns = [];
    const addExport = name => { if (name && !exports.includes(name)) exports.push(name); };

    for (const raw of ast.body) {
        let node = raw;
        if (raw.type === 'ExportNamedDeclaration') {
            if (raw.declaration) node = raw.declaration;
            else {
                for (const s of raw.specifiers) addExport(s.exported?.name);
                if (raw.source) imports.push(`export {…} from ${raw.source.value}`);
            }
        } else if (raw.type === 'ExportDefaultDeclaration') {
            node = raw.declaration;
            addExport(node.id?.name || 'default');
        }

        if (node.type === 'ImportDeclaration') {
            const names = node.specifiers.map(s => s.local?.name || '*').slice(0, 10).join(', ');
            imports.push(`${node.source.value}${names ? ` (${names})` : ''}`);
            continue;
        }
        if (node.type === 'FunctionDeclaration' && node.id) {
            fns.push(`${node.async ? 'async ' : ''}${node.id.name}(${paramList(node.params)})${node.generator ? '*' : ''} L${node.loc.start.line}-${node.loc.end.line}`);
            if (raw.type === 'ExportNamedDeclaration' && raw.declaration) addExport(node.id.name);
            continue;
        }
        if (node.type === 'ClassDeclaration' && node.id) {
            const methods = (node.body.body || []).filter(x => x.type === 'MethodDefinition').map(methodSig).slice(0, 16);
            classes.push(`${node.id.name}${node.superClass ? ` extends ${shortNode(node.superClass, 24)}` : ''} { ${methods.join('; ')}${methods.length ? '; ' : ''}} L${node.loc.start.line}-${node.loc.end.line}`);
            if (raw.type === 'ExportNamedDeclaration' && raw.declaration) addExport(node.id.name);
            continue;
        }
        if (node.type === 'VariableDeclaration') {
            for (const d of node.declarations) {
                const name = d.id.type === 'Identifier' ? d.id.name : '{…}';
                const init = d.init;
                if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
                    fns.push(`${name} = ${init.async ? 'async ' : ''}(${paramList(init.params)}) => … L${node.loc.start.line}-${node.loc.end.line}`);
                } else {
                    vars.push(`${name} = ${shortNode(init, 50)} L${node.loc.start.line}`);
                }
                if (raw.type === 'ExportNamedDeclaration') addExport(name);
            }
            continue;
        }
        if (node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression') {
            const left = shortNode(node.expression.left, 40);
            if (/^(window|globalThis|self)\./.test(left)) assigns.push(`${left} = … L${node.loc.start.line}`);
        }
    }

    const apis = [...new Set([...code.matchAll(/['"`](\/api\/[^'"`\s]{1,80})['"`]/g)].map(m => m[1]))].slice(0, 10);
    const evts = [...new Set([...code.matchAll(/addEventListener\(\s*['"]([^'"]+)/g)].map(m => m[1]))].slice(0, 10);
    const dom = [...new Set([
        ...[...code.matchAll(/getElementById\(\s*['"]([^'"]+)/g)].map(m => '#' + m[1]),
        ...[...code.matchAll(/querySelector(?:All)?\(\s*['"]([^'"]{1,60})['"]/g)].map(m => m[1])
    ])].slice(0, 8);
    const flags = [];
    if (/new\s+WebSocket\s*\(/.test(code)) flags.push('WebSocket');
    if (/EventSource\s*\(/.test(code)) flags.push('SSE');
    if (/localStorage/.test(code)) flags.push('localStorage');
    if (/sessionStorage/.test(code)) flags.push('sessionStorage');
    if (/indexedDB/.test(code)) flags.push('indexedDB');
    if (/navigator\.serviceWorker/.test(code)) flags.push('ServiceWorker');

    const out = [];
    if (imports.length) out.push(`- imports: ${imports.slice(0, 6).join('; ')}${imports.length > 6 ? '; …' : ''}`);
    if (exports.length) out.push(`- exports: ${exports.slice(0, 12).join(', ')}${exports.length > 12 ? ', …' : ''}`);
    if (fns.length) out.push(`- fn: ${fns.slice(0, 18).join('; ')}${fns.length > 18 ? `; … +${fns.length - 18}` : ''}`);
    if (classes.length) out.push(...classes.slice(0, 8).map(c => `- class: ${c}`));
    if (vars.length) out.push(`- var: ${vars.slice(0, 10).join('; ')}${vars.length > 10 ? '; …' : ''}`);
    if (assigns.length) out.push(`- global: ${assigns.slice(0, 8).join('; ')}`);
    if (apis.length) out.push(`- api: ${apis.join(', ')}`);
    if (evts.length) out.push(`- evt: ${evts.join(', ')}`);
    if (dom.length) out.push(`- dom: ${dom.join(', ')}`);
    if (flags.length) out.push(`- flags: ${flags.join(', ')}`);
    return out.join('\n');
}

function htmlOutline(code) {
    const title = (code.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim();
    const desc = (code.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || [])[1];
    const links = [...new Set([...code.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
        .map(m => (m[0].match(/href=["']([^"']+)/i) || [])[1]).filter(Boolean))];
    const scripts = [...new Set([...code.matchAll(/<script[^>]+src=["']([^"']+)/gi)].map(m => m[1]))];
    const inlineScripts = [...code.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    const ids = [...new Set([...code.matchAll(/\bid=["']([^"']+)/g)].map(m => '#' + m[1]))];
    const forms = [...code.matchAll(/<form[^>]*>/gi)].map(m => (m[0].match(/action=["']([^"']*)/i) || [])[1] || '(no action)');
    const sections = (code.match(/<(section|main|aside|header|footer|nav)\b/gi) || []).length;

    const out = [];
    if (title) out.push(`- title: ${title}`);
    if (desc) out.push(`- description: ${desc}`);
    if (links.length) out.push(`- css: ${links.join(', ')}`);
    if (scripts.length) out.push(`- scripts: ${scripts.join(', ')}`);
    if (inlineScripts.length) out.push(`- inline scripts: ${inlineScripts.length} 个（共 ${inlineScripts.reduce((a, m) => a + m[1].length, 0)} 字符，未展开）`);
    if (forms.length) out.push(`- forms: ${forms.length} 个 (${forms.join(' | ')})`);
    if (sections) out.push(`- structural tags: ${sections}`);
    if (ids.length) out.push(`- ids (${ids.length}): ${ids.slice(0, 80).join(', ')}${ids.length > 80 ? ', …' : ''}`);
    return out.join('\n');
}

function mdOutline(code) {
    const langs = [...new Set([...code.matchAll(/^```(\w+)/gm)].map(m => m[1]))];
    const text = code.replace(/^```[\s\S]*?^```[ \t]*$/gm, '');
    const heads = [...text.matchAll(/^(#{1,4})\s+(.+)$/gm)].map(m => `${m[1]} ${trunc(m[2], 80)}`);
    const urls = [...new Set([
        ...[...code.matchAll(/`(\/api\/[^`\s]+)`/g)].map(m => m[1]),
        ...[...text.matchAll(/^#{2,5}\s+(?:GET|POST|PUT|DELETE|PATCH)?\s*(\/api\/[^\s|]+)/gm)].map(m => m[1])
    ])].slice(0, 20);
    const out = [];
    if (heads.length) out.push(`- headings (${heads.length}):\n${heads.slice(0, 80).map(h => `  - ${h}`).join('\n')}${heads.length > 80 ? '\n  - …' : ''}`);
    if (urls.length) out.push(`- endpoints: ${urls.join(', ')}`);
    if (langs.length) out.push(`- code fences: ${langs.join(', ')}`);
    return out.join('\n');
}

function cssSummary(files) {
    const lines = [];
    const vars = new Map();
    const themes = new Set();
    const medias = new Set();
    const keyframes = new Set();
    const rows = [];

    for (const rel of files) {
        const code = read(rel);
        const rules = [...code.matchAll(/^([^\r\n{}@/][^\r\n{}]*?)\s*\{/gm)].map(m => m[1].trim());
        const groups = new Map();
        for (const sel of rules) {
            const cls = [...sel.matchAll(/\.([A-Za-z0-9_-]+)/g)].map(m => m[1].split('-')[0]).filter(Boolean);
            for (const g of new Set(cls)) groups.set(g, (groups.get(g) || 0) + 1);
        }
        const topGroups = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([g, n]) => `${g}(${n})`);
        rows.push(`- ${rel}: ${lineCount(code)} 行, ${rules.length} 规则, ${topGroups.join(' ') || '-'}`);

        for (const m of code.matchAll(/(\[data-theme=["']([^"']+)["']\]|:root)\s*\{([\s\S]*?)\n\}/g)) {
            if (m[2]) themes.add(m[2]);
            for (const d of m[3].matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g)) {
                if (!vars.has(d[1])) vars.set(d[1], d[2].trim());
            }
        }
        for (const m of code.matchAll(/@media\s*([^{]+)\{/g)) medias.add(m[1].trim());
        for (const m of code.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)) keyframes.add(m[1]);
    }

    lines.push(`- 文件数: ${files.length}; 主题: ${[...themes].join(', ') || '(none)'}`);
    lines.push(`- 设计令牌 (${vars.size}, 取自 :root / [data-theme] 首个定义):`);
    lines.push([...vars.entries()].map(([k, v]) => `  ${k}: ${trunc(v, 60)};`).join('\n'));
    if (medias.size) lines.push(`- 断点: ${[...medias].join(' | ')}`);
    if (keyframes.size) lines.push(`- @keyframes (${keyframes.size}): ${[...keyframes].slice(0, 60).join(', ')}${keyframes.size > 60 ? ', …' : ''}`);
    lines.push('- 文件/规则/主要类名前缀:');
    lines.push(rows.join('\n'));
    return lines.join('\n');
}

function tree() {
    const root = { dirs: new Map(), files: [] };
    for (const rel of all) {
        const parts = rel.split('/');
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { dirs: new Map(), files: [] });
            node = node.dirs.get(parts[i]);
        }
        node.files.push(parts[parts.length - 1]);
    }
    const out = [];
    const walk = (node, prefix) => {
        const dirs = [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const files = [...node.files].sort();
        const entries = [...dirs.map(([name, child]) => ({ name, child, dir: true })), ...files.map(name => ({ name, dir: false }))];
        entries.forEach((e, i) => {
            const last = i === entries.length - 1;
            out.push(`${prefix}${last ? '└── ' : '├── '}${e.name}${e.dir ? '/' : ''}`);
            if (e.dir) walk(e.child, prefix + (last ? '    ' : '│   '));
        });
    };
    walk(root, '');
    return out.join('\n');
}

/* ---------- assemble ---------- */
const body = [];
const sectionTokens = {};
let currentSection = '';

function add(s) {
    body.push(s);
}

function section(name, fn) {
    currentSection = name;
    const before = body.length;
    fn();
    sectionTokens[name] = tok(body.slice(before).join('\n'));
}

function heading(title) {
    return `## ${sectionNo++}. ${title}`;
}
let sectionNo = 2;

const git = (() => {
    try {
        const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
        const head = execFileSync('git', ['log', '-1', '--format=%h %cs %s'], { cwd: ROOT, encoding: 'utf8' }).trim();
        return `${branch} @ ${head}`;
    } catch {
        return '(git unavailable)';
    }
})();

const modeRange = (() => {
    if (MODE === 'full') return '- 全文: 全部文本文件（含 13 个 CSS、全部 HTML/Markdown）。\n- 摘要: 无。';
    if (MODE === 'code') return '- 全文: 除 CSS 外的全部文本文件（JS/HTML/JSON/TOML/XML/SQL/MD/TXT）。\n- 摘要: CSS 设计令牌/断点/动画/类名分布。';
    return '- 全文: `functions/**`（静态 ASN 列表除外）、`worker/**`、构建/配置/schema、`src/js/{config,globals,theme-init,main,core}.js`。\n- 摘要: 其余 `src/js/**`（含 actions/utils/modules）、全部 CSS 规则体、全部 HTML 页面、README 与 SSO 文档正文。';
})();

section('overview', () => {
    add(`# WHUT Resource — AI 分析上下文包

> 武理资源共享平台（Cloudflare Pages + D1 + R2 + Vectorize + Queues + Durable Objects）
> 生成时间: ${new Date().toISOString()}  
> Git: ${git}  
> 模式: \`${MODE}\` — ${MODE_DESC[MODE]}  
> 本文件约 {{TOKENS}} tokens（${TOKEN_LABEL}）

## 0. 包说明

- 覆盖仓库内全部手写源码：${textFiles.length} 个文本文件；另附 ${binaryFiles.length} 个二进制资源的清单（不包含内容）。
- 已排除: \`node_modules/\`、\`package-lock.json\`、\`.git/\`、\`.wrangler/\`、\`dist/\`、\`lib/\`、图片/视频/字体、\`jwt_private_key.pem\`（私钥，未包含）。
- 标记: **[全文]** = 完整源码（已包含原始空行/缩进，未改写逻辑）；**[摘要]** = 行数 + 导入/导出/函数签名/类/API/事件/DOM 等结构信息（为控制 token 未展开函数体）。
- 本包按“${MODE_DESC[MODE]}”生成。
${modeRange}
- 前端根目录的 \`script.js\`、\`auth.js\`、\`css/*.css\` 等是构建产物，已被 \`.gitignore\` 排除，本包只包含 \`src/\` 源文件。
- 后端为 Cloudflare Pages Functions：\`functions/api/*.js\` 按文件路径映射到 \`/api/*\`；\`worker-ai/\` 与 \`worker/\` 为独立 Worker。

## 1. 架构速览

- 前端：原生 ES6+（无框架），\`src/js\` 按功能分模块，\`scripts/dev.js\` 合并为根目录未压缩文件，\`build.js\` 输出带 hash 的 \`dist/\`。
- 页面：\`index.html\`（浏览/搜索/上传入口/留言板）、\`upload.html\`、\`authorize.html\`（OAuth 授权）、5 个帮助页。
- 后端：Cloudflare Pages Functions + D1（SQLite）、R2（对象存储）、Vectorize（向量检索）、Queues（异步任务）、Durable Objects（下载日志/在线计数）、Email Workers。
- 认证：\`@whut.edu.cn\` 邮箱验证码 + JWT；CAS/SSO；Passkey/WebAuthn；同时作为 OAuth2/OIDC Provider（authorize/token/userinfo）。
- AI：SiliconFlow（Qwen3-Embedding-0.6B 向量、bge-reranker-v2-m3 重排、Qwen3-8B 审核/回复）；\`worker-ai\` 消费 AI/FILE 队列。
- 安全相关：PoW 防刷、Google Safe Browsing URL 检测、AI 内容审核、管理员审批/审计日志、JWT 私钥签名。
- 数据表：见第 4 节 \`schema.sql\`（users、files、guestbook、notifications、admin_logs、oauth_clients 等）。
- 构建/部署：\`npm run build\` → \`dist/\`；\`wrangler deploy -c worker-ai/wrangler.toml\` 与 \`-c worker/wrangler.toml\`。
`);

    const routes = textFiles
        .filter(f => f.startsWith('functions/api/') && f.endsWith('.js'))
        .map(f => '/' + f.replace(/^functions\//, '').replace(/\.js$/, '').replace(/\/index$/, ''));
    add(`- API 文件（由 \`functions/api/*.js\` 路径推导，共 ${routes.length} 个；其中 \`_middleware\`、\`sso-utils\` 为中间件/工具而非独立路由）: ${routes.join(', ')}\n`);
});

section('tree', () => {
    add(`${heading('目录树（源文件 + 二进制资源）')}

\`\`\`text
${tree()}
\`\`\`
`);
});

section('config', () => {
    add(`${heading('项目说明、构建与配置')}\n`);
    if (relSet.has('README.md')) {
        const code = read('README.md');
        if (isFull('README.md')) {
            add(`### \`README.md\` [全文]\n\n${fence(code, 'markdown')}\n`);
        } else {
            add(`### \`README.md\` [摘要] ${lineCount(code)} 行\n\n${mdOutline(code)}\n`);
            add(`- 关键环境变量（来自 README）: SILICONFLOW_API_KEY, JWT_SECRET, JWT_PRIVATE_KEY, BOT_EMAIL, GOOGLE_SAFE_BROWSING_API_KEY, AI_API_KEY\n`);
        }
    }
    for (const rel of [
        'package.json', 'build.js', 'wrangler.toml', 'sw.js', 'manifest.json', 'robots.txt', '_headers', 'sitemap.xml',
        'scripts/build/config.js', 'scripts/build/tasks.js', 'scripts/build/utils.js'
    ]) {
        if (!relSet.has(rel) || !isFull(rel)) continue;
        add(`### \`${rel}\` [全文]\n\n${fence(read(rel), langFor(rel))}\n`);
    }
});

section('schema', () => {
    if (!relSet.has('schema.sql')) return;
    add(`${heading('数据模型（schema.sql）')}\n\n### \`schema.sql\` [全文]\n\n${fence(read('schema.sql'), 'sql')}\n`);
});

section('backend', () => {
    add(`${heading('后端 Cloudflare Pages Functions')}\n`);
    const files = textFiles.filter(f => f.startsWith('functions/') && f.endsWith('.js'));
    const order = ['functions/utils.js', 'functions/whut-email.js'];
    const sorted = [...order.filter(f => relSet.has(f)), ...files.filter(f => !order.includes(f))];
    for (const rel of sorted) {
        if (rel === ASN_FILE && !isFull(rel)) {
            const code = read(rel);
            const nums = [...code.matchAll(/\b\d{2,6}\b/g)].length;
            add(`### \`${rel}\` [摘要：静态 ASN 数据列表，${lineCount(code)} 行，约 ${nums} 个数字]\n\n- 用途：区分数据中心/云厂商/VPN 出口 ASN，用于 URL/访问来源风控；完整列表已省略以节省 token。\n- 导出: \`DATA_CENTER_ASNS\`（Set<number>）。\n`);
            continue;
        }
        add(`### \`${rel}\` [全文]\n\n${fence(read(rel), 'js')}\n`);
    }
});

section('workers', () => {
    add(`${heading('独立 Workers')}\n`);
    for (const rel of ['worker/download_logger.js', 'worker/wrangler.toml', 'worker-ai/index.js', 'worker-ai/wrangler.toml']) {
        if (!relSet.has(rel)) continue;
        add(`### \`${rel}\` [全文]\n\n${fence(read(rel), langFor(rel))}\n`);
    }
});

section('frontend-full', () => {
    const files = textFiles.filter(f => f.startsWith('src/js/') && isFull(f));
    if (!files.length) return;
    add(`${heading('前端源码（全文）')}\n`);
    for (const rel of files) {
        add(`### \`${rel}\` [全文]\n\n${fence(read(rel), 'js')}\n`);
    }
});

section('frontend-outline', () => {
    const files = textFiles.filter(f => f.startsWith('src/js/') && !isFull(f));
    if (!files.length) return;
    add(`${heading('前端模块结构摘要')}\n\n> 以下文件未展开函数体；每项含导入/导出、函数签名（含行号）、类方法、调用的 API、DOM 选择器与事件。\n`);
    for (const rel of files) {
        const code = read(rel);
        add(`### \`${rel}\` [摘要] ${lineCount(code)} 行\n\n${jsOutline(code)}\n`);
    }
});

section('html', () => {
    const files = textFiles.filter(f => f.endsWith('.html'));
    if (!files.length) return;
    add(`${heading('页面')}\n`);
    files.sort((a, b) => a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b));
    for (const rel of files) {
        const code = read(rel);
        if (isFull(rel)) {
            add(`### \`${rel}\` [全文]\n\n${fence(code, 'html')}\n`);
        } else {
            add(`### \`${rel}\` [摘要] ${lineCount(code)} 行\n\n${htmlOutline(code)}\n`);
        }
    }
});

section('css', () => {
    const files = textFiles.filter(f => f.endsWith('.css'));
    if (!files.length) return;
    if (MODE === 'full') {
        add(`${heading('样式系统（全文）')}\n`);
        for (const rel of files) {
            add(`### \`${rel}\` [全文]\n\n${fence(read(rel), 'css')}\n`);
        }
    } else {
        add(`${heading('样式系统摘要')}\n\n> 为控制 token，未包含 ${files.length} 个 CSS 文件的规则体；以下为设计令牌、主题、断点、动画与按文件的类名前缀分布。\n\n${cssSummary(files)}\n`);
    }
});

section('other', () => {
    const files = ['scripts/clean.js', 'scripts/dev.js', 'scripts/search-smoke.mjs', 'scripts/sync-deps.js', 'scripts/export-context.mjs']
        .filter(f => relSet.has(f));
    if (!files.length) return;
    add(`${heading('其他脚本')}\n`);
    for (const rel of files) {
        const code = read(rel);
        if (isFull(rel)) {
            add(`### \`${rel}\` [全文]\n\n${fence(code, 'js')}\n`);
        } else {
            add(`### \`${rel}\` [摘要] ${lineCount(code)} 行\n\n${jsOutline(code)}\n`);
        }
    }
});

section('docs', () => {
    const files = textFiles.filter(f => f.endsWith('.md') && f !== 'README.md');
    if (!files.length) return;
    add(`${heading('文档')}\n`);
    for (const rel of files) {
        const code = read(rel);
        if (isFull(rel)) {
            add(`### \`${rel}\` [全文]\n\n${fence(code, 'markdown')}\n`);
        } else {
            add(`### \`${rel}\` [摘要] ${lineCount(code)} 行\n\n${mdOutline(code)}\n`);
        }
    }
});

section('binary', () => {
    add(`${heading('二进制资源（未包含内容）')}\n\n`);
    for (const rel of binaryFiles) {
        const size = fs.statSync(path.join(ROOT, rel)).size;
        const secret = rel.endsWith('.pem') ? ' — 私钥，已排除' : '';
        add(`- \`${rel}\` (${(size / 1024).toFixed(1)} KB)${secret}`);
    }
    add('');
});

const bodyText = body.join('\n');
const bodyTokens = tok(bodyText);
const finalText = bodyText.replace('{{TOKENS}}', `~${(bodyTokens / 1000).toFixed(1)}k`).replace('本文件约 ~', '本文件约 ');
const finalTokens = tok(finalText);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, finalText, 'utf8');

const fullCount = textFiles.filter(isFull).length;
const summaryCount = textFiles.length - fullCount;
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`[context] mode=${MODE} files=${textFiles.length} (full=${fullCount}, summary=${summaryCount})`);
console.log(`[context] wrote ${path.relative(ROOT, OUT)} (${kb} KB, ${finalTokens} tokens, budget=${BUDGET} ${finalTokens > BUDGET ? 'OVER' : 'OK'})`);
console.log(`[context] sections: ${Object.entries(sectionTokens).map(([k, v]) => `${k}=${v}`).join(' ')}`);
if (finalTokens > BUDGET) {
    const largest = textFiles.filter(isFull)
        .map(rel => ({ rel, t: tok(read(rel)) }))
        .sort((a, b) => b.t - a.t)
        .slice(0, 8);
    const nextMode = MODE === 'full' ? 'code' : MODE === 'code' ? 'balanced' : null;
    const suggestion = nextMode ? `可改用 --mode ${nextMode}` : '当前已是最小档位，可提高 --budget 或自行裁剪';
    console.warn(`[context] 超出预算 ${finalTokens - BUDGET} tokens；${suggestion}。`);
    console.warn(`[context] 最大的全文文件: ${largest.map(x => `${x.rel}(${x.t})`).join(', ')}`);
}
