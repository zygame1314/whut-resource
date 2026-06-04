const FAVICON_SOURCES = [
    (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
    (domain) => `https://icons.duckduckgo.com/ip3/${domain}.ico`,
];
const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
const CACHE_MAX_AGE = 86400;
function addCorsHeaders(headers = {}) {
    return new Headers({
        ...headers,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
}
function generateSvgFallback(domain) {
    const letter = domain.charAt(0).toUpperCase();
    return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#cccccc"/><text x="16" y="16" font-size="18" font-family="Arial,sans-serif" text-anchor="middle" dominant-baseline="central" fill="#666666">${letter}</text></svg>`;
}
export async function onRequest(context) {
    const { request } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: addCorsHeaders() });
    }
    const url = new URL(request.url);
    const domain = (url.searchParams.get('domain') || '').trim();
    if (!domain || !DOMAIN_REGEX.test(domain)) {
        return new Response(JSON.stringify({ success: false, error: '缺少或无效的 domain 参数' }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    let lastError = null;
    for (const sourceFn of FAVICON_SOURCES) {
        const sourceUrl = sourceFn(domain);
        try {
            const response = await fetch(sourceUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/*,*/*;q=0.8',
                },
                redirect: 'follow',
            });
            if (response.ok) {
                const contentType = response.headers.get('content-type') || 'image/x-icon';
                if (contentType.includes('text/html') || contentType.includes('application/json')) {
                    continue;
                }
                const body = await response.arrayBuffer();
                if (body.byteLength < 50) {
                    continue;
                }
                return new Response(body, {
                    status: 200,
                    headers: addCorsHeaders({
                        'Content-Type': contentType,
                        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
                    }),
                });
            }
        } catch (e) {
            lastError = e;
        }
    }
    return new Response(generateSvgFallback(domain), {
        status: 200,
        headers: addCorsHeaders({
            'Content-Type': 'image/svg+xml',
            'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
        }),
    });
}