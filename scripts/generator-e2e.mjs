#!/usr/bin/env node
/**
 * Phase C generator E2E:
 * - Always: regenerate fixture output + quick file presence check.
 * - Full (CI or GENERATOR_E2E_FULL=1): npm install/ci + typecheck in baseline + exotic outputs.
 * - Quick override: GENERATOR_E2E_QUICK=1 skips npm (for local iteration; do not use in CI).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(root, "build/src/generator/cli.js");
const BASE_FIXTURE = join(root, "tests/fixtures/contract-spec-fixture.json");
const EXOTIC_FIXTURE = join(root, "tests/fixtures/contract-spec-exotic-fixture.json");
const OUT_BASE = join(root, "build/generator-phasec-fixture-out");
const OUT_EXOTIC = join(root, "build/generator-phasec-exotic-out");

const NPM_INSTALL_TIMEOUT_MS = Number(process.env.GENERATOR_E2E_INSTALL_TIMEOUT_MS ?? 180_000);
const NPM_TYPECHECK_TIMEOUT_MS = Number(process.env.GENERATOR_E2E_TYPECHECK_TIMEOUT_MS ?? 120_000);

const quick = process.env.GENERATOR_E2E_QUICK === "1";
const full =
  !quick && (process.env.CI === "true" || process.env.GENERATOR_E2E_FULL === "1");

if (quick && (process.env.CI === "true" || process.env.GENERATOR_E2E_FULL === "1")) {
  console.error("Refusing GENERATOR_E2E_QUICK=1 together with CI or GENERATOR_E2E_FULL=1.");
  process.exit(1);
}

function runNode(args, opts = {}) {
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    ...opts
  });
  if (r.error) {
    throw r.error;
  }
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

function runNpm(cwd, args, timeoutMs) {
  const r = spawnSync("npm", args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, npm_config_loglevel: "warn" },
    timeout: timeoutMs
  });
  if (r.error) {
    throw r.error;
  }
  if (r.signal === "SIGTERM") {
    console.error(`npm ${args.join(" ")} timed out after ${timeoutMs}ms`);
    process.exit(1);
  }
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

function npmInstallProject(cwd) {
  const lock = join(cwd, "package-lock.json");
  if (existsSync(lock)) {
    runNpm(cwd, ["ci"], NPM_INSTALL_TIMEOUT_MS);
  } else {
    runNpm(cwd, ["install"], NPM_INSTALL_TIMEOUT_MS);
  }
}

function assertFiles(outDir) {
  const need = [
    join(outDir, "src/server.ts"),
    join(outDir, "src/generated/schemas.ts"),
    join(outDir, "src/registerContractTools.ts")
  ];
  for (const p of need) {
    if (!existsSync(p)) {
      console.error("Missing expected file:", p);
      process.exit(1);
    }
  }
}

mkdirSync(join(root, "build"), { recursive: true });

runNode([
  CLI,
  "--input",
  BASE_FIXTURE,
  "--out",
  OUT_BASE,
  "--name",
  "phasec-fixture",
  "--alias",
  "demo"
]);

assertFiles(OUT_BASE);

if (full) {
  runNode([
    CLI,
    "--input",
    EXOTIC_FIXTURE,
    "--out",
    OUT_EXOTIC,
    "--name",
    "phasec-exotic",
    "--alias",
    "exo"
  ]);
  assertFiles(OUT_EXOTIC);

  const exoticReg = readFileSync(
    join(OUT_EXOTIC, "src/registerContractTools.ts"),
    "utf8"
  );
  if (!/server\.tool\(\s*"exo_weird"/.test(exoticReg)) {
    console.error("Expected exo_weird tool in exotic fixture output.");
    process.exit(1);
  }

  npmInstallProject(OUT_BASE);
  runNpm(OUT_BASE, ["run", "typecheck"], NPM_TYPECHECK_TIMEOUT_MS);

  npmInstallProject(OUT_EXOTIC);
  runNpm(OUT_EXOTIC, ["run", "typecheck"], NPM_TYPECHECK_TIMEOUT_MS);

  console.error(
    "generator-e2e (full): baseline + exotic packages installed and typechecked."
  );
} else {
  console.error(
    "generator-e2e (quick): file checks only. For install+typecheck set GENERATOR_E2E_FULL=1 or run verify:phase:c."
  );
}
