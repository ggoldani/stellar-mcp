/**
 * Demo: Friendbot → stellar_get_account_history via StellarMCP stdio.
 * Run: npm run build && node build/tests/friendbot-account-history-demo.js
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Keypair } from "@stellar/stellar-sdk";

async function fundWithFriendbot(publicKey: string): Promise<void> {
  const response = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Friendbot funding failed: ${body}`);
  }
}

function parseToolText(result: unknown): Record<string, unknown> {
  const maybe = result as {
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
  };
  if (maybe.isError) {
    const text = maybe.content?.find((e) => e.type === "text")?.text ?? "unknown error";
    throw new Error(`Tool error: ${text}`);
  }
  const text = maybe.content?.find((entry) => entry.type === "text")?.text;
  if (!text) {
    throw new Error("Tool response did not include text payload.");
  }
  return JSON.parse(text) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const kp = Keypair.random();
  const publicKey = kp.publicKey();
  console.error("Funding testnet account via Friendbot:", publicKey);
  await fundWithFriendbot(publicKey);

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
    name: "friendbot-history-demo",
    version: "0.1.7"
  });

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "stellar_get_account_history",
      arguments: {
        publicKey,
        limit: 10
      }
    });
    const payload = parseToolText(result);
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

await main();
