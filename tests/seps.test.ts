import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTrustedAnchor,
  buildSep10ChallengeUrl,
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

test("buildSep10ChallengeUrl preserves existing query params", () => {
  const url = buildSep10ChallengeUrl(
    "https://api.anchor.example.com/auth?client_name=stellar",
    "GABC123"
  );
  assert.equal(
    url,
    "https://api.anchor.example.com/auth?client_name=stellar&account=GABC123"
  );
});

test("normalizeAnchorDomain rejects domain with path", () => {
  assert.throws(
    () => normalizeAnchorDomain("anchor.example.com/path"),
    /host/i
  );
});

test("normalizeAnchorDomain rejects domain with query", () => {
  assert.throws(
    () => normalizeAnchorDomain("anchor.example.com?foo=bar"),
    /host/i
  );
});

test("normalizeAnchorDomain rejects domain with explicit port", () => {
  assert.throws(
    () => normalizeAnchorDomain("anchor.example.com:8443"),
    /host/i
  );
});
