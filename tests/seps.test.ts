import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTrustedAnchor,
  normalizeAnchorDomain,
  parseTomlValue
} from "../src/tools/seps.js";

test("normalizeAnchorDomain strips protocol and trailing slash", () => {
  assert.equal(normalizeAnchorDomain("https://anchor.example.com/"), "anchor.example.com");
});

test("parseTomlValue extracts WEB_AUTH_ENDPOINT", () => {
  const toml = `WEB_AUTH_ENDPOINT="https://anchor.example.com/auth"\n`;
  assert.equal(parseTomlValue(toml, "WEB_AUTH_ENDPOINT"), "https://anchor.example.com/auth");
});

test("assertTrustedAnchor rejects unknown domain when allowlist is set", () => {
  assert.throws(
    () => assertTrustedAnchor("unknown.example.com", ["anchor.example.com"]),
    /allowlist/i
  );
});
