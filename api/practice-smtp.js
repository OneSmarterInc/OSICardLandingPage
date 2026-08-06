const nodemailer = require("nodemailer");
const originalPracticeHandler = require("./practice.js");

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

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const limits = (scan.limitations || []).map((limit) => `<li>${escapeHtml(limit)}</li>`).join("");

  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#111827">
    <div style="max-width:720px;margin:auto;padding:28px 16px">
      <div style="background:#0A0A0B;color:white;padding:24px;border-radius:14px 14px 0 0">
        <div style="color:#DC2626">OneSmarter</div>
        <h1>AI-visibility scan summary</h1>
        <p>${escapeHtml(scan.finalUrl)}</p>
      </div>
      <div style="background:white;padding:22px;border-radius:0 0 14px 14px">
        <p>This report contains only checks performed by the automated scanner on ${escapeHtml(scan.scannedAt)}.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
        <h2>Important limitations</h2>
        <ul>${limits}</ul>
        <p>Questions? Reply or contact <a href="mailto:care@onesmarter.com">care@onesmarter.com</a>.</p>
        <p style="font-size:12px;color:#6b7280">One Smarter, Inc. · 707 Miamisburg Centerville Road, #223, Dayton, OH 45459</p>
      </div>
    </div>
  </body></html>`;
}

function reportText(scan) {
  const findings = (scan.findings || []).map((finding) =>
    `${finding.label} [${finding.status}]\n${finding.evidence}\nNext step: ${finding.recommendation}`
  ).join("\n\n");
  const limitations = (scan.limitations || []).map((item) => `- ${item}`).join("\n");
  return `OneSmarter AI-visibility scan summary\n\nWebsite: ${scan.finalUrl}\nScanned: ${scan.scannedAt}\n\n${findings}\n\nImportant limitations\n${limitations}\n\nQuestions? care@onesmarter.com`;
}

function smtpConfig() {
  const user = String(process.env.SMTP_USER || "").trim();
  const password = String(process.env.SMTP_PASSWORD || "");
  if (!user || !password) {
    throw new AppError("Email delivery is not configured. Add SMTP_USER and SMTP_PASSWORD in Vercel.", 503, true);
  }

  const port = Number(process.env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new AppError("SMTP_PORT is invalid.", 503, true);
  }

  const secure = String(process.env.SMTP_SECURE ?? (port === 465)).toLowerCase() === "true";
  return {
    host: process.env.SMTP_HOST || "smtp.ionos.com",
    port,
    secure,
    auth: { user, pass: password },
    requireTLS: !secure,
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  };
}

async function sendReport(payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  if (!validEmail(email)) throw new AppError("Please provide a valid email address.");
  if (!payload.scan?.finalUrl || !Array.isArray(payload.scan.findings)) {
    throw new AppError("A completed scan is required.");
  }

  const config = smtpConfig();
  const transporter = nodemailer.createTransport(config);
  const from = process.env.SMTP_FROM_EMAIL || `OneSmarter <${config.auth.user}>`;
  const replyTo = process.env.SMTP_REPLY_TO || config.auth.user;

  try {
    const info = await transporter.sendMail({
      from,
      to: email,
      replyTo,
      subject: `Your OneSmarter AI-visibility scan — ${new URL(payload.scan.finalUrl).hostname}`,
      text: reportText(payload.scan),
      html: reportHtml(payload.scan)
    });
    return { emailId: info.messageId };
  } catch (error) {
    console.error("smtp_error", error?.code, error?.responseCode, error?.command);
    if (error?.responseCode === 535 || error?.code === "EAUTH") {
      throw new AppError("SMTP authentication failed. Check SMTP_USER and SMTP_PASSWORD.", 502);
    }
    if (error?.responseCode === 550) {
      throw new AppError("The SMTP sender was rejected. Ensure SMTP_FROM_EMAIL uses the same domain as SMTP_USER.", 502);
    }
    throw new AppError("The report email could not be sent through the SMTP server.", 502);
  } finally {
    transporter.close();
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      services: {
        scanner: true,
        ai: Boolean(process.env.OPENAI_API_KEY),
        email: Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD)
      },
      emailProvider: "IONOS SMTP"
    });
  }

  const payload = requestBody(req);
  if (req.method === "POST" && payload.action === "report") {
    try {
      return res.status(200).json({ ok: true, ...(await sendReport(payload)) });
    } catch (error) {
      console.error("practice_smtp_error", error?.message);
      const status = error instanceof AppError ? error.status : 500;
      return res.status(status).json({
        ok: false,
        configurationRequired: Boolean(error.configurationRequired),
        error: status === 500 ? "The request could not be completed." : error.message
      });
    }
  }

  return originalPracticeHandler(req, res);
};
