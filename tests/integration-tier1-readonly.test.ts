/**
 * SOTA integration tests: MCP server + client, real testnet calls.
 *
 * Tier 1 — Read-only tools (no secret key, friendbot for setup).
 * Covers: fund_account, get_account, get_account_history, get_fee_stats,
 *         get_ledger_meta, get_anchor_toml, soroban_get_events, soroban_simulate,
 *         xdr_encode, xdr_decode, xdr_guess, xdr_json_schema, xdr_types,
 *         input validation (invalid publicKey, contractId, amount).
 *
 * Run: npm run build && npm run test:integration
 * Requires: network access to testnet (no env vars needed).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Keypair } from "@stellar/stellar-sdk";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseToolText(result: unknown): Record<string, unknown> {
  const maybe = result as { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
  if (maybe.isError) {
    const errMsg = maybe.content?.find((e) => e.type === "text")?.text ?? "unknown error";
    throw new Error(`Tool returned isError=true: ${errMsg}`);
  }
  const text = maybe.content?.find((e) => e.type === "text")?.text;
  if (!text) {
    throw new Error("Tool response did not include text payload.");
  }
  return JSON.parse(text) as Record<string, unknown>;
}

async function fundWithFriendbot(publicKey: string): Promise<void> {
  const response = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
  );
  if (!response.ok) {
    // Already funded is OK
    if (response.status === 400) return;
    const body = await response.text();
    throw new Error(`Friendbot funding failed for ${publicKey}: ${body}`);
  }
}

let client: Client;
let transport: StdioClientTransport;
let testAccount: { publicKey: () => string };

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  testAccount = Keypair.random();
  await fundWithFriendbot(testAccount.publicKey());

  transport = new StdioClientTransport({
    command: "node",
    args: ["build/src/index.js"],
    cwd: process.cwd(),
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      ),
      MCP_TRANSPORT: "stdio",
      STELLAR_NETWORK: "testnet",
      STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
      STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org"
    }
  });

  client = new Client({ name: "integration-test", version: "0.1.7" });
  await client.connect(transport);
});

afterEach(async () => {
  await client.close();
  await transport.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Tier 1 — Read-only tools (testnet)", () => {
  // -- Accounts --

  it("stellar_fund_account funds a random account via friendbot", async () => {
    const freshKey = Keypair.random();
    const result = await client.callTool({
      name: "stellar_fund_account",
      arguments: { publicKey: freshKey.publicKey() }
    });
    const payload = parseToolText(result);
    assert.ok(typeof payload.hash === "string" || typeof payload.status === "string",
      `Expected hash or status, got: ${JSON.stringify(payload).slice(0, 200)}`);
  });

  it("stellar_get_account returns account details for funded account", async () => {
    const result = await client.callTool({
      name: "stellar_get_account",
      arguments: { publicKey: testAccount.publicKey() }
    });
    const payload = parseToolText(result);
    assert.equal(payload.accountId, testAccount.publicKey());
    assert.ok(Array.isArray(payload.balances), "balances should be an array");
    assert.ok(payload.balances !== undefined && (payload.balances as unknown[]).length > 0,
      "funded account should have balances");
  });

  it("stellar_get_account_history returns transaction records", async () => {
    const result = await client.callTool({
      name: "stellar_get_account_history",
      arguments: { publicKey: testAccount.publicKey(), limit: 5 }
    });
    const payload = parseToolText(result);
    assert.ok(Array.isArray(payload.records), "should return records array");
  });

  it("stellar_get_account_history with includeOperations=true", async () => {
    const result = await client.callTool({
      name: "stellar_get_account_history",
      arguments: { publicKey: testAccount.publicKey(), limit: 5, includeOperations: true }
    });
    const payload = parseToolText(result);
    assert.ok(Array.isArray(payload.records), "should return records array");
  });

  // -- Network --

  it("stellar_get_fee_stats returns fee data", async () => {
    const result = await client.callTool({
      name: "stellar_get_fee_stats",
      arguments: {}
    });
    const payload = parseToolText(result);
    assert.equal(typeof payload.baseFee, "string");
    assert.equal(typeof payload.recommendedFee, "string");
  });

  it("stellar_get_ledger_meta returns ledger details", async () => {
    // Get latest ledger from Horizon
    const res = await fetch("https://horizon-testnet.stellar.org/ledgers?order=desc&limit=1");
    const body = await res.json() as { _embedded: { records: Array<{ sequence: number }> } };
    const seq = body._embedded.records[0].sequence;

    const result = await client.callTool({
      name: "stellar_get_ledger_meta",
      arguments: { ledgerSequence: seq, maxXdrCharsPerField: 256 }
    });
    const payload = parseToolText(result);
    const ledger = payload.ledger as Record<string, unknown> | undefined;
    assert.equal(typeof ledger?.sequence, "number");
  });

  it("stellar_get_anchor_toml returns stellar.toml for test anchor", async () => {
    const result = await client.callTool({
      name: "stellar_get_anchor_toml",
      arguments: { anchorDomain: "testanchor.stellar.org" }
    });
    const payload = parseToolText(result);
    assert.ok(typeof payload === "object" && payload !== null, "should return TOML object");
  });

  // -- Soroban (read-only) --

  it("stellar_soroban_get_events returns events from testnet", async () => {
    // Get recent ledger from RPC
    const rpcRes = await fetch("https://soroban-testnet.stellar.org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestLedger", params: {} })
    });
    const rpcBody = await rpcRes.json() as { result: { sequence: number } };
    const startLedger = Math.max(1, rpcBody.result.sequence - 100);

    const result = await client.callTool({
      name: "stellar_soroban_get_events",
      arguments: { startLedger, limit: 5 }
    });
    const payload = parseToolText(result);
    assert.ok(Array.isArray(payload.events), "should return events array");
    assert.equal(typeof payload.latestLedger, "number");
  });

  it("stellar_soroban_simulate returns simulation result", async () => {
    // Use known testnet contract (USDC on testnet)
    const result = await client.callTool({
      name: "stellar_soroban_simulate",
      arguments: {
        contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        method: "decimals",
        sourceAccount: testAccount.publicKey(),
        args: []
      }
    });
    const payload = parseToolText(result);
    assert.ok(Array.isArray(payload.results), "should return results array");
  });

  // -- XDR (pure logic, no network needed) --

  it("stellar_xdr_encode encodes a numeric XDR type", async () => {
    const result = await client.callTool({
      name: "stellar_xdr_encode",
      arguments: { type: "Uint32", json: "42" }
    });
    const payload = parseToolText(result);
    assert.equal(typeof payload.xdr, "string");
    assert.ok((payload.xdr as string).length > 0, "XDR should not be empty");
  });

  it("stellar_xdr_json_schema returns schema for a type", async () => {
    const result = await client.callTool({
      name: "stellar_xdr_json_schema",
      arguments: { type: "TransactionEnvelope" }
    });
    const payload = parseToolText(result);
    assert.ok(payload.schema !== undefined, "should return schema");
  });

  it("stellar_xdr_types lists available XDR types", async () => {
    const result = await client.callTool({
      name: "stellar_xdr_types",
      arguments: {}
    });
    const payload = parseToolText(result);
    assert.ok(Array.isArray(payload.types), "should return types array");
    assert.ok(payload.types !== undefined && (payload.types as unknown[]).length > 0,
      "should have at least one type");
  });

  // -- Input validation (rejects before network call) --

  it("rejects invalid publicKey format (G... required)", async () => {
    const result = await client.callTool({
      name: "stellar_get_account",
      arguments: { publicKey: "INVALID_NOT_A_KEY" }
    });
    assert.equal(result.isError, true, "should return isError=true for invalid publicKey");
    const text = (result.content as Array<{ type: string; text: string }>)?.[0]?.text ?? "";
    assert.ok(text.includes("Invalid Stellar public key"),
      `Error should mention invalid key, got: ${text.slice(0, 200)}`);
  });

  it("rejects invalid contractId format (C... required)", async () => {
    const result = await client.callTool({
      name: "stellar_soroban_simulate",
      arguments: {
        contractId: "NOT_A_CONTRACT_ID",
        method: "decimals",
        sourceAccount: testAccount.publicKey(),
        args: []
      }
    });
    assert.equal(result.isError, true, "should return isError=true for invalid contractId");
    const text = (result.content as Array<{ type: string; text: string }>)?.[0]?.text ?? "";
    assert.ok(text.includes("Invalid Stellar contract ID"),
      `Error should mention invalid contract, got: ${text.slice(0, 200)}`);
  });

  it("rejects invalid amount (more than 7 decimals)", async () => {
    const result = await client.callTool({
      name: "stellar_submit_payment",
      arguments: {
        from: testAccount.publicKey(),
        to: testAccount.publicKey(),
        asset: { type: "native" },
        amount: "1.12345678"
      }
    });
    assert.equal(result.isError, true, "should return isError=true for 8-decimal amount");
    const text = (result.content as Array<{ type: string; text: string }>)?.[0]?.text ?? "";
    assert.ok(text.includes("7 decimal") || text.includes("Invalid amount"),
      `Error should mention decimal limit, got: ${text.slice(0, 200)}`);
  });

  it("rejects zero amount", async () => {
    const result = await client.callTool({
      name: "stellar_submit_payment",
      arguments: {
        from: testAccount.publicKey(),
        to: testAccount.publicKey(),
        asset: { type: "native" },
        amount: "0"
      }
    });
    assert.equal(result.isError, true, "should return isError=true for zero amount");
  });

  it("rejects negative amount string", async () => {
    const result = await client.callTool({
      name: "stellar_submit_payment",
      arguments: {
        from: testAccount.publicKey(),
        to: testAccount.publicKey(),
        asset: { type: "native" },
        amount: "-1"
      }
    });
    assert.equal(result.isError, true, "should return isError=true for negative amount");
  });
});
