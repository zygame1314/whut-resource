function bigIntFromBase64url(b64url) {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    let result = 0n;
    for (let i = 0; i < bin.length; i++) {
        result = (result << 8n) | BigInt(bin.charCodeAt(i));
    }
    return result;
}
function bytesToBigInt(bytes) {
    let result = 0n;
    for (let i = 0; i < bytes.length; i++) {
        result = (result << 8n) | BigInt(bytes[i]);
    }
    return result;
}
function bigIntToBytes(n, length) {
    const bytes = new Uint8Array(length);
    for (let i = length - 1; i >= 0; i--) {
        bytes[i] = Number(n & 0xFFn);
        n >>= 8n;
    }
    return bytes;
}
function modPow(base, exp, mod) {
    let result = 1n;
    base = base % mod;
    while (exp > 0n) {
        if (exp & 1n) {
            result = (result * base) % mod;
        }
        exp >>= 1n;
        base = (base * base) % mod;
    }
    return result;
}
const LT_REGEX = /name=["']?lt["']?\s+value=["']?([^"']+)["']?/i;
const EXECUTION_REGEX = /name=["']?execution["']?\s+value=["']?([^"']+)["']?/i;
const EVENT_ID_REGEX = /name=["']?_eventId["']?\s+value=["']?([^"']+)["']?/i;
const NAME_REGEX = /id="user-btn-01"[\s\S]*?<span class="tit">\s*(.*?)\s*<\/span>/i;
const CARD_REGEX = /[?&]account_name=([0-9]+)/i;
const ERROR_REGEX = /<div id="msg".*?>(.*?)<\/div>/s;
const FETCH_TIMEOUT = 8000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;
async function retryAsync(fn, maxRetries = MAX_RETRIES, delayMs = RETRY_DELAY, label = "") {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn(attempt);
        } catch (e) {
            lastErr = e;
            if (attempt < maxRetries) {
                console.log(`[SSO] ${label} 第 ${attempt + 1} 次失败: ${e.message}, ${delayMs}ms 后重试...`);
                await new Promise(r => setTimeout(r, delayMs));
            }
        }
    }
    throw lastErr;
}
function parseAndMergeCookies(currentJar, newSetCookies) {
    const cookieMap = {};
    if (currentJar) {
        const pairs = currentJar.split(";");
        for (let i = 0; i < pairs.length; i++) {
            const eq = pairs[i].indexOf("=");
            if (eq > 0) {
                cookieMap[pairs[i].substring(0, eq).trim()] = pairs[i].substring(eq + 1).trim();
            }
        }
    }
    if (newSetCookies && newSetCookies.length > 0) {
        for (let i = 0; i < newSetCookies.length; i++) {
            const part = newSetCookies[i].split(";")[0];
            const eq = part.indexOf("=");
            if (eq > 0) {
                cookieMap[part.substring(0, eq).trim()] = part.substring(eq + 1).trim();
            }
        }
    }
    const keys = Object.keys(cookieMap);
    const parts = new Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
        parts[i] = `${keys[i]}=${cookieMap[keys[i]]}`;
    }
    return parts.join("; ");
}
export async function refreshSsoCaptcha(initialCookies) {
    const baseUrl = "https://zhlgd.whut.edu.cn/tpass";
    const loginUrl = `${baseUrl}/login`;
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
    const headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    };
    try {
        let cookieStr = initialCookies;
        if (!initialCookies) {
            const initResp = await retryAsync(async () => {
                return fetch(loginUrl, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
            }, MAX_RETRIES, RETRY_DELAY, "验证码页初始化");
            const setCookie = initResp.headers.get("set-cookie");
            if (setCookie) {
                const allCookies = initResp.headers.getSetCookie();
                cookieStr = (allCookies && allCookies.length > 0)
                    ? allCookies.map(c => c.split(";")[0]).join("; ")
                    : setCookie.split(";")[0];
            }
        }
        const captchaResp = await retryAsync(async () => {
            return fetch(`${baseUrl}/code`, {
                headers: { "User-Agent": UA, "Cookie": cookieStr, "Referer": loginUrl },
                signal: AbortSignal.timeout(FETCH_TIMEOUT)
            });
        }, MAX_RETRIES, RETRY_DELAY, "验证码获取");
        const arrayBuffer = await captchaResp.arrayBuffer();
        const base64Image = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        return {
            success: true,
            captchaImage: `data:image/jpeg;base64,${base64Image}`,
            cookies: cookieStr
        };
    } catch (e) {
        return { success: false, error: "获取验证码失败: " + e.message };
    }
}
export async function verifyWHUTCredentials(username, password, captchaCode = "", initialCookies = "") {
    const baseUrl = "https://zhlgd.whut.edu.cn/tpass";
    const loginUrl = `${baseUrl}/login`;
    const rsaUrl = `${baseUrl}/rsa?skipWechat=true`;
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
    const headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    };
    try {
        let cookieStr = initialCookies;
        let html = "";
        let lt = "";
        let execution = "e1s1";
        let eventId = "submit";
        if (!initialCookies) {
            const initResult = await retryAsync(async () => {
                const resp = await fetch(loginUrl, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
                const sc = resp.headers.get("set-cookie");
                const text = await resp.text();
                let cookies = "";
                if (sc) {
                    const all = resp.headers.getSetCookie();
                    cookies = (all && all.length > 0)
                        ? all.map(c => c.split(";")[0]).join("; ")
                        : sc.split(";")[0];
                }
                return { cookies, html: text };
            }, MAX_RETRIES, RETRY_DELAY, "登录页获取");
            cookieStr = initResult.cookies;
            html = initResult.html;
        } else {
            html = await retryAsync(async () => {
                const resp = await fetch(loginUrl, { headers: { ...headers, "Cookie": cookieStr }, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
                return resp.text();
            }, MAX_RETRIES, RETRY_DELAY, "登录页获取");
        }
        const ltMatch = html.match(LT_REGEX);
        if (!ltMatch) throw new Error("无法获取登录票据 (LT)");
        lt = ltMatch[1];
        const executionMatch = html.match(EXECUTION_REGEX);
        execution = executionMatch ? executionMatch[1] : "e1s1";
        const eventIdMatch = html.match(EVENT_ID_REGEX);
        eventId = eventIdMatch ? eventIdMatch[1] : "submit";
        console.log(`[SSO] LT: ${lt}, EXECUTION: ${execution}`);
        console.log(`[SSO] Cookies: ${cookieStr}`);
        const cleanHtmlForCaptcha = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "");
        const needsCaptcha = cleanHtmlForCaptcha.includes('id="codeImage"') || cleanHtmlForCaptcha.includes('/tpass/code');
        if (needsCaptcha && !captchaCode) {
            console.log("[SSO] Detected captcha required, but no code provided.");
            try {
                const captchaResp = await fetch(`${baseUrl}/code`, {
                    headers: { "User-Agent": UA, "Cookie": cookieStr, "Referer": loginUrl },
                    signal: AbortSignal.timeout(FETCH_TIMEOUT)
                });
                const arrayBuffer = await captchaResp.arrayBuffer();
                const base64Image = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                return {
                    success: false,
                    captchaRequired: true,
                    captchaImage: `data:image/jpeg;base64,${base64Image}`,
                    cookies: cookieStr,
                    error: "请输入验证码以继续"
                };
            } catch (e) {
                console.log("[SSO] Failed to fetch captcha image:", e.message);
            }
        }
        const rsaJson = await retryAsync(async () => {
            const resp = await fetch(rsaUrl, {
                method: "POST",
                headers: { "User-Agent": UA, "Cookie": cookieStr, "Referer": loginUrl },
                signal: AbortSignal.timeout(FETCH_TIMEOUT)
            });
            return resp.json();
        }, MAX_RETRIES, RETRY_DELAY, "RSA公钥获取");
        const publicKeyStr = rsaJson.publicKey;
        if (!publicKeyStr) throw new Error("获取公钥失败");
        const base64Key = publicKeyStr
            .replace(/-----BEGIN PUBLIC KEY-----/g, '')
            .replace(/-----END PUBLIC KEY-----/g, '')
            .replace(/\s/g, '');
        const binaryStr = atob(base64Key);
        const keyBytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            keyBytes[i] = binaryStr.charCodeAt(i);
        }
        const cryptoKey = await crypto.subtle.importKey(
            "spki",
            keyBytes.buffer,
            { name: "RSA-OAEP", hash: "SHA-1" },
            true,
            ["encrypt"]
        );
        const jwk = await crypto.subtle.exportKey("jwk", cryptoKey);
        const n = bigIntFromBase64url(jwk.n);
        const e = bigIntFromBase64url(jwk.e);
        const modulusB64 = jwk.n.replace(/-/g, '+').replace(/_/g, '/');
        const modulusLen = atob(modulusB64).length;
        const ul = rsaEncryptRaw(username, n, e, modulusLen);
        const pl = rsaEncryptRaw(password, n, e, modulusLen);
        const formBody = `un=&pd=&ul=${encodeURIComponent(ul)}&pl=${encodeURIComponent(pl)}&lt=${encodeURIComponent(lt)}&execution=${encodeURIComponent(execution)}&_eventId=${encodeURIComponent(eventId)}&code=${encodeURIComponent(captchaCode || "")}`;
        const loginResp = await retryAsync(async () => {
            return fetch(loginUrl, {
                method: "POST",
                headers: {
                    "User-Agent": UA,
                    "Cookie": cookieStr,
                    "Referer": loginUrl,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: formBody,
                redirect: "manual",
                signal: AbortSignal.timeout(FETCH_TIMEOUT)
            });
        }, MAX_RETRIES, RETRY_DELAY, "登录请求");
        console.log(`[SSO] Login Status: ${loginResp.status}`);
        const location = loginResp.headers.get("location");
        console.log(`[SSO] Location: ${location}`);
        if (loginResp.status === 302 || loginResp.status === 307) {
            let nickname = null;
            let cardId = null;
            try {
                const authCookieJar = parseAndMergeCookies(cookieStr, loginResp.headers.getSetCookie());
                const yktServiceUrl = "https://yktapp.whut.edu.cn/berserker-auth/cas/login/neusoftCas?targetUrl=https%3A%2F%2Fyktapp.whut.edu.cn%2Fplat-pc";
                const tpassCasUrl = `https://zhlgd.whut.edu.cn/tpass/login?service=${encodeURIComponent(yktServiceUrl)}`;
                let token = await retryAsync(async () => {
                    let currentUrl = tpassCasUrl;
                    let yktCookieJar = authCookieJar;
                    let t = "";
                    for (let i = 0; i < 10 && !t; i++) {
                        const resp = await fetch(currentUrl, {
                            method: "GET",
                            headers: { "User-Agent": UA, "Cookie": yktCookieJar },
                            redirect: "manual",
                            signal: AbortSignal.timeout(FETCH_TIMEOUT)
                        });
                        const newCookies = resp.headers.getSetCookie();
                        if (newCookies) {
                            yktCookieJar = parseAndMergeCookies(yktCookieJar, newCookies);
                            for (const c of newCookies) {
                                if (c.toLowerCase().includes("synjones-auth=")) {
                                    t = c.split(/synjones-auth=/i)[1].split(";")[0];
                                }
                            }
                        }
                        if (t) break;
                        const loc = resp.headers.get("location");
                        if (loc) {
                            try {
                                const locUrl = new URL(loc.startsWith("/") ? `https://${new URL(currentUrl).host}${loc}` : loc);
                                t = locUrl.searchParams.get("token") || locUrl.searchParams.get("synjones-auth") || "";
                            } catch (e) { }
                        }
                        if (t) break;
                        if (resp.status === 302 || resp.status === 301 || resp.status === 307) {
                            if (resp.body) await resp.body.cancel();
                            if (!loc) break;
                            currentUrl = loc.startsWith("/") ? `https://${new URL(currentUrl).host}${loc}` : loc;
                            continue;
                        }
                        const bodyText = await resp.text();
                        const tokenMatch = bodyText.match(/synjones-auth[=:]\s*["']?bearer\s+([^"'\s;]+)/i)
                            || bodyText.match(/token[=:]\s*["']?([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/i);
                        if (tokenMatch) t = tokenMatch[1];
                        break;
                    }
                    if (!t) throw new Error("CAS重定向链中未获取到token");
                    return t;
                }, MAX_RETRIES, RETRY_DELAY, "CAS重定向链");
                if (token) {
                    let yktData = null;
                    for (let retry = 0; retry < 3; retry++) {
                        try {
                            const yktUserResp = await fetch("https://yktapp.whut.edu.cn/berserker-base/user?synAccessSource=pc", {
                                method: "GET",
                                headers: {
                                    "User-Agent": UA,
                                    "synaccesssource": "pc",
                                    "synjones-auth": `bearer ${token}`
                                },
                                signal: AbortSignal.timeout(6000)
                            });
                            if (yktUserResp.status === 200) {
                                yktData = await yktUserResp.json();
                                if (yktData && yktData.data) break;
                            }
                        } catch (e) {
                            console.log(`[SSO] 个人信息抓取第 ${retry + 1} 次尝试失败: ${e.message}`);
                        }
                    }
                    if (yktData && yktData.data) {
                        const data = yktData.data;
                        const finalSno = data.sno || data.account;
                        if (finalSno) {
                            return {
                                success: true,
                                location: location,
                                nickname: data.name,
                                cardId: data.cardAccount,
                                sno: finalSno
                            };
                        }
                    }
                }
                throw new Error("未能从学校一卡通系统同步到信息（sno 缺失或服务超时）");
            } catch (err) {
                console.log("[SSO] 个人信息获取关键失败", err.message);
                return {
                    success: false,
                    error: "学校信息系统(一卡通)响应异常，请尝试刷新重试或联系管理员。",
                    debug: { msg: err.message }
                };
            }
        }
        const failureHtml = await loginResp.text();
        const errorMsgMatch = failureHtml.match(ERROR_REGEX);
        let errorDetail = errorMsgMatch ? errorMsgMatch[1].trim() : null;
        if (!errorDetail && failureHtml.includes("验证码有误")) {
            errorDetail = "验证码有误，请重新输入";
        }
        if (!errorDetail && failureHtml.includes('name="lt"')) {
            errorDetail = "用户名或密码错误，请检查后重试";
        }
        const res = {
            success: false,
            error: errorDetail || "SSO 登录失败",
            debug: {
                status: loginResp.status,
                location: location,
                cookies: cookieStr,
                bodySnippet: failureHtml.substring(0, 2000)
            }
        };
        if (failureHtml.includes('id="codeImage"') || failureHtml.includes('/tpass/code')) {
            res.captchaRequired = true;
            res.cookies = cookieStr;
            try {
                const captchaResp = await fetch(`${baseUrl}/code`, {
                    headers: { "User-Agent": UA, "Cookie": cookieStr, "Referer": loginUrl },
                    signal: AbortSignal.timeout(FETCH_TIMEOUT)
                });
                const arrayBuffer = await captchaResp.arrayBuffer();
                const base64Image = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                res.captchaImage = `data:image/jpeg;base64,${base64Image}`;
            } catch (e) {
                console.log("[SSO] Failed to re-fetch captcha image:", e.message);
            }
        }
        return res;
    } catch (e) {
        return { success: false, error: e.message };
    }
}
function rsaEncryptRaw(plaintext, n, e, keyLen) {
    const data = new TextEncoder().encode(plaintext);
    if (data.length > keyLen - 11) {
        throw new Error("数据过长，无法进行 PKCS1 v1.5 加密");
    }
    const padded = new Uint8Array(keyLen);
    padded[0] = 0x00;
    padded[1] = 0x02;
    const psLen = keyLen - data.length - 3;
    const ps = new Uint8Array(psLen);
    crypto.getRandomValues(ps);
    for (let i = 0; i < psLen; i++) {
        while (ps[i] === 0) {
            const tmp = new Uint8Array(1);
            crypto.getRandomValues(tmp);
            ps[i] = tmp[0];
        }
        padded[2 + i] = ps[i];
    }
    padded[2 + psLen] = 0x00;
    padded.set(data, 3 + psLen);
    const m = bytesToBigInt(padded);
    const c = modPow(m, e, n);
    const result = bigIntToBytes(c, keyLen);
    return btoa(String.fromCharCode(...result));
}
