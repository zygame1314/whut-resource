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
        console.log(`Created directory entry in D1: ${currentPath}`);
      }
    } catch (error) {
      console.error(`Error ensuring directory ${currentPath} exists in D1:`, error);
    }
  }
}
export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const R2_BUCKET = env.R2_bucket;
    const DB = env.DB;
    if (!R2_BUCKET || !DB) {
      return new Response(JSON.stringify({ success: false, error: 'Server configuration error (R2 or D1 binding).' }), {
        status: 500,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: addCorsHeaders() });
    }
    const token = authHeader.substring(7);
    const user = await verifyToken(token, env.JWT_SECRET || 'secret');
    if (!user || user.role !== 'admin') {
        return new Response(JSON.stringify({ success: false, error: 'Forbidden: Admin access required.' }), { status: 403, headers: addCorsHeaders() });
    }
    let formData;
    try {
      formData = await request.formData();
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid request body. Expected FormData.' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const file = formData.get('file');
    const filename = file?.name;
    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ success: false, error: 'File data is missing or invalid.' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const MAX_FILE_SIZE = 300 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ success: false, error: 'File size exceeds the 300MB limit.' }), {
        status: 413,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const key = filename;
    const existingFile = await DB.prepare('SELECT key FROM files WHERE key = ?').bind(key).first();
    if (existingFile) {
        return new Response(JSON.stringify({ success: false, error: 'File already exists.' }), { status: 409, headers: addCorsHeaders() });
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
    return new Response(JSON.stringify({ success: true, message: 'File uploaded successfully.' }), {
        status: 200,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error("Upload error:", error);
    return new Response(JSON.stringify({ success: false, error: 'An unexpected error occurred.' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: addCorsHeaders() });
}
