/**
 * E2E security hardening tests — rejection AND happy paths.
 * Run: STELLAR_SECRET_KEY=<secret> node build/tests/security-e2e.test.js
 */
import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFileSync } from "node:fs";

const sk = process.env.STELLAR_SECRET_KEY;
if (!sk) { console.error("Need STELLAR_SECRET_KEY"); process.exit(1); }

let PUBKEY = "";
const PROJECT = "/home/debian/Documents/Projects/stellar-mcp";
const WASM_PATH = "/tmp/test-contract.wasm";

before(async () => {
  const { Keypair } = await import("@stellar/stellar-sdk");
  PUBKEY = Keypair.fromSecret(sk).publicKey();
  writeFileSync(WASM_PATH, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function textOf(r: any): string { return r.content?.find((e: any) => e.type === "text")?.text ?? ""; }
function isErr(r: any): boolean { return !!r.isError; }
async function raw(c: any, name: string, args: Record<string, unknown>): Promise<any> {
  return await c.callTool({ name, arguments: args });
}
async function ok(c: any, name: string, args: Record<string, unknown>): Promise<string> {
  const r = await raw(c, name, args);
  if (r.isError) throw new Error(`Tool error: ${textOf(r)}`);
  return textOf(r);
}
function spawn(opts: Record<string, string>): Promise<any> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  Object.assign(env, opts);
  const t = new StdioClientTransport({ command: "node", args: [`${PROJECT}/build/src/index.js`], env, cwd: PROJECT });
  return new Client({ name: "test", version: "1.0" }).connect(t);
}

// Valid public key from a different account (Friendbot-funded)
const OTHER_KEY = "GBY3WHJBR47DDMS7EKYW266W5C2KOULJ572CPN6LPJ5VLLBXXGE2BDZ6";

// ---------------------------------------------------------------------------
// 1. Path traversal
// ---------------------------------------------------------------------------
describe("1. Path traversal", () => {
  let c: any;
  before(async () => { c = await spawn({ STELLAR_NETWORK: "testnet", STELLAR_SECRET_KEY: sk, STELLAR_AUTO_SIGN_POLICY: "safe" }); });

  it("REJECT /etc/passwd", async () => {
    const r = await raw(c, "stellar_soroban_deploy", { wasmFilePath: "/etc/passwd", sourceAccount: PUBKEY });
    assert.ok(isErr(r)); assert.ok(textOf(r).includes("forbidden"));
  });
  it("REJECT ../../etc/hosts", async () => {
    const r = await raw(c, "stellar_soroban_deploy", { wasmFilePath: "../../etc/hosts", sourceAccount: PUBKEY });
    assert.ok(isErr(r)); assert.ok(textOf(r).includes("forbidden"));
  });
  it("REJECT /proc/self/mem", async () => {
    const r = await raw(c, "stellar_soroban_deploy", { wasmFilePath: "/proc/self/mem", sourceAccount: PUBKEY });
    assert.ok(isErr(r)); assert.ok(textOf(r).includes("forbidden"));
  });
  it("ACCEPT valid path → fails at RPC, not path validation", async () => {
    const r = await raw(c, "stellar_soroban_deploy", { wasmFilePath: WASM_PATH, sourceAccount: PUBKEY });
    assert.ok(!textOf(r).includes("forbidden"), `not path rejection: ${textOf(r).substring(0, 200)}`);
  });
  it("ACCEPT relative path without ..", async () => {
    const r = await raw(c, "stellar_soroban_deploy", { wasmFilePath: "./build/test.wasm", sourceAccount: PUBKEY });
    assert.ok(!textOf(r).includes("forbidden"));
  });
});

// ---------------------------------------------------------------------------
// 2. Source key mismatch — use guarded policy so signing path is exercised
// ---------------------------------------------------------------------------
describe("2. Source key mismatch", () => {
  let c: any;
  before(async () => { c = await spawn({ STELLAR_NETWORK: "testnet", STELLAR_SECRET_KEY: sk, STELLAR_AUTO_SIGN_POLICY: "guarded", STELLAR_AUTO_SIGN_LIMIT: "100" }); });

  it("soroban_invoke REJECTS wrong source key", async () => {
    const r = await raw(c, "stellar_soroban_invoke", {
      contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      sourceAccount: OTHER_KEY,
      method: "hello",
      args: [],
    });
    assert.ok(isErr(r), "should be error");
    assert.ok(textOf(r).includes("does not match"), `expected mismatch: ${textOf(r).substring(0, 200)}`);
  });

  it("soroban_invoke ACCEPTS correct key → reaches RPC (no key error)", async () => {
    const r = await raw(c, "stellar_soroban_invoke", {
      contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      sourceAccount: PUBKEY,
      method: "hello",
      args: [],
    });
    assert.ok(!textOf(r).includes("does not match"), `no mismatch: ${textOf(r).substring(0, 200)}`);
  });

  it("stellar_set_options REJECTS wrong key", async () => {
    const r = await raw(c, "stellar_set_options", { sourceAccount: OTHER_KEY, inflationDestination: PUBKEY });
    assert.ok(isErr(r));
    assert.ok(textOf(r).includes("does not match"), `expected mismatch: ${textOf(r).substring(0, 200)}`);
  });

  it("stellar_set_options ACCEPTS correct key → submits", async () => {
    const r = await raw(c, "stellar_set_options", { sourceAccount: PUBKEY, inflationDestination: PUBKEY });
    assert.ok(!textOf(r).includes("does not match"), `no mismatch: ${textOf(r).substring(0, 200)}`);
    // May succeed or fail at Horizon, but NOT at key check
    if (isErr(r)) assert.ok(!textOf(r).includes("mismatch"), `horizon error: ${textOf(r).substring(0, 200)}`);
    else assert.ok(textOf(r).includes("success") || textOf(r).includes("hash"));
  });
});

// ---------------------------------------------------------------------------
// 3. Auto-sign policy flow
// ---------------------------------------------------------------------------
describe("3. Auto-sign policy", () => {
  it("safe → always unsigned", async () => {
    const c = await spawn({ STELLAR_NETWORK: "testnet", STELLAR_SECRET_KEY: sk, STELLAR_AUTO_SIGN_POLICY: "safe" });
    const r = await raw(c, "stellar_submit_payment", { from: PUBKEY, to: PUBKEY, asset: { type: "native" }, amount: "0.000001" });
    assert.ok(textOf(r).includes("unsigned"), `safe = unsigned: ${textOf(r).substring(0, 200)}`);
  });

  it("guarded + non-native → unsigned (no valuation)", async () => {
    const c = await spawn({ STELLAR_NETWORK: "testnet", STELLAR_SECRET_KEY: sk, STELLAR_AUTO_SIGN_POLICY: "guarded", STELLAR_AUTO_SIGN_LIMIT: "100" });
    const r = await raw(c, "stellar_submit_payment", {
      from: PUBKEY, to: PUBKEY,
      asset: { type: "credit", code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
      amount: "10",
    });
    assert.ok(textOf(r).includes("unsigned"), `no valuation → unsigned: ${textOf(r).substring(0, 200)}`);
  });

  it("guarded + XLM on testnet → unsigned (no SEP-38 price feed)", async () => {
    const c = await spawn({ STELLAR_NETWORK: "testnet", STELLAR_SECRET_KEY: sk, STELLAR_AUTO_SIGN_POLICY: "guarded", STELLAR_AUTO_SIGN_LIMIT: "100" });
    const r = await raw(c, "stellar_submit_payment", { from: PUBKEY, to: PUBKEY, asset: { type: "native" }, amount: "0.000001" });
    // Without SEP-38 URL, valuation fails → unsigned. This is correct behavior.
    assert.ok(textOf(r).includes("unsigned"), `no price feed → unsigned: ${textOf(r).substring(0, 200)}`);
  });

  it("expert → signs and submits to testnet (no limit check)", async () => {
    const c = await spawn({ STELLAR_NETWORK: "testnet", STELLAR_SECRET_KEY: sk, STELLAR_AUTO_SIGN_POLICY: "expert" });
    const r = await raw(c, "stellar_submit_payment", { from: PUBKEY, to: PUBKEY, asset: { type: "native" }, amount: "0.000001" });
    assert.ok(!textOf(r).includes("does not match"), `no key error: ${textOf(r).substring(0, 200)}`);
    // Expert always signs. May fail at Horizon (seq, fees) but NOT at policy
    if (isErr(r)) {
      assert.ok(!textOf(r).includes("unsigned") && !textOf(r).includes("mismatch"),
        `horizon error, not policy: ${textOf(r).substring(0, 200)}`);
    } else {
      assert.ok(textOf(r).includes("success") || textOf(r).includes("hash"));
    }
  });
});

// ---------------------------------------------------------------------------
// 4. SSRF
// ---------------------------------------------------------------------------
describe("4. SSRF + real fetch", () => {
  let c: any;
  before(async () => { c = await spawn({ STELLAR_NETWORK: "testnet", STELLAR_SECRET_KEY: sk, STELLAR_AUTO_SIGN_POLICY: "safe" }); });

  it("real anchor toml works", async () => {
    const r = await ok(c, "stellar_get_anchor_toml", { anchorDomain: "demo-wallet.stellar.org" });
    assert.ok(JSON.parse(r));
  });
  it("malformed domain fails gracefully", async () => {
    const r = await raw(c, "stellar_get_anchor_toml", { anchorDomain: "not-real-xyz123.test" });
    assert.ok(isErr(r));
  });
});

// ---------------------------------------------------------------------------
// 5. Startup
// ---------------------------------------------------------------------------
describe("5. Single key parse", () => {
  it("server starts and queries account", async () => {
    const c = await spawn({ STELLAR_NETWORK: "testnet", STELLAR_SECRET_KEY: sk, STELLAR_AUTO_SIGN_POLICY: "safe" });
    const r = await raw(c, "stellar_get_account", { publicKey: PUBKEY });
    assert.ok(!isErr(r), `account lookup works: ${textOf(r).substring(0, 200)}`);
  });
});
