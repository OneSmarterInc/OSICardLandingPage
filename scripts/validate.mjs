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
assert(gateway.includes("promptInjectionAttempt"), "prompt-injection interception exists");
assert(gateway.includes("possiblePhi"), "expanded PHI interception exists");
assert(gateway.includes("SOC 2 Type II Attested"), "trust-language output correction exists");
assert(gateway.includes("rateLimit(req"), "best-effort abuse throttling exists");
assert(gateway.includes("No marketing subscription was created"), "one-time report email disclosure exists");
assert(analytics.includes("Intentionally excludes message text"), "analytics excludes sensitive conversation content");
assert(envExample.includes("LEAD_TO_EMAIL="), "lead recipient environment variable is documented");
assert(envExample.includes("ANALYTICS_WEBHOOK_URL="), "analytics webhook environment variable is documented");
assert(packageJson.dependencies?.nodemailer, "Nodemailer dependency is declared");

const combined = [app, practice, gateway, analytics, envExample].join("\n");
assert(!/sk-(?:proj|ant)-[A-Za-z0-9_-]{20,}/.test(combined), "no API key is committed");
assert(!/SMTP_PASSWORD\s*=\s*["']?[^"'\s#][^\r\n]{7,}/.test(envExample), "example file contains no SMTP password");

if (process.exitCode) process.exit(process.exitCode);
console.log("All static launch checks passed.");
