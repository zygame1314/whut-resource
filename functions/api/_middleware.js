import { verifyToken, isAdmin, addCorsHeaders } from '../utils.js';
const MAINTENANCE_CACHE_TTL = 60000;
let maintenanceCache = { status: null, lastChecked: 0 };
export function invalidateMaintenanceCache() {
    maintenanceCache.status = null;
    maintenanceCache.lastChecked = 0;
}
export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
        return next();
    }
    if (url.pathname.startsWith('/api/maintenance') || url.pathname.startsWith('/api/auth') || url.pathname.startsWith('/api/pow') || url.pathname.startsWith('/api/site-stats') || url.pathname.startsWith('/api/oauth')) {
        return next();
    }
    try {
        const DB = env.DB;
        if (!DB) return next();
        let status;
        const now = Date.now();
        if (maintenanceCache.status && (now - maintenanceCache.lastChecked < MAINTENANCE_CACHE_TTL)) {
            status = maintenanceCache.status;
        } else {
            status = await DB.prepare('SELECT maintenance_mode, maintenance_msg FROM system_stats WHERE id = 1').first();
            maintenanceCache.status = status;
            maintenanceCache.lastChecked = now;
        }
        const isMaintenance = status?.maintenance_mode === 1 || status?.maintenance_mode === true;
        if (isMaintenance) {
            let token = null;
            const authHeader = request.headers.get('Authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }
            if (!token) {
                token = url.searchParams.get('token');
            }
            if (token) {
                try {
                    const user = await verifyToken(token, env.JWT_SECRET || 'secret');
                    if (isAdmin(user)) {
                        return next();
                    }
                } catch (e) {
                }
            }
            return new Response(JSON.stringify({
                success: false,
                error: '系统维护中',
                maintenance: true,
                message: status.maintenance_msg || '系统正在维护中...'
            }), {
                status: 503,
                headers: addCorsHeaders({
                    'Content-Type': 'application/json'
                })
            });
        }
    } catch (err) {
        console.error('Middleware maintenance check error:', err);
    }
    return next();
}