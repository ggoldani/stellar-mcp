#!/usr/bin/env node
/**
 * Deterministic checks that `npm pack` would ship generator + template inputs.
 * Parses `npm pack --dry-run --json` (npm 9+).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const r = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024
});

if (r.status !== 0) {
  console.error(r.stderr || r.stdout || "npm pack failed");
  process.exit(r.status ?? 1);
}

let data;
try {
  data = JSON.parse(r.stdout.trim());
} catch {
  console.error("Could not parse npm pack --json output:\n", r.stdout?.slice(0, 500));
  process.exit(1);
}

const entry = Array.isArray(data) ? data[0] : data;
const files = entry?.files;
if (!Array.isArray(files) || files.length === 0) {
  console.error("Unexpected pack JSON shape (no files array).");
  process.exit(1);
}

const paths = new Set(files.map((f) => f.path.replace(/\\/g, "/")));

function mustHave(predicate, label) {
  const ok = [...paths].some(predicate);
  if (!ok) {
    console.error(`pack:sanity missing required path: ${label}`);
    console.error(
      "Sample paths:",
      [...paths].filter((p) => p.includes("template") || p.includes("errors") || p.includes("generator")).slice(0, 30)
    );
    process.exit(1);
  }
}

mustHave((p) => p.startsWith("templates/generated-mcp/"), "templates/generated-mcp/**");
mustHave((p) => p === "src/lib/errors.ts", "src/lib/errors.ts");
mustHave((p) => p === "src/lib/redact.ts", "src/lib/redact.ts");
mustHave((p) => p === "build/src/generator/cli.js", "build/src/generator/cli.js");

console.error(`pack:sanity OK (${paths.size} paths in dry-run tarball).`);
