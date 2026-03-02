import forge from 'node-forge';
export async function verifyWHUTCredentials(username, password) {
    const baseUrl = "https://zhlgd.whut.edu.cn/tpass";
    const loginUrl = `${baseUrl}/login`;
    const rsaUrl = `${baseUrl}/rsa?skipWechat=true`;
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    };
    try {
        const initResp = await fetch(loginUrl, { headers });
        const setCookie = initResp.headers.get("set-cookie");
        const html = await initResp.text();
        const ltMatch = html.match(/name=["']?lt["']?\s+value=["']?([^"']+)["']?/i);
        const executionMatch = html.match(/name=["']?execution["']?\s+value=["']?([^"']+)["']?/i);
        const eventIdMatch = html.match(/name=["']?_eventId["']?\s+value=["']?([^"']+)["']?/i);
        if (!ltMatch) throw new Error("无法获取登录票据 (LT)");
        const lt = ltMatch[1];
        const execution = executionMatch ? executionMatch[1] : "e1s1";
        const eventId = eventIdMatch ? eventIdMatch[1] : "submit";
        const sessionHeaders = { ...headers };
        if (setCookie) {
            const allCookies = initResp.headers.getSetCookie();
            sessionHeaders["Cookie"] = (allCookies && allCookies.length > 0)
                ? allCookies.map(c => c.split(";")[0]).join("; ")
                : setCookie.split(";")[0];
        }
        sessionHeaders["Referer"] = loginUrl;
        console.log(`[SSO] LT: ${lt}, EXECUTION: ${execution}`);
        console.log(`[SSO] Cookies: ${sessionHeaders["Cookie"]}`);
        const rsaResp = await fetch(rsaUrl, {
            method: "POST",
            headers: sessionHeaders
        });
        const rsaJson = await rsaResp.json();
        const publicKey = rsaJson.publicKey;
        if (!publicKey) throw new Error("获取公钥失败");
        let pem = publicKey;
        if (!pem.startsWith('-----BEGIN PUBLIC KEY-----')) {
            pem = `-----BEGIN PUBLIC KEY-----\n${pem}\n-----END PUBLIC KEY-----`;
        }
        const pubKeyObj = forge.pki.publicKeyFromPem(pem);
        const ul = forge.util.encode64(pubKeyObj.encrypt(forge.util.encodeUtf8(username), 'RSAES-PKCS1-V1_5'));
        const pl = forge.util.encode64(pubKeyObj.encrypt(forge.util.encodeUtf8(password), 'RSAES-PKCS1-V1_5'));
        const formData = new URLSearchParams();
        formData.append("un", "");
        formData.append("pd", "");
        formData.append("ul", ul);
        formData.append("pl", pl);
        formData.append("lt", lt);
        formData.append("execution", execution);
        formData.append("_eventId", eventId);
        const postHeaders = { ...sessionHeaders };
        postHeaders["Content-Type"] = "application/x-www-form-urlencoded";
        const loginResp = await fetch(loginUrl, {
            method: "POST",
            headers: postHeaders,
            body: formData.toString(),
            redirect: "manual"
        });
        console.log(`[SSO] Login Status: ${loginResp.status}`);
        const location = loginResp.headers.get("location");
        console.log(`[SSO] Location: ${location}`);
        if (loginResp.status === 302 || loginResp.status === 307) {
            let nickname = null;
            let cardId = null;
            try {
                const parseAndMergeCookies = (currentJar, newSetCookies) => {
                    const cookieMap = {};
                    if (currentJar) {
                        currentJar.split(";").forEach(c => {
                            const [k, ...v] = c.trim().split("=");
                            if (k && v.length >= 0) cookieMap[k] = v.join("=");
                        });
                    }
                    if (newSetCookies && newSetCookies.length > 0) {
                        newSetCookies.forEach(c => {
                            const [k, ...v] = c.split(";")[0].split("=");
                            if (k && v.length >= 0) cookieMap[k] = v.join("=");
                        });
                    }
                    return Object.keys(cookieMap).map(k => `${k}=${cookieMap[k]}`).join("; ");
                };
                let cookieJar = parseAndMergeCookies(sessionHeaders["Cookie"], loginResp.headers.getSetCookie());
                let currentUrl = location;
                let portalHtml = "";
                for (let i = 0; i < 10; i++) {
                    const resp = await fetch(currentUrl, {
                        headers: { "User-Agent": headers["User-Agent"], "Cookie": cookieJar },
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
                const nameMatch = portalHtml.match(/id="user-btn-01"[\s\S]*?<span class="tit">\s*(.*?)\s*<\/span>/i);
                if (nameMatch && nameMatch[1]) nickname = nameMatch[1].trim();
                const cardResp = await fetch("https://zhlgd.whut.edu.cn/tp_up/up/sysintegration/checkLogin", {
                    method: "POST",
                    headers: {
                        "User-Agent": headers["User-Agent"],
                        "Cookie": cookieJar,
                        "Content-Type": "application/json;charset=UTF-8",
                        "X-Requested-With": "XMLHttpRequest",
                        "Accept": "application/json, text/javascript, */*; q=0.01"
                    },
                    body: "{}",
                    redirect: "manual"
                });
                let cardDataStr = await cardResp.text();
                if (cardResp.status === 200) {
                    try {
                        const cardData = JSON.parse(cardDataStr);
                        if (cardData && cardData.SSOUrl) {
                            const cardMatch = cardData.SSOUrl.match(/[?&]account_name=([0-9]{6})/i);
                            if (cardMatch) cardId = cardMatch[1];
                        }
                    } catch (e) { }
                }
                console.log(`[SSO] 信息抓取结果: 姓名=${nickname}, 卡号=${cardId}`);
            } catch (err) {
                console.log("[SSO] 个人信息补充获取失败", err.message);
            }
            return { success: true, location: location, nickname: nickname, cardId: cardId };
        }
        const failureHtml = await loginResp.text();
        const errorMsgMatch = failureHtml.match(/<div id="msg".*?>(.*?)<\/div>/s);
        const errorDetail = errorMsgMatch ? errorMsgMatch[1].trim() : null;
        return {
            success: false,
            error: errorDetail || "SSO 登录失败",
            debug: {
                status: loginResp.status,
                location: location,
                cookies: sessionHeaders["Cookie"],
                bodySnippet: failureHtml.substring(0, 500)
            }
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
}
