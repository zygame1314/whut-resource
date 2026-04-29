# WHUT Resource | 武理资源共享平台

> 以一灯传诸灯，终至灯火通明

武汉理工大学非营利性学习资源共享平台，聚合历年考试试卷、课件、笔记等学术资料，为同学们提供便捷的资源浏览、搜索与上传服务。

**在线访问**: [resource.haoli.site](https://resource.haoli.site)

---

## 功能概览

### 📂 文件浏览与管理
- 目录树侧边栏导航 + 面包屑路径
- 列表/网格视图切换、多种排序方式
- 文件类型筛选（文件夹 / 链接 / PDF / 文档 / 图片 / 视频）
- 分页浏览（每页 20 条）

### 🔍 智能搜索
- **全文搜索**：基于 SQLite FTS5，支持中文逐字分词与缩写匹配
- **AI 语义搜索**：基于向量嵌入 (Qwen3-Embedding) + 重排序 (bge-reranker)，理解自然语言查询意图

### 📤 文件上传
- 拖拽上传 / 文件选择器 / 外部链接上传
- 可视化目录路径选择器
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
- 点赞、状态管理（未解决/已解决/已驳回）

### 👤 用户系统
- 仅限 `@whut.edu.cn` 邮箱注册 + 邮箱验证
- 武汉理工统一认证 (CAS/SSO) 登录
- JWT 认证 + 角色权限（user / admin / super_admin）
- hCaptcha 人机验证

### 🛡️ 管理后台
- 公告管理（Markdown 支持）
- 留言板 AI 辅助审核
- 删除审批工作流
- 操作审计日志
- 维护模式开关
- 用户管理（封禁、配额调整）
- 向量索引重建

### 📋 其他
- 知识图谱可视化
- 文件预览（PDF / 图片 / 视频 / 文本）
- 外部链接安全检测（Google Safe Browsing）
- Shepherd.js 新手引导
- PWA 离线缓存 + 可安装应用
- 深色/浅色主题切换

---

## 技术栈

### 前端
| 技术 | 用途 |
|---|---|
| Vanilla JavaScript (ES6+) | 全部前端逻辑，模块化构建打包 |
| 自定义 CSS（7 模块架构） | 主题（亮/暗色）、动画、响应式 |
| Marked.js + KaTeX + Highlight.js | Markdown 渲染、数学公式、代码高亮 |
| DOMPurify | XSS 过滤 |
| JSZip | 客户端 ZIP 打包 |
| pdf-lib | PDF 水印注入 |
| Shepherd.js | 新手引导 |
| hCaptcha | 人机验证 |

### 后端（Cloudflare 全家桶）
| 技术 | 用途 |
|---|---|
| Cloudflare Pages Functions | Serverless API |
| Cloudflare D1 | SQLite 数据库 |
| Cloudflare R2 | 对象存储 |
| Cloudflare Vectorize | 向量索引（AI 语义搜索） |
| Cloudflare Durable Objects | WebSocket 实时日志 |
| Cloudflare Email Workers | 邮箱验证码发送 |

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

```
├── index.html                  # 主页（文件浏览器）
├── upload.html                 # 上传页
├── about.html                  # 关于页
├── src/
│   ├── js/
│   │   ├── config.js           # API 端点、全局配置
│   │   ├── core.js             # 文件浏览核心逻辑
│   │   ├── main.js             # 主页初始化、搜索、主题
│   │   ├── actions.js          # 文件操作（下载/删除/移动/分享）
│   │   ├── upload_main.js      # 上传页初始化
│   │   ├── utils.js            # 工具函数
│   │   ├── globals.js          # DOM 引用与全局状态
│   │   ├── ui/
│   │   │   ├── render.js       # 文件列表渲染、分页
│   │   │   └── modals.js       # 弹窗组件
│   │   └── modules/
│   │       ├── auth/           # 认证模块（登录/注册/SSO/管理）
│   │       ├── guestbook/      # 留言板（含 AI 审核逻辑）
│   │       ├── upload/         # 上传模块
│   │       ├── announcements.js
│   │       ├── graph.js        # 知识图谱
│   │       ├── preview.js      # 文件预览
│   │       ├── batch.js        # 批量操作
│   │       ├── download-manager.js
│   │       └── tutorial.js     # 新手引导
│   └── css/
│       └── modules/            # 7 模块 CSS 架构
├── functions/                  # Cloudflare Pages Functions（Serverless API）
│   ├── utils.js                # JWT、哈希、CORS、AI 工具
│   ├── whut-email.js           # 邮件 Worker
│   └── api/
│       ├── auth.js             # 认证 API
│       ├── files.js            # 文件 CRUD + 搜索
│       ├── upload.js           # 上传 API
│       ├── guestbook.js        # 留言板 API
│       ├── guestbook-ai.js     # AI 审核 API
│       ├── ai-search.js        # AI 语义搜索 API
│       └── ...
├── worker/
│   └── download_logger.js      # Durable Object（下载日志）
├── scripts/
│   ├── build/                  # 构建脚本
│   ├── dev.js                  # 开发热更新
│   └── clean.js                # 清理
├── lib/                        # 第三方库（从 node_modules 同步）
├── schema.sql                  # D1 数据库 Schema
├── wrangler.toml               # Cloudflare 配置
└── build.js                    # 构建入口
```

---

## 快速开始

### 环境要求

- Node.js >= 18
- Cloudflare 账户（部署时需要）

### 开发

```bash
# 安装依赖（postinstall 会自动同步第三方库到 lib/）
npm install

# 启动开发模式（监听 src/ 变更，自动打包，不压缩）
npm run dev

# 本地静态服务（另开终端）
npx -y http-server .
```

### 构建

```bash
# 生产构建（输出到 dist/，含压缩 + 缓存哈希）
npm run build

# 清理构建产物
npm run clean
```

### 部署

```bash
# 构建 + 部署到 Cloudflare Pages
npm run deploy
```

---

## API 端点

所有接口通过 Cloudflare Pages Functions 提供，路径前缀 `/api/`：

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/auth` | POST | 注册/登录/密码重置/SSO/资料修改 |
| `/api/files` | GET/POST/PUT/DELETE | 文件 CRUD、搜索、统计、点赞 |
| `/api/upload` | POST | 文件/链接上传至 R2 + D1 |
| `/api/download` | GET | 生成 R2 签名下载链接 |
| `/api/preview` | GET | 生成预览签名链接 |
| `/api/guestbook` | GET/POST/PUT/DELETE | 留言板 CRUD、点赞、管理 |
| `/api/guestbook-ai` | POST | AI 留言审核与回复 |
| `/api/ai-search` | GET | AI 语义搜索 |
| `/api/announcements` | GET/POST/PUT/DELETE | 公告管理 |
| `/api/batch-download` | POST | 批量打包下载 |
| `/api/maintenance` | GET/POST | 维护模式 |
| `/api/path-recommend` | GET | 上传路径推荐 |
| `/api/admin-requests` | GET/POST/PUT | 管理员审批 |
| `/api/admin-logs` | GET | 操作审计日志 |
| `/api/url-safety` | POST | 链接安全检测 |
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
