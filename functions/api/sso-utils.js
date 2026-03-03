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
export async function verifyWHUTCredentials(username, password) {
    const baseUrl = "https://zhlgd.whut.edu.cn/tpass";
    const loginUrl = `${baseUrl}/login`;
    const rsaUrl = `${baseUrl}/rsa?skipWechat=true`;
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
    const headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    };
    try {
        const initResp = await fetch(loginUrl, { headers });
        const setCookie = initResp.headers.get("set-cookie");
        const html = await initResp.text();
        const ltMatch = html.match(LT_REGEX);
        if (!ltMatch) throw new Error("无法获取登录票据 (LT)");
        const lt = ltMatch[1];
        const executionMatch = html.match(EXECUTION_REGEX);
        const execution = executionMatch ? executionMatch[1] : "e1s1";
        const eventIdMatch = html.match(EVENT_ID_REGEX);
        const eventId = eventIdMatch ? eventIdMatch[1] : "submit";
        let cookieStr = "";
        if (setCookie) {
            const allCookies = initResp.headers.getSetCookie();
            cookieStr = (allCookies && allCookies.length > 0)
                ? allCookies.map(c => c.split(";")[0]).join("; ")
                : setCookie.split(";")[0];
        }
        console.log(`[SSO] LT: ${lt}, EXECUTION: ${execution}`);
        console.log(`[SSO] Cookies: ${cookieStr}`);
        const rsaResp = await fetch(rsaUrl, {
            method: "POST",
            headers: { "User-Agent": UA, "Cookie": cookieStr, "Referer": loginUrl }
        });
        const rsaJson = await rsaResp.json();
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
        const formBody = `un=&pd=&ul=${encodeURIComponent(ul)}&pl=${encodeURIComponent(pl)}&lt=${encodeURIComponent(lt)}&execution=${encodeURIComponent(execution)}&_eventId=${encodeURIComponent(eventId)}`;
        const loginResp = await fetch(loginUrl, {
            method: "POST",
            headers: {
                "User-Agent": UA,
                "Cookie": cookieStr,
                "Referer": loginUrl,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: formBody,
            redirect: "manual"
        });
        console.log(`[SSO] Login Status: ${loginResp.status}`);
        const location = loginResp.headers.get("location");
        console.log(`[SSO] Location: ${location}`);
        if (loginResp.status === 302 || loginResp.status === 307) {
            let nickname = null;
            let cardId = null;
            let realStudentId = null;
            try {
                const authCookieJar = parseAndMergeCookies(cookieStr, loginResp.headers.getSetCookie());
                const portalTask = (async () => {
                    try {
                        let cookieJar = authCookieJar;
                        let currentUrl = location;
                        let portalHtml = "";
                        for (let i = 0; i < 10; i++) {
                            const resp = await fetch(currentUrl, {
                                headers: { "User-Agent": UA, "Cookie": cookieJar },
                                redirect: "manual"
                            });
                            cookieJar = parseAndMergeCookies(cookieJar, resp.headers.getSetCookie());
                            if (resp.status === 302 || resp.status === 301 || resp.status === 307) {
                                if (resp.body) await resp.body.cancel();
                                currentUrl = resp.headers.get("location");
                                if (!currentUrl) break;
                                if (currentUrl.startsWith("/")) currentUrl = "https://zhlgd.whut.edu.cn" + currentUrl;
                                continue;
                            }
                            portalHtml = await resp.text();
                            break;
                        }
                        let localName = null;
                        const nameMatch = portalHtml.match(NAME_REGEX);
                        if (nameMatch && nameMatch[1]) localName = nameMatch[1].trim();
                        let localStudentId = null;
                        const snoMatch = portalHtml.match(/var\s+id_number\s*=\s*["']?([^"';]+)["']?/i);
                        if (snoMatch && snoMatch[1]) {
                            localStudentId = snoMatch[1].trim();
                        }
                        let localCardId = null;
                        const cardResp = await fetch("https://zhlgd.whut.edu.cn/tp_up/up/sysintegration/checkLogin", {
                            method: "POST",
                            headers: {
                                "User-Agent": UA,
                                "Cookie": cookieJar,
                                "Content-Type": "application/json;charset=UTF-8",
                                "X-Requested-With": "XMLHttpRequest",
                                "Accept": "application/json, text/javascript, */*; q=0.01"
                            },
                            body: "{}",
                            redirect: "manual"
                        });
                        if (cardResp.status === 200) {
                            try {
                                const cardDataStr = await cardResp.text();
                                const cardData = JSON.parse(cardDataStr);
                                if (cardData && cardData.SSOUrl) {
                                    const cardMatch = cardData.SSOUrl.match(CARD_REGEX);
                                    if (cardMatch) {
                                        localCardId = cardMatch[1];
                                    }
                                }
                            } catch (e) { }
                        } else {
                            if (cardResp.body) await cardResp.body.cancel();
                        }
                        return { type: 'portal', name: localName, cardId: localCardId, studentId: localStudentId };
                    } catch (e) {
                        return { type: 'portal', error: e.message };
                    }
                })();
                const yktTask = (async () => {
                    try {
                        const yktServiceUrl = "https://yktapp.whut.edu.cn/berserker-auth/cas/login/neusoftCas?targetUrl=https%3A%2F%2Fyktapp.whut.edu.cn%2Fplat-pc";
                        const tpassCasUrl = `https://zhlgd.whut.edu.cn/tpass/login?service=${encodeURIComponent(yktServiceUrl)}`;
                        let currentUrl = tpassCasUrl;
                        let yktCookieJar = authCookieJar;
                        let token = "";
                        for (let i = 0; i < 10 && !token; i++) {
                            const resp = await fetch(currentUrl, {
                                method: "GET",
                                headers: { "User-Agent": UA, "Cookie": yktCookieJar },
                                redirect: "manual"
                            });
                            const newCookies = resp.headers.getSetCookie();
                            if (newCookies) {
                                yktCookieJar = parseAndMergeCookies(yktCookieJar, newCookies);
                                for (const c of newCookies) {
                                    if (c.toLowerCase().includes("synjones-auth=")) {
                                        token = c.split(/synjones-auth=/i)[1].split(";")[0];
                                    }
                                }
                            }
                            if (token) break;
                            const loc = resp.headers.get("location");
                            if (loc) {
                                try {
                                    const locUrl = new URL(loc.startsWith("/") ? `https://${new URL(currentUrl).host}${loc}` : loc);
                                    token = locUrl.searchParams.get("token") || locUrl.searchParams.get("synjones-auth") || "";
                                } catch (e) { }
                            }
                            if (token) break;
                            if (resp.status === 302 || resp.status === 301 || resp.status === 307) {
                                if (resp.body) await resp.body.cancel();
                                if (!loc) break;
                                currentUrl = loc.startsWith("/") ? `https://${new URL(currentUrl).host}${loc}` : loc;
                                continue;
                            }
                            const bodyText = await resp.text();
                            const tokenMatch = bodyText.match(/synjones-auth[=:]\s*["']?bearer\s+([^"'\s;]+)/i)
                                || bodyText.match(/token[=:]\s*["']?([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/i);
                            if (tokenMatch) token = tokenMatch[1];
                            break;
                        }
                        if (!token) {
                            return { type: 'ykt', error: 'JWT token not found after redirect chain', debugParams: currentUrl };
                        }
                        const yktUserResp = await fetch("https://yktapp.whut.edu.cn/berserker-base/user?synAccessSource=pc", {
                            method: "GET",
                            headers: {
                                "User-Agent": UA,
                                "synaccesssource": "pc",
                                "synjones-auth": `bearer ${token}`
                            }
                        });
                        if (yktUserResp.status === 200) {
                            const yktData = await yktUserResp.json();
                            if (yktData && yktData.data) {
                                return {
                                    type: 'ykt',
                                    name: yktData.data.name,
                                    cardId: yktData.data.cardAccount,
                                    studentId: yktData.data.sno || yktData.data.account
                                };
                            }
                        }
                        return { type: 'ykt', error: 'Failed to fetch user profile' };
                    } catch (e) {
                        return { type: 'ykt', error: e.message };
                    }
                })();
                const results = await Promise.all([portalTask, yktTask]);
                const portalResult = results[0];
                const yktResult = results[1];
                nickname = yktResult.name || portalResult.name || nickname;
                cardId = yktResult.cardId || portalResult.cardId || cardId;
                realStudentId = yktResult.studentId || portalResult.studentId || null;
                console.log(`[SSO] 抓取完成 - Portal(名:${portalResult.name}, 卡:${portalResult.cardId}, 学号:${portalResult.studentId}) YKT(名:${yktResult.name}, 卡:${yktResult.cardId}, 学号:${yktResult.studentId})`);
                if (yktResult.error) {
                    console.log(`[SSO] YKT 调试 - 错误:${yktResult.error} 附加:${yktResult.debugParams || ''}`);
                }
            } catch (err) {
                console.log("[SSO] 个人信息组装机制获取失败", err.message);
            }
            return { success: true, location: location, nickname: nickname, cardId: cardId, studentId: realStudentId };
        }
        const failureHtml = await loginResp.text();
        const errorMsgMatch = failureHtml.match(ERROR_REGEX);
        const errorDetail = errorMsgMatch ? errorMsgMatch[1].trim() : null;
        return {
            success: false,
            error: errorDetail || "SSO 登录失败",
            debug: {
                status: loginResp.status,
                location: location,
                cookies: cookieStr,
                bodySnippet: failureHtml.substring(0, 500)
            }
        };
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
