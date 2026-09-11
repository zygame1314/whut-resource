import { processWithAIAgent } from '../functions/api/guestbook-ai.js';
import { runFileTask, recordFileTaskFailure, runMaintenanceJob, MAINTENANCE_JOB_TYPE } from '../functions/utils.js';

export default {
    async queue(batch, env, ctx) {
        for (const msg of batch.messages) {
            const payload = msg.body;
            if (!payload) {
                msg.retry();
                continue;
            }
            if (payload.type === MAINTENANCE_JOB_TYPE) {
                try {
                    await runMaintenanceJob(env, payload.jobId);
                    msg.ack();
                } catch (err) {
                    console.error('维护任务队列消费失败:', err);
                    await recordFileTaskFailure(env, { op: MAINTENANCE_JOB_TYPE, jobId: payload.jobId }, err?.message || err);
                    msg.retry();
                }
                continue;
            }
            if (payload.type === 'file') {
                try {
                    await runFileTask(env, payload);
                    msg.ack();
                } catch (err) {
                    console.error('文件任务队列消费失败:', err);
                    await recordFileTaskFailure(env, payload, err?.message || err);
                    msg.retry();
                }
                continue;
            }
            const { guestbookId, adminTriggered } = payload;
            if (!guestbookId) {
                msg.retry();
                continue;
            }
            try {
                const entry = await env.DB.prepare(
                    'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
                ).bind(guestbookId).first();
                if (!entry) {
                    msg.ack();
                    continue;
                }

                const aiResult = await processWithAIAgent(entry, env);
                if (aiResult && aiResult.success &&
                    (aiResult.action === 'no_action' || aiResult.action === 'keep_pending' || aiResult.action === 'resolve')) {
                    if (adminTriggered) {
                        await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ? AND is_hidden = 1').bind(guestbookId).run();
                        const fresh = await env.DB.prepare(
                            'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
                        ).bind(guestbookId).first();
                        const { broadcastGuestbookUpdate } = await import('../functions/utils.js');
                        await broadcastGuestbookUpdate(env, guestbookId, 'new_message', { message: fresh });
                    } else {
                        await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ?').bind(guestbookId).run();
                        const fresh = await env.DB.prepare(
                            'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
                        ).bind(guestbookId).first();
                        const { broadcastGuestbookUpdate } = await import('../functions/utils.js');
                        await broadcastGuestbookUpdate(env, guestbookId, 'new_message', { message: fresh });
                    }
                } else if (aiResult && aiResult.success &&
                    (aiResult.action === 'search_no_results' || aiResult.action === 'search_completed')) {
                    await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ?').bind(guestbookId).run();
                    const fresh = await env.DB.prepare(
                        'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
                    ).bind(guestbookId).first();
                    const { broadcastGuestbookUpdate } = await import('../functions/utils.js');
                    if (fresh) await broadcastGuestbookUpdate(env, guestbookId, 'new_message', { message: fresh });
                }
                msg.ack();
            } catch (err) {
                console.error('AI 队列消费失败:', err);
                msg.retry();
            }
        }
    }
};
