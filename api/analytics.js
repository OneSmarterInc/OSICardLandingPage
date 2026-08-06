const ALLOWED_EVENTS = new Set([
  "page_view",
  "conversation_started",
  "url_provided",
  "scan_completed",
  "results_viewed",
  "email_captured",
  "report_sent",
  "human_handoff",
  "conversation_depth"
]);

const RATE_BUCKETS = new Map();

function requestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function clean(value, maxLength) {
  return String(value || "").replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, maxLength);
}

function clientIp(req) {
  return String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
}

function allowed(req) {
  const now = Date.now();
  const key = clientIp(req);
  const existing = RATE_BUCKETS.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + 60_000 }
    : existing;
  bucket.count += 1;
  RATE_BUCKETS.set(key, bucket);

  if (RATE_BUCKETS.size > 5000) {
    for (const [entryKey, entry] of RATE_BUCKETS) {
      if (entry.resetAt <= now) RATE_BUCKETS.delete(entryKey);
    }
  }
  return bucket.count <= 120;
}

function validWebhook(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

async function forward(record) {
  const webhook = validWebhook(process.env.ANALYTICS_WEBHOOK_URL);
  if (!webhook) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(webhook, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record)
    });
    if (!response.ok) console.error("analytics_webhook_error", response.status);
  } catch (error) {
    console.error("analytics_webhook_error", error?.name || "unknown");
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      events: [...ALLOWED_EVENTS],
      webhookConfigured: Boolean(validWebhook(process.env.ANALYTICS_WEBHOOK_URL))
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  if (!allowed(req)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ ok: false, error: "Too many analytics requests." });
  }

  const declared = Number(req.headers?.["content-length"] || 0);
  const payload = requestBody(req);
  if (declared > 10_000 || Buffer.byteLength(JSON.stringify(payload)) > 10_000) {
    return res.status(413).json({ ok: false, error: "Analytics payload is too large." });
  }

  const event = clean(payload.event, 40);
  if (!ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ ok: false, error: "Unknown analytics event." });
  }

  const depth = Number.isInteger(payload.depth)
    ? Math.max(0, Math.min(payload.depth, 200))
    : undefined;

  const record = {
    event,
    source: clean(payload.source || "none", 20) || "none",
    sessionId: clean(payload.sessionId, 80) || "anonymous",
    depth,
    path: "/practices",
    timestamp: new Date().toISOString()
  };

  // Intentionally excludes message text, email addresses, phone numbers, and scanned URLs.
  console.log("campaign_event", JSON.stringify(record));
  await forward(record);

  return res.status(202).json({ ok: true });
};
