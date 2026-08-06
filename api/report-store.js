function validHttpsUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function cleanIdentifier(value, maxLength) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._:-]/g, "")
    .slice(0, maxLength);
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function config() {
  const url = validHttpsUrl(process.env.SUPABASE_URL);
  const key = String(
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();
  const table = String(
    process.env.SUPABASE_REPORT_REQUESTS_TABLE || "practice_report_requests"
  ).trim();

  if (!url || !key || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(table)) return null;
  return { url, key, table };
}

function headers(config, prefer) {
  return {
    apikey: config.key,
    authorization: `Bearer ${config.key}`,
    "content-type": "application/json",
    prefer
  };
}

async function requestWithTimeout(url, options, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function validRecordId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function websiteOrigin(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.origin.slice(0, 500);
  } catch {
    return "";
  }
}

async function createReportRequest(input) {
  const settings = config();
  if (!settings) return null;

  const recipientEmail = cleanText(input.recipientEmail, 254).toLowerCase();
  const origin = websiteOrigin(input.website);
  if (!recipientEmail || !origin) return null;

  const row = {
    recipient_email: recipientEmail,
    website_origin: origin,
    source_tag: cleanIdentifier(input.sourceTag || "none", 20) || "none",
    session_id: cleanIdentifier(input.sessionId, 80) || null,
    delivery_status: "pending"
  };

  const endpoint = new URL(`/rest/v1/${settings.table}`, settings.url);
  endpoint.searchParams.set("select", "id");

  try {
    const response = await requestWithTimeout(endpoint, {
      method: "POST",
      headers: headers(settings, "return=representation"),
      body: JSON.stringify(row)
    });

    if (!response.ok) {
      console.error("report_store_insert_error", response.status);
      return null;
    }

    const data = await response.json().catch(() => []);
    const id = data?.[0]?.id;
    return validRecordId(id) ? id : null;
  } catch (error) {
    console.error("report_store_insert_error", error?.name || "unknown");
    return null;
  }
}

async function markReportRequest(id, update) {
  const settings = config();
  if (!settings || !validRecordId(id)) return false;

  const status = ["sent", "failed"].includes(update.status) ? update.status : "";
  if (!status) return false;

  const now = new Date().toISOString();
  const row = {
    delivery_status: status,
    smtp_message_id: cleanText(update.smtpMessageId, 500) || null,
    failure_code: status === "failed"
      ? cleanIdentifier(update.failureCode || "smtp_delivery_failed", 80)
      : null,
    sent_at: status === "sent" ? now : null,
    failed_at: status === "failed" ? now : null,
    updated_at: now
  };

  const endpoint = new URL(`/rest/v1/${settings.table}`, settings.url);
  endpoint.searchParams.set("id", `eq.${id}`);

  try {
    const response = await requestWithTimeout(endpoint, {
      method: "PATCH",
      headers: headers(settings, "return=minimal"),
      body: JSON.stringify(row)
    });

    if (!response.ok) {
      console.error("report_store_update_error", response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error("report_store_update_error", error?.name || "unknown");
    return false;
  }
}

module.exports = {
  configured: () => Boolean(config()),
  createReportRequest,
  markReportRequest,
  _test: { websiteOrigin }
};
