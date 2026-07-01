async function verifyToken(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [encodedHeader, encodedPayload, encodedSignature] = parts;
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["verify"]
        );
        const signature = Uint8Array.from(atob(encodedSignature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        const isValid = await crypto.subtle.verify(
            "HMAC",
            key,
            signature,
            new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
        );
        if (!isValid) return null;
        const payload = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/")));
        if (payload.exp && Date.now() > payload.exp) return null;
        return payload;
    } catch (e) {
        return null;
    }
}
export class DownloadLogger {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.onlineCount = null;
    }
    async fetch(request) {
        const url = new URL(request.url);
        this._ensureCounter();
        if (request.headers.get("Upgrade") === "websocket") {
            const token = url.searchParams.get('token');
            if (!token) {
                return new Response('未授权：缺少认证令牌', { status: 401 });
            }
            const jwtSecret = this.env.JWT_SECRET || 'secret';
            const user = await verifyToken(token, jwtSecret);
            if (!user) {
                return new Response('未授权：无效或过期的令牌', { status: 401 });
            }
            const dbUser = await this.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(user.id).first();
            if (!dbUser) {
                return new Response('未授权：用户不存在', { status: 401 });
            }
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);
            this.state.acceptWebSocket(server, ['user:' + user.id]);
            this.state.setWebSocketAutoResponse(
                new WebSocketRequestResponsePair(
                    JSON.stringify({ type: 'ping' }),
                    JSON.stringify({ type: 'pong' })
                )
            );
            this.onlineCount++;
            server.send(JSON.stringify({ type: 'welcome', message: '已成功连接到实时下载日志' }));
            server.send(JSON.stringify({ type: 'online_count', count: this.onlineCount }));
            this.broadcast({ type: 'online_count', count: this.onlineCount });
            return new Response(null, { status: 101, webSocket: client });
        }
        if (url.pathname === "/broadcast" && request.method === "POST") {
            const data = await request.json();
            this.broadcast(data);
            return new Response("OK", { status: 200 });
        }
        if (url.pathname === "/stats" && request.method === "GET") {
            return new Response(JSON.stringify({ online: this.onlineCount }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }
        return new Response("未找到", { status: 404 });
    }
    _ensureCounter() {
        if (this.onlineCount === null) {
            this.onlineCount = this.state.getWebSockets().length;
        }
    }
    broadcast(data) {
        if (data && data.type === 'notification' && data.target_user_id != null) {
            const tag = 'user:' + data.target_user_id;
            const msg = JSON.stringify(data);
            const targets = this.state.getWebSockets(tag);
            for (const ws of targets) {
                try { ws.send(msg); } catch (err) { ws.close(); }
            }
            return;
        }
        const msg = JSON.stringify(data);
        for (const ws of this.state.getWebSockets()) {
            try {
                ws.send(msg);
            } catch (err) {
                ws.close();
            }
        }
    }
    async webSocketMessage(ws, message) {
        try {
            const data = JSON.parse(message);
            if (data.type === 'disconnect') {
                ws.close(1000, 'client');
            }
        } catch (e) {}
    }
    async webSocketClose(ws, code, reason, wasClean) {
        this._ensureCounter();
        this.onlineCount = Math.max(0, this.onlineCount - 1);
        this.broadcast({ type: 'online_count', count: this.onlineCount });
    }
    async webSocketError(ws, error) {
        this._ensureCounter();
        this.onlineCount = Math.max(0, this.onlineCount - 1);
        this.broadcast({ type: 'online_count', count: this.onlineCount });
    }
}
export default {
    async fetch(request, env) {
        return new Response("该 Worker 仅用于 Durable Objects。", { status: 404 });
    }
};
