export class DownloadLogger {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.sessions = [];
    }
    async fetch(request) {
        const url = new URL(request.url);
        if (request.headers.get("Upgrade") === "websocket") {
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);
            await this.handleSession(server);
            return new Response(null, { status: 101, webSocket: client });
        }
        if (url.pathname === "/broadcast" && request.method === "POST") {
            const data = await request.json();
            this.broadcast(data);
            return new Response("OK", { status: 200 });
        }
        return new Response("未找到", { status: 404 });
    }
    async handleSession(webSocket) {
        webSocket.accept();
        this.sessions.push(webSocket);
        webSocket.send(JSON.stringify({ type: 'welcome', message: '已连接到实时下载日志' }));
        webSocket.addEventListener("close", async () => {
            this.sessions = this.sessions.filter((session) => session !== webSocket);
        });
    }
    broadcast(data) {
        this.sessions = this.sessions.filter(session => {
            try {
                session.send(JSON.stringify(data));
                return true;
            } catch (err) {
                return false;
            }
        });
    }
}
export default {
    async fetch(request, env) {
        return new Response("该 Worker 仅用于 Durable Objects。", { status: 404 });
    }
};
