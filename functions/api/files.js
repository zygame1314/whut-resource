import { verifyToken, addCorsHeaders, isAdmin } from '../utils.js';
async function deleteVectorIndexes(env, fileIds) {
    if (!env.VECTORIZE || !fileIds || fileIds.length === 0) return;
    try {
        const idsToDelete = fileIds.map(id => id.toString());
        await env.VECTORIZE.deleteByIds(idsToDelete);
        console.log(`已删除 ${idsToDelete.length} 个向量索引`);
    } catch (error) {
        console.error('删除向量索引失败:', error);
    }
}
async function createVectorIndexes(env, files) {
    if (!env.AI || !env.VECTORIZE || !files || files.length === 0) return;
    try {
        const textsToEmbed = files.map(f => f.key);
        const embeddingResponse = await env.AI.run('@cf/baai/bge-m3', {
            text: textsToEmbed
        });
        if (!embeddingResponse?.data || embeddingResponse.data.length !== files.length) {
            throw new Error('嵌入生成失败或数量不匹配');
        }
        const vectors = files.map((file, index) => ({
            id: file.id.toString(),
            values: embeddingResponse.data[index],
            metadata: {
                name: file.name,
                path: file.key
            }
        }));
        await env.VECTORIZE.upsert(vectors);
        console.log(`已创建 ${vectors.length} 个向量索引`);
    } catch (error) {
        console.error('创建向量索引失败:', error);
    }
}
export async function onRequestGet({ request, env, waitUntil }) {
    const authHeader = request.headers.get('Authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (env.AI_BOT_TOKEN && token === env.AI_BOT_TOKEN) {
            user = { id: 0, role: 'bot', username: 'AI_BOT' };
        } else {
            user = await verifyToken(token, env.JWT_SECRET || 'secret');
        }
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
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ success: false, error: '需要管理员权限。' }), {
                    status: 403,
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
            const CACHE_ID = 2;
            const CACHE_TTL_MS = 60 * 60 * 1000;
            let directories = [];
            let cacheHit = false;
            try {
                const cacheRecord = await DB.prepare('SELECT data, updated_at FROM system_cache WHERE id = ?').bind(CACHE_ID).first();
                if (cacheRecord && cacheRecord.data) {
                    const updatedAt = new Date(cacheRecord.updated_at + 'Z').getTime();
                    const now = Date.now();
                    if ((now - updatedAt) < CACHE_TTL_MS) {
                        directories = JSON.parse(cacheRecord.data);
                        cacheHit = true;
                    }
                }
            } catch (e) {
                console.error('Failed to read dir cache:', e);
            }
            if (!cacheHit) {
                const stmt = DB.prepare("SELECT key FROM files WHERE is_directory = TRUE ORDER BY key ASC");
                const { results } = await stmt.all();
                directories = results.map(row => row.key);
                try {
                    await DB.prepare(`
                        INSERT OR REPLACE INTO system_cache (id, data, updated_at) 
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                    `).bind(CACHE_ID, JSON.stringify(directories)).run();
                } catch (e) {
                    console.error('更新目录缓存失败:', e);
                }
            }
            return new Response(JSON.stringify({ success: true, directories: directories, cache: cacheHit }), {
                status: 200,
                headers: addCorsHeaders({
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=3600'
                })
            });
        }
        if (action === 'getHotFolders') {
            const cacheData = await DB.prepare('SELECT data, updated_at FROM system_cache WHERE id = 1').first();
            let hotFolders = [];
            let needsBackgroundRefresh = false;
            let cacheExists = false;
            if (cacheData && cacheData.data) {
                cacheExists = true;
                try {
                    const parsed = JSON.parse(cacheData.data);
                    hotFolders = parsed.map(row => {
                        const rawPath = row.path.endsWith('/') ? row.path.slice(0, -1) : row.path;
                        const parts = rawPath.split('/');
                        let displayPath = parts.pop();
                        if (parts.length > 0) {
                            const parent = parts.pop();
                            displayPath = `${parent}/${displayPath}`;
                            if (parts.length > 0) {
                                displayPath = `.../${displayPath}`;
                            }
                        }
                        return {
                            path: row.path,
                            name: row.path.endsWith('/') ? row.path.slice(0, -1).split('/').pop() : row.path.split('/').pop(),
                            display_path: displayPath,
                            total_downloads: row.total_downloads
                        };
                    });
                    if (cacheData.updated_at) {
                        const updatedAt = new Date(cacheData.updated_at + 'Z').getTime();
                        const now = Date.now();
                        needsBackgroundRefresh = (now - updatedAt) > 3600000;
                    }
                } catch (e) {
                    console.error('解析热门文件夹缓存失败:', e);
                    cacheExists = false;
                }
            }
            if (!cacheExists) {
                try {
                    const freshResult = await DB.prepare(`
                        SELECT '[' || COALESCE(GROUP_CONCAT(json_object('path', parent_path, 'total_downloads', total_downloads)), '') || ']' as data
                        FROM (
                            SELECT parent_path, SUM(downloads) as total_downloads
                            FROM files
                            WHERE parent_path != '' AND is_directory = FALSE
                            GROUP BY parent_path
                            ORDER BY total_downloads DESC
                            LIMIT 5
                        )
                    `).first();
                    if (freshResult && freshResult.data) {
                        await DB.prepare('INSERT OR REPLACE INTO system_cache (id, data, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)')
                            .bind(freshResult.data).run();
                        const parsed = JSON.parse(freshResult.data);
                        hotFolders = parsed.map(row => {
                            const rawPath = row.path.endsWith('/') ? row.path.slice(0, -1) : row.path;
                            const parts = rawPath.split('/');
                            let displayPath = parts.pop();
                            if (parts.length > 0) {
                                const parent = parts.pop();
                                displayPath = `${parent}/${displayPath}`;
                                if (parts.length > 0) {
                                    displayPath = `.../${displayPath}`;
                                }
                            }
                            return {
                                path: row.path,
                                name: row.path.endsWith('/') ? row.path.slice(0, -1).split('/').pop() : row.path.split('/').pop(),
                                display_path: displayPath,
                                total_downloads: row.total_downloads
                            };
                        });
                    }
                } catch (e) {
                    console.error('同步获取热门文件夹失败:', e);
                }
            } else if (needsBackgroundRefresh) {
                waitUntil((async () => {
                    try {
                        const refreshResult = await DB.prepare(`
                            SELECT '[' || COALESCE(GROUP_CONCAT(json_object('path', parent_path, 'total_downloads', total_downloads)), '') || ']' as data
                            FROM (
                                SELECT parent_path, SUM(downloads) as total_downloads
                                FROM files
                                WHERE parent_path != '' AND is_directory = FALSE
                                GROUP BY parent_path
                                ORDER BY total_downloads DESC
                                LIMIT 5
                            )
                        `).first();
                        if (refreshResult && refreshResult.data) {
                            await DB.prepare('INSERT OR REPLACE INTO system_cache (id, data, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)')
                                .bind(refreshResult.data).run();
                        }
                    } catch (e) {
                        console.error('后台刷新热门文件夹缓存失败:', e);
                    }
                })());
            }
            return new Response(JSON.stringify({ success: true, hotFolders: hotFolders }), {
                status: 200,
                headers: addCorsHeaders({
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=3600'
                })
            });
        }
        if (action === 'recentUploads') {
            const limit = parseInt(url.searchParams.get('limit') || '6');
            const stmt = DB.prepare(`
                SELECT *,
                ${user ? `(SELECT reaction FROM file_reactions WHERE file_key = files.key AND user_id = ${user.id}) as user_reaction` : 'NULL as user_reaction'}
                FROM files
                WHERE is_directory = FALSE
                ORDER BY uploaded DESC
                LIMIT ?
            `);
            const { results } = await stmt.bind(limit).all();
            return new Response(JSON.stringify({ success: true, files: results }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const MAX_LIMIT = 1000;
        const search = url.searchParams.get('search') || '';
        if (search) {
            const blockedExtensions = new Set([
                'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md',
                'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg',
                'mp4', 'webm', 'mov', 'avi', 'mkv',
                'mp3', 'wav', 'flac', 'm4a',
                'zip', 'rar', '7z', 'tar', 'gz',
                'exe', 'msi', 'apk', 'ipa', 'dmg', 'iso'
            ]);
            const cleanTerm = search.trim().toLowerCase().replace(/^\./, '');
            if (blockedExtensions.has(cleanTerm)) {
                return new Response(JSON.stringify({
                    success: true,
                    files: [],
                    directories: [],
                    totalItems: 0,
                    message: "关键词太过宽泛，请勿直接搜索文件后缀名。"
                }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
        }
        if (search && search.length < 3) {
            return new Response(JSON.stringify({
                success: true,
                files: [],
                directories: [],
                totalItems: 0,
                message: "搜索词太短（至少3个字符）。建议开启 AI 搜索以获得更好结果。"
            }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const prefix = url.searchParams.get('prefix') || '';
        let itemsResult;
        if (search) {
            const ftsQuery = `
                SELECT files.*,
                ${user ? `(SELECT reaction FROM file_reactions WHERE file_key = files.key AND user_id = ${user.id}) as user_reaction` : 'NULL as user_reaction'}
                FROM files
                JOIN files_fts ON files.id = files_fts.rowid
                WHERE files_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            `;
            const searchQuery = search.replace(/"/g, '');
            try {
                itemsResult = await DB.prepare(ftsQuery).bind(searchQuery, MAX_LIMIT).all();
            } catch (e) {
                itemsResult = { results: [] };
            }
        } else {
            let searchPath = prefix;
            if (searchPath && !searchPath.endsWith('/')) {
                searchPath += '/';
            }
            const combinedQuery = `
                SELECT *,
                ${user ? `(SELECT reaction FROM file_reactions WHERE file_key = files.key AND user_id = ${user.id}) as user_reaction` : 'NULL as user_reaction'}
                FROM files
                WHERE parent_path = ?
                ORDER BY is_directory DESC,
                        is_link DESC,
                        name ASC
                LIMIT ?
            `;
            itemsResult = await DB.prepare(combinedQuery).bind(searchPath, MAX_LIMIT).all();
        }
        const items = itemsResult.results || [];
        const directories = items.filter(item => item.is_directory);
        const files = items.filter(item => !item.is_directory);
        const totalItems = items.length;
        return new Response(JSON.stringify({
            success: true,
            files,
            directories,
            totalItems
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
    if (!isAdmin(user)) {
        return new Response(JSON.stringify({ success: false, error: '需要管理员权限。' }), {
            status: 403,
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
        const url = new URL(request.url);
        const action = url.searchParams.get('action');
        const body = await request.json();

        if (action === 'updateDescription') {
            const { key, description } = body;
            if (!key) {
                return new Response(JSON.stringify({ success: false, error: '缺少key。' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            const fileRecord = await DB.prepare('SELECT * FROM files WHERE key = ?').bind(key).first();
            if (!fileRecord || !(fileRecord.is_directory === 1 || fileRecord.is_directory === true)) {
                return new Response(JSON.stringify({ success: false, error: '未找到该文件夹。' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            await DB.prepare('UPDATE files SET description = ? WHERE key = ?').bind(description || null, key).run();
            return new Response(JSON.stringify({ success: true, message: '描述已更新' }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

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
            const MAX_SAFE_BATCH_SIZE = 50;
            if (childItems && childItems.length > MAX_SAFE_BATCH_SIZE) {
                return new Response(JSON.stringify({
                    success: false,
                    error: `该文件夹包含 ${childItems.length} 个项目，超过安全操作限制 (${MAX_SAFE_BATCH_SIZE})。为防止超时和数据丢失，请手动分批移动或联系管理员直接在数据库操作。`
                }), {
                    status: 400,
                    headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
                });
            }
            const batchOperations = [];
            batchOperations.push(
                DB.prepare(`
                    INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(newFolderKey, newName, fileRecord.size, fileRecord.uploaded, fileRecord.contentType, parentPath, 1, fileRecord.is_link, fileRecord.link_url, fileRecord.downloads, fileRecord.uploader_id)
            );
            batchOperations.push(DB.prepare('DELETE FROM files WHERE key = ?').bind(oldFolderKey));
            const R2_CONCURRENCY = 4;
            const filesToMove = (childItems || []).filter(child => {
                const isChildLink = child.is_link === 1 || child.is_link === true;
                const isChildDirectory = child.is_directory === 1 || child.is_directory === true;
                return !isChildLink && !isChildDirectory;
            });
            for (let i = 0; i < filesToMove.length; i += R2_CONCURRENCY) {
                const batch = filesToMove.slice(i, i + R2_CONCURRENCY);
                await Promise.all(batch.map(async (child) => {
                    const relativePath = child.key.substring(oldFolderPath.length);
                    const newChildKey = `${newFolderKey}${relativePath}`;
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
                }));
            }
            for (const child of childItems || []) {
                const relativePath = child.key.substring(oldFolderPath.length);
                const newChildKey = `${newFolderKey}${relativePath}`;
                const keyForParentCalc = child.is_directory && newChildKey.endsWith('/')
                    ? newChildKey.slice(0, -1)
                    : newChildKey;
                const newChildParentPath = keyForParentCalc.includes('/')
                    ? keyForParentCalc.substring(0, keyForParentCalc.lastIndexOf('/') + 1)
                    : '';
                batchOperations.push(
                    DB.prepare(`
                        INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).bind(newChildKey, child.name, child.size, child.uploaded, child.contentType, newChildParentPath, child.is_directory, child.is_link, child.link_url, child.downloads, child.uploader_id)
                );
                batchOperations.push(DB.prepare('UPDATE downloads SET file_key = ? WHERE file_key = ?').bind(newChildKey, child.key));
                batchOperations.push(DB.prepare('DELETE FROM files WHERE key = ?').bind(child.key));
            }
            const oldFileIds = [fileRecord.id, ...(childItems || []).map(c => c.id)];
            await DB.batch(batchOperations);
            await deleteVectorIndexes(env, oldFileIds);
            const newFolderPathForQuery = newFolderKey;
            const newEndKey = newFolderPathForQuery.substring(0, newFolderPathForQuery.length - 1) + '0';
            const { results: newFiles } = await DB.prepare(
                "SELECT id, name, key FROM files WHERE key = ? OR (key >= ? AND key < ?)"
            ).bind(newFolderKey, newFolderKey, newEndKey).all();
            await createVectorIndexes(env, newFiles || []);
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
        const oldFileId = fileRecord.id;
        await DB.batch([
            DB.prepare(`
                INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id)
                SELECT ?, ?, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id
                FROM files WHERE key = ?
            `).bind(newKey, newName, key),
            DB.prepare('UPDATE downloads SET file_key = ? WHERE file_key = ?').bind(newKey, key),
            DB.prepare('DELETE FROM files WHERE key = ?').bind(key)
        ]);
        await deleteVectorIndexes(env, [oldFileId]);
        const newFileRecord = await DB.prepare('SELECT id, name, key FROM files WHERE key = ?').bind(newKey).first();
        if (newFileRecord) {
            await createVectorIndexes(env, [newFileRecord]);
        }
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
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    if (!isAdmin(user) && action !== 'toggleReaction') {
        return new Response(JSON.stringify({ success: false, error: '需要管理员权限。' }), {
            status: 403,
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
        if (action === 'toggleReaction') {
            const { key, reaction } = body;
            if (!key || !['like', 'dislike'].includes(reaction)) {
                return new Response(JSON.stringify({ success: false, error: '无效的参数' }), {
                    status: 400,
                    headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
                });
            }
            const existing = await DB.prepare('SELECT reaction FROM file_reactions WHERE user_id = ? AND file_key = ?').bind(user.id, key).first();
            let currentUserReaction = null;
            if (existing) {
                if (existing.reaction === reaction) {
                    await DB.prepare('DELETE FROM file_reactions WHERE user_id = ? AND file_key = ?').bind(user.id, key).run();
                    currentUserReaction = null;
                } else {
                    await DB.prepare('UPDATE file_reactions SET reaction = ? WHERE user_id = ? AND file_key = ?').bind(reaction, user.id, key).run();
                    currentUserReaction = reaction;
                }
            } else {
                await DB.prepare('INSERT INTO file_reactions (user_id, file_key, reaction) VALUES (?, ?, ?)').bind(user.id, key, reaction).run();
                currentUserReaction = reaction;
            }
            const stats = await DB.prepare('SELECT likes, dislikes FROM files WHERE key = ?').bind(key).first();
            return new Response(JSON.stringify({
                success: true,
                likes: stats ? stats.likes : 0,
                dislikes: stats ? stats.dislikes : 0,
                userReaction: currentUserReaction
            }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const { sourceKey, destinationPath } = body;
        if (!sourceKey || destinationPath === undefined) {
            if (!action) {
                return new Response(JSON.stringify({ success: false, error: '缺少sourceKey或destinationPath。' }), {
                    status: 400,
                    headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
                });
            }
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
            const MAX_SAFE_BATCH_SIZE = 50;
            if (childItems && childItems.length > MAX_SAFE_BATCH_SIZE) {
                return new Response(JSON.stringify({
                    success: false,
                    error: `该文件夹包含 ${childItems.length} 个项目，超过安全操作限制 (${MAX_SAFE_BATCH_SIZE})。为防止超时和数据丢失，请手动分批移动或联系管理员直接在数据库操作。`
                }), {
                    status: 400,
                    headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
                });
            }
            const batchOperations = [];
            batchOperations.push(
                DB.prepare(`
                    INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(newFolderKey, folderName, fileRecord.size, fileRecord.uploaded, fileRecord.contentType, newParentPath, 1, fileRecord.is_link, fileRecord.link_url, fileRecord.downloads, fileRecord.uploader_id)
            );
            batchOperations.push(DB.prepare('DELETE FROM files WHERE key = ?').bind(sourceKey));
            const R2_CONCURRENCY = 4;
            const filesToMove = (childItems || []).filter(child => {
                const isChildLink = child.is_link === 1 || child.is_link === true;
                const isChildDirectory = child.is_directory === 1 || child.is_directory === true;
                return !isChildLink && !isChildDirectory;
            });
            for (let i = 0; i < filesToMove.length; i += R2_CONCURRENCY) {
                const batch = filesToMove.slice(i, i + R2_CONCURRENCY);
                await Promise.all(batch.map(async (child) => {
                    const relativePath = child.key.substring(oldFolderPath.length);
                    const newChildKey = `${newFolderKey}${relativePath}`;
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
                }));
            }
            for (const child of childItems || []) {
                const relativePath = child.key.substring(oldFolderPath.length);
                const newChildKey = `${newFolderKey}${relativePath}`;
                const keyForParentCalc = child.is_directory && newChildKey.endsWith('/')
                    ? newChildKey.slice(0, -1)
                    : newChildKey;
                const newChildParentPath = keyForParentCalc.includes('/')
                    ? keyForParentCalc.substring(0, keyForParentCalc.lastIndexOf('/') + 1)
                    : '';
                batchOperations.push(
                    DB.prepare(`
                        INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).bind(newChildKey, child.name, child.size, child.uploaded, child.contentType, newChildParentPath, child.is_directory, child.is_link, child.link_url, child.downloads, child.uploader_id)
                );
                batchOperations.push(DB.prepare('UPDATE downloads SET file_key = ? WHERE file_key = ?').bind(newChildKey, child.key));
                batchOperations.push(DB.prepare('DELETE FROM files WHERE key = ?').bind(child.key));
            }
            const oldFileIds = [fileRecord.id, ...(childItems || []).map(c => c.id)];
            await DB.batch(batchOperations);
            await deleteVectorIndexes(env, oldFileIds);
            const newFolderPathForQuery = newFolderKey;
            const newEndKey = newFolderPathForQuery.substring(0, newFolderPathForQuery.length - 1) + '0';
            const { results: newFiles } = await DB.prepare(
                "SELECT id, name, key FROM files WHERE key = ? OR (key >= ? AND key < ?)"
            ).bind(newFolderKey, newFolderKey, newEndKey).all();
            await createVectorIndexes(env, newFiles || []);
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
        const oldFileId = fileRecord.id;
        await DB.batch([
            DB.prepare(`
                INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id)
                SELECT ?, name, size, uploaded, contentType, ?, is_directory, is_link, link_url, downloads, uploader_id
                FROM files WHERE key = ?
            `).bind(newKey, newParentPath, sourceKey),
            DB.prepare('UPDATE downloads SET file_key = ? WHERE file_key = ?').bind(newKey, sourceKey),
            DB.prepare('DELETE FROM files WHERE key = ?').bind(sourceKey)
        ]);
        await deleteVectorIndexes(env, [oldFileId]);
        const newFileRecord = await DB.prepare('SELECT id, name, key FROM files WHERE key = ?').bind(newKey).first();
        if (newFileRecord) {
            await createVectorIndexes(env, [newFileRecord]);
        }
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
    if (!isAdmin(user)) {
        return new Response(JSON.stringify({ success: false, error: '需要管理员权限。' }), {
            status: 403,
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
        const { key } = body;
        if (!key) {
            return new Response(JSON.stringify({ success: false, error: '缺少文件key。' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const fullUser = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
        const isSuperAdminUser = fullUser && fullUser.role === 'super_admin';
        const fileRecord = await DB.prepare('SELECT * FROM files WHERE key = ?').bind(key).first();
        if (!fileRecord) {
            return new Response(JSON.stringify({ success: false, error: '文件未找到。' }), {
                status: 404,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const isDirectory = fileRecord.is_directory === 1 || fileRecord.is_directory === true;
        if (!isSuperAdminUser) {
            if (isDirectory) {
                const folderPath = key.endsWith('/') ? key : key + '/';
                const endKey = folderPath.substring(0, folderPath.length - 1) + '0';
                const countResult = await DB.prepare("SELECT COUNT(*) as count FROM files WHERE key >= ? AND key < ? AND key != ?").bind(folderPath, endKey, folderPath).first();
                const childCount = countResult.count;
                const MAX_SAFE_BATCH_SIZE = 50;
                if (childCount > MAX_SAFE_BATCH_SIZE) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: `文件夹 "${fileRecord.name}" 包含 ${childCount} 个项目，超过安全限制 (${MAX_SAFE_BATCH_SIZE})。无法提交删除申请，请先进入文件夹分批删除其中内容。`
                    }), {
                        status: 400,
                        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
                    });
                }
            }
            const requestType = isDirectory ? 'delete_folder' : 'delete_file';
            const requestData = {
                keys: [key],
                fileNames: [fileRecord.name],
                count: 1
            };
            const result = await DB.prepare(`
                INSERT INTO admin_requests (request_type, request_data, requested_by, status)
                VALUES (?, ?, ?, 'pending')
            `).bind(requestType, JSON.stringify(requestData), user.id).run();
            return new Response(JSON.stringify({
                success: true,
                pending_approval: true,
                request_id: result.meta.last_row_id,
                message: `已提交删除请求，等待超级管理员审批`
            }), {
                status: 200,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        if (isDirectory) {
            const folderPath = key.endsWith('/') ? key : key + '/';
            const endKey = folderPath.substring(0, folderPath.length - 1) + '0';
            const { results: childItems } = await DB.prepare("SELECT id, key, is_link, is_directory FROM files WHERE key >= ? AND key < ? AND key != ?").bind(folderPath, endKey, folderPath).all();
            const MAX_SAFE_BATCH_SIZE = 50;
            if (childItems && childItems.length > MAX_SAFE_BATCH_SIZE) {
                return new Response(JSON.stringify({
                    success: false,
                    error: `该文件夹包含 ${childItems.length} 个项目，超过安全操作限制 (${MAX_SAFE_BATCH_SIZE})。大量文件删除可能导致超时和数据残留，请先进入文件夹分批删除其中内容。`
                }), {
                    status: 400,
                    headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
                });
            }
            const R2_CONCURRENCY = 4;
            const filesToDelete = (childItems || []).filter(child => {
                const isChildLink = child.is_link === 1 || child.is_link === true;
                const isChildDirectory = child.is_directory === 1 || child.is_directory === true;
                return !isChildLink && !isChildDirectory;
            });
            for (let i = 0; i < filesToDelete.length; i += R2_CONCURRENCY) {
                const batch = filesToDelete.slice(i, i + R2_CONCURRENCY);
                await Promise.all(batch.map(async (child) => {
                    try {
                        await R2.delete(child.key);
                    } catch (e) {
                        console.error(`R2删除子项失败: ${child.key}`, e);
                    }
                }));
            }
            const fileIdsToDeleteVector = [fileRecord.id, ...(childItems || []).map(c => c.id)];
            if (childItems && childItems.length > 0) {
                const childKeys = childItems.map(c => c.key);
                for (let i = 0; i < childKeys.length; i += 100) {
                    const batch = childKeys.slice(i, i + 100);
                    const placeholders = batch.map(() => '?').join(',');
                    await DB.prepare(`DELETE FROM files WHERE key IN (${placeholders})`).bind(...batch).run();
                }
            }
            await DB.prepare('DELETE FROM files WHERE key = ?').bind(key).run();
            await deleteVectorIndexes(env, fileIdsToDeleteVector);
            const deletedCount = (childItems?.length || 0) + 1;
            return new Response(JSON.stringify({
                success: true,
                message: `成功删除了 ${deletedCount} 个项目。`
            }), {
                status: 200,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const fileIdToDelete = fileRecord.id;
        const isLink = fileRecord.is_link === 1 || fileRecord.is_link === true;
        if (!isLink) {
            await R2.delete(key);
        }
        await DB.prepare('DELETE FROM files WHERE key = ?').bind(key).run();
        await deleteVectorIndexes(env, [fileIdToDelete]);
        return new Response(JSON.stringify({
            success: true,
            message: '删除成功。'
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
