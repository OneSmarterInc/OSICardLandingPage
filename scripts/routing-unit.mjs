import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const config = JSON.parse(read("vercel.json"));
const app = read("practices/app.html");
const qrGenerator = read("generate_qr.py");
const rewrites = config.rewrites || [];
const redirects = config.redirects || [];

const findRewrite = (source, destination) =>
  rewrites.find((rule) => rule.source === source && rule.destination === destination);

assert(!config.routes, "legacy advanced routes are replaced by redirects/rewrites");

const legacyRoot = findRewrite("/", "/practices/app.html");
assert(
  legacyRoot?.has?.some((condition) => condition.type === "query" && condition.key === "s"),
  "legacy root ?s= source tags are preserved"
);
assert(
  rewrites.indexOf(legacyRoot) < rewrites.findIndex((rule) => rule.source === "/" && rule.destination.includes("?s=qr")),
  "legacy root query handling runs before the default root mapping"
);

assert(findRewrite("/", "/practices/app.html?s=qr"), "clean root maps to the qr experience");
assert(findRewrite("/a", "/practices/app.html?s=qra"), "clean /a maps to the qra experience");
assert(findRewrite("/b", "/practices/app.html?s=qrb"), "clean /b maps to the qrb experience");
assert(findRewrite("/practices", "/practices/app.html"), "legacy /practices route remains available");
assert(findRewrite("/api/practice", "/api/practice-entry"), "practice API routing remains unchanged");

assert(
  redirects.some((rule) => rule.destination === "/a" && rule.source.includes("[aA]")),
  "wildcard paths ending in a canonicalize to /a"
);
assert(
  redirects.some((rule) => rule.destination === "/b" && rule.source.includes("[bB]")),
  "wildcard paths ending in b canonicalize to /b"
);
assert(
  redirects.some((rule) => rule.destination === "/" && rule.source.includes("[aAbB]")),
  "other non-reserved wildcard paths canonicalize to root"
);

assert(
  app.includes('new URLSearchParams(location.search).get("s")'),
  "existing ?s=qr/qra/qrb source-tag logic remains intact"
);
assert(qrGenerator.includes('BASE_URL = "https://cards.onesmarter.com"'), "production QR generator uses cards.onesmarter.com");
assert(qrGenerator.includes('f"{BASE_URL}/"'), "default production QR points to clean root");
assert(qrGenerator.includes('f"{BASE_URL}/a"'), "QRA production QR points to /a");
assert(qrGenerator.includes('f"{BASE_URL}/b"'), "QRB production QR points to /b");

console.log("Card-domain routing checks passed.");
