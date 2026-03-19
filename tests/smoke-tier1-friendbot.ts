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

async function main(): Promise<void> {
  const source = Keypair.random();
  const destination = Keypair.random();
  const issuer = Keypair.random();
  const assetCode = "FBTST";

  await fundWithFriendbot(source.publicKey());
  await fundWithFriendbot(destination.publicKey());
  await fundWithFriendbot(issuer.publicKey());

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
      STELLAR_SECRET_KEY: source.secret(),
      STELLAR_AUTO_SIGN: "true",
      STELLAR_AUTO_SIGN_LIMIT: "0"
    }
  });

  const client = new Client({
    name: "stellarmcp-tier1-friendbot-smoke",
    version: "0.1.0"
  });

  try {
    await client.connect(transport);

    const accountResult = await client.callTool({
      name: "stellar_get_account",
      arguments: { publicKey: source.publicKey() }
    });
    if (accountResult.isError) {
      throw new Error("stellar_get_account failed in friendbot smoke.");
    }

    const feeResult = await client.callTool({
      name: "stellar_get_fee_stats",
      arguments: {}
    });
    if (feeResult.isError) {
      throw new Error("stellar_get_fee_stats failed in friendbot smoke.");
    }

    const trustlineResult = await client.callTool({
      name: "stellar_create_trustline",
      arguments: {
        account: source.publicKey(),
        asset_code: assetCode,
        asset_issuer: issuer.publicKey()
      }
    });
    if (trustlineResult.isError) {
      throw new Error("stellar_create_trustline failed in friendbot smoke.");
    }
    const trustlinePayload = parseToolText(trustlineResult);
    assert.equal(
      trustlinePayload.mode,
      "signed_submitted",
      "Expected trustline operation to be signed and submitted."
    );
    assert.equal(
      typeof trustlinePayload.hash,
      "string",
      "Expected trustline response to include transaction hash."
    );

    const paymentResult = await client.callTool({
      name: "stellar_submit_payment",
      arguments: {
        from: source.publicKey(),
        to: destination.publicKey(),
        asset: { type: "native" },
        amount: "0.0000001",
        memo: { type: "text", value: "friendbot-smoke" }
      }
    });
    if (paymentResult.isError) {
      throw new Error("stellar_submit_payment failed in friendbot smoke.");
    }
    const paymentPayload = parseToolText(paymentResult);
    assert.equal(
      paymentPayload.mode,
      "signed_submitted",
      "Expected payment operation to be signed and submitted."
    );
    assert.equal(
      typeof paymentPayload.hash,
      "string",
      "Expected payment response to include transaction hash."
    );
  } finally {
    await client.close();
    await transport.close();
  }
}

await main();
console.error("Tier-1 friendbot smoke checks passed on testnet.");
