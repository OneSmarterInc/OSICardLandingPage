const nodemailer = require("nodemailer");
const originalPracticeHandler = require("./practice.js");
const reportStore = require("./report-store.js");

const RATE_BUCKETS = new Map();
const MAX_BODY_BYTES = 100_000;

class AppError extends Error {
  constructor(message, status = 400, configurationRequired = false) {
    super(message);
    this.status = status;
    this.configurationRequired = configurationRequired;
  }
}

function requestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function clientIp(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function enforceBodyLimit(req, payload) {
  const declared = Number(req.headers?.["content-length"] || 0);
  const actual = Buffer.byteLength(JSON.stringify(payload || {}));
  if (declared > MAX_BODY_BYTES || actual > MAX_BODY_BYTES) {
    throw new AppError("The request is too large.", 413);
  }
}

function rateLimit(req, category, limit, windowMs) {
  const now = Date.now();
  const key = `${clientIp(req)}:${category}`;
  const existing = RATE_BUCKETS.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : existing;

  bucket.count += 1;
  RATE_BUCKETS.set(key, bucket);

  if (RATE_BUCKETS.size > 5_000) {
    for (const [entryKey, entry] of RATE_BUCKETS) {
      if (entry.resetAt <= now) RATE_BUCKETS.delete(entryKey);
    }
  }

  if (bucket.count > limit) {
    const error = new AppError("Too many requests. Please wait a few minutes and try again.", 429);
    error.retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000));
    throw error;
  }
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function validContact(value) {
  return validEmail(value) || /^[+()0-9.\s-]{7,30}$/.test(value);
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanIdentifier(value, maxLength) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._:-]/g, "")
    .slice(0, maxLength);
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function possiblePhi(value) {
  const text = String(value || "");
  return [
    /(?:ssn|social security)/i,
    /\b\d{3}-\d{2}-\d{4}\b/,
    /(?:medical record|mrn|patient id|member id)/i,
    /(?:date of birth|dob)\s*[:=-]?\s*\d/i,
    /(?:diagnosed with|diagnosis|prescription|medication)\s*[:=-]?\s*\S+/i,
    /(?:patient|member)\s+(?:name|named|is)\s+[A-Z][a-z]+/i,
    /\b(?:patient|member)\b.{0,50}\b(?:phone|email|address)\b/i
  ].some((pattern) => pattern.test(text));
}

function promptInjectionAttempt(value) {
  const text = String(value || "");
  return [
    /ignore (?:all |any )?(?:previous|prior|system|developer) instructions/i.test(text),
    /reveal|show|print|repeat|extract/i.test(text) &&
      /system prompt|developer message|hidden instructions|api key|environment variable/i.test(text),
    /act as (?:the )?(?:system|developer)/i.test(text),
    /jailbreak|prompt injection/i.test(text)
  ].some(Boolean);
}

function outOfScopeAdvice(value) {
  const text = String(value || "");
  if (/\b(?:diagnose|diagnosis|treat|treatment|dosage|symptom|medicine|medication)\b/i.test(text)) {
    return "medical";
  }
  if (/\b(?:legal advice|lawsuit|sue|contract interpretation|tax advice|tax return|deduction)\b/i.test(text)) {
    return "legal or tax";
  }
  return "";
}

function safetyIntercept(message) {
  if (possiblePhi(message)) {
    return {
      blockedForPhi: true,
      reply: "Please do not include patient-identifiable or medical information. This is not a HIPAA-covered clinical channel. I can help with practice operations or a public website scan without patient details."
    };
  }

  if (promptInjectionAttempt(message)) {
    return {
      blockedForInjection: true,
      reply: "I can’t provide hidden instructions, credentials, or internal configuration. I can help with OneSmarter services, practice operations, or a factual website scan."
    };
  }

  const scope = outOfScopeAdvice(message);
  if (scope) {
    return {
      blockedForScope: true,
      reply: `I can’t provide ${scope} advice. I can discuss non-clinical practice operations or connect you with care@onesmarter.com.`
    };
  }

  return null;
}

function sanitizeAgentReply(value, payload) {
  let reply = cleanText(value, 8_000);
  if (!reply) return "";

  reply = reply
    .replace(/\bSOC\s*2(?:\s*Type\s*II)?\s+(?:certified|certification)\b/gi, "SOC 2 Type II Attested")
    .replace(/\bHIPAA\s+(?:certified|certification)\b/gi, "HIPAA Security Rule Compliance Assessment Completed")
    .replace(/\bISO\/IEC\s*27001\s+(?:attested|assessment completed)\b/gi, "ISO/IEC 27001 Certified");

  if (/\bOneSmarter\b.{0,60}\b(?:issues|grants|awards)\b.{0,40}\b(?:certificate|certification|SOC report)\b/i.test(reply)) {
    return "OneSmarter can support readiness work, but it does not issue ISO certificates or SOC reports. For a precise services discussion, contact care@onesmarter.com.";
  }

  if (
    promptInjectionAttempt(payload.message || "") &&
    /system prompt|developer message|hidden instructions|environment variable|api key/i.test(reply)
  ) {
    return "I can’t provide hidden instructions, credentials, or internal configuration.";
  }

  return reply;
}

function reportHtml(scan) {
  const rows = (scan.findings || []).map((finding) => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top">
        <strong>${escapeHtml(finding.label)}</strong><br>
        <span style="color:#6b7280">${escapeHtml(finding.status)}</span>
      </td>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top">
        ${escapeHtml(finding.evidence)}<br>
        <strong>Next step:</strong> ${escapeHtml(finding.recommendation)}
      </td>
    </tr>`).join("");

  const limits = (scan.limitations || [])
    .map((limit) => `<li>${escapeHtml(limit)}</li>`)
    .join("");

  return `<!doctype html><html lang="en"><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#111827">
    <div style="max-width:720px;margin:auto;padding:28px 16px">
      <div style="background:#0A0A0B;color:white;padding:24px;border-radius:14px 14px 0 0">
        <div style="color:#DC2626">OneSmarter</div>
        <h1>AI-visibility scan summary</h1>
        <p>${escapeHtml(scan.finalUrl)}</p>
      </div>
      <div style="background:white;padding:22px;border-radius:0 0 14px 14px">
        <p>This report contains only checks performed by the automated scanner on ${escapeHtml(scan.scannedAt)}.</p>
        <table role="table" style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
        <h2>Important limitations</h2>
        <ul>${limits}</ul>
        <p>Questions? Reply or contact <a href="mailto:care@onesmarter.com">care@onesmarter.com</a>.</p>
        <p style="font-size:12px;color:#6b7280">One Smarter, Inc. · 707 Miamisburg Centerville Road, #223, Dayton, OH 45459</p>
        <p style="font-size:12px;color:#6b7280">You requested this one-time report. A limited delivery record is retained for operations; no marketing subscription was created.</p>
      </div>
    </div>
  </body></html>`;
}

function reportText(scan) {
  const findings = (scan.findings || []).map((finding) =>
    `${finding.label} [${finding.status}]\n${finding.evidence}\nNext step: ${finding.recommendation}`
  ).join("\n\n");
  const limitations = (scan.limitations || []).map((item) => `- ${item}`).join("\n");

  return `OneSmarter AI-visibility scan summary\n\nWebsite: ${scan.finalUrl}\nScanned: ${scan.scannedAt}\n\n${findings}\n\nImportant limitations\n${limitations}\n\nQuestions? care@onesmarter.com\n\nOne Smarter, Inc. · 707 Miamisburg Centerville Road, #223, Dayton, OH 45459\nYou requested this one-time report. A limited delivery record is retained for operations; no marketing subscription was created.`;
}

function smtpConfig() {
  const user = cleanText(process.env.SMTP_USER, 254).toLowerCase();
  const password = String(process.env.SMTP_PASSWORD || "");

  if (!validEmail(user) || !password) {
    throw new AppError(
      "Email delivery is not configured. Add a valid SMTP_USER and SMTP_PASSWORD in Vercel.",
      503,
      true
    );
  }

  const port = Number(process.env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new AppError("SMTP_PORT is invalid.", 503, true);
  }

  const host = cleanText(process.env.SMTP_HOST || "smtp.ionos.com", 255);
  if (!host) throw new AppError("SMTP_HOST is invalid.", 503, true);

  const secure = String(process.env.SMTP_SECURE ?? (port === 465)).toLowerCase() === "true";
  return {
    host,
    port,
    secure,
    auth: { user, pass: password },
    requireTLS: !secure,
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true
  };
}

function safeSmtpResponse(value) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

async function withTransport(callback) {
  const config = smtpConfig();
  const transporter = nodemailer.createTransport(config);

  try {
    return await callback(transporter, config);
  } catch (error) {
    console.error("smtp_error", {
      code: error?.code || "unknown",
      responseCode: error?.responseCode || null,
      command: error?.command || null,
      response: safeSmtpResponse(error?.response)
    });

    if (error?.responseCode === 535 || error?.code === "EAUTH") {
      throw new AppError("SMTP authentication failed. Check SMTP_USER and SMTP_PASSWORD.", 502);
    }
    if (error?.responseCode === 550) {
      throw new AppError("The SMTP sender was rejected. Ensure SMTP_FROM_EMAIL uses the authenticated mailbox.", 502);
    }
    if (error?.responseCode === 554 || error?.code === "EMESSAGE") {
      throw new AppError("The SMTP server rejected the message. Check the authenticated sender and IONOS mail policy.", 502);
    }
    if (error instanceof AppError) throw error;
    throw new AppError("The email could not be sent through the SMTP server.", 502);
  } finally {
    transporter.close();
  }
}

function senderAddress(config) {
  return cleanText(process.env.SMTP_FROM_EMAIL || config.auth.user, 320);
}

function replyAddress(config) {
  const value = cleanText(process.env.SMTP_REPLY_TO || config.auth.user, 254).toLowerCase();
  return validEmail(value) ? value : config.auth.user;
}

function reportCopyAddress(visitorEmail = "") {
  const value = cleanText(process.env.REPORT_COPY_TO, 254).toLowerCase();
  if (!validEmail(value) || value === visitorEmail) return "";
  return value;
}

function reportRecipients(visitorEmail) {
  const copyTo = reportCopyAddress(visitorEmail);
  return {
    copyTo,
    envelopeTo: copyTo ? [visitorEmail, copyTo] : [visitorEmail]
  };
}

function sourceTagFor(payload, req) {
  const supplied = cleanIdentifier(payload.sourceTag, 20);
  if (supplied) return supplied;

  try {
    const referer = req?.headers?.referer || req?.headers?.referrer;
    const fromQuery = new URL(referer).searchParams.get("s");
    return cleanIdentifier(fromQuery || "none", 20) || "none";
  } catch {
    return "none";
  }
}

function sessionIdFor(payload) {
  return cleanIdentifier(payload.sessionId, 80) || "";
}

async function sendReport(payload, req) {
  const email = cleanText(payload.email, 254).toLowerCase();
  if (!validEmail(email)) throw new AppError("Please provide a valid email address.");
  if (!payload.scan?.finalUrl || !Array.isArray(payload.scan.findings)) {
    throw new AppError("A completed scan is required.");
  }

  const reportRequestPromise = reportStore.createReportRequest({
    recipientEmail: email,
    website: payload.scan.finalUrl,
    sourceTag: sourceTagFor(payload, req),
    sessionId: sessionIdFor(payload)
  });

  try {
    const info = await withTransport(async (transporter, config) => {
      const recipients = reportRecipients(email);
      return transporter.sendMail({
        from: senderAddress(config),
        envelope: { from: config.auth.user, to: recipients.envelopeTo },
        to: email,
        bcc: recipients.copyTo || undefined,
        replyTo: replyAddress(config),
        subject: `Your OneSmarter AI-visibility scan — ${new URL(payload.scan.finalUrl).hostname}`,
        text: reportText(payload.scan),
        html: reportHtml(payload.scan)
      });
    });

    const reportRequestId = await reportRequestPromise;
    await reportStore.markReportRequest(reportRequestId, {
      status: "sent",
      smtpMessageId: info.messageId
    });

    console.log("report_email_sent", info.messageId || "accepted");
    return { emailId: info.messageId };
  } catch (error) {
    const reportRequestId = await reportRequestPromise;
    await reportStore.markReportRequest(reportRequestId, {
      status: "failed",
      failureCode: "smtp_delivery_failed"
    });
    throw error;
  }
}

function leadText(lead) {
  return `OneSmarter practice follow-up request

Name: ${lead.name}
Practice: ${lead.practice}
Preferred contact: ${lead.contact}
Area needing help: ${lead.need}
Source tag: ${lead.sourceTag}
Submitted: ${new Date().toISOString()}

Only the structured fields above were captured. No patient information or full chat transcript is included.`;
}

function leadHtml(lead) {
  return `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#111827">
    <h1>Practice follow-up request</h1>
    <table role="table" style="border-collapse:collapse">
      <tr><th align="left" style="padding:8px;border-bottom:1px solid #ddd">Name</th><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(lead.name)}</td></tr>
      <tr><th align="left" style="padding:8px;border-bottom:1px solid #ddd">Practice</th><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(lead.practice)}</td></tr>
      <tr><th align="left" style="padding:8px;border-bottom:1px solid #ddd">Preferred contact</th><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(lead.contact)}</td></tr>
      <tr><th align="left" style="padding:8px;border-bottom:1px solid #ddd">Area needing help</th><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(lead.need)}</td></tr>
      <tr><th align="left" style="padding:8px;border-bottom:1px solid #ddd">Source tag</th><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(lead.sourceTag)}</td></tr>
    </table>
    <p style="font-size:12px;color:#6b7280">Only structured fields were captured. No patient information or full chat transcript is included.</p>
  </body></html>`;
}

async function sendLead(payload) {
  const lead = {
    name: cleanText(payload.name, 100),
    practice: cleanText(payload.practice, 160),
    contact: cleanText(payload.contact, 254),
    need: cleanText(payload.need, 1_000),
    sourceTag: cleanText(payload.sourceTag || "none", 20)
  };

  if (!lead.name || !lead.practice || !lead.contact || !lead.need) {
    throw new AppError("Name, practice, preferred contact, and the requested help are required.");
  }
  if (!validContact(lead.contact)) {
    throw new AppError("Please provide a valid email address or phone number.");
  }
  if (possiblePhi(`${lead.name} ${lead.practice} ${lead.need}`)) {
    throw new AppError("Please remove patient-identifiable or medical information from the follow-up request.");
  }

  return withTransport(async (transporter, config) => {
    const replyTo = validEmail(lead.contact) ? lead.contact : replyAddress(config);
    const to = cleanText(
      process.env.LEAD_TO_EMAIL || process.env.SMTP_REPLY_TO || "care@onesmarter.com",
      254
    ).toLowerCase();

    if (!validEmail(to)) {
      throw new AppError("LEAD_TO_EMAIL is not configured with a valid email address.", 503, true);
    }

    const info = await transporter.sendMail({
      from: senderAddress(config),
      envelope: { from: config.auth.user, to },
      to,
      replyTo,
      subject: `OneSmarter practice follow-up request (${lead.sourceTag})`,
      text: leadText(lead),
      html: leadHtml(lead)
    });

    console.log("lead_email_sent", info.messageId || "accepted", lead.sourceTag);
    return { leadId: info.messageId };
  });
}

function invokeOriginal(req, payload) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    let settled = false;

    const finish = (body) => {
      if (settled) return;
      settled = true;
      resolve({ statusCode, body });
    };

    const mockRes = {
      setHeader() {},
      status(code) { statusCode = code; return this; },
      json(body) { finish(body); return this; },
      end(body) {
        try { finish(body ? JSON.parse(body) : {}); }
        catch { finish({ ok: statusCode < 400, body: String(body || "") }); }
        return this;
      }
    };

    Promise.resolve(originalPracticeHandler({
      method: "POST",
      body: payload,
      headers: req.headers || {},
      socket: req.socket
    }, mockRes)).then(() => {
      if (!settled) finish({ ok: statusCode < 400 });
    }).catch(reject);
  });
}

function sendError(res, error) {
  const status = error instanceof AppError ? error.status : 500;
  if (error?.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
  return res.status(status).json({
    ok: false,
    configurationRequired: Boolean(error.configurationRequired),
    error: status === 500 ? "The request could not be completed." : error.message
  });
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      services: {
        scanner: true,
        ai: Boolean(process.env.ANTHROPIC_API_KEY),
        email: Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD),
        analytics: true,
        leads: Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD),
        reportRecords: reportStore.configured(),
        reportCopy: Boolean(reportCopyAddress())
      },
      emailProvider: "IONOS SMTP",
      knowledgeConfigured: Boolean(
        process.env.ONESMARTER_KNOWLEDGE_URL || process.env.ONESMARTER_KNOWLEDGE_TEXT
      )
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const payload = requestBody(req);

  try {
    enforceBodyLimit(req, payload);
    rateLimit(req, "all", 90, 10 * 60 * 1_000);

    if (payload.action === "report") {
      rateLimit(req, "email", 6, 15 * 60 * 1_000);
      return res.status(200).json({ ok: true, ...(await sendReport(payload, req)) });
    }

    if (payload.action === "lead") {
      rateLimit(req, "lead", 5, 15 * 60 * 1_000);
      return res.status(200).json({ ok: true, ...(await sendLead(payload)) });
    }

    if (payload.action === "scan_report") {
      rateLimit(req, "scan", 12, 10 * 60 * 1_000);
      rateLimit(req, "email", 6, 15 * 60 * 1_000);
      const email = cleanText(payload.email, 254).toLowerCase();
      if (!validEmail(email)) throw new AppError("Please provide a valid email address.");

      const scanResult = await invokeOriginal(req, { action: "scan", url: payload.url });
      if (scanResult.statusCode >= 400 || !scanResult.body?.ok || !scanResult.body?.scan) {
        return res.status(scanResult.statusCode).json(scanResult.body);
      }

      const reportResult = await sendReport({ ...payload, email, scan: scanResult.body.scan }, req);
      return res.status(200).json({
        ok: true,
        scan: scanResult.body.scan,
        reportSent: true,
        ...reportResult
      });
    }

    if (payload.action === "chat") {
      rateLimit(req, "chat", 40, 10 * 60 * 1_000);
      const message = cleanText(payload.message, 4_000);
      const blocked = safetyIntercept(message);
      if (blocked) return res.status(200).json({ ok: true, ...blocked });

      const result = await invokeOriginal(req, { ...payload, message });
      if (result.body?.reply) {
        result.body.reply = sanitizeAgentReply(result.body.reply, { ...payload, message });
      }
      return res.status(result.statusCode).json(result.body);
    }

    if (payload.action === "scan") {
      rateLimit(req, "scan", 12, 10 * 60 * 1_000);
    }

    return originalPracticeHandler(req, res);
  } catch (error) {
    console.error("practice_gateway_error", error?.message || "unknown");
    return sendError(res, error);
  }
}

module.exports = handler;
module.exports._test = {
  reportRecipients,
  sourceTagFor,
  sessionIdFor
};
