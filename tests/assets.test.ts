import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTrustlineAutoSignCappedMessage,
  normalizeTrustlineLimit
} from "../src/tools/assets.js";

test("normalizeTrustlineLimit applies Stellar max amount when omitted", () => {
  assert.equal(normalizeTrustlineLimit(undefined), "922337203685.4775807");
});

test("normalizeTrustlineLimit validates provided trustline limit", () => {
  assert.equal(normalizeTrustlineLimit("1000.5"), "1000.5");
});

test("normalizeTrustlineLimit allows zero to revoke trustline", () => {
  assert.equal(normalizeTrustlineLimit("0"), "0");
});

test("buildTrustlineAutoSignCappedMessage describes fail-closed trustline behavior", () => {
  const message = buildTrustlineAutoSignCappedMessage(10);
  assert.match(message, /trustline operations do not have reliable usdc valuation/i);
  assert.match(message, /\$10 usdc/i);
});
