import { addCorsHeaders, isSuperAdmin, getUserFromRequest } from '../utils.js';
export async function onRequestPost({ request, env }) {
    const user = await getUserFromRequest(request, env);
    if (!user || !isSuperAdmin(user)) {
        return new Response(JSON.stringify({ success: false, error: '需要超级管理员权限' }), { status: 403, headers: addCorsHeaders() });
    }
    const R2 = env.R2_bucket;
    const DB = env.DB;
    const VECTORIZE = env.VECTORIZE;
    if (!R2 || !DB) {
        return new Response(JSON.stringify({ success: false, error: '配置错误' }), { status: 500, headers: addCorsHeaders() });
    }
    try {
        const body = await request.json().catch(() => ({}));
        const action = body.action || 'init';
        if (action === 'init') {
            await ensureSchema(DB);
        }
        switch (action) {
            case 'init':
                return await handleInit(DB);
            case 'process':
                return await handleProcess(request, env, body);
            case 'cleanup':
                return await handleCleanup(DB, body, VECTORIZE);
            case 'repair':
                return await handleRepair(DB);
            default:
                return new Response(JSON.stringify({ success: false, error: '无效的操作类型' }), { status: 400, headers: addCorsHeaders() });
        }
    } catch (e) {
        console.error('Sync error:', e);
        return new Response(JSON.stringify({ success: false, error: e.message, stack: e.stack }), { status: 500, headers: addCorsHeaders() });
    }
}
async function handleRepair(DB) {
    const result = await DB.prepare("SELECT DISTINCT parent_path FROM files WHERE parent_path IS NOT NULL AND parent_path != ''").all();
    const rows = result.results || [];
    const neededDirs = new Set();
    for (const row of rows) {
        let path = row.parent_path;
        if (path && !path.endsWith('/')) path += '/';
        let current = path;
        while (current) {
            neededDirs.add(current);
            if (current.endsWith('/')) current = current.slice(0, -1);
            const lastSlash = current.lastIndexOf('/');
            if (lastSlash === -1) break;
            current = current.substring(0, lastSlash + 1);
        }
    }
    const existResult = await DB.prepare("SELECT key FROM files WHERE is_directory = TRUE").all();
    const existingDirs = new Set((existResult.results || []).map(r => r.key));
    const statements = [];
    const now = new Date().toISOString();
    let repairCount = 0;
    for (const dirPath of neededDirs) {
        if (!existingDirs.has(dirPath)) {
            const parts = dirPath.split('/').filter(p => p);
            const name = parts[parts.length - 1];
            const parentPath = parts.length > 1 ? parts.slice(0, parts.length - 1).join('/') + '/' : '';
            statements.push(DB.prepare(`
                INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads, last_verified)
                VALUES (?, ?, 0, ?, 'inode/directory', ?, TRUE, 0, 0)
            `).bind(dirPath, name, now, parentPath));
            repairCount++;
        }
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
        message: `目录结构修复完成。扫描路径: ${neededDirs.size}, 恢复缺失: ${repairCount}`,
        repaired: repairCount
    }), { status: 200, headers: addCorsHeaders() });
}
async function ensureSchema(DB) {
    try {
        await DB.prepare('SELECT last_verified FROM files LIMIT 1').run();
    } catch (e) {
        console.log('Adding last_verified column to files table...');
        try {
            await DB.prepare('ALTER TABLE files ADD COLUMN last_verified INTEGER DEFAULT 0').run();
        } catch (alterError) {
            console.error('Failed to alter table:', alterError);
        }
    }
}
async function handleInit(DB) {
    const sessionId = Date.now();
    return new Response(JSON.stringify({
        success: true,
        sessionId: sessionId,
        message: '同步初始化完成'
    }), { status: 200, headers: addCorsHeaders() });
}
async function handleProcess(request, env, body) {
    const { cursor, sessionId } = body;
    if (!sessionId) {
        throw new Error('缺少 sessionId');
    }
    const R2 = env.R2_bucket;
    const DB = env.DB;
    const options = { limit: 1000 };
    if (cursor) options.cursor = cursor;
    const list = await R2.list(options);
    const objects = list.objects;
    const validKeys = new Set();
    const dirPaths = new Set();
    const statements = [];
    let processedCount = 0;
    let newDirsCount = 0;
    for (const object of objects) {
        const key = object.key;
        if (key.endsWith('/')) continue;
        validKeys.add(key);
        const name = key.split('/').pop();
        const parentPath = key.includes('/') ? key.substring(0, key.lastIndexOf('/') + 1) : '';
        const size = object.size;
        const uploaded = object.uploaded.toISOString();
        const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
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
        statements.push(DB.prepare(`
            INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads, uploader_id, last_verified)
            VALUES (?, ?, ?, ?, ?, ?, FALSE, 0, NULL, ?)
            ON CONFLICT(key) DO UPDATE SET
                size = excluded.size,
                uploaded = excluded.uploaded,
                contentType = excluded.contentType,
                parent_path = excluded.parent_path,
                last_verified = excluded.last_verified
        `).bind(key, name, size, uploaded, contentType, parentPath, sessionId));
        processedCount++;
    }
    for (const dirPath of dirPaths) {
        const parts = dirPath.split('/').filter(p => p);
        const dirName = parts[parts.length - 1];
        const parentDir = parts.length > 1 ? parts.slice(0, parts.length - 1).join('/') + '/' : '';
        statements.push(DB.prepare(`
            INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads, last_verified)
            VALUES (?, ?, 0, ?, 'inode/directory', ?, TRUE, 0, ?)
            ON CONFLICT(key) DO UPDATE SET
                last_verified = excluded.last_verified
        `).bind(dirPath, dirName, new Date().toISOString(), parentDir, sessionId));
        newDirsCount++;
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
        cursor: list.truncated ? list.cursor : null,
        truncated: list.truncated,
        processed: processedCount,
        dirsProcessed: newDirsCount
    }), { status: 200, headers: addCorsHeaders() });
}
async function handleCleanup(DB, body, VECTORIZE) {
    const { sessionId } = body;
    if (!sessionId) {
        throw new Error('缺少 sessionId');
    }
    const filesToDeleteResult = await DB.prepare(`
        SELECT id, key FROM files 
        WHERE (last_verified IS NULL OR last_verified != ?) 
          AND is_link = FALSE 
          AND is_directory = FALSE
    `).bind(sessionId).all();
    const filesToDelete = filesToDeleteResult.results || [];
    const deleteStatements = [];
    const vectorIdsToDelete = [];
    for (const file of filesToDelete) {
        deleteStatements.push(DB.prepare('DELETE FROM files WHERE id = ?').bind(file.id));
        if (file.id) {
            vectorIdsToDelete.push(file.id.toString());
        }
    }
    const dirsToDeleteResult = await DB.prepare(`
        SELECT id, key FROM files 
        WHERE is_directory = TRUE 
          AND (last_verified IS NULL OR last_verified != ?)
          AND key NOT IN (
              SELECT DISTINCT parent_path 
              FROM files 
              WHERE parent_path IS NOT NULL 
                AND (last_verified = ? OR is_link = TRUE)
          )
    `).bind(sessionId, sessionId).all();
    const dirsToDelete = dirsToDeleteResult.results || [];
    for (const dir of dirsToDelete) {
        deleteStatements.push(DB.prepare('DELETE FROM files WHERE id = ?').bind(dir.id));
    }
    const BATCH_SIZE = 50;
    for (let i = 0; i < deleteStatements.length; i += BATCH_SIZE) {
        const chunk = deleteStatements.slice(i, i + BATCH_SIZE);
        if (chunk.length > 0) {
            await DB.batch(chunk);
        }
    }
    let deletedVectorsCount = 0;
    if (VECTORIZE && vectorIdsToDelete.length > 0) {
        try {
            for (let i = 0; i < vectorIdsToDelete.length; i += 100) {
                const batch = vectorIdsToDelete.slice(i, i + 100);
                await VECTORIZE.deleteByIds(batch);
                deletedVectorsCount += batch.length;
            }
        } catch (e) {
            console.error('清理向量索引失败:', e);
        }
    }
    try {
        await DB.prepare(`
            INSERT OR REPLACE INTO system_stats (id, total_files, total_size)
            SELECT 1, COUNT(*), COALESCE(SUM(size), 0) FROM files WHERE is_directory = FALSE
        `).run();
    } catch (e) {
        console.error('更新系统统计失败', e);
    }
    return new Response(JSON.stringify({
        success: true,
        message: '同步完成',
        deletedFiles: filesToDelete.length,
        deletedDirs: dirsToDelete.length,
        deletedVectors: deletedVectorsCount
    }), { status: 200, headers: addCorsHeaders() });
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}
