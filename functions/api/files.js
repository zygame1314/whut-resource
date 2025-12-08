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
    return new Response(JSON.stringify({ success: false, error: '未授权' }), {
      status: 401,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const DB = env.DB;
  if (!DB) {
    return new Response(JSON.stringify({ success: false, error: '服务器配置错误（D1绑定）。' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  try {
    if (action === 'stats') {
      const stmt = DB.prepare('SELECT total_files as fileCount, total_size as totalSize FROM system_stats WHERE id = 1');
      const stats = await stmt.first();
      return new Response(JSON.stringify({
        success: true,
        stats: {
          fileCount: stats?.fileCount || 0,
          totalSize: stats?.totalSize || 0,
        }
      }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (action === 'recordLinkClick') {
      const key = url.searchParams.get('key');
      if (!key) {
        return new Response(JSON.stringify({ success: false, error: '缺少key参数' }), {
          status: 400,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      await DB.prepare('UPDATE files SET downloads = downloads + 1 WHERE key = ? AND is_link = TRUE').bind(key).run();
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
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
    if (action === 'recentUploads') {
      const limit = parseInt(url.searchParams.get('limit') || '6');
      const stmt = DB.prepare(`
        SELECT * FROM files
        WHERE is_directory = FALSE
        ORDER BY uploaded DESC
        LIMIT ?
      `);
      const { results } = await stmt.bind(limit).all();
      return new Response(JSON.stringify({ success: true, files: results }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || DEFAULT_PAGE_SIZE);
    const offset = (page - 1) * limit;
    const search = url.searchParams.get('search') || '';
    const prefix = url.searchParams.get('prefix') || '';
    let itemsResult, totalResult;
    const useFTS = search && search.length >= 3;
    if (useFTS) {
      const ftsQuery = `
        SELECT files.* FROM files
        JOIN files_fts ON files.id = files_fts.rowid
        WHERE files_fts MATCH ?
        ORDER BY rank
        LIMIT ? OFFSET ?
      `;
      const ftsCountQuery = `
        SELECT COUNT(*) as total FROM files
        JOIN files_fts ON files.id = files_fts.rowid
        WHERE files_fts MATCH ?
      `;
      const searchQuery = `"${search.replace(/"/g, '""')}"`;
      [itemsResult, totalResult] = await Promise.all([
        DB.prepare(ftsQuery).bind(searchQuery, limit, offset).all(),
        DB.prepare(ftsCountQuery).bind(searchQuery).first()
      ]);
    } else {
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
      const combinedQuery = `
        SELECT * FROM files
        ${baseWhere}
        ORDER BY is_directory DESC,
                 is_link DESC,
                 CASE WHEN is_directory = 1 THEN name END ASC,
                 CASE WHEN is_directory = 0 THEN uploaded END DESC
        LIMIT ? OFFSET ?
      `;
      const countQuery = `SELECT COUNT(*) as total FROM files ${baseWhere}`;
      [itemsResult, totalResult] = await Promise.all([
        DB.prepare(combinedQuery).bind(...params, limit, offset).all(),
        DB.prepare(countQuery).bind(...params).first()
      ]);
    }
    const items = itemsResult.results || [];
    const totalItems = totalResult?.total || 0;
    const directories = items.filter(item => item.is_directory);
    const files = items.filter(item => !item.is_directory);
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
    console.error('文件API错误:', error);
    return new Response(JSON.stringify({ success: false, error: '获取文件失败。' }), {
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
    return new Response(JSON.stringify({ success: false, error: '未授权：需要管理员访问权限。' }), {
      status: 401,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const DB = env.DB;
  const R2 = env.R2_bucket;
  if (!DB || !R2) {
    return new Response(JSON.stringify({ success: false, error: '服务器配置错误。' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  try {
    const body = await request.json();
    const { key, newName } = body;
    if (!key || !newName) {
      return new Response(JSON.stringify({ success: false, error: '缺少key或newName。' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const fileRecord = await DB.prepare('SELECT * FROM files WHERE key = ?').bind(key).first();
    if (!fileRecord) {
      return new Response(JSON.stringify({ success: false, error: '文件未找到。' }), {
        status: 404,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    if (fileRecord.is_directory) {
      return new Response(JSON.stringify({ success: false, error: '尚不支持重命名目录。' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const parentPath = fileRecord.parent_path;
    const newKey = parentPath ? `${parentPath}${newName}` : newName;
    const existing = await DB.prepare('SELECT key FROM files WHERE key = ?').bind(newKey).first();
    if (existing) {
      return new Response(JSON.stringify({ success: false, error: '新名称的文件已存在。' }), {
        status: 409,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const isLink = fileRecord.is_link === 1 || fileRecord.is_link === true;
    if (!isLink) {
      try {
        const sourceObj = await R2.get(key);
        if (sourceObj) {
          await R2.put(newKey, sourceObj.body, {
            httpMetadata: { contentType: fileRecord.contentType }
          });
          await R2.delete(key);
        }
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'R2重命名失败：' + e.message }), {
          status: 500,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
    }
    await DB.prepare('UPDATE files SET key = ?, name = ? WHERE key = ?').bind(newKey, newName, key).run();
    return new Response(JSON.stringify({ success: true, message: '重命名成功' }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error('重命名错误:', error);
    return new Response(JSON.stringify({ success: false, error: '重命名失败：' + error.message }), {
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
    return new Response(JSON.stringify({ success: false, error: '未授权：需要管理员访问权限。' }), {
      status: 401,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const DB = env.DB;
  const R2 = env.R2_bucket;
  if (!DB || !R2) {
    return new Response(JSON.stringify({ success: false, error: '服务器配置错误。' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  try {
    const body = await request.json();
    const { sourceKey, destinationPath } = body;
    if (!sourceKey || destinationPath === undefined) {
      return new Response(JSON.stringify({ success: false, error: '缺少sourceKey或destinationPath。' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const fileRecord = await DB.prepare('SELECT * FROM files WHERE key = ?').bind(sourceKey).first();
    if (!fileRecord) {
      return new Response(JSON.stringify({ success: false, error: '文件未找到。' }), {
        status: 404,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    if (fileRecord.is_directory) {
      return new Response(JSON.stringify({ success: false, error: '尚不支持移动目录。' }), {
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
      return new Response(JSON.stringify({ success: false, error: '源和目标相同。' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const existing = await DB.prepare('SELECT key FROM files WHERE key = ?').bind(newKey).first();
    if (existing) {
      return new Response(JSON.stringify({ success: false, error: '目标中文件已存在。' }), {
        status: 409,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const isLink = fileRecord.is_link === 1 || fileRecord.is_link === true;
    if (!isLink) {
      try {
        const sourceObj = await R2.get(sourceKey);
        if (sourceObj) {
          await R2.put(newKey, sourceObj.body, {
            httpMetadata: { contentType: fileRecord.contentType }
          });
          await R2.delete(sourceKey);
        }
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'R2移动失败：' + e.message }), {
          status: 500,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
    }
    await DB.prepare('UPDATE files SET key = ?, parent_path = ? WHERE key = ?').bind(newKey, newParentPath, sourceKey).run();
    return new Response(JSON.stringify({ success: true, message: '移动成功' }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error('移动错误:', error);
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
    return new Response(JSON.stringify({ success: false, error: '未授权：需要管理员访问权限。' }), {
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
      return new Response(JSON.stringify({ success: false, error: '缺少文件key或keys。' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const keysToDelete = keys || [key];
    const errors = [];
    let deletedCount = 0;
    for (const currentKey of keysToDelete) {
      try {
        const fileRecord = await DB.prepare('SELECT is_directory, is_link FROM files WHERE key = ?').bind(currentKey).first();
        if (!fileRecord) {
          continue;
        }
        if (fileRecord.is_directory) {
          const children = await DB.prepare('SELECT key FROM files WHERE parent_path = ? LIMIT 1').bind(currentKey.endsWith('/') ? currentKey : currentKey + '/').first();
          if (children) {
            errors.push(`目录 ${currentKey} 不为空。`);
            continue;
          }
          await DB.prepare('DELETE FROM files WHERE key = ?').bind(currentKey).run();
        } else {
          const isLink = fileRecord.is_link === 1 || fileRecord.is_link === true;
          if (!isLink) {
            await R2.delete(currentKey);
          }
          await DB.prepare('DELETE FROM files WHERE key = ?').bind(currentKey).run();
        }
        deletedCount++;
      } catch (err) {
        console.error(`删除 ${currentKey} 失败:`, err);
        errors.push(`删除 ${currentKey} 失败：${err.message}`);
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
      message: `成功删除了 ${deletedCount} 个项目。`,
      errors: errors.length > 0 ? errors : undefined
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error('删除错误:', error);
    return new Response(JSON.stringify({ success: false, error: '删除失败：' + error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: addCorsHeaders() });
}
