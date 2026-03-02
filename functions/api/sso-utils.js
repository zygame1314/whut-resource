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
        const ltMatch = html.match(/name="lt"\s+value="([^"]+)"/);
        const executionMatch = html.match(/name="execution"\s+value="([^"]+)"/);
        const eventIdMatch = html.match(/name="_eventId"\s+value="([^"]+)"/);
        if (!ltMatch) throw new Error("无法获取登录票据 (LT)");
        const lt = ltMatch[1];
        const execution = executionMatch ? executionMatch[1] : "e1s1";
        const eventId = eventIdMatch ? eventIdMatch[1] : "submit";
        const sessionHeaders = { ...headers };
        if (setCookie) sessionHeaders["Cookie"] = setCookie.split(";")[0];
        const rsaResp = await fetch(rsaUrl, {
            method: "POST",
            headers: sessionHeaders
        });
        const { publicKey } = await rsaResp.json();
        if (!publicKey) throw new Error("获取公钥失败");
        let pem = publicKey;
        if (!pem.startsWith('-----BEGIN PUBLIC KEY-----')) {
            pem = `-----BEGIN PUBLIC KEY-----\n${pem}\n-----END PUBLIC KEY-----`;
        }
        const pubKeyObj = forge.pki.publicKeyFromPem(pem);
        const ulEncoded = forge.util.encodeUtf8(username);
        const plEncoded = forge.util.encodeUtf8(password);
        const ul = forge.util.encode64(pubKeyObj.encrypt(ulEncoded, 'RSAES-PKCS1-V1_5'));
        const pl = forge.util.encode64(pubKeyObj.encrypt(plEncoded, 'RSAES-PKCS1-V1_5'));
        const formData = new URLSearchParams();
        formData.append("un", "");
        formData.append("pd", "");
        formData.append("ul", ul);
        formData.append("pl", pl);
        formData.append("lt", lt);
        formData.append("execution", execution);
        formData.append("_eventId", eventId);
        sessionHeaders["Content-Type"] = "application/x-www-form-urlencoded";
        const loginResp = await fetch(loginUrl, {
            method: "POST",
            headers: sessionHeaders,
            body: formData.toString(),
            redirect: "manual"
        });
        if (loginResp.status === 302 || loginResp.status === 307) {
            const location = loginResp.headers.get("location");
            if (location && location.includes("ticket=")) {
                return { success: true, ticket: location };
            }
        }
        return { success: false, error: "登录失败，账号或密码错误" };
    } catch (e) {
        return { success: false, error: e.message };
    }
}
