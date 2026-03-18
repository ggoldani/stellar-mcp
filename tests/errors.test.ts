import assert from "node:assert/strict";
import test from "node:test";

import {
  mapStellarResultCodes,
  normalizeStellarError,
  NetworkError,
  StellarProtocolError
} from "../src/lib/errors.js";

test("mapStellarResultCodes returns actionable no trust message", () => {
  const mapped = mapStellarResultCodes("tx_failed", "op_no_trust");
  assert.equal(mapped.name, "StellarProtocolError");
  assert.match(mapped.message, /destination account has no trustline/i);
});

test("normalizeStellarError maps timeout-like errors to NetworkError", () => {
  const mapped = normalizeStellarError(new Error("request timeout on horizon"));
  assert.ok(mapped instanceof NetworkError);
});

test("normalizeStellarError maps Horizon result_codes to StellarProtocolError", () => {
  const mapped = normalizeStellarError({
    response: {
      data: {
        extras: {
          result_codes: {
            transaction: "tx_failed",
            operations: ["op_underfunded"]
          }
        }
      }
    }
  });

  assert.ok(mapped instanceof StellarProtocolError);
  assert.match(mapped.message, /source account does not have enough balance/i);
});
