import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const entry = require("../api/practice-entry.js");
const { normalizeLeadContact } = entry._test;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

assert(
  normalizeLeadContact("akshay.kumar@onesmarter.com, 8888043003") === "akshay.kumar@onesmarter.com",
  "mixed email and phone input is normalized to the email address"
);
assert(
  normalizeLeadContact("  AGRAWALAKSHAY8888@GMAIL.COM  ") === "agrawalakshay8888@gmail.com",
  "standalone email input is normalized safely"
);
assert(
  normalizeLeadContact("+91 88880 43003") === "+91 88880 43003",
  "standalone phone input remains accepted"
);
assert(
  normalizeLeadContact("please call me") === "",
  "non-contact text is not converted into contact data"
);

console.log("Lead contact normalization checks passed.");
