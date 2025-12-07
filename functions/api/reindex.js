import { verifyToken, addCorsHeaders } from '../utils.js';
async function generateEmbedding(text, env) {
    try {
        if (!env.AI) return null;
        const response = await env.AI.run('@cf/baai/bge-m3', { text: [text] });
        return response.data[0];
    } catch (e) {
        console.error('嵌入生成失败:', e);
        return null;
    }
}
export async function onRequestGet({ request, env }) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    try {
        const user = await verifyToken(request, env);
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ success: false, error: '未授权' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
        if (!env.AI || !env.VECTORIZE) {
            return new Response(JSON.stringify({ success: false, error: 'AI或Vectorize未配置' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
        const { results } = await env.DB.prepare('SELECT id, name, is_link FROM files ORDER BY id DESC LIMIT 500').all();
        let successCount = 0;
        let failCount = 0;
        const vectors = [];
        for (const file of results) {
            const text = file.name;
            const vector = await generateEmbedding(text, env);
            if (vector) {
                vectors.push({
                    id: file.id.toString(),
                    values: vector,
                    metadata: { type: file.is_link ? 'link' : 'file' }
                });
                successCount++;
            } else {
                failCount++;
            }
        }
        if (vectors.length > 0) {
            await env.VECTORIZE.upsert(vectors);
        }
        return new Response(JSON.stringify({
            success: true,
            processed: results.length,
            indexed: successCount,
            failed: failCount
        }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
}
export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
