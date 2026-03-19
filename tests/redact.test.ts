import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";

import { redactSensitiveText, sanitizeDebugPayload } from "../src/lib/redact.js";

test("redactSensitiveText masks Stellar secret seeds", () => {
  const input = `Using seed ${Keypair.random().secret()} for signing`;
  const redacted = redactSensitiveText(input);
  assert.match(redacted, /\[REDACTED_SECRET\]/);
  assert.doesNotMatch(redacted, /SBZ5P75L/);
});

test("redactSensitiveText masks bearer tokens", () => {
  const input = "Authorization: Bearer abc.def.ghi";
  const redacted = redactSensitiveText(input);
  assert.equal(redacted, "Authorization: [REDACTED_BEARER]");
});

test("sanitizeDebugPayload strips disallowed keys recursively", () => {
  const sanitized = sanitizeDebugPayload({
    transactionXdr: "AAAA",
    secretKey: "S123",
    headers: { authorization: "Bearer token" },
    nested: { token: "abc", keep: 1 }
  });

  assert.deepEqual(sanitized, {
    transactionXdr: "AAAA",
    headers: {},
    nested: { keep: 1 }
  });
});
