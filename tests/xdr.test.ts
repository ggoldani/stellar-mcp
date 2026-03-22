import assert from "node:assert/strict";
import test from "node:test";

import {
  xdrDecodeToJsonString,
  xdrEncodeFromJsonString,
  xdrGuessTypes,
  xdrTypesList
} from "../src/lib/xdrJson.js";
import { formatXdrJsonToolError } from "../src/tools/xdr.js";

const validTxEnvelopeXdr =
  "AAAAAGL8HQvQkbG28t2Jm/T4hRk2i52HqP+i4g2sTUiJbA+lAAAAZAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAEAAAAA5Iv2u/Y+sDPAx3cO0s7pZkR2n0GnZTzbch+KR3M7e+kAAAAAAAAAAACYloAAAAAAAAAAAA==";

test("xdr JSON engine lists TransactionEnvelope", () => {
  const types = xdrTypesList();
  assert.ok(types.includes("TransactionEnvelope"));
});

test("encode then decode roundtrips TransactionEnvelope", () => {
  const json = xdrDecodeToJsonString("TransactionEnvelope", validTxEnvelopeXdr);
  const parsed = JSON.parse(json) as { tx_v0?: { tx?: { fee?: number } } };
  assert.equal(parsed.tx_v0?.tx?.fee, 100);

  const again = xdrEncodeFromJsonString("TransactionEnvelope", json);
  assert.equal(again, validTxEnvelopeXdr);
});

test("guess identifies TransactionEnvelope for canonical fixture", () => {
  const candidates = xdrGuessTypes(validTxEnvelopeXdr);
  assert.ok(candidates.includes("TransactionEnvelope"));
});

test("formatXdrJsonToolError maps unknown type to recovery hint", () => {
  const msg = formatXdrJsonToolError("stellar_xdr_json_schema", { type: "NotARealType" }, "unknown type");
  assert.match(msg, /stellar_xdr_types/i);
  assert.match(msg, /NotARealType/);
});

test("formatXdrJsonToolError maps bad XDR hint for guess/decode", () => {
  const msg = formatXdrJsonToolError("stellar_xdr_guess", {}, "String length limit exceeded");
  assert.match(msg, /stellar_xdr_guess/i);
  assert.match(msg, /base64/i);
});
