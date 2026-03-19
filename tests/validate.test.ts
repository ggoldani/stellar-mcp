import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";

import {
  amountSchema,
  assetInputSchema,
  memoSchema,
  publicKeySchema
} from "../src/lib/validate.js";

test("publicKeySchema accepts valid G address", () => {
  const valid = Keypair.random().publicKey();
  assert.equal(publicKeySchema.parse(valid), valid);
});

test("amountSchema rejects more than 7 decimal places", () => {
  assert.throws(
    () => amountSchema.parse("1.12345678"),
    /Invalid amount format/
  );
});

test("assetInputSchema allows native asset", () => {
  const parsed = assetInputSchema.parse({ type: "native" });
  assert.equal(parsed.type, "native");
});

test("assetInputSchema requires issuer for credit asset", () => {
  assert.throws(
    () => assetInputSchema.parse({ type: "credit", code: "USDC" }),
    /issuer/i
  );
});

test("memoSchema rejects memo text larger than 28 bytes", () => {
  assert.throws(
    () => memoSchema.parse({ type: "text", value: "x".repeat(29) }),
    /Memo text exceeds 28-byte Stellar limit/
  );
});

test("memoSchema accepts valid hash memo", () => {
  const parsed = memoSchema.parse({
    type: "hash",
    value: "a".repeat(64)
  });
  assert.equal(parsed.type, "hash");
});

test("memoSchema rejects memo id overflow above uint64", () => {
  assert.throws(
    () =>
      memoSchema.parse({
        type: "id",
        value: "18446744073709551616"
      }),
    /uint64/i
  );
});
