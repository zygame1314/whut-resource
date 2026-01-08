
export async function onRequest(context) {
    const { request, env } = context;
    const upgradeHeader = request.headers.get("Upgrade");

    if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    // Get the ID for the "global" Durable Object.
    // Using a single ID ("global") ensures all users connect to the same instance
    // and see the same download log.
    const id = env.DOWNLOAD_LOGGER.idFromName("global");

    // Get the Durable Object stub
    const stub = env.DOWNLOAD_LOGGER.get(id);

    // Forward the request to the Durable Object
    return stub.fetch(request);
}
