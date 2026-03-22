import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. This smoke test performs live testnet operations.`
    );
  }
  return value;
}

async function main(): Promise<void> {
  const sourceSecret = requiredEnv("STELLAR_SECRET_KEY");
  const destinationPublicKey = requiredEnv("STELLAR_SMOKE_DESTINATION_PUBLIC_KEY");
  const trustlineAssetCode = requiredEnv("STELLAR_SMOKE_ASSET_CODE");
  const trustlineAssetIssuer = requiredEnv("STELLAR_SMOKE_ASSET_ISSUER");

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
      STELLAR_NETWORK: "testnet",
      STELLAR_SECRET_KEY: sourceSecret,
      MCP_TRANSPORT: "stdio"
    }
  });

  const client = new Client({
    name: "stellarmcp-tier1-smoke",
    version: "0.1.7"
  });

  try {
    await client.connect(transport);

    // Resolve source account from secret key through server tool path.
    const sourceKeypair = await import("@stellar/stellar-sdk").then(({ Keypair }) =>
      Keypair.fromSecret(sourceSecret)
    );
    const sourcePublicKey = sourceKeypair.publicKey();

    const accountResult = await client.callTool({
      name: "stellar_get_account",
      arguments: {
        publicKey: sourcePublicKey
      }
    });
    if (accountResult.isError) {
      throw new Error("stellar_get_account failed in smoke test.");
    }

    const feeResult = await client.callTool({
      name: "stellar_get_fee_stats",
      arguments: {}
    });
    if (feeResult.isError) {
      throw new Error("stellar_get_fee_stats failed in smoke test.");
    }

    const trustlineResult = await client.callTool({
      name: "stellar_create_trustline",
      arguments: {
        account: sourcePublicKey,
        asset_code: trustlineAssetCode,
        asset_issuer: trustlineAssetIssuer
      }
    });
    if (trustlineResult.isError) {
      throw new Error(
        "stellar_create_trustline failed in smoke test. Ensure issuer/code are valid on testnet."
      );
    }

    const paymentResult = await client.callTool({
      name: "stellar_submit_payment",
      arguments: {
        from: sourcePublicKey,
        to: destinationPublicKey,
        asset: { type: "native" },
        amount: "0.0000001",
        memo: { type: "text", value: "smoke" }
      }
    });
    if (paymentResult.isError) {
      throw new Error(
        "stellar_submit_payment failed in smoke test. Ensure destination exists on testnet."
      );
    }
  } finally {
    await client.close();
    await transport.close();
  }
}

await main();
console.error("Tier-1 live smoke checks passed on testnet.");
