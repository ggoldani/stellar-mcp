import { Asset, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { decideSigningPolicy } from "../lib/autonomy.js";
import { normalizeStellarError } from "../lib/errors.js";
import { createStellarClients } from "../lib/stellar.js";
import { redactSensitiveText, sanitizeDebugPayload } from "../lib/redact.js";
import { amountSchema, assetInputSchema, publicKeySchema, secretKeySchema, assertSourceKeyMatch } from "../lib/validate.js";

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
  if (limit.trim() === "0") {
    return "0";
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
        const signer = config.validatedKeypair!;
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

  server.tool(
    "stellar_deposit_liquidity",
    "Deposit liquidity into a classic Stellar AMM liquidity pool.",
    {
      sourceAccount: publicKeySchema.describe("Account providing liquidity"),
      assetA: assetInputSchema.describe("First asset of the liquidity pool"),
      assetB: assetInputSchema.describe("Second asset of the liquidity pool"),
      maxAmountA: z.string().describe("Maximum amount of asset A to deposit"),
      maxAmountB: z.string().describe("Maximum amount of asset B to deposit"),
      minPrice: z.string().describe("Minimum price of asset A in terms of asset B"),
      maxPrice: z.string().describe("Maximum price of asset A in terms of asset B"),
      fee: z.number().int().default(30).describe("Liquidity pool fee in basis points (usually 30)")
    },
    async ({
      sourceAccount,
      assetA,
      assetB,
      maxAmountA,
      maxAmountB,
      minPrice,
      maxPrice,
      fee
    }) => {
      try {
        const stellar = createStellarClients(config);
        const account = await stellar.runHorizon(
          stellar.horizon.loadAccount(sourceAccount),
          "load_source_account"
        );

        const builder = new TransactionBuilder(account, {
          fee: "100",
          networkPassphrase: stellar.networkPassphrase
        });

        const assetObjA = new Asset(
          assetA.type === "native" ? "XLM" : assetA.code,
          assetA.type === "native" ? undefined : assetA.issuer
        );

        const assetObjB = new Asset(
          assetB.type === "native" ? "XLM" : assetB.code,
          assetB.type === "native" ? undefined : assetB.issuer
        );

        const liquidityPoolId = require("@stellar/stellar-sdk").getLiquidityPoolId(assetObjA, assetObjB, fee).toString("hex");

        builder.addOperation(
          (Operation as any).depositLiquidity({
            liquidityPoolId,
            maxAmountA,
            maxAmountB,
            minPrice,
            maxPrice
          })
        );
        builder.setTimeout(30);

        const tx = builder.build();

        // Safe policy always returns unsigned
        const isSafeUnsigned =
          config.autoSignPolicy === "safe" ||
          (config.autoSignPolicy === "guarded" && config.autoSignLimit === 0);

        if (isSafeUnsigned || !config.autoSign) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "unsigned",
                  message:
                    "Transaction requires signatures.",
                  unsignedXdr: tx.toXDR()
                }, null, 2)
              }
            ]
          };
        }

        // For guarded/expert with limit, route through policy engine
        if (config.autoSignLimit > 0) {
          const signingDecision = decideSigningPolicy({
            autoSign: config.autoSign,
            autoSignLimit: config.autoSignLimit,
            valueUsdc: undefined // AMM ops have no reliable USDC valuation
          });

          if (!signingDecision.shouldSign) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    status: "unsigned",
                    message: signingDecision.message || "Transaction requires signatures.",
                    unsignedXdr: tx.toXDR()
                  }, null, 2)
                }
              ]
            };
          }
        }

        // Auto-sign enabled (guarded with limit met or expert)
        if (config.secretKey) {
          assertSourceKeyMatch(config.validatedKeypair!, sourceAccount, "stellar_deposit_liquidity");
          tx.sign(config.validatedKeypair!);
        } else {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "unsigned",
                  message: "Transaction requires signatures.",
                  unsignedXdr: tx.toXDR()
                }, null, 2)
              }
            ]
          };
        }

        const submission = await stellar.runHorizon(
          stellar.horizon.submitTransaction(tx),
          "submit_deposit_liquidity"
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                hash: submission.hash,
                ledger: submission.ledger,
                _debug: sanitizeDebugPayload({
                  networkPassphrase: stellar.networkPassphrase
                })
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        const mapped = normalizeStellarError(error);
        return {
          isError: true,
          content: [{ type: "text", text: redactSensitiveText(mapped.message) }]
        };
      }
    }
  );

  server.tool(
    "stellar_withdraw_liquidity",
    "Withdraw liquidity from a classic Stellar AMM liquidity pool.",
    {
      sourceAccount: publicKeySchema.describe("Account withdrawing liquidity"),
      assetA: assetInputSchema.describe("First asset of the liquidity pool"),
      assetB: assetInputSchema.describe("Second asset of the liquidity pool"),
      amount: z.string().describe("Amount of pool shares to withdraw"),
      minAmountA: z.string().describe("Minimum amount of asset A to receive"),
      minAmountB: z.string().describe("Minimum amount of asset B to receive"),
      fee: z.number().int().default(30).describe("Liquidity pool fee in basis points (usually 30)")
    },
    async ({
      sourceAccount,
      assetA,
      assetB,
      amount,
      minAmountA,
      minAmountB,
      fee
    }) => {
      try {
        const stellar = createStellarClients(config);
        const account = await stellar.runHorizon(
          stellar.horizon.loadAccount(sourceAccount),
          "load_source_account"
        );

        const builder = new TransactionBuilder(account, {
          fee: "100",
          networkPassphrase: stellar.networkPassphrase
        });

        const assetObjA = new Asset(
          assetA.type === "native" ? "XLM" : assetA.code,
          assetA.type === "native" ? undefined : assetA.issuer
        );

        const assetObjB = new Asset(
          assetB.type === "native" ? "XLM" : assetB.code,
          assetB.type === "native" ? undefined : assetB.issuer
        );

        const liquidityPoolId = require("@stellar/stellar-sdk").getLiquidityPoolId(assetObjA, assetObjB, fee).toString("hex");

        builder.addOperation(
          (Operation as any).withdrawLiquidity({
            liquidityPoolId,
            amount,
            minAmountA,
            minAmountB
          })
        );
        builder.setTimeout(30);

        const tx = builder.build();

        // Safe policy always returns unsigned
        const isSafeUnsigned =
          config.autoSignPolicy === "safe" ||
          (config.autoSignPolicy === "guarded" && config.autoSignLimit === 0);

        if (isSafeUnsigned || !config.autoSign) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "unsigned",
                  message:
                    "Transaction requires signatures.",
                  unsignedXdr: tx.toXDR()
                }, null, 2)
              }
            ]
          };
        }

        // For guarded/expert with limit, route through policy engine
        if (config.autoSignLimit > 0) {
          const signingDecision = decideSigningPolicy({
            autoSign: config.autoSign,
            autoSignLimit: config.autoSignLimit,
            valueUsdc: undefined // AMM ops have no reliable USDC valuation
          });

          if (!signingDecision.shouldSign) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    status: "unsigned",
                    message: signingDecision.message || "Transaction requires signatures.",
                    unsignedXdr: tx.toXDR()
                  }, null, 2)
                }
              ]
            };
          }
        }

        // Auto-sign enabled (guarded with limit met or expert)
        if (config.secretKey) {
          assertSourceKeyMatch(config.validatedKeypair!, sourceAccount, "stellar_withdraw_liquidity");
          tx.sign(config.validatedKeypair!);
        } else {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "unsigned",
                  message: "Transaction requires signatures.",
                  unsignedXdr: tx.toXDR()
                }, null, 2)
              }
            ]
          };
        }

        const submission = await stellar.runHorizon(
          stellar.horizon.submitTransaction(tx),
          "submit_withdraw_liquidity"
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                hash: submission.hash,
                ledger: submission.ledger,
                _debug: sanitizeDebugPayload({
                  networkPassphrase: stellar.networkPassphrase
                })
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        const mapped = normalizeStellarError(error);
        return {
          isError: true,
          content: [{ type: "text", text: redactSensitiveText(mapped.message) }]
        };
      }
    }
  );
}
