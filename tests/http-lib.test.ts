import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeUrlForLogs } from "../src/lib/http.js";

test("sanitizeUrlForLogs strips query and hash components", () => {
  const sanitized = sanitizeUrlForLogs(
    "https://anchor.example.com/price?sell_asset=stellar%3Anative&buy_asset=iso4217%3ABRL#fragment"
  );
  assert.equal(sanitized, "https://anchor.example.com/price");
});

test("sanitizeUrlForLogs keeps path and origin", () => {
  const sanitized = sanitizeUrlForLogs("https://api.example.com/v1/quotes?secret=foo");
  assert.equal(sanitized, "https://api.example.com/v1/quotes");
});

test("sanitizeUrlForLogs returns original input when URL parsing fails", () => {
  const raw = "not-a-valid-url";
  assert.equal(sanitizeUrlForLogs(raw), raw);
});

test("sanitizeUrlForLogs strips query/hash even for non-url fallback strings", () => {
  const raw = "anchor/price?sell_asset=native#frag";
  assert.equal(sanitizeUrlForLogs(raw), "anchor/price");
});
