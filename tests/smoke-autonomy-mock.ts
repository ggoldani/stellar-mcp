import assert from "node:assert/strict";

import { decideSigningPolicy } from "../src/lib/autonomy.js";

function runAutonomyMockSmoke(): void {
  const disabled = decideSigningPolicy({
    autoSign: false,
    autoSignLimit: 0
  });
  assert.equal(disabled.mode, "unsigned_xdr");
  assert.equal(disabled.reason, "auto_sign_disabled");

  const limitedWithoutValuation = decideSigningPolicy({
    autoSign: true,
    autoSignLimit: 10
  });
  assert.equal(limitedWithoutValuation.mode, "unsigned_xdr");
  assert.equal(limitedWithoutValuation.reason, "valuation_unavailable");

  const limitedOverCap = decideSigningPolicy({
    autoSign: true,
    autoSignLimit: 10,
    valueUsdc: 10.01
  });
  assert.equal(limitedOverCap.mode, "unsigned_xdr");
  assert.equal(limitedOverCap.reason, "limit_exceeded");

  const limitedWithinCap = decideSigningPolicy({
    autoSign: true,
    autoSignLimit: 10,
    valueUsdc: 9.99
  });
  assert.equal(limitedWithinCap.mode, "signed_submitted");
  assert.equal(limitedWithinCap.reason, "auto_signed");
}

runAutonomyMockSmoke();
console.error("Autonomy mock smoke checks passed.");
