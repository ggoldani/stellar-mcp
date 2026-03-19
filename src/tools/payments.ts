import {
  Asset,
  Claimant,
  Keypair,
  Memo,
  Operation,
  Transaction,
  TransactionBuilder
} from "@stellar/stellar-sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { decideSigningPolicy } from "../lib/autonomy.js";
import { normalizeStellarError } from "../lib/errors.js";
import { createStellarClients } from "../lib/stellar.js";
import { estimateUsdcValue } from "../lib/valuation.js";
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

export function buildAnchorMemoAdvisory(
  asset: z.infer<typeof assetInputSchema>,
  memo: z.infer<typeof memoSchema> | undefined
): string | undefined {
  if (asset.type === "credit" && !memo) {
    return "Advisory: many anchor flows require memo_type+memo for credit-asset transfers. Confirm anchor instructions before submission.";
  }
  return undefined;
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
        const anchorMemoAdvisory = buildAnchorMemoAdvisory(validatedAsset, validatedMemo);

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
        const estimatedValueUsdc = await estimateUsdcValue({
          amount: validatedAmount,
          asset: validatedAsset,
          config
        });
        const signingDecision = decideSigningPolicy({
          autoSign: config.autoSign,
          autoSignLimit: config.autoSignLimit,
          valueUsdc: estimatedValueUsdc
        });

        if (!signingDecision.shouldSign) {
          const unsignedResponse = {
            mode: signingDecision.mode,
            reason: signingDecision.reason,
            message: signingDecision.message,
            transactionXdr: transaction.toXDR(),
            ...(config.network === "testnet"
              ? {
                  dryRunWarning:
                    "Network is testnet. Returned XDR is non-production and testnet state can reset periodically."
                }
              : {}),
            ...(anchorMemoAdvisory ? { advisory: anchorMemoAdvisory } : {}),
            _debug: sanitizeDebugPayload({
              selectedFee: feeStats.fee_charged.p99,
              valuationUsdc: estimatedValueUsdc ?? null
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
            "Transaction signing is unavailable: STELLAR_SECRET_KEY is not configured."
          );
        }
        const sourceKeypair = Keypair.fromSecret(secretKeySchema.parse(config.secretKey));
        if (sourceKeypair.publicKey() !== validatedFrom) {
          throw new Error(
            "Source account mismatch: `from` does not match STELLAR_SECRET_KEY public key."
          );
        }
        transaction.sign(sourceKeypair);
        const submitted = await stellar.runHorizon(stellar.horizon.submitTransaction(transaction), "submit_payment");

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
          ...(anchorMemoAdvisory ? { advisory: anchorMemoAdvisory } : {}),
          _debug: sanitizeDebugPayload({
            transactionXdr: transaction.toXDR(),
            selectedFee: feeStats.fee_charged.p99,
            valuationUsdc: estimatedValueUsdc ?? null
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
    "stellar_submit_transaction_xdr",
    "Submit a fully formed transaction XDR (base64) to the Stellar network. Optionally signs if STELLAR_SECRET_KEY is configured and autoSignPolicy allows.",
    {
      xdr: z.string().describe("Base64 encoded transaction XDR")
    },
    async ({ xdr }) => {
      try {
        const stellar = createStellarClients(config);
        const transaction = new Transaction(xdr, stellar.networkPassphrase);

        const isUnsignedMode =
          config.autoSignPolicy === "safe" ||
          (config.autoSignPolicy === "guarded" && config.autoSignLimit === 0) ||
          (!config.autoSignPolicy && !config.autoSign);

        if (!isUnsignedMode && config.secretKey) {
          const keypair = Keypair.fromSecret(config.secretKey);
          transaction.sign(keypair);
        }

        if (isUnsignedMode || !config.secretKey) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "unsigned",
                  message:
                    "Transaction requires signatures or policy blocks auto-signing. Please sign and submit this XDR externally.",
                  unsignedXdr: transaction.toXDR()
                }, null, 2)
              }
            ]
          };
        }

        const submission = await stellar.runHorizon(
          stellar.horizon.submitTransaction(transaction),
          "submit_transaction_xdr"
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
    "stellar_find_path_receive",
    "Discover the best exchange path to receive a specific amount of a destination asset by sending a source asset using the Stellar DEX.",
    {
      sourceAssets: z
        .array(assetInputSchema)
        .describe("List of potential source assets to send"),
      destinationAsset: assetInputSchema.describe("The asset you want to receive"),
      destinationAmount: z.string().describe("The exact amount of destination asset to receive")
    },
    async ({ sourceAssets, destinationAsset, destinationAmount }) => {
      try {
        const stellar = createStellarClients(config);

        const destAssetObj = new Asset(
          destinationAsset.type === "native" ? "XLM" : destinationAsset.code,
          destinationAsset.type === "native" ? undefined : destinationAsset.issuer
        );

        let paths: any[] = [];

        for (const sourceAsset of sourceAssets) {
          const sourceAssetObj = new Asset(
            sourceAsset.type === "native" ? "XLM" : sourceAsset.code,
            sourceAsset.type === "native" ? undefined : sourceAsset.issuer
          );

          try {
            const page = await stellar.runHorizon(
              stellar.horizon.strictReceivePaths(
                [sourceAssetObj],
                destAssetObj,
                destinationAmount
              ).call(),
              "strict_receive_paths"
            );
            paths = paths.concat(page.records);
          } catch (e) {
            // Ignore if no path found for one of the source assets
          }
        }

        // Sort by amount needed from source (cheapest first)
        paths.sort((a, b) => Number.parseFloat(a.source_amount) - Number.parseFloat(b.source_amount));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(paths.slice(0, 5), null, 2)
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
    "stellar_create_claimable_balance",
    "Create a claimable balance that allows a destination to claim funds later.",
    {
      sourceAccount: publicKeySchema.describe("Account sending the funds"),
      destinationAccount: publicKeySchema.describe("Account that can claim the funds"),
      asset: assetInputSchema,
      amount: z.string().describe("Amount to send")
    },
    async ({ sourceAccount, destinationAccount, asset, amount }) => {
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

        const assetObj = new Asset(
          asset.type === "native" ? "XLM" : asset.code,
          asset.type === "native" ? undefined : asset.issuer
        );

        builder.addOperation(
          Operation.createClaimableBalance({
            asset: assetObj,
            amount: amount,
            claimants: [
              new Claimant(destinationAccount, Claimant.predicateUnconditional())
            ]
          })
        );
        builder.setTimeout(30);

        const tx = builder.build();

        const isUnsignedMode =
          config.autoSignPolicy === "safe" ||
          (config.autoSignPolicy === "guarded" && config.autoSignLimit === 0) ||
          (!config.autoSignPolicy && !config.autoSign);

        if (!isUnsignedMode && config.secretKey) {
          tx.sign(Keypair.fromSecret(config.secretKey));
        }

        if (isUnsignedMode || !config.secretKey) {
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

        const submission = await stellar.runHorizon(
          stellar.horizon.submitTransaction(tx),
          "submit_create_claimable_balance"
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
    "stellar_claim_claimable_balance",
    "Claim a claimable balance using its balance ID.",
    {
      sourceAccount: publicKeySchema.describe("Account claiming the funds"),
      balanceId: z.string().describe("The ID of the claimable balance")
    },
    async ({ sourceAccount, balanceId }) => {
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

        builder.addOperation(
          Operation.claimClaimableBalance({
            balanceId
          })
        );
        builder.setTimeout(30);

        const tx = builder.build();

        const isUnsignedMode =
          config.autoSignPolicy === "safe" ||
          (config.autoSignPolicy === "guarded" && config.autoSignLimit === 0) ||
          (!config.autoSignPolicy && !config.autoSign);

        if (!isUnsignedMode && config.secretKey) {
          tx.sign(Keypair.fromSecret(config.secretKey));
        }

        if (isUnsignedMode || !config.secretKey) {
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

        const submission = await stellar.runHorizon(
          stellar.horizon.submitTransaction(tx),
          "submit_claim_claimable_balance"
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
