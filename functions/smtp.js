import { connect } from 'cloudflare:sockets';
export async function sendEmail(env, to, subject, html) {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error("请配置 SMTP_USER 和 SMTP_PASS 环境变量");
  }
  const socket = connect({
    hostname: 'smtp.qiye.aliyun.com',
    port: 465,
    secureTransport: 'on',
  });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  async function readResponse() {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      const text = decoder.decode(value, { stream: true });
      buffer += text;
      if (buffer.includes('\n')) {
          if (/\d{3} .*\r?\n$/.test(buffer)) {
             const response = buffer;
             buffer = ""; 
             return response;
          }
      }
    }
    return buffer;
  }
  async function sendCommand(cmd, logName) {
    await writer.write(encoder.encode(cmd + "\r\n"));
    const res = await readResponse();
    if (!res || !/^[23]/.test(res)) {
        throw new Error(`SMTP 错误（${logName || cmd}）：${res}`);
    }
    return res;
  }
  try {
    const welcome = await readResponse();
    if (!welcome || !welcome.startsWith('220')) {
        throw new Error(`连接失败: ${welcome}`);
    }
    await sendCommand("EHLO client", "EHLO");
    await sendCommand("AUTH LOGIN", "AUTH LOGIN");
    await sendCommand(btoa(env.SMTP_USER), "User");
    await sendCommand(btoa(env.SMTP_PASS), "Pass");
    await sendCommand(`MAIL FROM:<${env.SMTP_USER}>`, "MAIL FROM");
    await sendCommand(`RCPT TO:<${to}>`, "RCPT TO");
    await sendCommand("DATA", "DATA");
    const b64Subject = btoa(unescape(encodeURIComponent(subject)));
    const b64Html = btoa(unescape(encodeURIComponent(html)));
    const message = [
      `From: "武理资源共享平台" <${env.SMTP_USER}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${b64Subject}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      b64Html,
      "."
    ].join("\r\n");
    const result = await sendCommand(message, "Message Body");
    await sendCommand("QUIT", "QUIT");
    if (result && !result.includes("250")) {
       console.error("SMTP 发送失败:", result);
       throw new Error(`SMTP 错误: ${result}`);
    }
    return { success: true };
  } catch (e) {
    console.error("邮件发送异常:", e);
    return { success: false, error: e.message };
  } finally {
    try {
        writer.releaseLock();
        socket.close();
    } catch(e) {
    }
  }
}