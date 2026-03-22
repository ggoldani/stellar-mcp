import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundError } from "@stellar/stellar-sdk";

import {
  isHorizonAxiosNotFound,
  mapUnknownError,
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

test("mapStellarResultCodes maps transaction-only failures", () => {
  const mapped = mapStellarResultCodes("tx_too_late");
  assert.ok(mapped instanceof StellarProtocolError);
  assert.match(mapped.message, /transaction expired/i);
});

test("mapStellarResultCodes maps missing source account transaction code", () => {
  const mapped = mapStellarResultCodes("tx_no_source_account");
  assert.ok(mapped instanceof StellarProtocolError);
  assert.match(mapped.message, /source account does not exist/i);
});

test("mapStellarResultCodes maps malformed operation code", () => {
  const mapped = mapStellarResultCodes("tx_failed", "op_malformed");
  assert.ok(mapped instanceof StellarProtocolError);
  assert.match(mapped.message, /invalid operation structure/i);
});

test("mapStellarResultCodes tx_bad_auth includes network mismatch guidance", () => {
  const mapped = mapStellarResultCodes("tx_bad_auth");
  assert.ok(mapped instanceof StellarProtocolError);
  assert.match(mapped.message, /network passphrase/i);
});

test("mapUnknownError wraps non-error throwables", () => {
  const mapped = mapUnknownError("boom");
  assert.equal(mapped.message, "Unexpected non-error exception thrown.");
});

test("isHorizonAxiosNotFound detects Stellar NotFoundError", () => {
  assert.equal(isHorizonAxiosNotFound(new NotFoundError("missing", {})), true);
});

test("isHorizonAxiosNotFound detects axios-style 404", () => {
  assert.equal(isHorizonAxiosNotFound({ response: { status: 404 } }), true);
});

test("normalizeStellarError preserves string-throw meta load errors", () => {
  const err = new Error(
    "Ledger 999999999 not found on Horizon (404) and Soroban RPC getLedgers returned no ledgers (check RPC retention window and sequence)."
  );
  const mapped = normalizeStellarError(err);
  assert.ok(mapped instanceof Error);
  assert.match(mapped.message, /Ledger 999999999/i);
});
