import assert from "node:assert/strict";
import test from "node:test";
import { StrKey } from "@stellar/stellar-sdk";

import { buildReadStateLedgerKey } from "../src/tools/soroban.js";

const contractId = StrKey.encodeContract(Buffer.alloc(32, 1));

test("buildReadStateLedgerKey maps durability explicitly", () => {
  const persistent = buildReadStateLedgerKey(contractId, "string", "counter");
  const explicitPersistent = buildReadStateLedgerKey(
    contractId,
    "string",
    "counter",
    "persistent"
  );
  const temporary = buildReadStateLedgerKey(contractId, "string", "counter", "temporary");

  assert.equal(persistent.toXDR("base64"), explicitPersistent.toXDR("base64"));
  assert.notEqual(persistent.toXDR("base64"), temporary.toXDR("base64"));
});
