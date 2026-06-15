import assert from "node:assert";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function fakeText(value: string) {
  return { toString: () => value };
}

function fakeType(arm: string) {
  return { switch: () => ({ name: arm }) };
}

function fakeInput(name: string, arm = "scSpecTypeString") {
  return {
    name: () => fakeText(name),
    type: () => fakeType(arm)
  };
}

function fakeFunc(name: string, inputNames: string[]) {
  return {
    name: () => fakeText(name),
    doc: () => fakeText(`Fake doc for ${name}`),
    inputs: () => inputNames.map((inputName) => fakeInput(inputName))
  };
}

function makeFakeLoadedSpec() {
  const funcs = [fakeFunc("combine", ["to", "constructor", "fn_constructor"])];
  const spec = {
    funcs: () => funcs,
    getFunc: (name: string) => funcs.find((fn) => fn.name().toString() === name) ?? funcs[0]
  };

  return { spec, entriesBase64: ["fake-entry-1"] };
}

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
    assert.match(register, /args: \{ "count": input\.count \}/);

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
    assert.match(register, /args: \{ "data": input\.data \}/);

    const schemas = readFileSync(join(dir, "src/generated/schemas.ts"), "utf8");
    assert.match(schemas, /z\.record\(z\.string\(\), z\.unknown\(\)\)/);

    const genErrors = readFileSync(join(dir, "src/lib/errors.ts"), "utf8");
    assert.strictEqual(genErrors, readFileSync(rootErrorsPath, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("generator preserves raw arg names and resolves local identifier collisions", () => {
  const dir = mkdtempSync(join(tmpdir(), "stellarmcp-gen-collision-"));
  try {
    generateProject({
      outDir: dir,
      packageName: "collision-pkg",
      toolAlias: "demo",
      loaded: makeFakeLoadedSpec() as never
    });

    const register = readFileSync(join(dir, "src/registerContractTools.ts"), "utf8");
    assert.match(register, /server\.tool\(\s*"demo_combine"/);
    assert.match(register, /method: "combine"/);
    assert.match(
      register,
      /args:\s*\{\s*"to": input\.to,\s*"constructor": input\.fn_constructor,\s*"fn_constructor": input\.fn_constructor_1\s*\}/s
    );

    const typed = readFileSync(join(dir, "src/generated/typedClient.ts"), "utf8");
    assert.match(
      typed,
      /"combine": \(args: CombineArgs\) => \(\{ "to": args\.to, "constructor": args\.fn_constructor, "fn_constructor": args\.fn_constructor_1 \}\)/s
    );
    assert.match(typed, /export type CombineArgs = \{ to: string; fn_constructor: string; fn_constructor_1: string \};/s);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("generator removes stale files on regeneration", () => {
  const dir = mkdtempSync(join(tmpdir(), "stellarmcp-gen-stale-"));
  try {
    const loaded = loadSpecFromJsonFile(fixturePath);
    generateProject({
      outDir: dir,
      packageName: "stale-pkg",
      toolAlias: "demo",
      loaded
    });

    const stalePath = join(dir, "stale.txt");
    const markerPath = join(dir, "src/generated/stale-marker.ts");
    writeFileSync(stalePath, "stale", "utf8");
    writeFileSync(markerPath, "stale", "utf8");

    generateProject({
      outDir: dir,
      packageName: "stale-pkg",
      toolAlias: "demo",
      loaded
    });

    assert.equal(existsSync(stalePath), false);
    assert.equal(existsSync(markerPath), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("generator rejects filesystem root output dir", () => {
  assert.throws(
    () =>
      generateProject({
        outDir: "/",
        packageName: "root-pkg",
        toolAlias: "demo",
        loaded: loadSpecFromJsonFile(fixturePath)
      }),
    /filesystem root/i
  );
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
