import { Buffer } from 'node:buffer';
export async function sendEmail(env, to, subject, html) {
  const SECRET_ID = env.TENCENT_SECRET_ID;
  const SECRET_KEY = env.TENCENT_SECRET_KEY;
  const FROM_ADDRESS = env.TENCENT_SES_FROM;
  const REGION = env.TENCENT_SES_REGION || "ap-hongkong";
  if (!SECRET_ID || !SECRET_KEY || !FROM_ADDRESS) {
    throw new Error("请配置腾讯云环境变量: TENCENT_SECRET_ID, TENCENT_SECRET_KEY, TENCENT_SES_FROM");
  }
  const endpoint = "ses.tencentcloudapi.com";
  const service = "ses";
  const action = "SendEmail";
  const version = "2020-10-02";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payload = {
    FromEmailAddress: FROM_ADDRESS,
    Destination: [to],
    Subject: subject,
    TriggerType: 1,
    ReplyToAddresses: FROM_ADDRESS,
    Simple: {
      Html: html,
    },
  };
  const payloadStr = JSON.stringify(payload);
  const algorithm = "TC3-HMAC-SHA256";
  const canonicalUri = "/";
  const canonicalQuery = "";
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${endpoint}\n`;
  const signedHeaders = "content-type;host";
  const hashedRequestPayload = await sha256Hex(payloadStr);
  const canonicalRequest = `POST\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;
  const kDate = await hmacSha256(`TC3${SECRET_KEY}`, date);
  const kService = await hmacSha256(kDate, service);
  const kSigning = await hmacSha256(kService, "tc3_request");
  const signature = await hmacSha256Hex(kSigning, stringToSign);
  const authorization = `${algorithm} Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = `https://${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": authorization,
      "Content-Type": "application/json; charset=utf-8",
      "Host": endpoint,
      "X-TC-Action": action,
      "X-TC-Version": version,
      "X-TC-Timestamp": timestamp.toString(),
      "X-TC-Region": REGION,
    },
    body: payloadStr,
  });
  const result = await response.json();
  if (result.Response && result.Response.Error) {
    console.error("Tencent SES Error:", result.Response.Error);
    throw new Error(`腾讯云发送失败: ${result.Response.Error.Code} - ${result.Response.Error.Message}`);
  }
  return { success: true, requestId: result.Response.RequestId };
}
async function sha256Hex(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return bufferToHex(hashBuffer);
}
async function hmacSha256(key, message) {
  const keyData = (typeof key === 'string') ? new TextEncoder().encode(key) : key;
  const msgData = new TextEncoder().encode(message);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  return new Uint8Array(signature);
}
async function hmacSha256Hex(key, message) {
  const signature = await hmacSha256(key, message);
  return bufferToHex(signature);
}
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
