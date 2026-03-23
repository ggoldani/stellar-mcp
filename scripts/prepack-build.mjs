#!/usr/bin/env node
/**
 * Runs `npm run build` before pack/publish. Fails fast if devDependencies are missing
 * (e.g. after `rm -rf node_modules`) instead of a cryptic `tsc: not found`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tscPkg = join(root, "node_modules", "typescript", "package.json");

if (!existsSync(tscPkg)) {
  console.error(
    "prepack: TypeScript not found. Install devDependencies first, then pack/publish:\n" +
      "  npm ci\n" +
      "  npm pack   # or npm publish"
  );
  process.exit(1);
}

const r = spawnSync("npm", ["run", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(r.status ?? 1);
