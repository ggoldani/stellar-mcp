import assert from "node:assert/strict";
import test from "node:test";

import { calculateMinimumBalance } from "../src/tools/accounts.js";

test("calculateMinimumBalance computes reserve with base formula", () => {
  const minBalance = calculateMinimumBalance(3, 5_000_000);
  assert.equal(minBalance, "2.5000000");
});
