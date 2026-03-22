import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  extractOperationsFromTransactionMetaJson,
  truncateBase64Xdr
} from "../src/lib/metaBounds.js";
import { buildTransactionMetaOperationSlice } from "../src/lib/metaOperationSlice.js";
import { MetaDiskCache } from "../src/lib/metaCache.js";
import { xdrDecodeToJsonString } from "../src/lib/xdrJson.js";

test("truncateBase64Xdr returns null value for empty input", () => {
  const t = truncateBase64Xdr("", 100);
  assert.equal(t.value, null);
  assert.equal(t.truncated, false);
  assert.equal(t.originalLength, 0);
});

test("truncateBase64Xdr truncates when over maxChars", () => {
  const raw = "a".repeat(20);
  const t = truncateBase64Xdr(raw, 10);
  assert.equal(t.truncated, true);
  assert.equal(t.value?.length, 10);
  assert.equal(t.originalLength, 20);
});

test("extractOperationsFromTransactionMetaJson reads v3.operations", () => {
  const decoded = { v3: { operations: [{ foo: 1 }, { bar: 2 }] } };
  const ops = extractOperationsFromTransactionMetaJson(decoded);
  assert.ok(ops);
  assert.equal(ops?.length, 2);
});

test("MetaDiskCache stores and retrieves within TTL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "stellarmcp-meta-"));
  try {
    const cache = new MetaDiskCache(dir, true);
    const ok = await cache.set("k1", 60_000, { x: 1 });
    assert.equal(ok, true);
    const got = await cache.get<{ x: number }>("k1");
    assert.ok(got);
    assert.equal(got?.data.x, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("MetaDiskCache disabled never returns entries", async () => {
  const cache = new MetaDiskCache(join(tmpdir(), "noop"), false);
  await cache.set("k", 60_000, { a: 1 });
  const got = await cache.get("k");
  assert.equal(got, null);
});

function loadRpcMetaFixture(): { resultMetaXdrBase64: string } {
  const path = join(process.cwd(), "tests/fixtures/rpc-transaction-meta-sample.json");
  return JSON.parse(readFileSync(path, "utf8")) as { resultMetaXdrBase64: string };
}

test("buildTransactionMetaOperationSlice succeeds for complete meta (fixture from Soroban RPC shape)", () => {
  const { resultMetaXdrBase64 } = loadRpcMetaFixture();
  const decoded = JSON.parse(
    xdrDecodeToJsonString("TransactionMeta", resultMetaXdrBase64)
  ) as unknown;
  const ops = extractOperationsFromTransactionMetaJson(decoded);
  assert.ok(ops && ops.length >= 1, "fixture must decode to at least one operation meta");
  const slice = buildTransactionMetaOperationSlice({
    operationIndex: 0,
    operationCount: ops!.length,
    resultMetaXdr: resultMetaXdrBase64,
    resultMetaFieldTruncated: false
  });
  assert.equal(slice.available, true);
  assert.equal(slice.requestedIndex, 0);
  assert.ok("operationMeta" in slice && slice.operationMeta !== undefined);
});

test("buildTransactionMetaOperationSlice rejects truncated result meta field", () => {
  const { resultMetaXdrBase64 } = loadRpcMetaFixture();
  const slice = buildTransactionMetaOperationSlice({
    operationIndex: 0,
    operationCount: 1,
    resultMetaXdr: resultMetaXdrBase64,
    resultMetaFieldTruncated: true
  });
  assert.equal(slice.available, false);
  assert.match(String(slice.reason), /truncated/i);
});

test("buildTransactionMetaOperationSlice rejects out-of-range operation_index", () => {
  const { resultMetaXdrBase64 } = loadRpcMetaFixture();
  const slice = buildTransactionMetaOperationSlice({
    operationIndex: 99,
    operationCount: 1,
    resultMetaXdr: resultMetaXdrBase64,
    resultMetaFieldTruncated: false
  });
  assert.equal(slice.available, false);
  assert.match(String(slice.reason), /out of range/i);
});

test("buildTransactionMetaOperationSlice reports decode failure for garbage XDR", () => {
  const slice = buildTransactionMetaOperationSlice({
    operationIndex: 0,
    operationCount: 1,
    resultMetaXdr: "!!!not-valid-base64-xdr!!!",
    resultMetaFieldTruncated: false
  });
  assert.equal(slice.available, false);
  assert.match(String(slice.reason), /decode failed|TransactionMeta/i);
});
