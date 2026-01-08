export class DownloadLogger {
    constructor(state, env) {
        this.state = state;
        this.env = env;
    }
    async fetch(request) {
        const url = new URL(request.url);
        if (request.headers.get("Upgrade") === "websocket") {
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);
            this.state.acceptWebSocket(server);
            server.send(JSON.stringify({ type: 'welcome', message: '已连接到实时下载日志' }));
            return new Response(null, { status: 101, webSocket: client });
        }
        if (url.pathname === "/broadcast" && request.method === "POST") {
            const data = await request.json();
            this.broadcast(data);
            return new Response("OK", { status: 200 });
        }
        return new Response("未找到", { status: 404 });
    }
    broadcast(data) {
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
    }
    async webSocketClose(ws, code, reason, wasClean) {
    }
    async webSocketError(ws, error) {
    }
}
export default {
    async fetch(request, env) {
        return new Response("该 Worker 仅用于 Durable Objects。", { status: 404 });
    }
};
