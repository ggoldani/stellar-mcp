import {
  Asset,
  Keypair,
  Memo,
  Operation,
  TransactionBuilder
} from "@stellar/stellar-sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { normalizeStellarError } from "../lib/errors.js";
import { createStellarClients } from "../lib/stellar.js";
import { redactSensitiveText, sanitizeDebugPayload } from "../lib/redact.js";
import {
  amountSchema,
  assetInputSchema,
  memoSchema,
  publicKeySchema,
  secretKeySchema
} from "../lib/validate.js";

const submitPaymentInputSchema = {
  from: z.string().describe("Source account public key (G...)"),
  to: z.string().describe("Destination account public key (G...)"),
  asset: z
    .object({
      type: z.enum(["native", "credit"]),
      code: z.string().optional(),
      issuer: z.string().optional()
    })
    .describe("Asset descriptor: native or credit with code+issuer."),
  amount: z.string().describe("Amount to send (up to 7 decimals)."),
  memo: z
    .object({
      type: z.enum(["text", "id", "hash"]).optional(),
      value: z.string().optional()
    })
    .optional()
    .describe("Optional memo payload.")
};

export function toStellarAsset(
  asset: z.infer<typeof assetInputSchema>
): Asset {
  if (asset.type === "native") {
    return Asset.native();
  }
  return new Asset(asset.code, asset.issuer);
}

export function toStellarMemo(
  memo: z.infer<typeof memoSchema> | undefined
): Memo | undefined {
  if (!memo) {
    return undefined;
  }

  switch (memo.type) {
    case "text":
      return Memo.text(memo.value);
    case "id":
      return Memo.id(memo.value);
    case "hash":
      return Memo.hash(memo.value);
    default:
      return undefined;
  }
}

/**
 * Register payment-focused MCP tools.
 *
 * @example
 * {
 *   "name": "stellar_submit_payment",
 *   "arguments": {
 *     "from": "G...",
 *     "to": "G...",
 *     "asset": { "type": "native" },
 *     "amount": "1.5"
 *   }
 * }
 */
export function registerPaymentTools(server: McpServer, config: AppConfig): void {
  server.tool(
    "stellar_submit_payment",
    "Submit a Stellar payment transaction and return the transaction hash.",
    submitPaymentInputSchema,
    async ({ from, to, asset, amount, memo }) => {
      try {
        const validatedFrom = publicKeySchema.parse(from);
        const validatedTo = publicKeySchema.parse(to);
        const validatedAmount = amountSchema.parse(amount);
        const validatedAsset = assetInputSchema.parse(asset);
        const validatedMemo = memo ? memoSchema.parse(memo) : undefined;

        if (!config.secretKey) {
          throw new Error(
            "Transaction signing is unavailable: STELLAR_SECRET_KEY is not configured."
          );
        }

        const sourceKeypair = Keypair.fromSecret(secretKeySchema.parse(config.secretKey));
        if (sourceKeypair.publicKey() !== validatedFrom) {
          throw new Error(
            "Source account mismatch: `from` does not match STELLAR_SECRET_KEY public key."
          );
        }

        const stellar = createStellarClients(config);
        const sourceAccount = await stellar.runHorizon(
          stellar.horizon.loadAccount(validatedFrom),
          "load_source_account"
        );
        const feeStats = await stellar.runHorizon(
          stellar.horizon.feeStats(),
          "fee_stats"
        );

        const txBuilder = new TransactionBuilder(sourceAccount, {
          fee: feeStats.fee_charged.p99,
          networkPassphrase: stellar.networkPassphrase
        }).addOperation(
          Operation.payment({
            destination: validatedTo,
            asset: toStellarAsset(validatedAsset),
            amount: validatedAmount
          })
        );

        const memoValue = toStellarMemo(validatedMemo);
        if (memoValue) {
          txBuilder.addMemo(memoValue);
        }

        const transaction = txBuilder.setTimeout(30).build();
        transaction.sign(sourceKeypair);

        const submitted = await stellar.runHorizon(
          stellar.horizon.submitTransaction(transaction),
          "submit_payment"
        );

        const response = {
          hash: submitted.hash,
          successful: submitted.successful,
          ...(config.network === "testnet"
            ? {
                dryRunWarning:
                  "Network is testnet. Submitted transaction is non-production and testnet state can reset periodically."
              }
            : {}),
          _debug: sanitizeDebugPayload({
            transactionXdr: transaction.toXDR(),
            selectedFee: feeStats.fee_charged.p99
          })
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2)
            }
          ]
        };
      } catch (error) {
        const mapped = normalizeStellarError(error);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: redactSensitiveText(mapped.message)
            }
          ]
        };
      }
    }
  );
}
