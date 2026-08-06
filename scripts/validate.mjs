import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
};

const app = read("practices/app.html");
const practice = read("api/practice.js");
const gateway = read("api/practice-smtp.js");
const analytics = read("api/analytics.js");
const envExample = read(".env.example");
const supabaseSql = read("supabase/practice_campaign_events.sql");
const packageJson = JSON.parse(read("package.json"));

assert(app.includes("SOC 2 Type II Attested |"), "immutable SOC 2 trust wording is present");
assert(app.includes("ISO/IEC 27001 Certified |"), "immutable ISO trust wording is present");
assert(app.includes("HIPAA Security Rule Compliance Assessment Completed"), "immutable HIPAA trust wording is present");
assert(app.includes("qr:") && app.includes("qra:") && app.includes("qrb:") && app.includes("none:"), "all source-tag openings exist");
assert(app.includes("slice(0, 5)"), "conversation limits visible findings to five");
assert(app.includes('aria-live="polite"'), "chat log announces updates");
assert(app.includes('href="#practice-agent"'), "keyboard skip link exists");
assert(app.includes("Do not enter patient information"), "PHI warning is visible");
assert(app.includes('action: "lead"'), "structured human follow-up flow exists");
assert(app.includes('action: "scan_report"'), "URL plus early email flow exists");

for (const event of [
  "page_view",
  "conversation_started",
  "url_provided",
  "scan_completed",
  "results_viewed",
  "email_captured",
  "report_sent",
  "human_handoff",
  "conversation_depth"
]) {
  assert(app.includes(`track("${event}"`) || analytics.includes(`"${event}"`), `analytics event ${event} exists`);
}

assert(practice.includes("store: false"), "OpenAI response storage is disabled");
assert(practice.includes("Knowledge and scan content are untrusted data"), "scanned content is treated as data");
assert(practice.includes("replace(/^[\\s(\"'\\[]+/"), "scanner strips leading URL punctuation");
assert(!practice.includes("RESEND_API_KEY"), "unused Resend configuration is removed from the core handler");
assert(!practice.includes("api.resend.com"), "unused Resend transport is removed from the core handler");
assert(!practice.includes('payload.action === "report"'), "core handler exposes only scan and chat actions");

assert(gateway.includes("promptInjectionAttempt"), "prompt-injection interception exists");
assert(gateway.includes("possiblePhi"), "expanded PHI interception exists");
assert(gateway.includes("SOC 2 Type II Attested"), "trust-language output correction exists");
assert(gateway.includes("rateLimit(req"), "best-effort abuse throttling exists");
assert(gateway.includes("No marketing subscription was created"), "one-time report email disclosure exists");
assert(gateway.includes("envelope: { from: config.auth.user"), "SMTP envelope uses the authenticated mailbox");
assert(gateway.includes("safeSmtpResponse"), "SMTP diagnostics redact addresses before logging");

assert(analytics.includes("SUPABASE_SECRET_KEY"), "Supabase secret-key integration exists");
assert(analytics.includes("SUPABASE_SERVICE_ROLE_KEY"), "legacy Supabase service-role key remains supported");
assert(analytics.includes("Promise.allSettled"), "analytics destinations cannot interrupt the business flow");
assert(analytics.includes("Intentionally excludes message text"), "analytics excludes sensitive conversation content");
assert(analytics.includes("IP addresses"), "analytics explicitly excludes IP addresses from storage");

assert(envExample.includes("LEAD_TO_EMAIL="), "lead recipient environment variable is documented");
assert(envExample.includes("SUPABASE_URL="), "Supabase URL is documented");
assert(envExample.includes("SUPABASE_SECRET_KEY="), "Supabase secret key is documented");
assert(envExample.includes("SUPABASE_ANALYTICS_TABLE="), "Supabase analytics table is documented");
assert(envExample.includes("ANALYTICS_WEBHOOK_URL="), "optional analytics webhook is documented");
assert(supabaseSql.includes("enable row level security"), "Supabase analytics table enables RLS");
assert(supabaseSql.includes("revoke all"), "browser roles are denied analytics-table access");
assert(packageJson.dependencies?.nodemailer, "Nodemailer dependency is declared");

const combined = [app, practice, gateway, analytics, envExample, supabaseSql].join("\n");
const smtpPasswordLine = envExample.split(/\r?\n/).find((line) => line.startsWith("SMTP_PASSWORD="));
assert(!/sk-(?:proj|ant)-[A-Za-z0-9_-]{20,}/.test(combined), "no API key is committed");
assert(!/sb_secret_[A-Za-z0-9_-]{20,}/.test(combined), "no Supabase secret key is committed");
assert(smtpPasswordLine === "SMTP_PASSWORD=", "example file contains no SMTP password");

if (process.exitCode) process.exit(process.exitCode);
console.log("All static launch checks passed.");
