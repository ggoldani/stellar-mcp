/**
 * Real testnet smoke: stdio MCP client calls Horizon + Soroban RPC (no secret key).
 * Run: npm run build && npm run smoke:testnet:readonly
 */
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Keypair } from "@stellar/stellar-sdk";

async function fundWithFriendbot(publicKey: string): Promise<void> {
  const response = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Friendbot funding failed for ${publicKey}: ${body}`);
  }
}

function parseToolText(result: unknown): Record<string, unknown> {
  const maybe = result as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = maybe.content?.find((entry) => entry.type === "text")?.text;
  if (!text) {
    throw new Error("Tool response did not include text payload.");
  }
  return JSON.parse(text) as Record<string, unknown>;
}

async function latestClosedLedgerSequence(): Promise<number> {
  const res = await fetch(
    "https://horizon-testnet.stellar.org/ledgers?order=desc&limit=1"
  );
  if (!res.ok) {
    throw new Error(`Horizon ledgers fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { _embedded?: { records?: Array<{ sequence?: number }> } };
  const seq = body._embedded?.records?.[0]?.sequence;
  if (typeof seq !== "number") {
    throw new Error("Could not parse latest ledger sequence from Horizon.");
  }
  return seq;
}

async function rpcLatestLedger(): Promise<number> {
  const res = await fetch("https://soroban-testnet.stellar.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getLatestLedger",
      params: {}
    })
  });
  if (!res.ok) {
    throw new Error(`Soroban getLatestLedger failed: ${res.status}`);
  }
  const body = (await res.json()) as {
    result?: { sequence?: number };
    error?: { message?: string };
  };
  if (body.error) {
    throw new Error(body.error.message ?? "getLatestLedger RPC error");
  }
  const seq = body.result?.sequence;
  if (typeof seq !== "number") {
    throw new Error("Could not parse latest ledger from Soroban RPC.");
  }
  return seq;
}

async function main(): Promise<void> {
  const account = Keypair.random();
  await fundWithFriendbot(account.publicKey());

  const transport = new StdioClientTransport({
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

  const client = new Client({
    name: "stellarmcp-testnet-readonly-smoke",
    version: "0.1.7"
  });

  try {
    await client.connect(transport);

    const feeResult = await client.callTool({
      name: "stellar_get_fee_stats",
      arguments: {}
    });
    if (feeResult.isError) {
      throw new Error("stellar_get_fee_stats failed (isError=true).");
    }
    const feePayload = parseToolText(feeResult);
    assert.equal(typeof feePayload.baseFee, "string");
    assert.equal(typeof feePayload.recommendedFee, "string");
    assert.equal(feePayload.dryRunWarning !== undefined, true);

    const acctResult = await client.callTool({
      name: "stellar_get_account",
      arguments: { publicKey: account.publicKey() }
    });
    if (acctResult.isError) {
      throw new Error("stellar_get_account failed (isError=true).");
    }
    const acctPayload = parseToolText(acctResult);
    assert.equal(typeof acctPayload.accountId, "string");

    const ledgerSeq = await latestClosedLedgerSequence();
    const ledgerResult = await client.callTool({
      name: "stellar_get_ledger_meta",
      arguments: { ledgerSequence: ledgerSeq, maxXdrCharsPerField: 512 }
    });
    if (ledgerResult.isError) {
      throw new Error("stellar_get_ledger_meta failed (isError=true).");
    }
    const ledgerPayload = parseToolText(ledgerResult);
    const ledger = ledgerPayload.ledger as { sequence?: number } | undefined;
    assert.equal(typeof ledger?.sequence, "number");

    const rpcLatest = await rpcLatestLedger();
    const startLedger = Math.max(1, rpcLatest - 50);
    const eventsResult = await client.callTool({
      name: "stellar_soroban_get_events",
      arguments: { startLedger, limit: 5 }
    });
    if (eventsResult.isError) {
      throw new Error("stellar_soroban_get_events failed (isError=true).");
    }
    const eventsPayload = parseToolText(eventsResult);
    assert.ok(Array.isArray(eventsPayload.events));
    assert.equal(typeof eventsPayload.latestLedger, "number");

    // Soroban simulate against a live testnet contract (events showed activity on this id).
    const liveContract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    const simResult = await client.callTool({
      name: "stellar_soroban_simulate",
      arguments: {
        contractId: liveContract,
        method: "decimals",
        sourceAccount: account.publicKey(),
        args: []
      }
    });
    if (simResult.isError) {
      throw new Error("stellar_soroban_simulate failed (isError=true).");
    }
    const simPayload = parseToolText(simResult);
    assert.ok(Array.isArray(simPayload.results));
    assert.ok(
      typeof simPayload.minResourceFee === "string" ||
        typeof simPayload.minResourceFee === "number"
    );
  } finally {
    await client.close();
    await transport.close();
  }
}

await main();
console.error("Testnet read-only MCP smoke passed (Horizon + Soroban).");
