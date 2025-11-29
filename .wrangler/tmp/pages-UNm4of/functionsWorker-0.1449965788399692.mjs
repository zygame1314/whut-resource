var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../.wrangler/tmp/bundle-gmWbbo/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// utils.js
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + (salt || "default-salt"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashPassword, "hashPassword");
async function verifyPasswordHash(password, hash, salt) {
  const computedHash = await hashPassword(password, salt);
  return computedHash === hash;
}
__name(verifyPasswordHash, "verifyPasswordHash");
async function signToken(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}
__name(signToken, "signToken");
async function verifyToken(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signature = Uint8Array.from(atob(encodedSignature.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );
    if (!isValid) return null;
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}
__name(verifyToken, "verifyToken");
function addCorsHeaders(headers = {}) {
  return {
    ...headers,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400"
  };
}
__name(addCorsHeaders, "addCorsHeaders");

// api/download/[[path]].js
async function onRequest(context) {
  const { request, env, params } = context;
  const path = params.path;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
  }
  const url = new URL(request.url);
  let key;
  let isSignedUrl = false;
  let signature, expires;
  if (Array.isArray(path) && path.length >= 3) {
    const potentialExpires = parseInt(path[1]);
    if (!isNaN(potentialExpires) && potentialExpires > 15778368e5) {
      signature = path[0];
      expires = potentialExpires;
      const keySegments = path.slice(2);
      key = decodeURIComponent(keySegments.join("/"));
      isSignedUrl = true;
    }
  }
  if (!isSignedUrl) {
    const queryToken = url.searchParams.get("token");
    const queryExpires = url.searchParams.get("expires");
    if (queryToken && queryExpires) {
      signature = queryToken;
      expires = parseInt(queryExpires);
      if (Array.isArray(path)) {
        key = decodeURIComponent(path.join("/"));
      } else {
        key = decodeURIComponent(path);
      }
      isSignedUrl = true;
    }
  }
  if (isSignedUrl) {
    const secret = env.PREVIEW_SECRET || "default-secret";
    const tokenPayload = `${key}:${expires}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signatureData = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(tokenPayload));
    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureData))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    if (signature !== expectedSignature) {
      return new Response(JSON.stringify({ success: false, error: "Invalid signature." }), { status: 403, headers: addCorsHeaders() });
    }
    if (Date.now() > expires) {
      return new Response(JSON.stringify({ success: false, error: "Link expired." }), { status: 410, headers: addCorsHeaders() });
    }
  } else {
    let token = null;
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      token = url.searchParams.get("token");
    }
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized: Missing token." }), { status: 401, headers: addCorsHeaders() });
    }
    const userPayload = await verifyToken(token, env.JWT_SECRET || "secret");
    if (!userPayload) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized: Invalid token." }), { status: 401, headers: addCorsHeaders() });
    }
    const user = await env.DB.prepare("SELECT id, quota_limit, quota_used FROM users WHERE id = ?").bind(userPayload.id).first();
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: "User not found." }), { status: 401, headers: addCorsHeaders() });
    }
    if (Array.isArray(path)) {
      key = decodeURIComponent(path.join("/"));
    } else {
      key = decodeURIComponent(path);
    }
    if (!key) {
      return new Response(JSON.stringify({ success: false, error: "Invalid file path" }), { status: 400, headers: addCorsHeaders() });
    }
    const fileInfo = await env.DB.prepare("SELECT size FROM files WHERE key = ?").bind(key).first();
    if (!fileInfo) {
      return new Response(JSON.stringify({ success: false, error: "File not found in index." }), { status: 404, headers: addCorsHeaders() });
    }
    if (user.quota_used + fileInfo.size > user.quota_limit) {
      return new Response(JSON.stringify({ success: false, error: "Download quota exceeded." }), { status: 403, headers: addCorsHeaders() });
    }
    context.waitUntil((async () => {
      try {
        await env.DB.prepare("UPDATE users SET quota_used = quota_used + ? WHERE id = ?").bind(fileInfo.size, user.id).run();
        await env.DB.prepare("UPDATE files SET downloads = downloads + 1 WHERE key = ?").bind(key).run();
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        await env.DB.prepare("INSERT INTO downloads (user_id, file_key, ip_address, size) VALUES (?, ?, ?, ?)").bind(user.id, key, ip, fileInfo.size).run();
      } catch (e) {
        console.error("Error updating stats:", e);
      }
    })());
  }
  try {
    const object = await env.R2_bucket.get(key);
    if (object === null) {
      return new Response(JSON.stringify({ success: false, error: "File not found in storage." }), {
        status: 404,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    const isInline = url.searchParams.get("inline") === "true";
    const filename = key.split("/").pop();
    if (isInline) {
      headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
    } else {
      headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    }
    const corsHeaders = addCorsHeaders();
    for (const [k, v] of Object.entries(corsHeaders)) {
      headers.set(k, v);
    }
    return new Response(object.body, {
      headers
    });
  } catch (error) {
    console.error(`Error serving file "${key}":`, error);
    return new Response(JSON.stringify({ success: false, error: "Internal Server Error" }), {
      status: 500,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
}
__name(onRequest, "onRequest");

// api/auth.js
async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { action, email, password } = body;
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: "Database not configured" }), { status: 500, headers: addCorsHeaders() });
    }
    if (action === "send-code") {
      if (!email || !email.endsWith("@whut.edu.cn")) {
        return new Response(JSON.stringify({ success: false, error: "Only @whut.edu.cn emails are allowed." }), { status: 400, headers: addCorsHeaders() });
      }
      const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
      if (existing) {
        return new Response(JSON.stringify({ success: false, error: "User already exists." }), { status: 400, headers: addCorsHeaders() });
      }
      const code = Math.floor(1e5 + Math.random() * 9e5).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1e3).toISOString();
      await env.DB.prepare("INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)").bind(email, code, expiresAt).run();
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "\u751F\u79D1\u6811\u6D1E <noreply@mails.zygame1314.site>",
          to: email,
          subject: "\u751F\u79D1\u6811\u6D1E - \u6CE8\u518C\u9A8C\u8BC1\u7801",
          html: `<p>\u60A8\u7684\u9A8C\u8BC1\u7801\u662F: <strong>${code}</strong></p><p>\u8BE5\u9A8C\u8BC1\u780110\u5206\u949F\u5185\u6709\u6548\u3002</p>`
        })
      });
      if (!resendRes.ok) {
        const errorText = await resendRes.text();
        console.error("Resend Error:", errorText);
        return new Response(JSON.stringify({ success: false, error: "Failed to send verification email." }), { status: 500, headers: addCorsHeaders() });
      }
      return new Response(JSON.stringify({ success: true, message: "Verification code sent." }), { status: 200, headers: addCorsHeaders() });
    }
    if (action === "register") {
      if (!email || !email.endsWith("@whut.edu.cn")) {
        return new Response(JSON.stringify({ success: false, error: "Only @whut.edu.cn emails are allowed." }), { status: 400, headers: addCorsHeaders() });
      }
      if (!password || password.length < 6) {
        return new Response(JSON.stringify({ success: false, error: "Password must be at least 6 characters." }), { status: 400, headers: addCorsHeaders() });
      }
      const { code } = body;
      if (!code) {
        return new Response(JSON.stringify({ success: false, error: "Verification code is required." }), { status: 400, headers: addCorsHeaders() });
      }
      const validCode = await env.DB.prepare("SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1").bind(email, code, (/* @__PURE__ */ new Date()).toISOString()).first();
      if (!validCode) {
        return new Response(JSON.stringify({ success: false, error: "Invalid or expired verification code." }), { status: 400, headers: addCorsHeaders() });
      }
      const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
      if (existing) {
        return new Response(JSON.stringify({ success: false, error: "User already exists." }), { status: 400, headers: addCorsHeaders() });
      }
      const passwordHash = await hashPassword(password, env.SALT);
      const role = "user";
      await env.DB.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").bind(email, passwordHash, role).run();
      await env.DB.prepare("DELETE FROM verification_codes WHERE email = ?").bind(email).run();
      return new Response(JSON.stringify({ success: true, message: "Registration successful. Please login." }), { status: 200, headers: addCorsHeaders() });
    }
    if (action === "login") {
      const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
      if (!user) {
        return new Response(JSON.stringify({ success: false, error: "Invalid credentials." }), { status: 401, headers: addCorsHeaders() });
      }
      const isValid = await verifyPasswordHash(password, user.password_hash, env.SALT);
      if (!isValid) {
        return new Response(JSON.stringify({ success: false, error: "Invalid credentials." }), { status: 401, headers: addCorsHeaders() });
      }
      const token = await signToken({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 864e5 * 7 }, env.JWT_SECRET || "secret");
      const quota_remaining = user.quota_limit - user.quota_used;
      return new Response(JSON.stringify({ success: true, token, user: { email: user.email, role: user.role, quota_limit: user.quota_limit, quota_used: user.quota_used, quota_remaining } }), { status: 200, headers: addCorsHeaders() });
    }
    return new Response(JSON.stringify({ success: false, error: "Invalid action" }), { status: 400, headers: addCorsHeaders() });
  } catch (e) {
    console.error("Auth Error:", e);
    return new Response(JSON.stringify({ success: false, error: e.message, stack: e.stack }), { status: 500, headers: addCorsHeaders() });
  }
}
__name(onRequestPost, "onRequestPost");
async function onRequestGet({ request, env }) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: addCorsHeaders() });
  }
  const token = authHeader.substring(7);
  const payload = await verifyToken(token, env.JWT_SECRET || "secret");
  if (!payload) {
    return new Response(JSON.stringify({ success: false, error: "Invalid token" }), { status: 401, headers: addCorsHeaders() });
  }
  const user = await env.DB.prepare("SELECT email, role, quota_limit, quota_used FROM users WHERE id = ?").bind(payload.id).first();
  if (user) {
    user.quota_remaining = user.quota_limit - user.quota_used;
  }
  return new Response(JSON.stringify({ success: true, user }), { status: 200, headers: addCorsHeaders() });
}
__name(onRequestGet, "onRequestGet");
async function onRequestOptions() {
  return new Response(null, { status: 204, headers: addCorsHeaders() });
}
__name(onRequestOptions, "onRequestOptions");

// api/batch-download.js
var addCorsHeaders2 = /* @__PURE__ */ __name((headers = {}) => {
  const allowedOrigin = "*";
  return {
    ...headers,
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}, "addCorsHeaders");
async function generateToken(key, secret, expiration = 86400) {
  const expires = Date.now() + expiration * 1e3;
  const tokenPayload = `${key}:${expires}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signatureData = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(tokenPayload));
  const token = btoa(String.fromCharCode(...new Uint8Array(signatureData))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return { token, expires };
}
__name(generateToken, "generateToken");
async function onRequestPost2({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: addCorsHeaders2() });
  }
  const authHeader = request.headers.get("Authorization");
  let user = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    user = await verifyToken(token, env.JWT_SECRET || "secret");
  }
  if (!user) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: addCorsHeaders2({ "Content-Type": "application/json" })
    });
  }
  const R2_BUCKET = env.R2_bucket;
  if (!R2_BUCKET) {
    return new Response(JSON.stringify({ success: false, error: "Server configuration error (R2 binding)." }), {
      status: 500,
      headers: addCorsHeaders2({ "Content-Type": "application/json" })
    });
  }
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: addCorsHeaders2({ "Content-Type": "application/json" })
    });
  }
  const { keys } = payload;
  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    return new Response(JSON.stringify({ success: false, error: "Missing or invalid keys array." }), {
      status: 400,
      headers: addCorsHeaders2({ "Content-Type": "application/json" })
    });
  }
  const DB = env.DB;
  if (!DB) {
    return new Response(JSON.stringify({ success: false, error: "Server configuration error (D1 binding)." }), {
      status: 500,
      headers: addCorsHeaders2({ "Content-Type": "application/json" })
    });
  }
  const allFileKeysToProcess = /* @__PURE__ */ new Set();
  for (const key of keys) {
    const isDirectory = key.endsWith("/");
    if (isDirectory) {
      const filesInDirStmt = DB.prepare("SELECT key FROM files WHERE key LIKE ? AND is_directory = FALSE");
      const { results: filesInDir } = await filesInDirStmt.bind(`${key}%`).all();
      if (filesInDir) {
        for (const file of filesInDir) {
          allFileKeysToProcess.add(file.key);
        }
      }
    } else {
      allFileKeysToProcess.add(key);
    }
  }
  if (allFileKeysToProcess.size === 0 && keys.length > 0) {
    return new Response(JSON.stringify({ success: false, error: "\u9009\u62E9\u7684\u9879\u76EE\u4E2D\u6CA1\u6709\u53EF\u4E0B\u8F7D\u7684\u6587\u4EF6\u3002" }), {
      status: 404,
      headers: addCorsHeaders2({ "Content-Type": "application/json" })
    });
  }
  try {
    const secret = env.PREVIEW_SECRET || "default-secret";
    const signedUrls = [];
    for (const fileKey of allFileKeysToProcess) {
      const { token, expires } = await generateToken(fileKey, secret);
      const urlPath = `/api/download/${encodeURIComponent(fileKey)}?token=${token}&expires=${expires}`;
      signedUrls.push({
        key: fileKey,
        filename: fileKey.split("/").pop(),
        urlPath
      });
    }
    if (signedUrls.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "\u6CA1\u6709\u6709\u6548\u7684\u6587\u4EF6\u53EF\u4F9B\u4E0B\u8F7D\u3002" }), {
        status: 404,
        headers: addCorsHeaders2({ "Content-Type": "application/json" })
      });
    }
    return new Response(JSON.stringify({ success: true, files: signedUrls }), {
      headers: addCorsHeaders2({ "Content-Type": "application/json" })
    });
  } catch (error) {
    console.error("Error generating signed URLs:", error);
    return new Response(JSON.stringify({ success: false, error: "\u751F\u6210\u4E0B\u8F7D\u94FE\u63A5\u5931\u8D25\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\u6216\u8054\u7CFB\u7BA1\u7406\u5458\u3002" }), {
      status: 500,
      headers: addCorsHeaders2({ "Content-Type": "application/json" })
    });
  }
}
__name(onRequestPost2, "onRequestPost");
async function onRequest2(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: addCorsHeaders2() });
  }
  if (context.request.method === "POST") {
    return onRequestPost2(context);
  }
  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: addCorsHeaders2({ "Content-Type": "application/json", "Allow": "POST, OPTIONS" })
  });
}
__name(onRequest2, "onRequest");

// api/files.js
var DEFAULT_PAGE_SIZE = 20;
async function onRequestGet2({ request, env }) {
  const authHeader = request.headers.get("Authorization");
  let user = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    user = await verifyToken(token, env.JWT_SECRET || "secret");
  }
  if (!user) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
  const DB = env.DB;
  if (!DB) {
    return new Response(JSON.stringify({ success: false, error: "Server configuration error (D1 binding)." }), {
      status: 500,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  try {
    if (action === "stats") {
      const stmt = DB.prepare("SELECT COUNT(*) as fileCount, SUM(size) as totalSize FROM files");
      const stats = await stmt.first();
      return new Response(JSON.stringify({
        success: true,
        stats: {
          fileCount: stats.fileCount || 0,
          totalSize: stats.totalSize || 0
        }
      }), { status: 200, headers: addCorsHeaders({ "Content-Type": "application/json" }) });
    }
    if (action === "listAllDirs") {
      const stmt = DB.prepare("SELECT key FROM files WHERE is_directory = TRUE ORDER BY key ASC");
      const { results } = await stmt.all();
      const directories2 = results.map((row) => row.key);
      return new Response(JSON.stringify({ success: true, directories: directories2 }), { status: 200, headers: addCorsHeaders({ "Content-Type": "application/json" }) });
    }
    if (action === "getHotFolders") {
      const stmt = DB.prepare(`
        SELECT
          parent_path,
          SUM(downloads) as total_downloads
        FROM files
        WHERE parent_path != '' AND is_directory = FALSE
        GROUP BY parent_path
        ORDER BY total_downloads DESC
        LIMIT 5
      `);
      const { results } = await stmt.all();
      const hotFolders = results.map((row) => ({
        path: row.parent_path,
        name: row.parent_path.endsWith("/") ? row.parent_path.slice(0, -1).split("/").pop() : row.parent_path.split("/").pop(),
        total_downloads: row.total_downloads
      }));
      return new Response(JSON.stringify({ success: true, hotFolders }), { status: 200, headers: addCorsHeaders({ "Content-Type": "application/json" }) });
    }
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || DEFAULT_PAGE_SIZE);
    const offset = (page - 1) * limit;
    const search = url.searchParams.get("search") || "";
    const prefix = url.searchParams.get("prefix") || "";
    const params = [];
    let baseWhere = "WHERE 1=1";
    if (search) {
      baseWhere += " AND name LIKE ?";
      params.push(`%${search}%`);
    } else {
      let searchPath = prefix;
      if (searchPath && !searchPath.endsWith("/")) {
        searchPath += "/";
      }
      baseWhere += " AND parent_path = ?";
      params.push(searchPath);
    }
    const dirQuery = `SELECT * FROM files ${baseWhere} AND is_directory = TRUE ORDER BY name ASC`;
    const fileQuery = `SELECT * FROM files ${baseWhere} AND is_directory = FALSE ORDER BY uploaded DESC`;
    const [dirResult, fileResult] = await Promise.all([
      DB.prepare(dirQuery).bind(...params).all(),
      DB.prepare(fileQuery + " LIMIT ? OFFSET ?").bind(...params, limit, offset).all()
    ]);
    const directories = dirResult.results || [];
    const files = fileResult.results || [];
    let countQuery = `SELECT COUNT(*) as total FROM files ${baseWhere} AND is_directory = FALSE`;
    const totalResult = await DB.prepare(countQuery).bind(...params).first();
    const totalItems = totalResult?.total || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    return new Response(JSON.stringify({
      success: true,
      files,
      directories,
      currentPage: page,
      totalPages,
      totalItems,
      limit
    }), { status: 200, headers: addCorsHeaders({ "Content-Type": "application/json" }) });
  } catch (error) {
    console.error("Error in files API:", error);
    return new Response(JSON.stringify({ success: false, error: "Failed to fetch files." }), {
      status: 500,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
}
__name(onRequestGet2, "onRequestGet");
async function onRequestPut({ request, env }) {
  const authHeader = request.headers.get("Authorization");
  let user = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    user = await verifyToken(token, env.JWT_SECRET || "secret");
  }
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized: Admin access required." }), {
      status: 401,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
  const DB = env.DB;
  const R2 = env.R2_bucket;
  if (!DB || !R2) {
    return new Response(JSON.stringify({ success: false, error: "Server configuration error." }), {
      status: 500,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
  try {
    const body = await request.json();
    const { key, newName } = body;
    if (!key || !newName) {
      return new Response(JSON.stringify({ success: false, error: "Missing key or newName." }), {
        status: 400,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    const fileRecord = await DB.prepare("SELECT * FROM files WHERE key = ?").bind(key).first();
    if (!fileRecord) {
      return new Response(JSON.stringify({ success: false, error: "File not found." }), {
        status: 404,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    if (fileRecord.is_directory) {
      return new Response(JSON.stringify({ success: false, error: "Renaming directories is not supported yet." }), {
        status: 400,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    const parentPath = fileRecord.parent_path;
    const newKey = parentPath ? `${parentPath}${newName}` : newName;
    const existing = await DB.prepare("SELECT key FROM files WHERE key = ?").bind(newKey).first();
    if (existing) {
      return new Response(JSON.stringify({ success: false, error: "File with new name already exists." }), {
        status: 409,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    try {
      await R2.put(newKey, await R2.get(key).then((obj) => obj.body), {
        httpMetadata: { contentType: fileRecord.contentType }
      });
      await R2.delete(key);
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: "R2 Rename failed: " + e.message }), {
        status: 500,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    await DB.prepare("UPDATE files SET key = ?, name = ? WHERE key = ?").bind(newKey, newName, key).run();
    return new Response(JSON.stringify({ success: true, message: "Renamed successfully" }), {
      status: 200,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  } catch (error) {
    console.error("Rename error:", error);
    return new Response(JSON.stringify({ success: false, error: "Rename failed: " + error.message }), {
      status: 500,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
}
__name(onRequestPut, "onRequestPut");
async function onRequestPost3({ request, env }) {
  const authHeader = request.headers.get("Authorization");
  let user = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    user = await verifyToken(token, env.JWT_SECRET || "secret");
  }
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized: Admin access required." }), {
      status: 401,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
  const DB = env.DB;
  const R2 = env.R2_bucket;
  if (!DB || !R2) {
    return new Response(JSON.stringify({ success: false, error: "Server configuration error." }), {
      status: 500,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
  try {
    const body = await request.json();
    const { sourceKey, destinationPath } = body;
    if (!sourceKey || destinationPath === void 0) {
      return new Response(JSON.stringify({ success: false, error: "Missing sourceKey or destinationPath." }), {
        status: 400,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    const fileRecord = await DB.prepare("SELECT * FROM files WHERE key = ?").bind(sourceKey).first();
    if (!fileRecord) {
      return new Response(JSON.stringify({ success: false, error: "File not found." }), {
        status: 404,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    if (fileRecord.is_directory) {
      return new Response(JSON.stringify({ success: false, error: "Moving directories is not supported yet." }), {
        status: 400,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    let newParentPath = destinationPath;
    if (newParentPath && !newParentPath.endsWith("/")) {
      newParentPath += "/";
    }
    const newKey = newParentPath ? `${newParentPath}${fileRecord.name}` : fileRecord.name;
    if (sourceKey === newKey) {
      return new Response(JSON.stringify({ success: false, error: "Source and destination are the same." }), {
        status: 400,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    const existing = await DB.prepare("SELECT key FROM files WHERE key = ?").bind(newKey).first();
    if (existing) {
      return new Response(JSON.stringify({ success: false, error: "File already exists in destination." }), {
        status: 409,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    try {
      await R2.put(newKey, await R2.get(sourceKey).then((obj) => obj.body), {
        httpMetadata: { contentType: fileRecord.contentType }
      });
      await R2.delete(sourceKey);
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: "R2 Move failed: " + e.message }), {
        status: 500,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    await DB.prepare("UPDATE files SET key = ?, parent_path = ? WHERE key = ?").bind(newKey, newParentPath, sourceKey).run();
    return new Response(JSON.stringify({ success: true, message: "Moved successfully" }), {
      status: 200,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  } catch (error) {
    console.error("Move error:", error);
    return new Response(JSON.stringify({ success: false, error: "Move failed: " + error.message }), {
      status: 500,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
}
__name(onRequestPost3, "onRequestPost");
async function onRequestDelete({ request, env }) {
  const authHeader = request.headers.get("Authorization");
  let user = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    user = await verifyToken(token, env.JWT_SECRET || "secret");
  }
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized: Admin access required." }), {
      status: 401,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
  const DB = env.DB;
  const R2 = env.R2_bucket;
  if (!DB || !R2) {
    return new Response(JSON.stringify({ success: false, error: "Server configuration error." }), {
      status: 500,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
  try {
    const body = await request.json();
    const { key, keys } = body;
    if (!key && (!keys || !Array.isArray(keys) || keys.length === 0)) {
      return new Response(JSON.stringify({ success: false, error: "Missing file key or keys." }), {
        status: 400,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    const keysToDelete = keys || [key];
    const errors = [];
    let deletedCount = 0;
    for (const currentKey of keysToDelete) {
      try {
        const fileRecord = await DB.prepare("SELECT is_directory FROM files WHERE key = ?").bind(currentKey).first();
        if (!fileRecord) {
          continue;
        }
        if (fileRecord.is_directory) {
          const children = await DB.prepare("SELECT key FROM files WHERE parent_path = ? LIMIT 1").bind(currentKey.endsWith("/") ? currentKey : currentKey + "/").first();
          if (children) {
            errors.push(`Directory ${currentKey} is not empty.`);
            continue;
          }
          await DB.prepare("DELETE FROM files WHERE key = ?").bind(currentKey).run();
        } else {
          await R2.delete(currentKey);
          await DB.prepare("DELETE FROM files WHERE key = ?").bind(currentKey).run();
        }
        deletedCount++;
      } catch (err) {
        console.error(`Failed to delete ${currentKey}:`, err);
        errors.push(`Failed to delete ${currentKey}: ${err.message}`);
      }
    }
    if (deletedCount === 0 && errors.length > 0) {
      return new Response(JSON.stringify({ success: false, error: errors.join("; ") }), {
        status: 500,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    return new Response(JSON.stringify({
      success: true,
      message: `Deleted ${deletedCount} items successfully.`,
      errors: errors.length > 0 ? errors : void 0
    }), {
      status: 200,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  } catch (error) {
    console.error("Delete error:", error);
    return new Response(JSON.stringify({ success: false, error: "Delete failed: " + error.message }), {
      status: 500,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
}
__name(onRequestDelete, "onRequestDelete");
async function onRequestOptions2() {
  return new Response(null, { status: 204, headers: addCorsHeaders() });
}
__name(onRequestOptions2, "onRequestOptions");

// api/sync.js
async function onRequestPost4({ request, env }) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: addCorsHeaders() });
  }
  const token = authHeader.substring(7);
  const user = await verifyToken(token, env.JWT_SECRET || "secret");
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ success: false, error: "Forbidden" }), { status: 403, headers: addCorsHeaders() });
  }
  const R2 = env.R2_bucket;
  const DB = env.DB;
  if (!R2 || !DB) {
    return new Response(JSON.stringify({ success: false, error: "Config error" }), { status: 500, headers: addCorsHeaders() });
  }
  try {
    let requestBody = {};
    try {
      requestBody = await request.json();
    } catch (e) {
    }
    const cursor = requestBody.cursor;
    const options = { limit: 500 };
    if (cursor) options.cursor = cursor;
    const list = await R2.list(options);
    const statements = [];
    const dirPaths = /* @__PURE__ */ new Set();
    let totalSynced = 0;
    for (const object of list.objects) {
      const key = object.key;
      if (key.endsWith("/")) continue;
      const name = key.split("/").pop();
      const parentPath = key.includes("/") ? key.substring(0, key.lastIndexOf("/") + 1) : "";
      const size = object.size;
      const uploaded = object.uploaded.toISOString();
      const contentType = object.httpMetadata?.contentType || "application/octet-stream";
      statements.push(DB.prepare(
        "INSERT OR IGNORE INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads, uploader_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(key, name, size, uploaded, contentType, parentPath, false, 0, user.id));
      totalSynced++;
      if (parentPath) {
        let currentPath = parentPath;
        while (currentPath) {
          dirPaths.add(currentPath);
          if (currentPath.endsWith("/")) currentPath = currentPath.slice(0, -1);
          const lastSlash = currentPath.lastIndexOf("/");
          if (lastSlash === -1) break;
          currentPath = currentPath.substring(0, lastSlash + 1);
        }
      }
    }
    for (const dirPath of dirPaths) {
      const parts = dirPath.split("/").filter((p) => p);
      const dirName = parts[parts.length - 1];
      const parentDir = parts.length > 1 ? parts.slice(0, parts.length - 1).join("/") + "/" : "";
      statements.push(DB.prepare(
        "INSERT OR IGNORE INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(dirPath, dirName, 0, (/* @__PURE__ */ new Date()).toISOString(), "inode/directory", parentDir, true, 0));
    }
    const BATCH_SIZE = 50;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const chunk = statements.slice(i, i + BATCH_SIZE);
      if (chunk.length > 0) {
        await DB.batch(chunk);
      }
    }
    return new Response(JSON.stringify({
      success: true,
      message: `\u5DF2\u5904\u7406 ${totalSynced} \u4E2A\u6587\u4EF6\u3002`,
      nextCursor: list.truncated ? list.cursor : null,
      syncedCount: totalSynced
    }), { status: 200, headers: addCorsHeaders() });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message, stack: e.stack }), { status: 500, headers: addCorsHeaders() });
  }
}
__name(onRequestPost4, "onRequestPost");
async function onRequestOptions3() {
  return new Response(null, { status: 204, headers: addCorsHeaders() });
}
__name(onRequestOptions3, "onRequestOptions");

// api/upload.js
async function ensureDirectoryExists(db, fullPath, env) {
  const pathSegments = fullPath.split("/").filter((segment) => segment.length > 0);
  let currentPath = "";
  for (let i = 0; i < pathSegments.length - 1; i++) {
    const segment = pathSegments[i];
    const parentPathForCurrentDir = currentPath;
    currentPath += segment + "/";
    try {
      const checkStmt = db.prepare("SELECT key FROM files WHERE key = ? AND is_directory = TRUE");
      const existingDir = await checkStmt.bind(currentPath).first();
      if (!existingDir) {
        const insertDirStmt = db.prepare(
          "INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        );
        await insertDirStmt.bind(
          currentPath,
          segment,
          0,
          (/* @__PURE__ */ new Date()).toISOString(),
          "inode/directory",
          parentPathForCurrentDir,
          true,
          0
        ).run();
        console.log(`Created directory entry in D1: ${currentPath}`);
      }
    } catch (error) {
      console.error(`Error ensuring directory ${currentPath} exists in D1:`, error);
    }
  }
}
__name(ensureDirectoryExists, "ensureDirectoryExists");
async function onRequestPost5({ request, env, waitUntil }) {
  try {
    const R2_BUCKET = env.R2_bucket;
    const DB = env.DB;
    if (!R2_BUCKET || !DB) {
      return new Response(JSON.stringify({ success: false, error: "Server configuration error (R2 or D1 binding)." }), {
        status: 500,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: addCorsHeaders() });
    }
    const token = authHeader.substring(7);
    const user = await verifyToken(token, env.JWT_SECRET || "secret");
    if (!user || user.role !== "admin") {
      return new Response(JSON.stringify({ success: false, error: "Forbidden: Admin access required." }), { status: 403, headers: addCorsHeaders() });
    }
    let formData;
    try {
      formData = await request.formData();
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: "Invalid request body. Expected FormData." }), {
        status: 400,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    const file = formData.get("file");
    const filename = file?.name;
    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ success: false, error: "File data is missing or invalid." }), {
        status: 400,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    const MAX_FILE_SIZE = 300 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ success: false, error: "File size exceeds the 300MB limit." }), {
        status: 413,
        headers: addCorsHeaders({ "Content-Type": "application/json" })
      });
    }
    const key = filename;
    const existingFile = await DB.prepare("SELECT key FROM files WHERE key = ?").bind(key).first();
    if (existingFile) {
      return new Response(JSON.stringify({ success: false, error: "File already exists." }), { status: 409, headers: addCorsHeaders() });
    }
    await R2_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type }
    });
    const parentPath = key.includes("/") ? key.substring(0, key.lastIndexOf("/") + 1) : "";
    await ensureDirectoryExists(DB, key, env);
    await DB.prepare(
      "INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads, uploader_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      key,
      key.split("/").pop(),
      file.size,
      (/* @__PURE__ */ new Date()).toISOString(),
      file.type,
      parentPath,
      false,
      0,
      user.id
    ).run();
    return new Response(JSON.stringify({ success: true, message: "File uploaded successfully." }), {
      status: 200,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  } catch (error) {
    console.error("Upload error:", error);
    return new Response(JSON.stringify({ success: false, error: "An unexpected error occurred." }), {
      status: 500,
      headers: addCorsHeaders({ "Content-Type": "application/json" })
    });
  }
}
__name(onRequestPost5, "onRequestPost");
async function onRequestOptions4() {
  return new Response(null, { status: 204, headers: addCorsHeaders() });
}
__name(onRequestOptions4, "onRequestOptions");

// api/preview.js
var addCorsHeaders3 = /* @__PURE__ */ __name((headers = {}) => {
  return {
    ...headers,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}, "addCorsHeaders");
async function onRequest3(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: addCorsHeaders3()
    });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ success: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: addCorsHeaders3({ "Content-Type": "application/json" })
    });
  }
  const authHeader = request.headers.get("Authorization");
  let user = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    user = await verifyToken(token, env.JWT_SECRET || "secret");
  }
  if (!user) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: addCorsHeaders3({ "Content-Type": "application/json" })
    });
  }
  const R2_BUCKET = env.R2_bucket;
  if (!R2_BUCKET) {
    console.error("Server config error: R2 binding 'R2_bucket' not found.");
    return new Response(JSON.stringify({ success: false, error: "Server configuration error." }), {
      status: 500,
      headers: addCorsHeaders3({ "Content-Type": "application/json" })
    });
  }
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const isOfficePreview = url.searchParams.get("office") === "true";
  const isInline = url.searchParams.get("inline") === "true";
  const previewType = url.searchParams.get("type");
  if (!key) {
    return new Response(JSON.stringify({
      success: false,
      error: "File key is required."
    }), {
      status: 400,
      headers: addCorsHeaders3({
        "Content-Type": "application/json"
      })
    });
  }
  try {
    const object = await R2_BUCKET.get(key);
    if (object === null) {
      return new Response(JSON.stringify({ success: false, error: "File not found." }), {
        status: 404,
        headers: addCorsHeaders3({ "Content-Type": "application/json" })
      });
    }
    if (previewType === "text") {
      const textContent = await object.text();
      return new Response(JSON.stringify({
        success: true,
        content: textContent
      }), {
        status: 200,
        headers: addCorsHeaders3({
          "Content-Type": "application/json"
        })
      });
    }
    const expiresIn = url.searchParams.get("expiresIn") ? parseInt(url.searchParams.get("expiresIn")) : 300;
    const expires = Date.now() + expiresIn * 1e3;
    const tokenPayload = `${key}:${expires}`;
    const secret = env.PREVIEW_SECRET || "default-secret";
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signatureData = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(tokenPayload));
    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureData))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const customDomain = env.CDN_DOMAIN;
    const baseUrl = customDomain ? `https://${customDomain}` : new URL(request.url).origin;
    let previewUrl;
    if (isOfficePreview) {
      previewUrl = `${baseUrl}/api/download/${signature}/${expires}/${encodeURIComponent(key)}`;
    } else {
      previewUrl = `${baseUrl}/api/download/${encodeURIComponent(key)}?token=${signature}&expires=${expires}`;
      if (isInline) {
        previewUrl += "&inline=true";
      }
    }
    return new Response(JSON.stringify({ success: true, url: previewUrl }), {
      status: 200,
      headers: addCorsHeaders3({ "Content-Type": "application/json" })
    });
  } catch (error) {
    console.error(`Error generating preview URL for key "${key}":`, error);
    return new Response(JSON.stringify({ success: false, error: "Failed to generate preview URL." }), {
      status: 500,
      headers: addCorsHeaders3({ "Content-Type": "application/json" })
    });
  }
}
__name(onRequest3, "onRequest");

// ../.wrangler/tmp/pages-UNm4of/functionsRoutes-0.06440180343304136.mjs
var routes = [
  {
    routePath: "/api/download/:path*",
    mountPath: "/api/download",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/auth",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/auth",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions]
  },
  {
    routePath: "/api/auth",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/batch-download",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/files",
    mountPath: "/api",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete]
  },
  {
    routePath: "/api/files",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/files",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions2]
  },
  {
    routePath: "/api/files",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/files",
    mountPath: "/api",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut]
  },
  {
    routePath: "/api/sync",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions3]
  },
  {
    routePath: "/api/sync",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/upload",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions4]
  },
  {
    routePath: "/api/upload",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/batch-download",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/api/preview",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  }
];

// C:/Users/13646/AppData/Roaming/npm/node_modules/wrangler/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// C:/Users/13646/AppData/Roaming/npm/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// C:/Users/13646/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// C:/Users/13646/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-gmWbbo/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// C:/Users/13646/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-gmWbbo/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.1449965788399692.mjs.map
