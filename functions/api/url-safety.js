const addCorsHeaders = (headers = {}) => {
    return {
        ...headers,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
};
const SafetyStatus = {
    SAFE: 'safe',
    DANGEROUS: 'dangerous',
    UNKNOWN: 'unknown',
};
const ThreatTypeLabels = {
    'MALWARE': '恶意软件',
    'SOCIAL_ENGINEERING': '钓鱼/欺诈网站',
    'UNWANTED_SOFTWARE': '不受欢迎的软件',
    'POTENTIALLY_HARMFUL_APPLICATION': '潜在有害应用',
    'THREAT_TYPE_UNSPECIFIED': '未知威胁',
};
async function fetchPageInfo(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            },
            signal: controller.signal,
            redirect: 'follow',
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            return null;
        }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) {
            return { title: null, description: null, favicon: null, contentType: contentType.split(';')[0] };
        }
        const html = await response.text();
        const urlObj = new URL(url);
        const origin = urlObj.origin;
        let title = null;
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
            html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
            html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
        if (titleMatch) {
            title = titleMatch[1].trim()
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/\s+/g, ' ');
            if (title.length > 100) title = title.substring(0, 100) + '...';
        }
        let description = null;
        const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
            html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i) ||
            html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
            html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i);
        if (descMatch) {
            description = descMatch[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            if (description.length > 200) description = description.substring(0, 200) + '...';
        }
        let favicon = null;
        const iconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) ||
            html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i) ||
            html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i);
        if (iconMatch) {
            favicon = iconMatch[1];
            if (favicon.startsWith('//')) {
                favicon = 'https:' + favicon;
            } else if (favicon.startsWith('/')) {
                favicon = origin + favicon;
            } else if (!favicon.startsWith('http')) {
                favicon = origin + '/' + favicon;
            }
        } else {
            favicon = origin + '/favicon.ico';
        }
        return { title, description, favicon };
    } catch (e) {
        console.warn('抓取页面信息失败:', e.message);
        return null;
    }
}
export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: addCorsHeaders(),
        });
    }
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({
            success: false,
            error: '方法不允许，请使用 POST'
        }), {
            status: 405,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({
            success: false,
            error: '请求体格式错误'
        }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    const { url } = body;
    if (!url || typeof url !== 'string') {
        return new Response(JSON.stringify({
            success: false,
            error: '缺少 url 参数'
        }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    try {
        new URL(url);
    } catch (e) {
        return new Response(JSON.stringify({
            success: false,
            error: '无效的 URL 格式'
        }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    const [safetyResult, pageInfo] = await Promise.all([
        checkUrlSafety(url, env),
        fetchPageInfo(url)
    ]);
    return new Response(JSON.stringify({
        success: true,
        ...safetyResult,
        pageInfo: pageInfo,
    }), {
        status: 200,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
}
async function checkUrlSafety(url, env) {
    const apiKey = env.GOOGLE_SAFE_BROWSING_API_KEY;
    if (!apiKey) {
        return {
            status: SafetyStatus.UNKNOWN,
            message: '安全检测服务未启用',
            threats: [],
        };
    }
    try {
        const safeBrowsingUrl = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;
        const requestBody = {
            client: {
                clientId: 'whut-resource',
                clientVersion: '1.0.0'
            },
            threatInfo: {
                threatTypes: [
                    'MALWARE',
                    'SOCIAL_ENGINEERING',
                    'UNWANTED_SOFTWARE',
                    'POTENTIALLY_HARMFUL_APPLICATION'
                ],
                platformTypes: ['ANY_PLATFORM'],
                threatEntryTypes: ['URL'],
                threatEntries: [{ url: url }]
            }
        };
        const response = await fetch(safeBrowsingUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
            return {
                status: SafetyStatus.UNKNOWN,
                message: '安全检测服务暂时不可用',
                threats: [],
            };
        }
        const result = await response.json();
        if (result.matches && result.matches.length > 0) {
            const threats = result.matches.map(match => ({
                type: match.threatType,
                label: ThreatTypeLabels[match.threatType] || match.threatType,
            }));
            const uniqueThreats = Array.from(
                new Map(threats.map(t => [t.type, t])).values()
            );
            return {
                status: SafetyStatus.DANGEROUS,
                message: '该链接可能存在安全风险',
                threats: uniqueThreats,
            };
        }
        return {
            status: SafetyStatus.SAFE,
            message: '未检测到已知威胁',
            threats: [],
        };
    } catch (error) {
        console.error('URL 安全检测出错:', error);
        return {
            status: SafetyStatus.UNKNOWN,
            message: '检测过程中发生错误',
            threats: [],
        };
    }
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}
