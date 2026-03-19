import { test } from "node:test";
import * as assert from "node:assert";

import { normalizeAnchorDomain } from "../src/tools/seps.js";

test("Smoke Test: SEPs Helper functions", () => {
  const domain = normalizeAnchorDomain("testanchor.stellar.org");
  assert.strictEqual(domain, "testanchor.stellar.org");
});
