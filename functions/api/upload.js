import { verifyToken, addCorsHeaders } from '../utils.js';
async function ensureDirectoryExists(db, fullPath, env) {
  const pathSegments = fullPath.split('/').filter(segment => segment.length > 0);
  let currentPath = '';
  for (let i = 0; i < pathSegments.length -1; i++) {
    const segment = pathSegments[i];
    const parentPathForCurrentDir = currentPath;
    currentPath += segment + '/';
    try {
      const checkStmt = db.prepare('SELECT key FROM files WHERE key = ? AND is_directory = TRUE');
      const existingDir = await checkStmt.bind(currentPath).first();
      if (!existingDir) {
        const insertDirStmt = db.prepare(
          'INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        await insertDirStmt.bind(
          currentPath,
          segment,
          0,
          new Date().toISOString(),
          'inode/directory',
          parentPathForCurrentDir,
          true,
          0
        ).run();
        console.log(`在D1中创建目录条目: ${currentPath}`);
      }
    } catch (error) {
      console.error(`确保目录 ${currentPath} 在D1中存在时出错:`, error);
    }
  }
}
export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const R2_BUCKET = env.R2_bucket;
    const DB = env.DB;
    if (!R2_BUCKET || !DB) {
      return new Response(JSON.stringify({ success: false, error: '服务器配置错误（R2或D1绑定）。' }), {
        status: 500,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ success: false, error: '未授权' }), { status: 401, headers: addCorsHeaders() });
    }
    const token = authHeader.substring(7);
    const user = await verifyToken(token, env.JWT_SECRET || 'secret');
    if (!user || user.role !== 'admin') {
        return new Response(JSON.stringify({ success: false, error: '禁止：需要管理员访问权限。' }), { status: 403, headers: addCorsHeaders() });
    }
    let formData;
    try {
      formData = await request.formData();
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: '请求体无效。期望FormData。' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const file = formData.get('file');
    const filename = file?.name;
    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ success: false, error: '文件数据缺失或无效。' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const MAX_FILE_SIZE = 300 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ success: false, error: '文件大小超过300MB限制。' }), {
        status: 413,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const key = filename;
    const existingFile = await DB.prepare('SELECT key FROM files WHERE key = ?').bind(key).first();
    if (existingFile) {
        return new Response(JSON.stringify({ success: false, error: '文件已存在。' }), { status: 409, headers: addCorsHeaders() });
    }
    await R2_BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
    });
    const parentPath = key.includes('/') ? key.substring(0, key.lastIndexOf('/') + 1) : '';
    await ensureDirectoryExists(DB, key, env);
    await DB.prepare(
        'INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads, uploader_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
        key,
        key.split('/').pop(),
        file.size,
        new Date().toISOString(),
        file.type,
        parentPath,
        false,
        0,
        user.id
    ).run();
    return new Response(JSON.stringify({ success: true, message: '文件上传成功。' }), {
        status: 200,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error("上传错误:", error);
    return new Response(JSON.stringify({ success: false, error: '发生意外错误。' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: addCorsHeaders() });
}
