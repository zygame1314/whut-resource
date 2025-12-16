import { verifyToken, addCorsHeaders } from '../utils.js';
const DEFAULT_PAGE_SIZE = 20;
export async function onRequestGet({ request, env, waitUntil }) {
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
    if (action === 'updateLinkUrl') {
      if (!user || user.role !== 'admin') {
        return new Response(JSON.stringify({ success: false, error: '未授权：需要管理员权限。' }), {
          status: 401,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      const key = url.searchParams.get('key');
      const newUrl = url.searchParams.get('newUrl');
      if (!key || !newUrl) {
        return new Response(JSON.stringify({ success: false, error: '缺少key或newUrl参数' }), {
          status: 400,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      try {
        new URL(newUrl);
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: '无效的URL格式' }), {
          status: 400,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      const fileRecord = await DB.prepare('SELECT * FROM files WHERE key = ? AND is_link = TRUE').bind(key).first();
      if (!fileRecord) {
        return new Response(JSON.stringify({ success: false, error: '链接未找到' }), {
          status: 404,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      await DB.prepare('UPDATE files SET link_url = ? WHERE key = ?').bind(newUrl, key).run();
      return new Response(JSON.stringify({ success: true, message: '链接地址已更新' }), {
        status: 200,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    if (action === 'listAllDirs') {
      const cache = caches.default;
      const cacheKey = new Request(request.url);
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }
      const stmt = DB.prepare("SELECT key FROM files WHERE is_directory = TRUE ORDER BY key ASC");
      const { results } = await stmt.all();
      const directories = results.map(row => row.key);
      const response = new Response(JSON.stringify({ success: true, directories: directories }), {
        status: 200,
        headers: addCorsHeaders({
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600'
        })
      });
      waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }
    if (action === 'getHotFolders') {
      const cache = caches.default;
      const cacheKey = new Request(request.url);
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }
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
      const response = new Response(JSON.stringify({ success: true, hotFolders: hotFolders }), {
        status: 200,
        headers: addCorsHeaders({
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600'
        })
      });
      waitUntil(cache.put(cacheKey, response.clone()));
      return response;
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
    if (search && search.length < 3) {
      return new Response(JSON.stringify({
        success: true,
        files: [],
        directories: [],
        totalItems: 0,
        totalPages: 0,
        message: "搜索词太短（至少3个字符）。建议开启 AI 搜索以获得更好结果。"
      }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const prefix = url.searchParams.get('prefix') || '';
    let itemsResult, totalResult;
    if (search) {
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
      try {
        [itemsResult, totalResult] = await Promise.all([
          DB.prepare(ftsQuery).bind(searchQuery, limit, offset).all(),
          DB.prepare(ftsCountQuery).bind(searchQuery).first()
        ]);
      } catch (e) {
        itemsResult = { results: [] };
        totalResult = { total: 0 };
      }
    } else {
      const params = [];
      let baseWhere = 'WHERE 1=1';
      let searchPath = prefix;
      if (searchPath && !searchPath.endsWith('/')) {
        searchPath += '/';
      }
      baseWhere += ' AND parent_path = ?';
      params.push(searchPath);
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
    const parentPath = fileRecord.parent_path || '';
    const isDirectory = fileRecord.is_directory === 1 || fileRecord.is_directory === true;
    if (isDirectory) {
      const oldFolderKey = key;
      const oldFolderPath = key.endsWith('/') ? key : key + '/';
      const newFolderKey = parentPath ? `${parentPath}${newName}/` : `${newName}/`;
      if (oldFolderKey === newFolderKey || oldFolderPath === newFolderKey) {
        return new Response(JSON.stringify({ success: false, error: '新名称与原名称相同。' }), {
          status: 400,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      const existingFolder = await DB.prepare('SELECT key FROM files WHERE key = ?').bind(newFolderKey).first();
      if (existingFolder) {
        return new Response(JSON.stringify({ success: false, error: '新名称的文件夹已存在。' }), {
          status: 409,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      const endKey = oldFolderPath.substring(0, oldFolderPath.length - 1) + '0';
      const { results: childItems } = await DB.prepare("SELECT * FROM files WHERE key >= ? AND key < ? AND key != ?").bind(oldFolderPath, endKey, oldFolderPath).all();
      const batchOperations = [];
      batchOperations.push(
        DB.prepare(`
          INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(newFolderKey, newName, fileRecord.size, fileRecord.uploaded, fileRecord.contentType, parentPath, 1, fileRecord.is_link, fileRecord.link_url, fileRecord.downloads, fileRecord.uploader_id)
      );
      batchOperations.push(DB.prepare('DELETE FROM files WHERE key = ?').bind(oldFolderKey));
      for (const child of childItems || []) {
        const relativePath = child.key.substring(oldFolderPath.length);
        const newChildKey = `${newFolderKey}${relativePath}`;
        const newChildParentPath = newChildKey.includes('/')
          ? newChildKey.substring(0, newChildKey.lastIndexOf('/') + 1)
          : '';
        const isChildLink = child.is_link === 1 || child.is_link === true;
        const isChildDirectory = child.is_directory === 1 || child.is_directory === true;
        if (!isChildLink && !isChildDirectory) {
          try {
            const sourceObj = await R2.get(child.key);
            if (sourceObj) {
              await R2.put(newChildKey, sourceObj.body, {
                httpMetadata: { contentType: child.contentType }
              });
              await R2.delete(child.key);
            }
          } catch (e) {
            console.error(`R2重命名子项失败: ${child.key}`, e);
          }
        }
        batchOperations.push(
          DB.prepare(`
            INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(newChildKey, child.name, child.size, child.uploaded, child.contentType, newChildParentPath, child.is_directory, child.is_link, child.link_url, child.downloads, child.uploader_id)
        );
        batchOperations.push(DB.prepare('UPDATE downloads SET file_key = ? WHERE file_key = ?').bind(newChildKey, child.key));
        batchOperations.push(DB.prepare('DELETE FROM files WHERE key = ?').bind(child.key));
      }
      await DB.batch(batchOperations);
      return new Response(JSON.stringify({ success: true, message: '文件夹重命名成功' }), {
        status: 200,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
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
    await DB.batch([
      DB.prepare(`
        INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id)
        SELECT ?, ?, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id
        FROM files WHERE key = ?
      `).bind(newKey, newName, key),
      DB.prepare('UPDATE downloads SET file_key = ? WHERE file_key = ?').bind(newKey, key),
      DB.prepare('DELETE FROM files WHERE key = ?').bind(key)
    ]);
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
    let newParentPath = destinationPath;
    if (newParentPath && !newParentPath.endsWith('/')) {
      newParentPath += '/';
    }
    const isDirectory = fileRecord.is_directory === 1 || fileRecord.is_directory === true;
    if (isDirectory) {
      const oldFolderPath = sourceKey.endsWith('/') ? sourceKey : sourceKey + '/';
      const folderName = fileRecord.name;
      const newFolderKey = newParentPath ? `${newParentPath}${folderName}/` : `${folderName}/`;
      if (newFolderKey.startsWith(oldFolderPath)) {
        return new Response(JSON.stringify({ success: false, error: '不能将文件夹移动到其自身或子目录中。' }), {
          status: 400,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      if (sourceKey === newFolderKey || oldFolderPath === newFolderKey) {
        return new Response(JSON.stringify({ success: false, error: '源和目标相同。' }), {
          status: 400,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      const existingFolder = await DB.prepare('SELECT key FROM files WHERE key = ?').bind(newFolderKey).first();
      if (existingFolder) {
        return new Response(JSON.stringify({ success: false, error: '目标中已存在同名文件夹。' }), {
          status: 409,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      const endKey = oldFolderPath.substring(0, oldFolderPath.length - 1) + '0';
      const { results: childItems } = await DB.prepare("SELECT * FROM files WHERE key >= ? AND key < ? AND key != ?").bind(oldFolderPath, endKey, oldFolderPath).all();
      const batchOperations = [];
      batchOperations.push(
        DB.prepare(`
          INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(newFolderKey, folderName, fileRecord.size, fileRecord.uploaded, fileRecord.contentType, newParentPath, 1, fileRecord.is_link, fileRecord.link_url, fileRecord.downloads, fileRecord.uploader_id)
      );
      batchOperations.push(DB.prepare('DELETE FROM files WHERE key = ?').bind(sourceKey));
      for (const child of childItems || []) {
        const relativePath = child.key.substring(oldFolderPath.length);
        const newChildKey = `${newFolderKey}${relativePath}`;
        const newChildParentPath = newChildKey.includes('/')
          ? newChildKey.substring(0, newChildKey.lastIndexOf('/') + 1)
          : '';
        const isChildLink = child.is_link === 1 || child.is_link === true;
        const isChildDirectory = child.is_directory === 1 || child.is_directory === true;
        if (!isChildLink && !isChildDirectory) {
          try {
            const sourceObj = await R2.get(child.key);
            if (sourceObj) {
              await R2.put(newChildKey, sourceObj.body, {
                httpMetadata: { contentType: child.contentType }
              });
              await R2.delete(child.key);
            }
          } catch (e) {
            console.error(`R2移动子项失败: ${child.key}`, e);
          }
        }
        batchOperations.push(
          DB.prepare(`
            INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(newChildKey, child.name, child.size, child.uploaded, child.contentType, newChildParentPath, child.is_directory, child.is_link, child.link_url, child.downloads, child.uploader_id)
        );
        batchOperations.push(DB.prepare('UPDATE downloads SET file_key = ? WHERE file_key = ?').bind(newChildKey, child.key));
        batchOperations.push(DB.prepare('DELETE FROM files WHERE key = ?').bind(child.key));
      }
      await DB.batch(batchOperations);
      return new Response(JSON.stringify({ success: true, message: '文件夹移动成功' }), {
        status: 200,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
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
    await DB.batch([
      DB.prepare(`
        INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id)
        SELECT ?, name, size, uploaded, contentType, ?, is_directory, is_link, link_url, downloads, uploader_id
        FROM files WHERE key = ?
      `).bind(newKey, newParentPath, sourceKey),
      DB.prepare('UPDATE downloads SET file_key = ? WHERE file_key = ?').bind(newKey, sourceKey),
      DB.prepare('DELETE FROM files WHERE key = ?').bind(sourceKey)
    ]);
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
          const folderPath = currentKey.endsWith('/') ? currentKey : currentKey + '/';
          const endKey = folderPath.substring(0, folderPath.length - 1) + '0';
          const { results: childItems } = await DB.prepare("SELECT key, is_link, is_directory FROM files WHERE key >= ? AND key < ?").bind(folderPath, endKey).all();
          for (const child of childItems || []) {
            const isChildLink = child.is_link === 1 || child.is_link === true;
            const isChildDirectory = child.is_directory === 1 || child.is_directory === true;
            if (!isChildLink && !isChildDirectory) {
              try {
                await R2.delete(child.key);
              } catch (e) {
                console.error(`R2删除子项失败: ${child.key}`, e);
              }
            }
          }
          if (childItems && childItems.length > 0) {
            const childKeys = childItems.map(c => c.key);
            for (let i = 0; i < childKeys.length; i += 100) {
              const batch = childKeys.slice(i, i + 100);
              const placeholders = batch.map(() => '?').join(',');
              await DB.prepare(`DELETE FROM files WHERE key IN (${placeholders})`).bind(...batch).run();
            }
          }
          await DB.prepare('DELETE FROM files WHERE key = ?').bind(currentKey).run();
          deletedCount += (childItems?.length || 0) + 1;
        } else {
          const isLink = fileRecord.is_link === 1 || fileRecord.is_link === true;
          if (!isLink) {
            await R2.delete(currentKey);
          }
          await DB.prepare('DELETE FROM files WHERE key = ?').bind(currentKey).run();
          deletedCount++;
        }
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
