export async function onRequest(context) {
    // ⚠️ 极其危险的操作
    // 此接口会直接返回敏感的 SALT 环境变量
    // 请在使用后立即删除此文件！

    // 添加禁止缓存头，确保看到最新的
    const headers = {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0"
    };

    const salt = context.env.SALT || "环境变量未找到 (SALT is undefined)";

    return new Response(`当前的环境变量 SALT 值为:\n\n${salt}\n\n⚠️ 请在获取后立即删除此文件！`, {
        headers
    });
}
