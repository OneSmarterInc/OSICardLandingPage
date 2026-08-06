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
  return String(value || "")
    .replace(/[^a-zA-Z0-9._:-]/g, "")
    .slice(0, maxLength);
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

  if (RATE_BUCKETS.size > 5_000) {
    for (const [entryKey, entry] of RATE_BUCKETS) {
      if (entry.resetAt <= now) RATE_BUCKETS.delete(entryKey);
    }
  }

  return bucket.count <= 120;
}

function validHttpsUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function webhookUrl() {
  return validHttpsUrl(process.env.ANALYTICS_WEBHOOK_URL);
}

function supabaseConfig() {
  const url = validHttpsUrl(process.env.SUPABASE_URL);
  const key = String(
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();
  const table = String(
    process.env.SUPABASE_ANALYTICS_TABLE || "practice_campaign_events"
  ).trim();

  if (!url || !key || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(table)) return null;
  return { url, key, table };
}

async function postWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function forwardWebhook(record) {
  const url = webhookUrl();
  if (!url) return;

  try {
    const response = await postWithTimeout(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record)
    }, 3_500);

    if (!response.ok) {
      console.error("analytics_webhook_error", response.status);
    }
  } catch (error) {
    console.error("analytics_webhook_error", error?.name || "unknown");
  }
}

async function writeSupabase(record) {
  const config = supabaseConfig();
  if (!config) return;

  const endpoint = new URL(`/rest/v1/${config.table}`, config.url);
  const row = {
    event: record.event,
    source: record.source,
    session_id: record.sessionId,
    depth: record.depth ?? null,
    path: record.path,
    occurred_at: record.timestamp
  };

  try {
    const response = await postWithTimeout(endpoint, {
      method: "POST",
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        "content-type": "application/json",
        prefer: "return=minimal"
      },
      body: JSON.stringify(row)
    }, 3_500);

    if (!response.ok) {
      const detail = clean(await response.text(), 220);
      console.error("analytics_supabase_error", response.status, detail);
    }
  } catch (error) {
    console.error("analytics_supabase_error", error?.name || "unknown");
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      events: [...ALLOWED_EVENTS],
      destinations: {
        vercelLogs: true,
        supabaseConfigured: Boolean(supabaseConfig()),
        webhookConfigured: Boolean(webhookUrl())
      }
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

  // Intentionally excludes message text, email addresses, phone numbers,
  // scanned URLs, IP addresses, and the full conversation transcript.
  console.log("campaign_event", JSON.stringify(record));

  // Analytics is best-effort and must never break the visitor's business flow.
  await Promise.allSettled([
    writeSupabase(record),
    forwardWebhook(record)
  ]);

  return res.status(202).json({ ok: true });
};
