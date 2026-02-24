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
const SPA_PRESETS = [
    {
        pattern: /bilibili\.com/,
        title: '哔哩哔哩 (bilibili)',
        description: '哔哩哔哩 (bilibili.com) 是国内知名的视频弹幕网站，这里有及时的动漫新番，活跃的ACG氛围，有创意的Up主。'
    },
    {
        pattern: /123pan\.com/,
        title: '123云盘',
        description: '123云盘为您提供高速、安全、稳定的网盘存储服务。'
    },
    {
        pattern: /douyin\.com/,
        title: '抖音',
        description: '抖音-记录美好生活'
    },
    {
        pattern: /kdocs\.cn/,
        title: '金山文档 | WPS云文档',
        description: '金山文档是一款可多人实时协作编辑的在线文档，修改后自动保存，无需转换格式，支持多人在线协作编辑文档和表格。'
    },
    {
        pattern: /docs\.qq\.com/,
        title: '腾讯文档',
        description: '腾讯文档是一款可多人协作的在线文档，支持Word、Excel和PPT类型，支持多人实时编辑、批注和修订。'
    },
    {
        pattern: /shimo\.im/,
        title: '石墨文档',
        description: '石墨文档，全新一代云端 Office，支持多人在线协作编辑文档和表格。'
    },
    {
        pattern: /yuque\.com/,
        title: '语雀',
        description: '语雀，专业的云端知识库，面向个人和团队，提供构建知识体系的全新方式。'
    },
    {
        pattern: /pan\.baidu\.com/,
        title: '百度网盘',
        description: '百度网盘为您提供文件的网络备份、同步和分享服务。空间大、速度快、安全稳固。'
    },
    {
        pattern: /pan\.quark\.cn/,
        title: '夸克网盘',
        description: '夸克网盘是夸克推出的云端存储服务，覆盖手机、PC、iPad三端，致力于为用户提供高效、智能、安全的数据存储与处理服务。'
    },
    {
        pattern: /lanzou.\.com/,
        title: '蓝奏云',
        description: '蓝奏云网盘，不限速，支持云存储、云分享。'
    },
    {
        pattern: /feishu\.cn/,
        title: '飞书',
        description: '飞书是字节跳动旗下先进企业协作与管理平台，一站式整合即时沟通、日历、音视频会议、云文档、云盘、工作台等功能。'
    },
    {
        pattern: /alipan\.com/,
        title: '阿里云盘',
        description: '阿里云盘是一款速度快、不打扰、够安全、易于分享的网盘。'
    },
    {
        pattern: /xiaohongshu\.com/,
        title: '小红书',
        description: '小红书 - 你的生活兴趣社区。'
    }
];
async function fetchPageInfo(url, externalSignal = null) {
    try {
        try {
            const urlObj = new URL(url);
            const preset = SPA_PRESETS.find(p => p.pattern.test(urlObj.hostname));
            if (preset) {
                return {
                    title: preset.title,
                    description: preset.description,
                    favicon: `https://favicon.im/${urlObj.hostname}`
                };
            }
        } catch (e) {
            console.warn('预置列表匹配出错:', e);
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        if (externalSignal) {
            externalSignal.addEventListener('abort', () => controller.abort());
        }
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"'
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
        const urlObj = new URL(url);
        const origin = urlObj.origin;
        const info = {
            title: null,
            description: null,
            iconHref: null,
            ogTitle: null,
            ogDesc: null
        };
        const rewriter = new HTMLRewriter()
            .on('title', {
                text(text) {
                    if (!info.title) info.title = '';
                    info.title += text.text;
                }
            })
            .on('meta[property="og:title"]', {
                element(element) {
                    const content = element.getAttribute('content');
                    if (content) info.ogTitle = content;
                }
            })
            .on('meta[name="description"]', {
                element(element) {
                    const content = element.getAttribute('content');
                    if (content) info.description = content;
                }
            })
            .on('meta[property="og:description"]', {
                element(element) {
                    const content = element.getAttribute('content');
                    if (content) info.ogDesc = content;
                }
            })
            .on('link[rel="icon"], link[rel="shortcut icon"]', {
                element(element) {
                    const href = element.getAttribute('href');
                    if (href && !info.iconHref) info.iconHref = href;
                }
            });
        await rewriter.transform(response).text();
        let title = info.title || info.ogTitle;
        if (title) {
            title = title.trim();
            if (title.length > 100) title = title.substring(0, 100) + '...';
        }
        let description = info.description || info.ogDesc;
        if (description) {
            description = description.trim();
            if (description.length > 200) description = description.substring(0, 200) + '...';
        }
        let favicon = `https://favicon.im/${urlObj.hostname}?fallback=https://resource.haoli.site/favicon.png`;
        if (info.iconHref) {
            try {
                favicon = new URL(info.iconHref, urlObj.href).href;
            } catch (e) { }
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
    const abortController = new AbortController();
    const safetyPromise = checkUrlSafety(url, env);
    const pageInfoPromise = fetchPageInfo(url, abortController.signal);
    safetyPromise.then(result => {
        if (result.status === 'dangerous') {
            abortController.abort();
        }
    });
    const [safetyResult, pageInfo] = await Promise.all([
        safetyPromise,
        pageInfoPromise.catch(() => null)
    ]);
    return new Response(JSON.stringify({
        success: true,
        ...safetyResult,
        pageInfo: safetyResult.status === 'dangerous' ? null : pageInfo,
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
