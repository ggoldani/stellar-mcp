import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLimitExceededMessage,
  decideSigningPolicy
} from "../src/lib/autonomy.js";

test("decideSigningPolicy returns unsigned when auto-sign is disabled", () => {
  const decision = decideSigningPolicy({
    autoSign: false,
    autoSignLimit: 0
  });

  assert.equal(decision.shouldSign, false);
  assert.equal(decision.mode, "unsigned_xdr");
  assert.equal(decision.reason, "auto_sign_disabled");
});

test("decideSigningPolicy signs when auto-sign is enabled with unlimited mode", () => {
  const decision = decideSigningPolicy({
    autoSign: true,
    autoSignLimit: 0
  });

  assert.equal(decision.shouldSign, true);
  assert.equal(decision.mode, "signed_submitted");
  assert.equal(decision.reason, "auto_signed");
});

test("decideSigningPolicy fails closed when valuation is unavailable under capped mode", () => {
  const decision = decideSigningPolicy({
    autoSign: true,
    autoSignLimit: 10
  });

  assert.equal(decision.shouldSign, false);
  assert.equal(decision.reason, "valuation_unavailable");
});

test("decideSigningPolicy returns unsigned when valuation exceeds configured limit", () => {
  const decision = decideSigningPolicy({
    autoSign: true,
    autoSignLimit: 10,
    valueUsdc: 10.01
  });

  assert.equal(decision.shouldSign, false);
  assert.equal(decision.reason, "limit_exceeded");
  assert.equal(decision.message, buildLimitExceededMessage(10));
});

test("decideSigningPolicy signs when valuation is within configured limit", () => {
  const decision = decideSigningPolicy({
    autoSign: true,
    autoSignLimit: 10,
    valueUsdc: 9.99
  });

  assert.equal(decision.shouldSign, true);
  assert.equal(decision.reason, "auto_signed");
});
