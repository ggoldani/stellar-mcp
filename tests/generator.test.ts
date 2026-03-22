import assert from "node:assert";
import { readFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { generateProject } from "../src/generator/emit.js";
import { loadSpecFromJsonFile } from "../src/generator/loadSpec.js";

/** Resolved from repo root; `npm test` runs with cwd = project root. */
const fixturePath = join(process.cwd(), "tests/fixtures/contract-spec-fixture.json");
const exoticFixturePath = join(process.cwd(), "tests/fixtures/contract-spec-exotic-fixture.json");

const rootErrorsPath = join(process.cwd(), "src/lib/errors.ts");
const rootRedactPath = join(process.cwd(), "src/lib/redact.ts");

test("generator: fixture spec loads and lists expected functions", () => {
  const { spec } = loadSpecFromJsonFile(fixturePath);
  const names = spec.funcs().map((f) => f.name().toString()).sort();
  assert.deepStrictEqual(names, ["hello", "increment"]);
});

test("generator: conformance output for fixture (tools, schemas, meta)", () => {
  const dir = mkdtempSync(join(tmpdir(), "stellarmcp-gen-"));
  try {
    const loaded = loadSpecFromJsonFile(fixturePath);
    generateProject({
      outDir: dir,
      packageName: "fixture-pkg",
      toolAlias: "demo",
      loaded
    });

    const register = readFileSync(join(dir, "src/registerContractTools.ts"), "utf8");
    assert.match(register, /server\.tool\(\s*"demo_increment"/);
    assert.match(register, /server\.tool\(\s*"demo_hello"/);
    assert.match(register, /method: "increment"/);
    assert.match(register, /method: "hello"/);
    assert.match(register, /args: \{ count: input\.count \}/);

    const schemas = readFileSync(join(dir, "src/generated/schemas.ts"), "utf8");
    assert.match(schemas, /export const incrementInputSchema/);
    assert.match(schemas, /export const helloInputSchema/);
    assert.match(schemas, /count: z\.number\(\)\.int\(\)\.min\(0\)\.max\(4294967295\)/);

    const meta = readFileSync(join(dir, "src/generated/meta.ts"), "utf8");
    assert.match(meta, /export const GENERATOR_ARTIFACT_VERSION = "1"/);
    assert.match(meta, /SPEC_FINGERPRINT = "/);

    const typed = readFileSync(join(dir, "src/generated/typedClient.ts"), "utf8");
    assert.match(typed, /export type IncrementArgs/);
    assert.match(typed, /GeneratedContractCalls/);

    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    assert.strictEqual(pkg.name, "fixture-pkg");

    const genErrors = readFileSync(join(dir, "src/lib/errors.ts"), "utf8");
    assert.match(genErrors, /export function normalizeStellarError/);
    assert.strictEqual(genErrors, readFileSync(rootErrorsPath, "utf8"), "errors.ts must match repo (no drift)");

    const genRedact = readFileSync(join(dir, "src/lib/redact.ts"), "utf8");
    assert.match(genRedact, /export function redactSensitiveText/);
    assert.strictEqual(genRedact, readFileSync(rootRedactPath, "utf8"), "redact.ts must match repo (no drift)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("generator: exotic ScSpecTypeMap fixture emits loose schema + tool registration", () => {
  const dir = mkdtempSync(join(tmpdir(), "stellarmcp-gen-exotic-"));
  try {
    const { spec } = loadSpecFromJsonFile(exoticFixturePath);
    assert.deepStrictEqual(
      spec.funcs().map((f) => f.name().toString()),
      ["weird"]
    );

    const loaded = loadSpecFromJsonFile(exoticFixturePath);
    generateProject({
      outDir: dir,
      packageName: "exo-pkg",
      toolAlias: "exo",
      loaded
    });

    const register = readFileSync(join(dir, "src/registerContractTools.ts"), "utf8");
    assert.match(register, /server\.tool\(\s*"exo_weird"/);
    assert.match(register, /method: "weird"/);
    assert.match(register, /args: \{ data: input\.data \}/);

    const schemas = readFileSync(join(dir, "src/generated/schemas.ts"), "utf8");
    assert.match(schemas, /z\.record\(z\.string\(\), z\.unknown\(\)\)/);

    const genErrors = readFileSync(join(dir, "src/lib/errors.ts"), "utf8");
    assert.strictEqual(genErrors, readFileSync(rootErrorsPath, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("generator: spec fingerprint is stable for fixture entries", () => {
  const { entriesBase64 } = loadSpecFromJsonFile(fixturePath);
  const sorted = [...entriesBase64].sort().join("|");
  assert.strictEqual(
    sorted,
    [
      "AAAAAAAAAAAAAAAFaGVsbG8AAAAAAAAAAAAAAA==",
      "AAAAAAAAAAAAAAAJaW5jcmVtZW50AAAAAAAAAQAAAAAAAAAFY291bnQAAAAAAAAEAAAAAQAAAAQ="
    ].join("|")
  );
});
