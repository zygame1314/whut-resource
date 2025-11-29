import { verifyToken, addCorsHeaders } from '../utils.js';
const DEFAULT_PAGE_SIZE = 20;
export async function onRequestGet({ request, env }) {
  const authHeader = request.headers.get('Authorization');
  let user = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    user = await verifyToken(token, env.JWT_SECRET || 'secret');
  }
  if (!user) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const DB = env.DB;
  if (!DB) {
    return new Response(JSON.stringify({ success: false, error: 'Server configuration error (D1 binding).' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  try {
    if (action === 'stats') {
      const stmt = DB.prepare('SELECT COUNT(*) as fileCount, SUM(size) as totalSize FROM files');
      const stats = await stmt.first();
      return new Response(JSON.stringify({
        success: true,
        stats: {
          fileCount: stats.fileCount || 0,
          totalSize: stats.totalSize || 0,
        }
      }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (action === 'listAllDirs') {
      const stmt = DB.prepare("SELECT key FROM files WHERE is_directory = TRUE ORDER BY key ASC");
      const { results } = await stmt.all();
      const directories = results.map(row => row.key);
      return new Response(JSON.stringify({ success: true, directories: directories }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (action === 'getHotFolders') {
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
      const hotFolders = results.map(row => ({
        path: row.parent_path,
        name: row.parent_path.endsWith('/') ? row.parent_path.slice(0, -1).split('/').pop() : row.parent_path.split('/').pop(),
        total_downloads: row.total_downloads
      }));
      return new Response(JSON.stringify({ success: true, hotFolders: hotFolders }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || DEFAULT_PAGE_SIZE);
    const offset = (page - 1) * limit;
    const search = url.searchParams.get('search') || '';
    const prefix = url.searchParams.get('prefix') || '';
    const params = [];
    let baseWhere = 'WHERE 1=1';
    if (search) {
      baseWhere += ' AND name LIKE ?';
      params.push(`%${search}%`);
    } else {
      let searchPath = prefix;
      if (searchPath && !searchPath.endsWith('/')) {
        searchPath += '/';
      }
      baseWhere += ' AND parent_path = ?';
      params.push(searchPath);
    }
    const dirQuery = `SELECT * FROM files ${baseWhere} AND is_directory = TRUE ORDER BY name ASC`;
    const fileQuery = `SELECT * FROM files ${baseWhere} AND is_directory = FALSE ORDER BY uploaded DESC`;
    const [dirResult, fileResult] = await Promise.all([
      DB.prepare(dirQuery).bind(...params).all(),
      DB.prepare(fileQuery + ' LIMIT ? OFFSET ?').bind(...params, limit, offset).all()
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
    }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
  } catch (error) {
    console.error('Error in files API:', error);
    return new Response(JSON.stringify({ success: false, error: 'Failed to fetch files.' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}
export async function onRequestPut({ request, env }) {
  const authHeader = request.headers.get('Authorization');
  let user = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    user = await verifyToken(token, env.JWT_SECRET || 'secret');
  }
  if (!user || user.role !== 'admin') {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Admin access required.' }), {
      status: 401,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const DB = env.DB;
  const R2 = env.R2_bucket;
  if (!DB || !R2) {
    return new Response(JSON.stringify({ success: false, error: 'Server configuration error.' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  try {
    const body = await request.json();
    const { key, newName } = body;
    if (!key || !newName) {
      return new Response(JSON.stringify({ success: false, error: 'Missing key or newName.' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const fileRecord = await DB.prepare('SELECT * FROM files WHERE key = ?').bind(key).first();
    if (!fileRecord) {
        return new Response(JSON.stringify({ success: false, error: 'File not found.' }), {
            status: 404,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    if (fileRecord.is_directory) {
        return new Response(JSON.stringify({ success: false, error: 'Renaming directories is not supported yet.' }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    const parentPath = fileRecord.parent_path;
    const newKey = parentPath ? `${parentPath}${newName}` : newName;
    const existing = await DB.prepare('SELECT key FROM files WHERE key = ?').bind(newKey).first();
    if (existing) {
        return new Response(JSON.stringify({ success: false, error: 'File with new name already exists.' }), {
            status: 409,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    try {
        await R2.put(newKey, await R2.get(key).then(obj => obj.body), {
            httpMetadata: { contentType: fileRecord.contentType }
        });
        await R2.delete(key);
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'R2 Rename failed: ' + e.message }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    await DB.prepare('UPDATE files SET key = ?, name = ? WHERE key = ?').bind(newKey, newName, key).run();
    return new Response(JSON.stringify({ success: true, message: 'Renamed successfully' }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error('Rename error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Rename failed: ' + error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}
export async function onRequestPost({ request, env }) {
  const authHeader = request.headers.get('Authorization');
  let user = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    user = await verifyToken(token, env.JWT_SECRET || 'secret');
  }
  if (!user || user.role !== 'admin') {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Admin access required.' }), {
      status: 401,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const DB = env.DB;
  const R2 = env.R2_bucket;
  if (!DB || !R2) {
    return new Response(JSON.stringify({ success: false, error: 'Server configuration error.' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  try {
    const body = await request.json();
    const { sourceKey, destinationPath } = body;
    if (!sourceKey || destinationPath === undefined) {
      return new Response(JSON.stringify({ success: false, error: 'Missing sourceKey or destinationPath.' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const fileRecord = await DB.prepare('SELECT * FROM files WHERE key = ?').bind(sourceKey).first();
    if (!fileRecord) {
        return new Response(JSON.stringify({ success: false, error: 'File not found.' }), {
            status: 404,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    if (fileRecord.is_directory) {
         return new Response(JSON.stringify({ success: false, error: 'Moving directories is not supported yet.' }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    let newParentPath = destinationPath;
    if (newParentPath && !newParentPath.endsWith('/')) {
        newParentPath += '/';
    }
    const newKey = newParentPath ? `${newParentPath}${fileRecord.name}` : fileRecord.name;
    if (sourceKey === newKey) {
         return new Response(JSON.stringify({ success: false, error: 'Source and destination are the same.' }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    const existing = await DB.prepare('SELECT key FROM files WHERE key = ?').bind(newKey).first();
    if (existing) {
        return new Response(JSON.stringify({ success: false, error: 'File already exists in destination.' }), {
            status: 409,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    try {
        await R2.put(newKey, await R2.get(sourceKey).then(obj => obj.body), {
            httpMetadata: { contentType: fileRecord.contentType }
        });
        await R2.delete(sourceKey);
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'R2 Move failed: ' + e.message }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    await DB.prepare('UPDATE files SET key = ?, parent_path = ? WHERE key = ?').bind(newKey, newParentPath, sourceKey).run();
    return new Response(JSON.stringify({ success: true, message: 'Moved successfully' }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error('Move error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Move failed: ' + error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}
export async function onRequestDelete({ request, env }) {
  const authHeader = request.headers.get('Authorization');
  let user = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    user = await verifyToken(token, env.JWT_SECRET || 'secret');
  }
  if (!user || user.role !== 'admin') {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Admin access required.' }), {
      status: 401,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const DB = env.DB;
  const R2 = env.R2_bucket;
  if (!DB || !R2) {
    return new Response(JSON.stringify({ success: false, error: 'Server configuration error.' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  try {
    const body = await request.json();
    const { key, keys } = body;
    if (!key && (!keys || !Array.isArray(keys) || keys.length === 0)) {
      return new Response(JSON.stringify({ success: false, error: 'Missing file key or keys.' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const keysToDelete = keys || [key];
    const errors = [];
    let deletedCount = 0;
    for (const currentKey of keysToDelete) {
        try {
            const fileRecord = await DB.prepare('SELECT is_directory FROM files WHERE key = ?').bind(currentKey).first();
            if (!fileRecord) {
                continue;
            }
            if (fileRecord.is_directory) {
                const children = await DB.prepare('SELECT key FROM files WHERE parent_path = ? LIMIT 1').bind(currentKey.endsWith('/') ? currentKey : currentKey + '/').first();
                if (children) {
                    errors.push(`Directory ${currentKey} is not empty.`);
                    continue;
                }
                await DB.prepare('DELETE FROM files WHERE key = ?').bind(currentKey).run();
            } else {
                await R2.delete(currentKey);
                await DB.prepare('DELETE FROM files WHERE key = ?').bind(currentKey).run();
            }
            deletedCount++;
        } catch (err) {
            console.error(`Failed to delete ${currentKey}:`, err);
            errors.push(`Failed to delete ${currentKey}: ${err.message}`);
        }
    }
    if (deletedCount === 0 && errors.length > 0) {
         return new Response(JSON.stringify({ success: false, error: errors.join('; ') }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    return new Response(JSON.stringify({ 
        success: true, 
        message: `Deleted ${deletedCount} items successfully.`,
        errors: errors.length > 0 ? errors : undefined
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error('Delete error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Delete failed: ' + error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: addCorsHeaders() });
}
