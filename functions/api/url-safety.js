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
    const apiKey = env.GOOGLE_SAFE_BROWSING_API_KEY;
    if (!apiKey) {
        console.warn('未配置 GOOGLE_SAFE_BROWSING_API_KEY，跳过安全检测');
        return new Response(JSON.stringify({
            success: true,
            status: SafetyStatus.UNKNOWN,
            message: '安全检测服务未启用',
            threats: [],
        }), {
            status: 200,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
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
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Google Safe Browsing API 错误:', response.status, errorText);
            return new Response(JSON.stringify({
                success: true,
                status: SafetyStatus.UNKNOWN,
                message: '安全检测服务暂时不可用',
                threats: [],
            }), {
                status: 200,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
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
            return new Response(JSON.stringify({
                success: true,
                status: SafetyStatus.DANGEROUS,
                message: '该链接可能存在安全风险',
                threats: uniqueThreats,
            }), {
                status: 200,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        return new Response(JSON.stringify({
            success: true,
            status: SafetyStatus.SAFE,
            message: '未检测到已知威胁',
            threats: [],
        }), {
            status: 200,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    } catch (error) {
        console.error('URL 安全检测出错:', error);
        return new Response(JSON.stringify({
            success: true,
            status: SafetyStatus.UNKNOWN,
            message: '检测过程中发生错误',
            threats: [],
        }), {
            status: 200,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
}
