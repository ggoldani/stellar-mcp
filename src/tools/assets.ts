import { Asset, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { decideSigningPolicy } from "../lib/autonomy.js";
import { normalizeStellarError } from "../lib/errors.js";
import { createStellarClients } from "../lib/stellar.js";
import { redactSensitiveText, sanitizeDebugPayload } from "../lib/redact.js";
import { amountSchema, publicKeySchema, secretKeySchema } from "../lib/validate.js";

const createTrustlineInputSchema = {
  account: z.string().describe("Account public key that will hold the trustline."),
  asset_code: z.string().min(1).max(12).describe("Credit asset code."),
  asset_issuer: z.string().describe("Issuer public key for the credit asset."),
  limit: z
    .string()
    .optional()
    .describe("Optional trustline limit. Defaults to max representable amount.")
};

export function normalizeTrustlineLimit(limit: string | undefined): string {
  if (!limit) {
    return "922337203685.4775807";
  }
  return amountSchema.parse(limit);
}

export function buildTrustlineAutoSignCappedMessage(limitUsdc: number): string {
  return `Trustline operations do not have reliable USDC valuation. Under STELLAR_AUTO_SIGN_LIMIT=$${limitUsdc} USDC, explicit confirmation is required and unsigned XDR is returned.`;
}

/**
 * Register asset-focused MCP tools.
 *
 * @example
 * {
 *   "name": "stellar_create_trustline",
 *   "arguments": {
 *     "account": "G...",
 *     "asset_code": "USDC",
 *     "asset_issuer": "G..."
 *   }
 * }
 */
export function registerAssetTools(server: McpServer, config: AppConfig): void {
  server.tool(
    "stellar_create_trustline",
    "Create a trustline for a non-native Stellar asset and return transaction hash.",
    createTrustlineInputSchema,
    async ({ account, asset_code, asset_issuer, limit }) => {
      try {
        const validatedAccount = publicKeySchema.parse(account);
        const validatedIssuer = publicKeySchema.parse(asset_issuer);
        const validatedLimit = normalizeTrustlineLimit(limit);

        const stellar = createStellarClients(config);
        const sourceAccount = await stellar.runHorizon(
          stellar.horizon.loadAccount(validatedAccount),
          "load_source_account"
        );
        const feeStats = await stellar.runHorizon(
          stellar.horizon.feeStats(),
          "fee_stats"
        );

        const asset = new Asset(asset_code, validatedIssuer);
        const transaction = new TransactionBuilder(sourceAccount, {
          fee: feeStats.fee_charged.p99,
          networkPassphrase: stellar.networkPassphrase
        })
          .addOperation(
            Operation.changeTrust({
              asset,
              limit: validatedLimit
            })
          )
          .setTimeout(30)
          .build();
        const signingDecision = decideSigningPolicy({
          autoSign: config.autoSign,
          autoSignLimit: config.autoSignLimit,
          // Trustline operations do not carry a reliable USDC transfer value.
          valueUsdc: undefined
        });

        if (!signingDecision.shouldSign) {
          const message =
            signingDecision.reason === "valuation_unavailable" && config.autoSignLimit > 0
              ? buildTrustlineAutoSignCappedMessage(config.autoSignLimit)
              : signingDecision.message;
          const unsignedResponse = {
            mode: signingDecision.mode,
            reason: signingDecision.reason,
            message,
            transactionXdr: transaction.toXDR(),
            ...(config.network === "testnet"
              ? {
                  dryRunWarning:
                    "Network is testnet. Returned XDR is non-production and testnet state can reset periodically."
                }
              : {}),
            _debug: sanitizeDebugPayload({
              selectedFee: feeStats.fee_charged.p99
            })
          };
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(unsignedResponse, null, 2)
              }
            ]
          };
        }

        if (!config.secretKey) {
          throw new Error(
            "Trustline transaction signing is unavailable: STELLAR_SECRET_KEY is not configured."
          );
        }
        const signer = Keypair.fromSecret(secretKeySchema.parse(config.secretKey));
        if (signer.publicKey() !== validatedAccount) {
          throw new Error(
            "Account mismatch: `account` does not match STELLAR_SECRET_KEY public key."
          );
        }
        transaction.sign(signer);
        const submitted = await stellar.runHorizon(stellar.horizon.submitTransaction(transaction), "submit_trustline");

        const response = {
          mode: signingDecision.mode,
          reason: signingDecision.reason,
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
