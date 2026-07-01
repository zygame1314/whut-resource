# WHUT Resource | 武理资源共享平台

> 以一灯传诸灯，终至灯火通明

武汉理工大学非营利性学习资源共享平台，聚合历年考试试卷、课件、笔记等学术资料，为同学们提供便捷的资源浏览、搜索与上传服务。

**在线访问**: [resource.haoli.site](https://resource.haoli.site)

---

## 功能概览

### 📂 文件浏览与管理
- 目录树侧边栏导航（懒加载）+ 面包屑路径
- 列表/网格视图切换、多种排序方式
- 文件类型筛选（文件夹 / 链接 / PDF / 文档 / 图片 / 视频）
- 分页浏览（每页 20 条）
- 收藏夹（收藏常用资源）

### 🔍 智能搜索
- **全文搜索**：基于 SQLite FTS5，支持中文逐字分词与缩写匹配
- **AI 语义搜索**：基于向量嵌入 (Qwen3-Embedding) + 重排序 (bge-reranker)，理解自然语言查询意图
- **搜索历史**：本地记录与快速复用

### 📤 文件上传
- 拖拽上传 / 文件选择器 / 外部链接上传
- 可视化目录路径选择器 + AI 上传路径推荐
- PDF 自动水印注入（pdf-lib）
- 上传结果面板（成功/失败汇总）

### 📥 下载管理
- 单文件下载（R2 签名 URL）
- 批量打包下载（JSZip）
- 下载队列 + 进度追踪
- WebSocket 实时下载日志

### 💬 留言板 & AI 治理
- 资源求片 & 社区交流
- **AI 自动审核**：自动识别违规内容，建议驳回/隐藏/封禁
- **AI 资源匹配**：理解求片意图，语义检索匹配资源并自动回复
- **TODO 关联**：将求片留言关联为待办任务，跟踪解决进度
- **实时通知**：基于 WebSocket 的实时通知中心，支持留言状态变更、回复提醒及即时界面同步
- 点赞、状态管理（未解决/已解决/已驳回）

### ⚡ 文件助推与评论
- 文件助推（boost）+ 评论，含 AI 自动审核
- 助推数统计，热门资源聚合

### 👤 用户系统
- 仅限 `@whut.edu.cn` 邮箱注册 + 邮箱验证
- 武汉理工统一认证 (CAS/SSO) 登录
- **Passkey / WebAuthn** 无密码登录
- **工作量证明 (PoW)** 注册/重置防刷
- JWT 认证 + 角色权限（user / admin / super_admin）
- hCaptcha 人机验证

### 🔑 OAuth2 提供方
- 本平台同时作为 **OAuth2 / OIDC 提供方** 对外输出统一认证
- 授权码流程 + PKCE，端点 `/api/oauth/authorize` `/api/oauth/token` `/api/oauth/userinfo`
- 超管可管理第三方客户端（`/api/oauth-admin`）
- 接入教程见 `docs/SSO集成教程.md`

### 🛡️ 管理后台
- 公告管理（Markdown 支持）
- 留言板 AI 辅助审核
- 删除审批工作流（admin_requests）
- 操作审计日志（admin_logs）
- 维护模式开关
- 用户管理（封禁、配额调整、admin-management）
- OAuth 客户端管理
- 向量索引重建（reindex）

### 📋 其他
- 知识图谱可视化
- 文件预览（PDF.js / 图片 / 视频 / 文本）
- 外部链接安全检测（Google Safe Browsing）
- 站点统计（在线人数、GitHub 提交记录）
- 捐助弹窗
- 应用内浏览器检测引导
- 帮助页查看器（下载帮助 / 留言规范 / 上传指南 / 搜索技巧 / 分享规范）
- Shepherd.js 新手引导
- PWA 离线缓存 + 可安装应用
- 深色/浅色主题切换

---

## 技术栈

### 前端
| 技术 | 用途 |
|---|---|
| Vanilla JavaScript (ES6+) | 全部前端逻辑，模块化构建打包 |
| 自定义 CSS（11 模块架构） | 主题（亮/暗色）、动画、响应式 |
| Marked.js + KaTeX + Highlight.js | Markdown 渲染、数学公式、代码高亮 |
| marked-footnote / marked-highlight / marked-katex-extension | Marked 插件（脚注、高亮、公式） |
| DOMPurify | XSS 过滤 |
| JSZip | 客户端 ZIP 打包 |
| pdf-lib | PDF 水印注入 |
| PDF.js | PDF 预览 |
| Shepherd.js | 新手引导 |
| hCaptcha | 人机验证 |

### 后端（Cloudflare 全家桶）
| 技术 | 用途 |
|---|---|
| Cloudflare Pages Functions | Serverless API |
| Cloudflare D1 | SQLite 数据库 |
| Cloudflare R2 | 对象存储 |
| Cloudflare Vectorize | 向量索引（AI 语义搜索） |
| Cloudflare Durable Objects | WebSocket 实时日志 + 在线计数 |
| Cloudflare Email Workers | 邮箱验证码接收/解析 |

> AI 能力通过 SiliconFlow HTTP API 实现（非 Workers AI 绑定），需在 Pages 环境变量/Secret 中配置 `SILICONFLOW_API_KEY`、`JWT_SECRET`、`JWT_PRIVATE_KEY`、`BOT_EMAIL`、`GOOGLE_SAFE_BROWSING_API_KEY` 等。

### AI 服务
| 模型 / 服务 | 用途 |
|---|---|
| Qwen3-Embedding-0.6B (SiliconFlow) | 文本向量化 |
| bge-reranker-v2-m3 (SiliconFlow) | 搜索结果重排序 |
| Qwen3-8B (SiliconFlow) | 留言板 AI 审核与回复 |

### 构建工具
| 技术 | 用途 |
|---|---|
| Node.js 自定义构建脚本 | 模块打包、压缩、缓存哈希 |
| Terser | JS 压缩 |
| clean-css | CSS 压缩 |
| html-minifier-terser | HTML 压缩 |
| Wrangler | Cloudflare 部署 |

---

## 项目结构

> 根目录下的 JS/CSS（如 `script.js`、`auth.js`、`css/style.css` 等）均为**构建产物**，由 `src/` 经 `scripts/dev.js`（开发态，未压缩）或 `build.js`（生产态，压缩+哈希）生成，请勿直接编辑。

```
├── index.html                  # 主页（文件浏览器）
├── upload.html                 # 上传页
├── about.html                  # 关于页
├── authorize.html              # OAuth2 授权确认页
├── download_help.html          # 帮助页：下载与预览
├── guestbook_rules.html        # 帮助页：留言规范
├── how_to_upload.html          # 帮助页：上传指南
├── search_tips.html            # 帮助页：搜索技巧
├── sharing_rules.html          # 帮助页：分享规范
├── *.js / css/                  # 构建产物（见 src/ 源文件）
├── sw.js                        # Service Worker（构建时注入版本号）
├── manifest.json                # PWA 清单
├── src/
│   ├── js/
│   │   ├── config.js           # API 端点、全局配置
│   │   ├── core.js             # 文件浏览核心逻辑
│   │   ├── main.js             # 主页初始化、搜索、主题
│   │   ├── actions.js          # 文件操作（下载/删除/移动/分享）
│   │   ├── upload_main.js      # 上传页初始化
│   │   ├── utils.js            # 工具函数
│   │   ├── globals.js          # DOM 引用与全局状态
│   │   ├── sw.js               # Service Worker 源文件
│   │   ├── ui/
│   │   │   ├── render.js        # 文件列表渲染、分页
│   │   │   ├── modals.js        # 弹窗组件
│   │   │   └── folder-tree-lazy.js  # 懒加载目录树
│   │   └── modules/
│   │       ├── auth/           # 认证模块（pow/state/utils/ui/api-core/api-admin/init + modals/）
│   │       ├── guestbook/      # 留言板（state/utils/api/render/modals/actions/ai/todos/init）
│   │       ├── upload/         # 上传模块（ui/handlers/path-selector/links）
│   │       ├── oauth.js        # OAuth2 授权页客户端逻辑
│   │       ├── announcements.js
│   │       ├── graph.js        # 知识图谱
│   │       ├── preview.js      # 文件预览
│   │       ├── batch.js        # 批量操作
│   │       ├── download-manager.js
│   │       ├── download-manager-ui.js
│   │       ├── download-log.js # WebSocket 下载日志客户端
│   │       ├── tutorial.js     # 新手引导
│   │       ├── search-history.js
│   │       ├── lazy-loader.js  # 模块懒加载器
│   │       ├── site-stats.js   # 站点统计
│   │       ├── browser-guide.js # 应用内浏览器引导
│   │       ├── page-viewer.js  # 帮助页 AJAX 查看器
│   │       └── donation-popup.js # 捐助弹窗
│   └── css/
│       └── modules/            # 11 模块 CSS（base/animations/layout/components/pages/dynamic/tutorial/graph/authorize/browser-guide/page-viewer）
├── functions/                  # Cloudflare Pages Functions（Serverless API）
│   ├── utils.js                # JWT、哈希、CORS、AI(SiliconFlow)、向量搜索工具
│   ├── whut-email.js           # Email Worker（邮件解析）
│   └── api/
│       ├── _middleware.js      # 维护模式中间件
│       ├── auth.js             # 认证 API
│       ├── files.js            # 文件 CRUD + 搜索
│       ├── upload.js           # 上传 API
│       ├── preview.js          # 预览签名链接
│       ├── download/[[path]].js # 动态路径下载
│       ├── guestbook.js        # 留言板 API
│       ├── guestbook-ai.js     # AI 审核 API
│       ├── ai-search.js        # AI 语义搜索 API
│       ├── announcements.js    # 公告管理
│       ├── batch-download.js  # 批量打包下载
│       ├── maintenance.js     # 维护模式
│       ├── path-recommend.js  # 上传路径推荐
│       ├── admin-logs.js      # 操作审计日志
│       ├── admin-management.js # 用户/管理管理
│       ├── admin-requests.js  # 管理员审批
│       ├── file-boosts.js     # 文件助推/评论 + AI 审核
│       ├── passkey.js         # Passkey/WebAuthn
│       ├── pow.js             # 工作量证明防刷
│       ├── reindex.js         # 向量索引重建
│       ├── site-stats.js      # 站点统计
│       ├── sso-utils.js       # SSO/CAS 工具（RSA 验签）
│       ├── sync.js            # R2/D1/Vectorize 数据同步
│       ├── todos.js           # TODO 任务管理
│       ├── url-safety.js      # 链接安全检测
│       ├── ws.js               # WebSocket 路由
│       ├── oauth-admin.js     # OAuth 客户端管理
│       └── oauth/
│           ├── authorize.js   # OAuth2 授权端点
│           ├── token.js       # OAuth2 令牌端点
│           └── userinfo.js    # OAuth2 用户信息端点
├── worker/
│   ├── download_logger.js     # DownloadLogger Durable Object（WebSocket 日志 + 在线计数）
│   └── wrangler.toml          # DO Worker 独立部署配置
├── scripts/
│   ├── build/                 # 构建脚本（config.js / tasks.js / utils.js）
│   ├── dev.js                 # 开发热更新
│   ├── clean.js               # 清理构建产物
│   └── sync-deps.js           # postinstall：同步第三方库到 lib/
├── lib/                       # 第三方库（由 sync-deps.js 同步，pdfjs 手动维护）
├── docs/
│   └── SSO集成教程.md          # OAuth2/OIDC 接入文档
├── dist/                      # 生产构建产物（npm run build 输出）
├── schema.sql                 # D1 数据库 Schema（25 张表）
├── wrangler.toml              # Cloudflare Pages 配置
└── build.js                   # 构建入口
```

### 数据库表（schema.sql）

`users` `files` `files_fts` `downloads` `announcements` `guestbook` `guestbook_likes` `file_reactions` `pending_registrations` `pending_resets` `pending_email_changes` `system_stats` `admin_logs` `system_cache` `admin_requests` `login_attempts` `file_boosts` `vector_sync_failures` `user_passkeys` `oauth_clients` `oauth_authorization_codes` `oauth_access_tokens` `pow_challenges` `todos` `todo_guestbook` `favorites`

---

## 快速开始

### 环境要求

- Node.js >= 18
- Cloudflare 账户（部署时需要）

### 开发

```bash
# 安装依赖（postinstall 会自动同步第三方库到 lib/）
npm install

# 启动开发模式（监听 src/ 变更，自动打包到根目录，不压缩）
npm run dev

# 本地静态服务（另开终端）
npx -y http-server .
```

### 构建

```bash
# 生产构建（输出到 dist/，含压缩 + 缓存哈希）
npm run build

# 预览构建产物
npm run preview

# 清理构建产物
npm run clean
```

### 部署

```bash
# 构建 + 部署到 Cloudflare Pages
npm run deploy

# Durable Object Worker 需单独部署（首次部署需执行 migrations）
wrangler deploy -c worker/wrangler.toml
```

### 环境变量 / Secret

在 Cloudflare Pages 控制台配置：
- `SILICONFLOW_API_KEY` — AI 模型服务密钥
- `JWT_SECRET` — JWT 签名密钥（内部 access_token 验证用，HS256）
- `JWT_PRIVATE_KEY` — OpenID Connect ID Token 签名用 RSA 私钥（PKCS#8 PEM 格式，RS256），JWKS 公钥由其动态推导
- `BOT_EMAIL` — 发件邮箱
- `GOOGLE_SAFE_BROWSING_API_KEY` — 链接安全检测密钥

---

## API 端点

所有接口通过 Cloudflare Pages Functions 提供，路径前缀 `/api/`：

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/auth` | POST | 注册/登录/密码重置/SSO/资料修改 |
| `/api/files` | GET/POST/PUT/DELETE | 文件 CRUD、搜索、统计、点赞 |
| `/api/upload` | POST | 文件/链接上传至 R2 + D1 |
| `/api/preview` | GET | 生成预览签名链接 |
| `/api/download/*` | GET | 动态路径下载 |
| `/api/guestbook` | GET/POST/PUT/DELETE | 留言板 CRUD、点赞、管理 |
| `/api/guestbook-ai` | POST | AI 留言审核与回复 |
| `/api/ai-search` | GET | AI 语义搜索 |
| `/api/announcements` | GET/POST/PUT/DELETE | 公告管理 |
| `/api/batch-download` | POST | 批量打包下载 |
| `/api/maintenance` | GET/POST | 维护模式 |
| `/api/path-recommend` | GET | 上传路径推荐 |
| `/api/admin-requests` | GET/POST/PUT | 管理员审批工作流 |
| `/api/admin-logs` | GET | 操作审计日志 |
| `/api/admin-management` | GET/POST/PUT | 用户/管理员管理 |
| `/api/file-boosts` | GET/POST | 文件助推/评论（含 AI 审核） |
| `/api/passkey` | POST/DELETE | Passkey/WebAuthn 凭证 |
| `/api/pow` | GET/POST | 工作量证明挑战 |
| `/api/reindex` | POST | 向量索引重建 |
| `/api/site-stats` | GET | 站点统计 |
| `/api/sync` | POST | R2/D1/Vectorize 数据同步 |
| `/api/todos` | GET/POST/PUT/DELETE | TODO 任务管理 |
| `/api/url-safety` | POST | 链接安全检测 |
| `/api/oauth-admin` | GET/POST/PUT/DELETE | OAuth 客户端管理 |
| `/api/oauth/authorize` | GET/POST | OAuth2 授权端点 |
| `/api/oauth/token` | POST | OAuth2 令牌端点 |
| `/api/oauth/userinfo` | GET | OAuth2 用户信息端点 |
| `/api/ws` | WebSocket | 实时下载日志 |

---

## 致谢

- 所有上传和分享资源的同学们
- [Cloudflare](https://www.cloudflare.com/) 提供的 Serverless 基础设施
- [SiliconFlow](https://siliconflow.cn/) 提供的 AI 模型服务

---

## 许可证

本项目采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) 许可协议。

- ✅ 允许：分享、修改、演绎
- ❌ 禁止：商业用途
- 📌 要求：署名注明原作者