import { processWithAIAgent } from '../functions/api/guestbook-ai.js';

export default {
    async queue(batch, env, ctx) {
        for (const msg of batch.messages) {
            const payload = msg.body;
            const { guestbookId } = payload || {};
            if (!guestbookId) {
                msg.retry();
                continue;
            }
            try {
                const entry = await env.DB.prepare(
                    'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
                ).bind(guestbookId).first();
                if (!entry) continue;

                const aiResult = await processWithAIAgent(entry, env, true);
                if (aiResult && aiResult.success &&
                    (aiResult.action === 'no_action' || aiResult.action === 'keep_pending' || aiResult.action === 'resolve')) {
                    await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ?').bind(guestbookId).run();
                    const fresh = await env.DB.prepare(
                        'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
                    ).bind(guestbookId).first();
                    const { broadcastGuestbookUpdate } = await import('../functions/utils.js');
                    await broadcastGuestbookUpdate(env, guestbookId, 'new_message', { message: fresh });
                }
            } catch (err) {
                console.error('AI 队列消费失败:', err);
                msg.retry();
            }
        }
    }
};
