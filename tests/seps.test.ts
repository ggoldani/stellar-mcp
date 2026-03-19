import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTrustedAnchor,
  buildSep10ChallengeUrl,
  extractSep10Token,
  normalizeAnchorDomain,
  parseTomlValue,
  validateSep10ChallengePayload,
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

test("validateSep10ChallengePayload accepts valid payload for expected network", () => {
  const payload = validateSep10ChallengePayload(
    {
      transaction: "AAAA...",
      network_passphrase: "Test SDF Network ; September 2015"
    },
    "Test SDF Network ; September 2015"
  );
  assert.equal(payload.transaction, "AAAA...");
});

test("validateSep10ChallengePayload rejects missing transaction", () => {
  assert.throws(
    () =>
      validateSep10ChallengePayload(
        {
          network_passphrase: "Test SDF Network ; September 2015"
        },
        "Test SDF Network ; September 2015"
      ),
    /challenge transaction/i
  );
});

test("validateSep10ChallengePayload rejects network mismatch", () => {
  assert.throws(
    () =>
      validateSep10ChallengePayload(
        {
          transaction: "AAAA...",
          network_passphrase: "Public Global Stellar Network ; September 2015"
        },
        "Test SDF Network ; September 2015"
      ),
    /network passphrase/i
  );
});

test("extractSep10Token returns token when present", () => {
  const token = extractSep10Token({ token: "jwt-token" });
  assert.equal(token, "jwt-token");
});

test("extractSep10Token rejects missing token", () => {
  assert.throws(() => extractSep10Token({}), /did not return a token/i);
});
