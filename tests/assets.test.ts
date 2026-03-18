import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTrustlineLimit } from "../src/tools/assets.js";

test("normalizeTrustlineLimit applies Stellar max amount when omitted", () => {
  assert.equal(normalizeTrustlineLimit(undefined), "922337203685.4775807");
});

test("normalizeTrustlineLimit validates provided trustline limit", () => {
  assert.equal(normalizeTrustlineLimit("1000.5"), "1000.5");
});
