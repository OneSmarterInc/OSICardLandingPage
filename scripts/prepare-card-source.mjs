import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appPath = path.join(root, "practices", "app.html");

const originalBlock = `  const rawSource = new URLSearchParams(location.search).get("s");
  const sourceTag = (rawSource || "none").slice(0, 20);`;

const cleanPathBlock = `  const rawSource = new URLSearchParams(location.search).get("s");
  const cleanPath = location.pathname.replace(/\\/+$/, "").toLowerCase();
  const pathSource = cleanPath === "/a"
    ? "qra"
    : cleanPath === "/b"
      ? "qrb"
      : (cleanPath === "" || cleanPath === "/")
        ? "qr"
        : null;
  // Legacy ?s=qr/qra/qrb links take priority so already-printed cards keep working.
  const sourceTag = (rawSource || pathSource || "none").slice(0, 20);`;

function patchApp(html) {
  if (html.includes(cleanPathBlock)) return html;

  const occurrences = html.split(originalBlock).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Expected exactly one source-tag block in practices/app.html; found ${occurrences}.`);
  }

  return html.replace(originalBlock, cleanPathBlock);
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

const current = fs.readFileSync(appPath, "utf8");
const patched = patchApp(current);

if (process.argv.includes("--check")) {
  assert(patched.includes('new URLSearchParams(location.search).get("s")'), "legacy query source detection remains present");
  assert(patched.includes('cleanPath === "/a"'), "clean /a source detection is injected");
  assert(patched.includes('cleanPath === "/b"'), "clean /b source detection is injected");
  assert(patched.includes('? "qr"'), "clean root source detection is injected");
  assert(patched.includes("rawSource || pathSource || \"none\""), "legacy query source has priority over clean path source");
  console.log("Card source-tag build patch checks passed.");
} else {
  fs.writeFileSync(appPath, patched, "utf8");
  console.log("Prepared practices/app.html for clean card-domain paths.");
}
