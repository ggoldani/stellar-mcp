import assert from "node:assert/strict";
import test from "node:test";

import { Keypair, Memo } from "@stellar/stellar-sdk";

import { toStellarAsset, toStellarMemo } from "../src/tools/payments.js";

test("toStellarAsset maps native assets", () => {
  const asset = toStellarAsset({ type: "native" });
  assert.equal(asset.getCode(), "XLM");
});

test("toStellarAsset maps credit assets", () => {
  const asset = toStellarAsset({
    type: "credit",
    code: "USDC",
    issuer: Keypair.random().publicKey()
  });
  assert.equal(asset.getCode(), "USDC");
});

test("toStellarMemo maps text memo", () => {
  const memo = toStellarMemo({ type: "text", value: "hello" });
  assert.equal(memo?.type, Memo.text("hello").type);
});

test("toStellarMemo maps id memo", () => {
  const memo = toStellarMemo({ type: "id", value: "123" });
  assert.equal(memo?.type, Memo.id("123").type);
});
