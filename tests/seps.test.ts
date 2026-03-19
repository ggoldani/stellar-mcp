import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTrustedAnchor,
  normalizeAnchorDomain,
  parseTomlValue,
  validateDiscoveredWebAuthEndpoint
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

test("validateDiscoveredWebAuthEndpoint accepts same host over https", () => {
  const endpoint = validateDiscoveredWebAuthEndpoint(
    "https://anchor.example.com/auth",
    "anchor.example.com"
  );
  assert.equal(endpoint, "https://anchor.example.com/auth");
});

test("validateDiscoveredWebAuthEndpoint accepts subdomain over https", () => {
  const endpoint = validateDiscoveredWebAuthEndpoint(
    "https://api.anchor.example.com/auth",
    "anchor.example.com"
  );
  assert.equal(endpoint, "https://api.anchor.example.com/auth");
});

test("validateDiscoveredWebAuthEndpoint rejects non-https endpoint", () => {
  assert.throws(
    () =>
      validateDiscoveredWebAuthEndpoint(
        "http://anchor.example.com/auth",
        "anchor.example.com"
      ),
    /https/i
  );
});

test("validateDiscoveredWebAuthEndpoint rejects unrelated host", () => {
  assert.throws(
    () =>
      validateDiscoveredWebAuthEndpoint(
        "https://evil.example.net/auth",
        "anchor.example.com"
      ),
    /anchor domain/i
  );
});
