export async function onRequest(context) {
    const { request, env } = context;
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response("需要 WebSocket 升级连接", { status: 426 });
    }
    const id = env.DOWNLOAD_LOGGER.idFromName("global");
    const stub = env.DOWNLOAD_LOGGER.get(id);
    return stub.fetch(request);
}
