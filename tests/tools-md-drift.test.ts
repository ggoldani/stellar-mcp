import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("docs/TOOLS.md is in sync with MCP tools/list", () => {
  // `npm test` runs from the package root; drift check needs that cwd for scripts/ and docs/.
  const result = spawnSync(process.execPath, ["scripts/render-tools-md.mjs", "--check"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || "render-tools-md --check failed"
  );
});
