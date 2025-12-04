const TENCENT_ERROR_MAP = {
  'FailedOperation.EmailAddrInBlacklist': '该邮箱地址在黑名单中，无法发送邮件。',
  'FailedOperation.ExceedSendLimit': '今日发送邮件数量已达上限，请明天再试。',
  'FailedOperation.FrequencyLimit': '发送过于频繁，请稍后再试。',
  'FailedOperation.HighRejectionRate': '由于拒信率过高，发送功能被临时限制，请联系管理员。',
  'FailedOperation.IncorrectEmail': '邮箱地址格式错误，请检查后重试。',
  'FailedOperation.InsufficientBalance': '邮件服务余额不足，请联系管理员充值。',
  'FailedOperation.InsufficientQuota': '邮件套餐额度不足，请联系管理员。',
  'FailedOperation.InvalidTemplateID': '邮件模板无效，请联系管理员检查配置。',
  'FailedOperation.NotAuthenticatedSender': '发件地址未认证，请联系管理员配置。',
  'FailedOperation.ReceiverHasUnsubscribed': '该收件人已退订邮件。',
  'FailedOperation.RejectedByRecipients': '邮件被收件方拒绝。',
  'FailedOperation.SendEmailErr': '邮件发送遇到问题，请联系管理员。',
  'FailedOperation.ServiceNotAvailable': '邮件服务暂时不可用，请稍后重试。',
  'FailedOperation.TemporaryBlocked': '触发了收件服务商限制，请10分钟后再试。',
  'FailedOperation.UnsupportMailType': '不支持该类型的邮箱地址。',
  'FailedOperation.IllegalURL': '邮件内容包含不合规链接，请联系管理员。',
  'InvalidParameterValue.EmailAddressIsNULL': '邮箱地址不能为空。',
  'InvalidParameterValue.IllegalEmailAddress': '邮箱地址格式不正确。',
  'InvalidParameterValue.TemplateNotExist': '邮件模板不存在，请联系管理员配置。',
  'AuthFailure.SecretIdNotFound': '腾讯云密钥配置错误，请联系管理员。',
  'AuthFailure.SignatureFailure': '腾讯云签名错误，请联系管理员检查配置。',
  'AuthFailure.SignatureExpire': '请求签名过期，请重试。',
  'InternalError': '腾讯云内部错误，请稍后重试。',
  'RequestLimitExceeded': '请求频率超限，请稍后再试。',
  'ServiceUnavailable': '邮件服务暂时不可用，请稍后重试。',
  'OperationDenied.DomainNotVerified': '发信域名未验证，请联系管理员。',
  'OperationDenied.SendAddressStatusError': '发信地址状态异常，请联系管理员。',
  'OperationDenied.TemplateStatusError': '邮件模板未审核通过，请联系管理员。',
};
function getFriendlyErrorMessage(code, message) {
  if (TENCENT_ERROR_MAP[code]) {
    return TENCENT_ERROR_MAP[code];
  }
  if (code.startsWith('FailedOperation.')) {
    return `邮件发送失败: ${message || code}`;
  }
  if (code.startsWith('AuthFailure.')) {
    return '腾讯云认证失败，请联系管理员检查配置。';
  }
  if (code.startsWith('InvalidParameter')) {
    return `参数错误: ${message || code}`;
  }
  return `邮件发送失败: ${message || code}`;
}
export async function sendEmail(env, to, subject, templateData) {
  const SECRET_ID = env.TENCENT_SECRET_ID;
  const SECRET_KEY = env.TENCENT_SECRET_KEY;
  const FROM_ADDRESS = env.TENCENT_SES_FROM;
  const TEMPLATE_ID = env.TENCENT_TEMPLATE_ID;
  const REGION = env.TENCENT_SES_REGION || "ap-hongkong";
  if (!SECRET_ID || !SECRET_KEY || !FROM_ADDRESS || !TEMPLATE_ID) {
    throw new Error("请配置腾讯云环境变量: TENCENT_SECRET_ID, TENCENT_SECRET_KEY, TENCENT_SES_FROM, TENCENT_TEMPLATE_ID");
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
    Template: {
      TemplateID: parseInt(TEMPLATE_ID),
      TemplateData: JSON.stringify(templateData)
    }
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
    const errCode = result.Response.Error.Code;
    const errMessage = result.Response.Error.Message;
    console.error("Tencent SES Error:", { code: errCode, message: errMessage, requestId: result.Response.RequestId });
    const friendlyMsg = getFriendlyErrorMessage(errCode, errMessage);
    throw new Error(friendlyMsg);
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
