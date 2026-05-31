import { verifyToken, addCorsHeaders, isAdmin, logAdminAction } from '../utils.js';
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
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const DB = env.DB;
    if (!DB) {
        return new Response(JSON.stringify({
            success: false,
            error: '服务器配置错误'
        }), {
            status: 500,
            headers: addCorsHeaders({
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            })
        });
    }
    try {
        const result = await DB.prepare(
            'SELECT maintenance_mode, maintenance_msg FROM system_stats WHERE id = 1'
        ).first();
        let maintenanceMode = result?.maintenance_mode === 1 || result?.maintenance_mode === true;
        const realMaintenanceMode = maintenanceMode;
        const maintenanceMsg = result?.maintenance_msg || '系统正在进行升级维护，请稍候访问...';
        if (maintenanceMode && isAdmin(user)) {
            maintenanceMode = false;
        }
        return new Response(JSON.stringify({
            success: true,
            maintenance: maintenanceMode,
            real_maintenance: realMaintenanceMode,
            message: maintenanceMsg
        }), {
            status: 200,
            headers: addCorsHeaders({
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            })
        });
    } catch (error) {
        console.error('获取维护状态失败:', error);
        return new Response(JSON.stringify({
            success: false,
            error: '获取维护状态失败'
        }), {
            status: 500,
            headers: addCorsHeaders({
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            })
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
    if (!user) {
        return new Response(JSON.stringify({ success: false, error: '未授权' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const DB = env.DB;
    if (!DB) {
        return new Response(JSON.stringify({ success: false, error: '服务器配置错误' }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const fullUser = await DB.prepare('SELECT role FROM users WHERE id = ?').bind(user.id).first();
    if (!fullUser || fullUser.role !== 'super_admin') {
        return new Response(JSON.stringify({ success: false, error: '需要超级管理员权限' }), {
            status: 403,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    try {
        const body = await request.json();
        const { maintenance, message } = body;
        if (typeof maintenance !== 'boolean') {
            return new Response(JSON.stringify({ success: false, error: '参数 maintenance 必须为布尔值' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        if (message !== undefined) {
            await DB.prepare(
                'UPDATE system_stats SET maintenance_mode = ?, maintenance_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
            ).bind(maintenance ? 1 : 0, message).run();
        } else {
            await DB.prepare(
                'UPDATE system_stats SET maintenance_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
            ).bind(maintenance ? 1 : 0).run();
        }
        await logAdminAction(env, maintenance ? 'enable_maintenance' : 'disable_maintenance', 'system', 1, maintenance ? '开启维护' : '关闭维护', JSON.stringify({ message: message || null }));
        return new Response(JSON.stringify({
            success: true,
            message: maintenance ? '维护已开启' : '维护已关闭'
        }), {
            status: 200,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    } catch (error) {
        console.error('设置维护状态失败:', error);
        return new Response(JSON.stringify({ success: false, error: '设置维护状态失败' }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
}
export async function onRequestOptions() {
    return new Response(null, {
        headers: addCorsHeaders({})
    });
}
