import { verifyToken, addCorsHeaders, isSuperAdmin } from '../utils.js';
export async function onRequestPost({ request, env }) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ success: false, error: '未授权' }), { status: 401, headers: addCorsHeaders() });
    }
    const token = authHeader.substring(7);
    const user = await verifyToken(token, env.JWT_SECRET || 'secret');
    if (!isSuperAdmin(user)) {
        return new Response(JSON.stringify({ success: false, error: '需要根管理员权限' }), { status: 403, headers: addCorsHeaders() });
    }
    const R2 = env.R2_bucket;
    const DB = env.DB;
    const VECTORIZE = env.VECTORIZE;
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
        const { results: existingFiles } = await DB.prepare(
            'SELECT id, key, size, uploaded, is_directory, is_link FROM files'
        ).all();
        const existingMap = new Map();
        for (const file of existingFiles) {
            existingMap.set(file.key, {
                id: file.id,
                size: file.size,
                uploaded: file.uploaded,
                is_directory: file.is_directory,
                is_link: file.is_link
            });
        }
        const { results: linkResults } = await DB.prepare('SELECT key, parent_path FROM files WHERE is_link = TRUE').all();
        const validKeys = new Set();
        const dirPaths = new Set();
        let totalSystemFiles = 0;
        let totalSystemSize = 0;
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
        const statements = [];
        let insertedFiles = 0;
        let updatedFiles = 0;
        let skippedFiles = 0;
        for (const object of allR2Objects) {
            const key = object.key;
            if (key.endsWith('/')) continue;
            totalSystemFiles++;
            totalSystemSize += object.size;
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
            const existing = existingMap.get(key);
            if (existing) {
                if (existing.size === size) {
                    skippedFiles++;
                    continue;
                }
                statements.push(DB.prepare(
                    `UPDATE files SET size=?, uploaded=?, contentType=?, parent_path=? WHERE key=?`
                ).bind(size, uploaded, contentType, parentPath, key));
                updatedFiles++;
            } else {
                statements.push(DB.prepare(
                    `INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads, uploader_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).bind(key, name, size, uploaded, contentType, parentPath, false, 0, user.id));
                insertedFiles++;
            }
        }
        let insertedDirs = 0;
        for (const dirPath of dirPaths) {
            validKeys.add(dirPath);
            if (existingMap.has(dirPath)) {
                continue;
            }
            const parts = dirPath.split('/').filter(p => p);
            const dirName = parts[parts.length - 1];
            const parentDir = parts.length > 1 ? parts.slice(0, parts.length - 1).join('/') + '/' : '';
            statements.push(DB.prepare(
                `INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(dirPath, dirName, 0, new Date().toISOString(), 'inode/directory', parentDir, true, 0));
            insertedDirs++;
        }
        const filesToDelete = existingFiles.filter(r => !r.is_link && !validKeys.has(r.key));
        const vectorIdsToDelete = [];
        for (const file of filesToDelete) {
            statements.push(DB.prepare('DELETE FROM files WHERE key = ?').bind(file.key));
            if (file.id) {
                vectorIdsToDelete.push(file.id.toString());
            }
        }
        const BATCH_SIZE = 50;
        for (let i = 0; i < statements.length; i += BATCH_SIZE) {
            const chunk = statements.slice(i, i + BATCH_SIZE);
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
                console.log(`已清理 ${deletedVectorsCount} 个无效向量索引`);
            } catch (e) {
                console.error('清理向量索引失败:', e);
            }
        }
        await DB.prepare(`
            INSERT INTO system_stats (id, total_files, total_size) VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
            total_files = excluded.total_files,
            total_size = excluded.total_size
        `).bind(totalSystemFiles, totalSystemSize).run();
        return new Response(JSON.stringify({
            success: true,
            message: `增量同步完成。新增: ${insertedFiles}, 更新: ${updatedFiles}, 跳过: ${skippedFiles}, 新目录: ${insertedDirs}, 删除: ${filesToDelete.length}`,
            syncedStats: {
                r2Objects: allR2Objects.length,
                files: totalSystemFiles,
                dirs: dirPaths.size,
                links: linkResults.length,
                inserted: insertedFiles,
                updated: updatedFiles,
                skipped: skippedFiles,
                insertedDirs: insertedDirs,
                deleted: filesToDelete.length,
                deletedVectors: deletedVectorsCount,
                totalSize: totalSystemSize,
                totalOperations: statements.length
            }
        }), { status: 200, headers: addCorsHeaders() });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message, stack: e.stack }), { status: 500, headers: addCorsHeaders() });
    }
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}
