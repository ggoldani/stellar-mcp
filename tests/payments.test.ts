import assert from "node:assert/strict";
import test from "node:test";

import { Keypair, Memo } from "@stellar/stellar-sdk";

import {
  buildAnchorMemoAdvisory,
  toStellarAsset,
  toStellarMemo
} from "../src/tools/payments.js";

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

test("buildAnchorMemoAdvisory warns for credit asset without memo", () => {
  const advisory = buildAnchorMemoAdvisory(
    {
      type: "credit",
      code: "USDC",
      issuer: Keypair.random().publicKey()
    },
    undefined
  );
  assert.match(advisory ?? "", /anchor flows require memo/i);
});

test("buildAnchorMemoAdvisory does not warn for native asset", () => {
  const advisory = buildAnchorMemoAdvisory({ type: "native" }, undefined);
  assert.equal(advisory, undefined);
});

test("buildAnchorMemoAdvisory does not warn when memo is present", () => {
  const advisory = buildAnchorMemoAdvisory(
    {
      type: "credit",
      code: "USDC",
      issuer: Keypair.random().publicKey()
    },
    { type: "text", value: "memo" }
  );
  assert.equal(advisory, undefined);
});
