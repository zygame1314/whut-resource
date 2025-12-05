import { verifyToken, addCorsHeaders } from '../utils.js';
export async function onRequestPost({ request, env }) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: '未授权' }), { status: 401, headers: addCorsHeaders() });
  }
  const token = authHeader.substring(7);
  const user = await verifyToken(token, env.JWT_SECRET || 'secret');
  if (!user || user.role !== 'admin') {
    return new Response(JSON.stringify({ success: false, error: '禁止' }), { status: 403, headers: addCorsHeaders() });
  }
  const R2 = env.R2_bucket;
  const DB = env.DB;
  if (!R2 || !DB) {
     return new Response(JSON.stringify({ success: false, error: '配置错误' }), { status: 500, headers: addCorsHeaders() });
  }
  try {
    let allR2Objects = [];
    let cursor = null;
    let truncated = true;
    while (truncated) {
        const options = { limit: 1000 };
        if (cursor) options.cursor = cursor;
        const list = await R2.list(options);
        allR2Objects = allR2Objects.concat(list.objects);
        truncated = list.truncated;
        cursor = list.cursor;
    }
    const statements = [];
    const validKeys = new Set();
    const dirPaths = new Set();
    for (const object of allR2Objects) {
        const key = object.key;
        if (key.endsWith('/')) continue;
        validKeys.add(key);
        const name = key.split('/').pop();
        const parentPath = key.includes('/') ? key.substring(0, key.lastIndexOf('/') + 1) : '';
        const size = object.size;
        const uploaded = object.uploaded.toISOString();
        const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
        statements.push(DB.prepare(
            `INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads, uploader_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET
             size=excluded.size,
             uploaded=excluded.uploaded,
             contentType=excluded.contentType,
             parent_path=excluded.parent_path`
        ).bind(key, name, size, uploaded, contentType, parentPath, false, 0, user.id));
        if (parentPath) {
            let currentPath = parentPath;
            while (currentPath) {
                dirPaths.add(currentPath);
                if (currentPath.endsWith('/')) currentPath = currentPath.slice(0, -1);
                const lastSlash = currentPath.lastIndexOf('/');
                if (lastSlash === -1) break;
                currentPath = currentPath.substring(0, lastSlash + 1);
            }
        }
    }
    for (const dirPath of dirPaths) {
        validKeys.add(dirPath);
        const parts = dirPath.split('/').filter(p => p);
        const dirName = parts[parts.length - 1];
        const parentDir = parts.length > 1 ? parts.slice(0, parts.length - 1).join('/') + '/' : '';
        statements.push(DB.prepare(
            `INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET
             uploaded=excluded.uploaded,
             parent_path=excluded.parent_path`
        ).bind(dirPath, dirName, 0, new Date().toISOString(), 'inode/directory', parentDir, true, 0));
    }
    const { results } = await DB.prepare('SELECT key FROM files WHERE is_link = FALSE OR is_link IS NULL').all();
    const dbKeys = results.map(r => r.key);
    const keysToDelete = dbKeys.filter(key => !validKeys.has(key));
    for (const key of keysToDelete) {
        statements.push(DB.prepare('DELETE FROM files WHERE key = ?').bind(key));
    }
    const { results: linkResults } = await DB.prepare('SELECT key, parent_path FROM files WHERE is_link = TRUE').all();
    for (const link of linkResults) {
        validKeys.add(link.key);
        if (link.parent_path) {
            let currentPath = link.parent_path;
            while (currentPath) {
                dirPaths.add(currentPath);
                if (currentPath.endsWith('/')) currentPath = currentPath.slice(0, -1);
                const lastSlash = currentPath.lastIndexOf('/');
                if (lastSlash === -1) break;
                currentPath = currentPath.substring(0, lastSlash + 1);
            }
        }
    }
    const BATCH_SIZE = 50;
    let processedCount = 0;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
        const chunk = statements.slice(i, i + BATCH_SIZE);
        if (chunk.length > 0) {
            await DB.batch(chunk);
            processedCount += chunk.length;
        }
    }
    return new Response(JSON.stringify({
        success: true,
        message: `同步完成。R2文件数: ${allR2Objects.length}, 目录数: ${dirPaths.size}, 链接数: ${linkResults.length}, 数据库操作数: ${statements.length} (含 ${keysToDelete.length} 个删除)`,
        syncedStats: {
            files: allR2Objects.length,
            dirs: dirPaths.size,
            links: linkResults.length,
            deleted: keysToDelete.length
        }
    }), { status: 200, headers: addCorsHeaders() });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message, stack: e.stack }), { status: 500, headers: addCorsHeaders() });
  }
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: addCorsHeaders() });
}
