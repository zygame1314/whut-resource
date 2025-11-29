import { verifyToken, addCorsHeaders } from '../utils.js';
export async function onRequestPost({ request, env }) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: addCorsHeaders() });
  }
  const token = authHeader.substring(7);
  const user = await verifyToken(token, env.JWT_SECRET || 'secret');
  if (!user || user.role !== 'admin') {
    return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: addCorsHeaders() });
  }
  const R2 = env.R2_bucket;
  const DB = env.DB;
  if (!R2 || !DB) {
     return new Response(JSON.stringify({ success: false, error: 'Config error' }), { status: 500, headers: addCorsHeaders() });
  }
  try {
    let requestBody = {};
    try {
        requestBody = await request.json();
    } catch (e) {}
    const cursor = requestBody.cursor;
    const options = { limit: 500 };
    if (cursor) options.cursor = cursor;
    const list = await R2.list(options);
    const statements = [];
    const dirPaths = new Set();
    let totalSynced = 0;
    for (const object of list.objects) {
        const key = object.key;
        if (key.endsWith('/')) continue;
        const name = key.split('/').pop();
        const parentPath = key.includes('/') ? key.substring(0, key.lastIndexOf('/') + 1) : '';
        const size = object.size;
        const uploaded = object.uploaded.toISOString();
        const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
        statements.push(DB.prepare(
            'INSERT OR IGNORE INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads, uploader_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(key, name, size, uploaded, contentType, parentPath, false, 0, user.id));
        totalSynced++;
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
        const parts = dirPath.split('/').filter(p => p);
        const dirName = parts[parts.length - 1];
        const parentDir = parts.length > 1 ? parts.slice(0, parts.length - 1).join('/') + '/' : '';
        statements.push(DB.prepare(
            'INSERT OR IGNORE INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(dirPath, dirName, 0, new Date().toISOString(), 'inode/directory', parentDir, true, 0));
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
        message: `已处理 ${totalSynced} 个文件。`,
        nextCursor: list.truncated ? list.cursor : null,
        syncedCount: totalSynced
    }), { status: 200, headers: addCorsHeaders() });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message, stack: e.stack }), { status: 500, headers: addCorsHeaders() });
  }
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: addCorsHeaders() });
}
