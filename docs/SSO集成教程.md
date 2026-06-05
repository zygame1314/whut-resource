# 武理资源共享平台 SSO 接入教程

## 目录

- [概述](#概述)
- [协议与端点](#协议与端点)
- [超管操作：注册 OAuth 客户端](#超管操作注册-oauth-客户端)
- [开发者接入：授权码流程详解](#开发者接入授权码流程详解)
  - [Step 1：引导用户授权](#step-1引导用户授权)
  - [Step 2：用户在授权页确认](#step-2用户在授权页确认)
  - [Step 3：接收授权码](#step-3接收授权码)
  - [Step 4：用授权码换取令牌](#step-4用授权码换取令牌)
  - [Step 5：获取用户信息](#step-5获取用户信息)
  - [Step 6：验证 ID Token (可选)](#step-6验证-id-token-可选)
- [PKCE 安全扩展](#pkce-安全扩展)
- [接口参考](#接口参考)
  - [POST /api/oauth/authorize](#post-apioauthauthorize)
  - [POST /api/oauth/token](#post-apioauthtoken)
  - [GET /api/oauth/userinfo](#get-apioauthuserinfo)
- [Scope 权限说明](#scope-权限说明)
- [错误码参考](#错误码参考)
- [完整接入示例](#完整接入示例)
  - [纯前端 SPA (PKCE)](#纯前端-spa-pkce)
  - [服务端渲染 (传统授权码)](#服务端渲染传统授权码)
- [安全建议](#安全建议)
- [超管运维手册](#超管运维手册)

---

## 概述

武理资源共享平台实现了标准 **OAuth 2.0 Authorization Code Flow**，并支持 **PKCE (Proof Key for Code Exchange)** 扩展和 **OpenID Connect** ID Token，可作为 SSO 统一登录入口。

**核心能力：**

| 能力 | 说明 |
|------|------|
| 授权模式 | Authorization Code（授权码模式） |
| PKCE | 支持 `S256` 和 `plain` |
| OpenID Connect | Token 端点签发 `id_token` (JWT) |
| Access Token 有效期 | 24 小时 |
| 授权码有效期 | 10 分钟 |
| 支持 Scope | `openid` `profile` `email` |

**站点地址：** `https://resource.haoli.site`

---

## 协议与端点

| 端点 | URL | 方法 | 说明 |
|------|-----|------|------|
| 授权端点 | `https://resource.haoli.site/api/oauth/authorize` | POST | 用户登录 + 授权确认 + 签发授权码 |
| 授权页面 | `https://resource.haoli.site/authorize.html` | GET | 供用户交互的授权页面 |
| 令牌端点 | `https://resource.haoli.site/api/oauth/token` | POST | 用授权码换取 access_token + id_token |
| 用户信息端点 | `https://resource.haoli.site/api/oauth/userinfo` | GET | 用 access_token 获取用户 Claims |

> **注意：** 授权端点 (`/api/oauth/authorize`) 使用 **POST** 而非传统的 GET + 302 重定向。接入方需要先在前端引导用户到授权页面 (`authorize.html`)，授权页面内通过 POST 请求与后端交互。授权成功后由授权页面直接将用户 `window.location.href` 重定向到你的 `redirect_uri`。

---

## 超管操作：注册 OAuth 客户端

外部应用接入前，需要由平台 **超级管理员 (super_admin)** 在后台注册 OAuth 客户端。

### 1. 进入管理面板

登录平台 → 点击头像 → 管理面板 → OAuth 客户端管理

### 2. 创建客户端

点击「创建客户端」，填写以下信息：

| 字段 | 必填 | 说明 |
|------|------|------|
| 客户端名称 | ✅ | 显示在用户授权确认页的名称，如 "课程表助手" |
| 回调地址 | ✅ | 授权成功后跳转的 URL，多个用英文逗号分隔。如 `http://localhost:3000/callback,https://myapp.com/auth/callback` |
| 描述 | ❌ | 应用简介，显示在授权确认页 |
| Logo URL | ❌ | 应用图标 URL，显示在授权确认页 |

### 3. 保存凭证

创建成功后，系统**仅展示一次** `client_id` 和 `client_secret`，格式如下：

```
client_id:     whut_aBcDeFgHiJkLmNoPqRsTuVw
client_secret: 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d...
```

> **⚠️ 极度重要：`client_secret` 只展示一次，关闭弹窗后无法再查看，只能重置。请立即安全存储。**

### 4. 将凭证提供给开发者

将 `client_id` 和 `client_secret` 安全地（不要通过明文聊天工具）传递给接入方开发者，同时告知其可用的 `redirect_uri`。

---

## 开发者接入：授权码流程详解

下面是完整的授权码流程时序：

```
┌──────────┐       ┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│  用户     │       │  你的应用     │       │  authorize.html  │       │  OAuth 后端   │
└────┬─────┘       └──────┬───────┘       └────────┬─────────┘       └──────┬───────┘
     │  点击"登录"         │                        │                        │
     │ ─────────────────>  │                        │                        │
     │                     │  重定向到 authorize.html │                        │
     │ <─────────────────  │                        │                        │
     │  ─────────────────────────────────────────>  │                        │
     │                     │                        │  POST /authorize       │
     │                     │                        │  (携带 OAuth 参数)      │
     │                     │                        │ ─────────────────────> │
     │                     │                        │  返回 requireConsent   │
     │                     │                        │ <───────────────────── │
     │  看到授权确认页       │                        │                        │
     │ <────────────────────────────────────────── │                        │
     │  点击"允许授权"       │                        │                        │
     │ ─────────────────────────────────────────>  │                        │
     │                     │                        │  POST /authorize       │
     │                     │                        │  decision=approve      │
     │                     │                        │ ─────────────────────> │
     │                     │                        │  返回 code             │
     │                     │                        │ <───────────────────── │
     │                     │  重定向到 redirect_uri  │                        │
     │                     │  ?code=xxx&state=yyy   │                        │
     │ <───────────────────────────────────────── │                        │
     │                     │                        │                        │
     │                     │  POST /token           │                        │
     │                     │  code + client_secret  │                        │
     │                     │ ─────────────────────────────────────────────────> │
     │                     │  access_token + id_token                       │
     │                     │ <───────────────────────────────────────────────── │
     │                     │                        │                        │
     │                     │  GET /userinfo         │                        │
     │                     │  Bearer access_token   │                        │
     │                     │ ─────────────────────────────────────────────────> │
     │                     │  用户信息 Claims       │                        │
     │                     │ <───────────────────────────────────────────────── │
```

### Step 1：引导用户授权

在你的应用中，将用户重定向到武理资源共享平台的授权页面：

```
https://resource.haoli.site/authorize.html?client_id={your_client_id}&redirect_uri={your_redirect_uri}&response_type=code&scope=openid profile email&state={random_state}
```

**参数说明：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `client_id` | ✅ | 超管分配的客户端 ID，格式 `whut_` + 24位随机字符 |
| `redirect_uri` | ✅ | 必须与注册时的回调地址**完全一致** |
| `response_type` | ✅ | 固定为 `code` |
| `scope` | ❌ | 请求的权限范围，空格分隔，默认 `openid profile email` |
| `state` | 强烈建议 | 随机字符串，用于防止 CSRF 攻击，回调时原样返回 |
| `code_challenge` | 推荐 | PKCE code challenge，见 [PKCE 章节](#pkce-安全扩展) |
| `code_challenge_method` | 推荐 | `S256`（推荐）或 `plain` |

**示例 URL：**

```
https://resource.haoli.site/authorize.html?client_id=whut_aBcDeFgHiJkLmNoPqRsTuVw&redirect_uri=https://myapp.com/auth/callback&response_type=code&scope=openid%20profile%20email&state=xyz789&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256
```

### Step 2：用户在授权页确认

用户到达 `authorize.html` 后，会发生以下两种情况：

1. **用户未登录** → 页面提示"需要登录"，引导用户先登录武理资源共享平台账户，登录后自动回到授权流程
2. **用户已登录** → 页面展示授权确认页，包含：
   - 客户端名称和 Logo
   - 当前登录用户信息
   - 请求的权限列表（openid/profile/email 说明）
   - 「允许授权」和「拒绝」按钮

用户点击「允许授权」后，系统签发授权码并重定向。

### Step 3：接收授权码

用户同意授权后，浏览器会被重定向到你的 `redirect_uri`，并附带以下参数：

**授权成功：**
```
https://myapp.com/auth/callback?code=AUTHORIZATION_CODE&state=xyz789
```

**用户拒绝：**
```
https://myapp.com/auth/callback?error=access_denied&error_description=用户拒绝授权&state=xyz789
```

> **安全检查：** 收到回调后，务必验证 `state` 参数与你发起时传入的值一致，防止 CSRF 攻击。

### Step 4：用授权码换取令牌

在你的**服务端**，使用授权码换取令牌：

```http
POST https://resource.haoli.site/api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTHORIZATION_CODE
&redirect_uri=https://myapp.com/auth/callback
&client_id=whut_aBcDeFgHiJkLmNoPqRsTuVw
&client_secret=YOUR_CLIENT_SECRET
```

也支持 JSON 格式请求体（`Content-Type: application/json`）。

**如果使用了 PKCE，** 需额外传入 `code_verifier` 参数（不需要 `client_secret`）。

**成功响应 (HTTP 200)：**

```json
{
  "access_token": "1a2b3c...96char_hex_string",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "openid profile email",
  "id_token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiL..."
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `access_token` | string | 不透明令牌，96 字符十六进制字符串 |
| `token_type` | string | 固定 `Bearer` |
| `expires_in` | number | 有效期秒数，固定 `86400`（24小时） |
| `scope` | string | 授权的权限范围 |
| `id_token` | string | JWT 格式的 ID Token，包含用户身份信息 |

> **授权码一次性：** 授权码使用后立即失效，不可重复使用。

### Step 5：获取用户信息

使用 access_token 调用 UserInfo 端点：

```http
GET https://resource.haoli.site/api/oauth/userinfo
Authorization: Bearer {access_token}
```

**成功响应 (HTTP 200)：**

```json
{
  "sub": "123",
  "nickname": "张三",
  "role": "user",
  "email": "zhangsan@whut.edu.cn",
  "email_verified": true,
  "school_id": "2021001234",
  "updated_at": 1717584000
}
```

返回的 Claims 取决于授权的 scope：

| Claim | 始终返回 | 需要 `profile` | 需要 `email` | 说明 |
|-------|---------|---------------|-------------|------|
| `sub` | ✅ | | | 用户唯一标识 (ID 字符串) |
| `updated_at` | ✅ | | | 信息更新时间戳 |
| `nickname` | | ✅ | | 用户昵称 |
| `role` | | ✅ | | 用户角色 (`user` / `admin` / `super_admin`) |
| `email` | | | ✅ | 邮箱地址 |
| `email_verified` | | | ✅ | 固定 `true` |
| `school_id` | | | ✅* | 学号（仅用户已绑定学号时返回） |

### Step 6：验证 ID Token (可选)

Token 端点返回的 `id_token` 是一个 HS256 签名的 JWT，你可以在不调用 UserInfo 端点的情况下直接从中获取用户信息。

**ID Token Payload：**

```json
{
  "id": 123,
  "email": "zhangsan@whut.edu.cn",
  "nickname": "张三",
  "role": "user",
  "school_id": "2021001234",
  "aud": "whut_aBcDeFgHiJkLmNoPqRsTuVw",
  "iss": "whut-resource",
  "exp": 1717670400
}
```

| 字段 | 说明 |
|------|------|
| `id` | 用户数字 ID |
| `email` | 用户邮箱 |
| `nickname` | 用户昵称 |
| `role` | 用户角色 |
| `school_id` | 学号 |
| `aud` | 受众 = 你的 `client_id` |
| `iss` | 签发者 = `whut-resource` |
| `exp` | 过期时间戳（秒） |

**验证步骤：**
1. 使用 `client_secret` 作为 HMAC-SHA256 密钥验证签名
2. 检查 `aud` 是否等于你的 `client_id`
3. 检查 `iss` 是否为 `whut-resource`
4. 检查 `exp` 是否未过期

> **注意：** 平台使用 HS256 算法签名 JWT。由于签名密钥与你的 `client_secret` 不同（使用平台全局 `JWT_SECRET`），你无法在本地验证 ID Token 签名。如需可靠验证用户身份，请始终调用 `/api/oauth/userinfo` 端点。如你确需本地验证 JWT，需联系超管获取 `JWT_SECRET`（不推荐，有安全风险）。

---

## PKCE 安全扩展

PKCE (Proof Key for Code Exchange) 用于防止授权码被截获滥用，**是纯前端 SPA 应用必须使用的安全机制**，也是服务端应用的推荐实践。

### 流程

1. **生成 code_verifier**：随机字符串，43-128 字符，包含 `[A-Z] / [a-z] / [0-9] / - / . / _ / ~`

2. **计算 code_challenge**：
   - `S256`（推荐）：`code_challenge = BASE64URL(SHA256(code_verifier))`
   - `plain`：`code_challenge = code_verifier`

3. **授权请求时**传入 `code_challenge` 和 `code_challenge_method`

4. **Token 请求时**传入 `code_verifier`（原始值），服务端验证它与之前提交的 `code_challenge` 匹配

### 代码示例

```javascript
// 生成 code_verifier
function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64UrlEncode(array);
}

// 生成 code_challenge (S256)
async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(buffer) {
    let str = '';
    const bytes = new Uint8Array(buffer);
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
```

> **使用 PKCE 时，Token 请求可省略 `client_secret`**，因为 `code_verifier` 已提供了相同的客户端认证保障。

---

## 接口参考

### POST /api/oauth/authorize

授权端点，处理用户授权请求。

**请求：**

支持 `application/json` 和 `application/x-www-form-urlencoded` 两种格式。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `client_id` | string | ✅ | 客户端 ID |
| `redirect_uri` | string | ✅ | 回调地址，必须在注册允许列表中 |
| `response_type` | string | ❌ | 固定 `code`，其他值返回错误 |
| `scope` | string | ❌ | 空格分隔的权限，默认 `openid profile email` |
| `state` | string | ❌ | 防 CSRF 随机值 |
| `code_challenge` | string | ❌ | PKCE code challenge |
| `code_challenge_method` | string | ❌ | `S256` 或 `plain` |
| `decision` | string | ❌ | `approve` 同意 / `deny` 拒绝，不传则返回授权信息让用户确认 |

**需要认证：** 请求头 `Authorization: Bearer {用户登录 Token}`

**响应 — 需要用户确认 (decision 未传)：**

```json
{
  "success": true,
  "requireConsent": true,
  "client": {
    "name": "课程表助手",
    "description": "自动导入课表",
    "logo_url": "https://example.com/logo.png"
  },
  "user": {
    "id": 123,
    "nickname": "张三",
    "email": "zhangsan@whut.edu.cn"
  },
  "scope": "openid profile email"
}
```

**响应 — 用户同意 (decision=approve)：**

```json
{
  "success": true,
  "code": "aBcDeFgHiJkLmNoPqRsTuVwXyZ012345",
  "state": "",
  "redirect_uri": "https://myapp.com/auth/callback"
}
```

**响应 — 用户拒绝 (decision=deny)：**

```json
{
  "success": false,
  "error": "用户拒绝授权",
  "error_code": "access_denied"
}
```

**响应 — 未登录：**

```json
{
  "success": false,
  "error": "未登录，请先登录",
  "requireLogin": true
}
```

**错误响应：**

| HTTP 状态码 | error | 说明 |
|-------------|-------|------|
| 400 | client_id 和 redirect_uri 不能为空 | 缺少必要参数 |
| 400 | 仅支持 response_type=code | 不支持的响应类型 |
| 400 | 无效的客户端ID或客户端已禁用 | client_id 不存在或已禁用 |
| 400 | redirect_uri 不在允许列表中 | 回调地址未注册 |
| 401 | 未登录，请先登录 | 用户未认证 |
| 500 | 授权请求处理失败 | 服务器内部错误 |

---

### POST /api/oauth/token

令牌端点，用授权码换取 access_token。

**请求：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `grant_type` | string | ✅ | 固定 `authorization_code` |
| `code` | string | ✅ | 授权码 |
| `redirect_uri` | string | ❌ | 回调地址，必须与授权时一致 |
| `client_id` | string | ❌ | 客户端 ID，用于校验 |
| `client_secret` | string | ❌* | 客户端密钥，机密客户端必填，使用 PKCE 时可省略 |
| `code_verifier` | string | ❌* | PKCE code verifier，授权时使用了 PKCE 则必填 |

> `client_id` 与 `client_secret` 也支持通过 HTTP Basic Auth 头传递（`Authorization: Basic base64(client_id:client_secret)`），但本平台未对 Basic Auth 做专门处理，建议直接放在请求体中。

**成功响应 (HTTP 200)：**

```json
{
  "access_token": "1a2b3c4d5e6f...96位hex",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "openid profile email",
  "id_token": "eyJhbGciOiJIUzI1NiJ9..."
}
```

响应头包含 `Cache-Control: no-store` 和 `Pragma: no-cache`。

**错误响应：**

| HTTP 状态码 | error | error_description | 说明 |
|-------------|-------|--------------------|------|
| 400 | unsupported_grant_type | 仅支持 authorization_code | grant_type 错误 |
| 400 | invalid_request | 缺少 authorization code | 未传 code |
| 400 | invalid_grant | 授权码无效 | code 不存在 |
| 400 | invalid_grant | 授权码已过期 | code 超过 10 分钟 |
| 400 | invalid_grant | redirect_uri 不匹配 | redirect_uri 与授权时不一致 |
| 400 | invalid_client | client_id 不匹配 | client_id 与授权时不一致 |
| 401 | invalid_client | client_secret 验证失败 | 密钥错误 |
| 400 | invalid_request | 需要 code_verifier (PKCE) | 授权时用了 PKCE 但 token 请求未提供 |
| 400 | invalid_grant | PKCE 验证失败 | code_verifier 与 code_challenge 不匹配 |
| 400 | invalid_client | 客户端无效或已禁用 | 客户端已被管理员禁用 |
| 400 | invalid_grant | 用户不存在 | 授权用户已被删除 |
| 500 | server_error | ... | 服务器内部错误 |

---

### GET /api/oauth/userinfo

用户信息端点，返回授权用户的 Claims。

**请求：**

```http
GET /api/oauth/userinfo
Authorization: Bearer {access_token}
```

**成功响应 (HTTP 200)：**

```json
{
  "sub": "123",
  "nickname": "张三",
  "role": "user",
  "email": "zhangsan@whut.edu.cn",
  "email_verified": true,
  "school_id": "2021001234",
  "updated_at": 1717584000
}
```

响应头包含 `Cache-Control: no-store` 和 `Pragma: no-cache`。

**错误响应：**

| HTTP 状态码 | error | error_description | 说明 |
|-------------|-------|--------------------|------|
| 401 | invalid_token | 缺少 Access Token | 未传 Authorization 头 |
| 401 | invalid_token | Access Token 无效 | token 不存在 |
| 401 | invalid_token | Access Token 已过期 | token 超过 24 小时 |
| 500 | server_error | ... | 服务器内部错误 |

错误时响应头包含 `WWW-Authenticate: Bearer error="invalid_token"`。

---

## Scope 权限说明

| Scope | 说明 | 返回的 Claims |
|-------|------|---------------|
| `openid` | 确认用户身份标识 | `sub` (用户 ID 字符串) |
| `profile` | 读取用户昵称和角色 | `nickname`, `role` |
| `email` | 读取用户邮箱和学号 | `email`, `email_verified`, `school_id`(如有) |

- 三个 scope 可以任意组合请求
- 如果请求了无效的 scope，会被自动过滤为有效 scope
- 如果所有请求的 scope 都无效，默认授予 `openid profile email`
- 不传 scope 等同于请求全部 `openid profile email`

---

## 错误码参考

### 授权页面回调错误 (redirect_uri 收到)

| error | error_description | 说明 |
|-------|-------------------|------|
| `access_denied` | 用户拒绝授权 | 用户点击了"拒绝"按钮 |
| `invalid_request` | ... | 缺少必要参数 |
| `unsupported_response_type` | 仅支持 response_type=code | response_type 不为 code |

### Token 端点错误

| error | 含义 |
|-------|------|
| `invalid_request` | 请求缺少必要参数 |
| `invalid_client` | 客户端认证失败 |
| `invalid_grant` | 授权码无效、已过期或不匹配 |
| `unsupported_grant_type` | grant_type 不为 authorization_code |
| `server_error` | 服务器内部错误 |

---

## 完整接入示例

### 纯前端 SPA (PKCE)

适合不需要服务端的无后端应用，使用 PKCE 替代 client_secret。

```javascript
// ===== 配置 =====
const CLIENT_ID = 'whut_aBcDeFgHiJkLmNoPqRsTuVw';
const REDIRECT_URI = 'https://myapp.com/callback.html';
const AUTHORIZE_URL = 'https://resource.haoli.site/authorize.html';
const TOKEN_URL = 'https://resource.haoli.site/api/oauth/token';
const USERINFO_URL = 'https://resource.haoli.site/api/oauth/userinfo';

// ===== 工具函数 =====
function base64UrlEncode(buffer) {
    let str = '';
    const bytes = new Uint8Array(buffer);
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
    return base64UrlEncode(new Uint8Array(digest));
}

// ===== 发起授权 =====
async function startOAuth() {
    const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // 保存到 sessionStorage 用于回调时验证
    sessionStorage.setItem('oauth_state', state);
    sessionStorage.setItem('oauth_code_verifier', codeVerifier);

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'openid profile email',
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
    });

    window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

// ===== 回调处理 (callback.html) =====
async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
        console.error('授权被拒绝:', params.get('error_description'));
        return;
    }

    // 验证 state
    const savedState = sessionStorage.getItem('oauth_state');
    if (state !== savedState) {
        console.error('State 不匹配，可能遭受 CSRF 攻击');
        return;
    }

    const codeVerifier = sessionStorage.getItem('oauth_code_verifier');

    // 换取令牌
    const tokenResponse = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            code_verifier: codeVerifier
        })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
        console.error('获取令牌失败:', tokenData);
        return;
    }

    // 获取用户信息
    const userinfoResponse = await fetch(USERINFO_URL, {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });

    const userinfo = await userinfoResponse.json();
    console.log('用户信息:', userinfo);
    // userinfo = { sub: "123", nickname: "张三", role: "user", email: "...", ... }

    // 保存登录状态
    localStorage.setItem('access_token', tokenData.access_token);
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('oauth_code_verifier');
}

// 根据当前页面决定执行哪个函数
if (window.location.pathname === '/callback.html' && window.location.search) {
    handleCallback();
}
```

### 服务端渲染 (传统授权码)

适合 Node.js / Python / Java 等后端应用。

**Node.js (Express) 示例：**

```javascript
const express = require('express');
const app = express();

const CLIENT_ID = 'whut_aBcDeFgHiJkLmNoPqRsTuVw';
const CLIENT_SECRET = '1a2b3c4d...64位hex';
const REDIRECT_URI = 'http://localhost:3000/auth/callback';
const AUTHORIZE_URL = 'https://resource.haoli.site/authorize.html';
const TOKEN_URL = 'https://resource.haoli.site/api/oauth/token';
const USERINFO_URL = 'https://resource.haoli.site/api/oauth/userinfo';

// 发起授权
app.get('/login', (req, res) => {
    const state = require('crypto').randomBytes(16).toString('base64url');
    req.session.oauthState = state;

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'openid profile email',
        state: state
    });

    res.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
});

// 处理回调
app.get('/auth/callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        return res.status(403).send('授权被拒绝: ' + req.query.error_description);
    }

    if (state !== req.session.oauthState) {
        return res.status(400).send('State 验证失败');
    }

    // 换取令牌
    const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET
        })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
        return res.status(500).send('获取令牌失败');
    }

    // 获取用户信息
    const userinfoRes = await fetch(USERINFO_URL, {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });

    const userinfo = await userinfoRes.json();
    console.log('用户信息:', userinfo);

    // 创建本地会话
    req.session.user = userinfo;
    res.redirect('/');
});

app.listen(3000);
```

**Python (Flask) 示例：**

```python
import secrets
import urllib.parse
import requests
from flask import Flask, request, session, redirect, jsonify

app = Flask(__name__)
app.secret_key = 'your-flask-secret'

CLIENT_ID = 'whut_aBcDeFgHiJkLmNoPqRsTuVw'
CLIENT_SECRET = '1a2b3c4d...64位hex'
REDIRECT_URI = 'http://localhost:5000/auth/callback'
AUTHORIZE_URL = 'https://resource.haoli.site/authorize.html'
TOKEN_URL = 'https://resource.haoli.site/api/oauth/token'
USERINFO_URL = 'https://resource.haoli.site/api/oauth/userinfo'

@app.route('/login')
def login():
    state = secrets.token_urlsafe(24)
    session['oauth_state'] = state
    params = urllib.parse.urlencode({
        'client_id': CLIENT_ID,
        'redirect_uri': REDIRECT_URI,
        'response_type': 'code',
        'scope': 'openid profile email',
        'state': state
    })
    return redirect(f'{AUTHORIZE_URL}?{params}')

@app.route('/auth/callback')
def callback():
    error = request.args.get('error')
    if error:
        return f'授权被拒绝: {request.args.get("error_description")}', 403

    code = request.args.get('code')
    state = request.args.get('state')
    if state != session.get('oauth_state'):
        return 'State 验证失败', 400

    token_res = requests.post(TOKEN_URL, json={
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': REDIRECT_URI,
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET
    })
    token_data = token_res.json()
    if 'access_token' not in token_data:
        return '获取令牌失败', 500

    userinfo_res = requests.get(USERINFO_URL, headers={
        'Authorization': f'Bearer {token_data["access_token"]}'
    })
    userinfo = userinfo_res.json()
    session['user'] = userinfo
    return jsonify(userinfo)

if __name__ == '__main__':
    app.run(port=5000)
```

---

## 安全建议

1. **始终使用 `state` 参数**：生成随机值并存入 session，回调时验证，防止 CSRF
2. **SPA 必须使用 PKCE**：纯前端应用无法安全保管 `client_secret`，PKCE (S256) 是必需的安全措施
3. **服务端应用建议同时使用 `client_secret` + PKCE**：双重保障
4. **`redirect_uri` 必须精确匹配**：包括尾部的斜杠、端口号、查询参数，注册多个回调地址用逗号分隔
5. **授权码只用一次**：重复使用授权码会失败
6. **Access Token 24 小时过期**：过期后需重新走授权流程
7. **不要在 URL 日志中暴露授权码**：`redirect_uri` 的 `code` 参数属于敏感数据
8. **`client_secret` 绝不传给前端**：只能在服务端使用
9. **HTTPS only**：所有端点均使用 HTTPS，回调地址也应使用 HTTPS（本地开发除外）

---

## 超管运维手册

### 客户端管理操作

| 操作 | 说明 | 影响 |
|------|------|------|
| 创建客户端 | 生成 `client_id` (`whut_` + 24位) 和 `client_secret` (64位hex) | 新增 `oauth_clients` 记录 |
| 启用/禁用 | 切换 `is_active` 状态 | 禁用后该客户端所有授权和令牌请求都会失败 |
| 重置密钥 | 生成新 `client_secret`，旧密钥立即失效 | 不影响已签发的 access_token |
| 更新信息 | 修改名称、回调地址、描述、Logo | `redirect_uris` 变更后，使用旧回调地址的授权会失败 |
| 删除客户端 | 级联删除所有关联的授权码和令牌 | **立即中断所有已登录用户** |
| 撤销令牌 | 删除该客户端所有 access_token | **所有已登录用户立即掉线** |
| 查看详情 | 查看客户端信息及最近 20 条授权记录 | 便于排查授权问题 |
| 清理过期数据 | 批量删除过期的授权码和令牌 | 不影响有效数据 |

### 注意事项

- **创建客户端后 `client_secret` 只展示一次**，务必提醒开发者立即保存
- **重置密钥前需通知开发者**，否则他们的应用会突然无法换取新令牌
- **删除客户端是不可逆操作**，会级联清除所有 token，建议先禁用观察再删除
- **系统会以 10% 概率自动清理过期数据**，也可手动在管理面板点击「清理」
- 管理面板可查看每个客户端的最近 20 条授权记录，便于排查问题

### 数据库表结构参考

```sql
-- OAuth 客户端
oauth_clients (
    id, client_id (唯一), client_secret_hash,
    client_name, redirect_uris (逗号分隔),
    description, logo_url, is_active,
    created_at, created_by
)

-- 授权码 (10 分钟有效，使用后删除)
oauth_authorization_codes (
    id, code (唯一), client_id, user_id,
    redirect_uri, scope, code_challenge,
    code_challenge_method, expires_at, created_at
)

-- 访问令牌 (24 小时有效)
oauth_access_tokens (
    id, access_token (唯一), client_id,
    user_id, scope, expires_at, created_at
)
```