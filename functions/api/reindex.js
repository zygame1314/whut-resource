import { verifyToken, addCorsHeaders, isSuperAdmin, generateEmbeddings, retryWithBackoff, recordVectorSyncFailure } from '../utils.js';
const BATCH_SIZE = 50;
export async function onRequestPost({ request, env }) {
    const authHeader = request.headers.get('Authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        user = await verifyToken(token, env.JWT_SECRET || 'secret');
    }
    if (!isSuperAdmin(user)) {
        return new Response(JSON.stringify({ success: false, error: '需要超级管理员权限' }), {
            status: 403,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    const DB = env.DB;
    const VECTORIZE = env.VECTORIZE;
    if (!DB || !VECTORIZE || !env.SILICONFLOW_API_KEY) {
        return new Response(JSON.stringify({ success: false, error: '服务器配置错误（缺少 DB/VECTORIZE/SILICONFLOW_API_KEY）' }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    try {
        const body = await request.json().catch(() => ({}));
        const action = body.action || 'reindex';
        if (action === 'retryFailed') {
            return await handleRetryFailed(env, DB, VECTORIZE);
        }
        if (action === 'clearFailures') {
            const cutoff = body.olderThanDays ? `AND created_at < datetime('now', '-${parseInt(body.olderThanDays)} days')` : '';
            const result = await DB.prepare(
                `DELETE FROM vector_sync_failures WHERE resolved = TRUE ${cutoff}`
            ).run();
            return new Response(JSON.stringify({
                success: true,
                message: `已清理已解决的失败记录`,
                deleted: result.meta?.changes || 0
            }), {
                status: 200,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const offset = parseInt(body.offset || '0');
        const forceRebuild = body.forceRebuild || false;
        const countResult = await DB.prepare('SELECT COUNT(*) as total FROM files').first();
        const totalFiles = countResult?.total || 0;
        if (totalFiles === 0) {
            return new Response(JSON.stringify({
                success: true,
                message: '没有文件需要索引',
                indexed: 0,
                total: 0,
                completed: true
            }), {
                status: 200,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const filesResult = await DB.prepare(
            'SELECT id, name, key, is_directory FROM files ORDER BY id LIMIT ? OFFSET ?'
        ).bind(BATCH_SIZE, offset).all();
        const files = filesResult.results || [];
        if (files.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                message: '索引完成',
                indexed: offset,
                total: totalFiles,
                completed: true
            }), {
                status: 200,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const textsToEmbed = files.map(f => f.key);
        const embeddings = await generateEmbeddings(env, textsToEmbed);
        if (!embeddings || embeddings.length !== files.length) {
            throw new Error('AI 嵌入生成失败或数量不匹配');
        }
        const vectors = files.map((file, index) => ({
            id: file.id.toString(),
            values: embeddings[index],
            metadata: {
                name: file.name,
                path: file.key
            }
        }));
        await VECTORIZE.upsert(vectors);
        const processedCount = offset + files.length;
        const isCompleted = processedCount >= totalFiles;
        return new Response(JSON.stringify({
            success: true,
            message: isCompleted ? '索引完成' : '批次处理完成，请继续调用以处理剩余文件',
            indexed: processedCount,
            total: totalFiles,
            completed: isCompleted,
            nextOffset: isCompleted ? null : processedCount
        }), {
            status: 200,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    } catch (error) {
        console.error('重建索引错误:', error);
        return new Response(JSON.stringify({
            success: false,
            error: '重建索引失败: ' + error.message
        }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
}
async function handleRetryFailed(env, DB, VECTORIZE) {
    const { results: failures } = await DB.prepare(
        'SELECT * FROM vector_sync_failures WHERE resolved = FALSE ORDER BY created_at ASC LIMIT 100'
    ).all();
    if (!failures || failures.length === 0) {
        return new Response(JSON.stringify({
            success: true,
            message: '没有待重试的失败记录',
            retried: 0,
            stillFailed: 0
        }), {
            status: 200,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    let retried = 0;
    let stillFailed = 0;
    for (const failure of failures) {
        try {
            if (failure.operation === 'delete') {
                await retryWithBackoff(async () => {
                    await VECTORIZE.deleteByIds([failure.file_id.toString()]);
                }, 2, 500);
                await DB.prepare(
                    'UPDATE vector_sync_failures SET resolved = TRUE, resolved_at = CURRENT_TIMESTAMP WHERE id = ?'
                ).bind(failure.id).run();
                retried++;
            } else if (failure.operation === 'create') {
                const fileRecord = await DB.prepare(
                    'SELECT id, name, key FROM files WHERE id = ?'
                ).bind(failure.file_id).first();
                if (!fileRecord) {
                    await DB.prepare(
                        'UPDATE vector_sync_failures SET resolved = TRUE, resolved_at = CURRENT_TIMESTAMP WHERE id = ?'
                    ).bind(failure.id).run();
                    retried++;
                    continue;
                }
                const embeddings = await retryWithBackoff(
                    () => generateEmbeddings(env, [fileRecord.key]), 2, 1000
                );
                if (embeddings?.[0]) {
                    await retryWithBackoff(async () => {
                        await VECTORIZE.upsert([{
                            id: fileRecord.id.toString(),
                            values: embeddings[0],
                            metadata: { name: fileRecord.name, path: fileRecord.key }
                        }]);
                    }, 2, 500);
                    await DB.prepare(
                        'UPDATE vector_sync_failures SET resolved = TRUE, resolved_at = CURRENT_TIMESTAMP WHERE id = ?'
                    ).bind(failure.id).run();
                    retried++;
                } else {
                    throw new Error('嵌入生成返回空结果');
                }
            }
        } catch (retryError) {
            console.error(`重试向量同步失败 (id=${failure.id}):`, retryError);
            await DB.prepare(
                'UPDATE vector_sync_failures SET retry_count = retry_count + 1, error_message = ? WHERE id = ?'
            ).bind(retryError.message, failure.id).run();
            stillFailed++;
        }
    }
    return new Response(JSON.stringify({
        success: true,
        message: `重试完成: ${retried} 个成功, ${stillFailed} 个仍然失败`,
        retried,
        stillFailed
    }), {
        status: 200,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
}
export async function onRequestGet({ request, env }) {
    const authHeader = request.headers.get('Authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        user = await verifyToken(token, env.JWT_SECRET || 'secret');
    }
    if (!isSuperAdmin(user)) {
        return new Response(JSON.stringify({ success: false, error: '需要超级管理员权限' }), {
            status: 403,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    const DB = env.DB;
    const VECTORIZE = env.VECTORIZE;
    if (!DB || !VECTORIZE) {
        return new Response(JSON.stringify({ success: false, error: '服务器配置错误' }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    try {
        const url = new URL(request.url);
        const action = url.searchParams.get('action');
        if (action === 'failures') {
            const { results: unresolvedFailures } = await DB.prepare(
                'SELECT * FROM vector_sync_failures WHERE resolved = FALSE ORDER BY created_at DESC LIMIT 200'
            ).all();
            const unresolvedCount = await DB.prepare(
                'SELECT COUNT(*) as count FROM vector_sync_failures WHERE resolved = FALSE'
            ).first();
            return new Response(JSON.stringify({
                success: true,
                unresolvedCount: unresolvedCount?.count || 0,
                failures: unresolvedFailures || []
            }), {
                status: 200,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const countResult = await DB.prepare('SELECT COUNT(*) as total FROM files').first();
        const totalFiles = countResult?.total || 0;
        const indexInfo = await VECTORIZE.describe();
        const unresolvedCount = await DB.prepare(
            'SELECT COUNT(*) as count FROM vector_sync_failures WHERE resolved = FALSE'
        ).first();
        return new Response(JSON.stringify({
            success: true,
            totalFiles: totalFiles,
            indexInfo: indexInfo,
            unresolvedSyncFailures: unresolvedCount?.count || 0
        }), {
            status: 200,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    } catch (error) {
        console.error('获取索引状态错误:', error);
        return new Response(JSON.stringify({
            success: false,
            error: '获取状态失败: ' + error.message
        }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}
