const practiceGateway = require("./practice-smtp.js");

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeLeadContact(value) {
  const text = cleanText(value, 254);
  if (!text) return "";

  // Prefer an email address when the visitor supplies both an email and phone.
  // This keeps the structured lead payload compatible with the strict gateway
  // while accepting natural input such as "name@example.com, 555-123-4567".
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) return email.toLowerCase();

  const phone = text.match(/\+?\d[\d().\s-]{5,}\d/)?.[0]?.trim() || "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 7 && digits.length <= 15) return phone;

  return "";
}

function requestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

async function handler(req, res) {
  if (req.method === "POST") {
    const payload = requestBody(req);
    if (payload?.action === "lead") {
      const normalized = normalizeLeadContact(payload.contact);
      if (normalized) {
        req.body = { ...payload, contact: normalized };
      }
    }
  }

  return practiceGateway(req, res);
}

module.exports = handler;
module.exports._test = { normalizeLeadContact };
