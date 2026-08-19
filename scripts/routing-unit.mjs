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
assert(!config.buildCommand, "existing static deployment model is unchanged");
assert(findRewrite("/", "/practices/app.html"), "clean root serves the practice app");
assert(findRewrite("/a", "/practices/app.html"), "clean /a serves the practice app");
assert(findRewrite("/b", "/practices/app.html"), "clean /b serves the practice app");
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
  redirects.filter((rule) => rule.destination === "/a" || rule.destination === "/b")
    .filter((rule) => rule.source.includes(":path"))
    .every((rule) => rule.source.includes("api/|api$")),
  "wildcard a/b redirects exclude API paths"
);

assert(app.includes('new URLSearchParams(location.search).get("s")'), "legacy ?s= source detection remains intact");
assert(app.includes('cleanPath === "/a"'), "clean /a maps to qra in browser logic");
assert(app.includes('cleanPath === "/b"'), "clean /b maps to qrb in browser logic");
assert(app.includes('? "qr"'), "clean root maps to qr in browser logic");
assert(
  app.includes('rawSource || pathSource || "none"'),
  "legacy query source takes priority over clean path source"
);

assert(qrGenerator.includes('BASE_URL = "https://cards.onesmarter.com"'), "production QR generator uses cards.onesmarter.com");
assert(qrGenerator.includes('f"{BASE_URL}/"'), "default production QR points to clean root");
assert(qrGenerator.includes('f"{BASE_URL}/a"'), "QRA production QR points to /a");
assert(qrGenerator.includes('f"{BASE_URL}/b"'), "QRB production QR points to /b");

console.log("Card-domain routing checks passed.");
