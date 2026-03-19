import assert from "node:assert/strict";
import test from "node:test";

import {
  isCanonicalUsdcAsset,
  toSep38AssetString
} from "../src/lib/valuation.js";

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

test("toSep38AssetString maps native Stellar asset", () => {
  const result = toSep38AssetString({ type: "native" });
  assert.equal(result, "stellar:native");
});

test("toSep38AssetString maps credit Stellar asset", () => {
  const result = toSep38AssetString({
    type: "credit",
    code: "USDC",
    issuer: USDC_ISSUER
  });
  assert.equal(result, `stellar:USDC:${USDC_ISSUER}`);
});

test("isCanonicalUsdcAsset identifies canonical USDC pair", () => {
  const result = isCanonicalUsdcAsset(
    {
      type: "credit",
      code: "USDC",
      issuer: USDC_ISSUER
    },
    USDC_ISSUER
  );
  assert.equal(result, true);
});

test("isCanonicalUsdcAsset returns false for non-USDC assets", () => {
  const result = isCanonicalUsdcAsset(
    {
      type: "credit",
      code: "EURC",
      issuer: USDC_ISSUER
    },
    USDC_ISSUER
  );
  assert.equal(result, false);
});
