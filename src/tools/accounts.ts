import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { z } from "zod";

type OperationRecord = {
  id: string;
  type: string;
  type_i: number;
  created_at: string;
  source_account: string;
  transaction_successful: boolean;
};

import type { AppConfig } from "../config.js";
import { normalizeStellarError } from "../lib/errors.js";
import { createStellarClients } from "../lib/stellar.js";
import { redactSensitiveText, sanitizeDebugPayload } from "../lib/redact.js";
import { publicKeySchema, assertSourceKeyMatch } from "../lib/validate.js";

const getAccountInputSchema = {
  publicKey: z
    .string()
    .describe("Stellar account public key (G...)")
};

export function calculateMinimumBalance(
  subentryCount: number,
  baseReserveStroops: number
): string {
  const baseReserveXlm = baseReserveStroops / 10_000_000;
  return ((2 + subentryCount) * baseReserveXlm).toFixed(7);
}

/**
 * Register account-focused MCP tools.
 *
 * @example
 * {
 *   "name": "stellar_get_account",
 *   "arguments": {
 *     "publicKey": "G..."
 *   }
 * }
 */
async function fetchOperationsForTransactions(
  stellar: ReturnType<typeof createStellarClients>,
  txHashes: string[],
): Promise<Map<string, OperationRecord[]>> {
  const opsMap = new Map<string, OperationRecord[]>();

  await Promise.all(
    txHashes.map(async (hash) => {
      try {
        const opsPage = await stellar.runHorizon(
          stellar.horizon.operations().forTransaction(hash).limit(100).call(),
          "load_operations_for_tx"
        );
        opsMap.set(hash, opsPage.records);
      } catch {
        opsMap.set(hash, []);
      }
    })
  );

  return opsMap;
}

export function registerAccountTools(server: McpServer, config: AppConfig): void {
  server.tool(
    "stellar_get_account_history",
    "Fetch the paginated transaction history for a Stellar account.",
    {
      publicKey: publicKeySchema.describe("Stellar account public key (G...)"),
      limit: z.number().int().min(1).max(200).default(10).describe("Number of records to return (max 200)"),
      cursor: z.string().optional().describe("Pagination cursor to fetch results after a specific transaction"),
      includeOperations: z.boolean().default(false).describe(
        "Include per-transaction operation details (type, source). Bounded by limit. Default false for backward compat."
      ),
    },
    async ({ publicKey, limit, cursor, includeOperations }) => {
      try {
        const validatedPublicKey = publicKeySchema.parse(publicKey);
        const stellar = createStellarClients(config);

        let builder = stellar.horizon.transactions().forAccount(validatedPublicKey).limit(limit).order("desc");

        if (cursor) {
          builder = builder.cursor(cursor);
        }

        const page = await stellar.runHorizon(
          builder.call(),
          "load_account_history"
        );

        let opsMap: Map<string, OperationRecord[]> | null = null;

        if (includeOperations) {
          const txHashes = page.records.map(r => r.hash);
          opsMap = await fetchOperationsForTransactions(stellar, txHashes);
        }

        const response = {
          records: page.records.map(r => ({
            id: r.id,
            hash: r.hash,
            ledger: r.ledger_attr,
            createdAt: r.created_at,
            sourceAccount: r.source_account,
            feeCharged: r.fee_charged,
            successful: r.successful,
            operationCount: r.operation_count,
            memo: r.memo,
            memoType: r.memo_type,
            ...(opsMap?.get(r.hash)
              ? {
                  operations: opsMap.get(r.hash)!.map(op => ({
                    id: op.id,
                    type: op.type,
                    typeI: op.type_i,
                    createdAt: op.created_at,
                    sourceAccount: op.source_account,
                    transactionSuccessful: op.transaction_successful,
                  })),
                }
              : {}),
          })),
          nextCursor: page.records.length > 0 ? page.records[page.records.length - 1].paging_token : null,
          ...(config.network === "testnet"
            ? { dryRunWarning: "Network is testnet." }
            : {}),
          _debug: sanitizeDebugPayload({
            count: page.records.length,
            publicKey: validatedPublicKey
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
    "stellar_get_account",
    "Fetch account details including balances, signers, flags, and calculated minimum balance.",
    getAccountInputSchema,
    async ({ publicKey }) => {
      try {
        const validatedPublicKey = publicKeySchema.parse(publicKey);
        const stellar = createStellarClients(config);

        const account = await stellar.runHorizon(
          stellar.horizon.loadAccount(validatedPublicKey),
          "load_account"
        );
        const latestLedgers = await stellar.runHorizon(
          stellar.horizon.ledgers().order("desc").limit(1).call(),
          "load_latest_ledger"
        );

        const latestLedger = latestLedgers.records[0];
        const baseReserveStroops = Number(
          latestLedger?.base_reserve_in_stroops ?? 5_000_000
        );
        const minimumBalance = calculateMinimumBalance(
          Number(account.subentry_count),
          baseReserveStroops
        );

        const response = {
          accountId: account.accountId(),
          sequence: account.sequence,
          balances: account.balances,
          signers: account.signers,
          flags: account.flags,
          subentryCount: account.subentry_count,
          minimumBalance,
          ...(config.network === "testnet"
            ? {
                dryRunWarning:
                  "Network is testnet. Data is non-production and testnet state can reset periodically."
              }
            : {}),
          _debug: sanitizeDebugPayload({
            ledgerSequence: latestLedger?.sequence,
            baseReserveInStroops: baseReserveStroops
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
    "stellar_fund_account",
    "Fund a Stellar testnet account with 10,000 testnet XLM using Friendbot.",
    getAccountInputSchema,
    async ({ publicKey }) => {
      try {
        if (config.network !== "testnet") {
          throw new Error("Friendbot is only available on the testnet.");
        }

        const validatedPublicKey = publicKeySchema.parse(publicKey);

        const response = await fetch(
          `https://friendbot.stellar.org?addr=${validatedPublicKey}`,
          { method: "GET" }
        );

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Friendbot failed (HTTP ${response.status}): ${body}`);
        }

        const data = await response.json();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                message: "Account funded successfully with testnet XLM.",
                hash: data.hash,
                ledger: data.ledger
              }, null, 2)
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
    "stellar_set_options",
    "Modify account options (e.g., adding a signer, setting weights/thresholds, or updating flags). Returns unsigned XDR by default unless policy allows.",
    {
      sourceAccount: publicKeySchema.describe("The account applying the options"),
      signer: z
        .object({
          ed25519PublicKey: publicKeySchema,
          weight: z.number().int().min(0).max(255)
        })
        .optional()
        .describe("Add, update, or remove a signer (set weight to 0 to remove)"),
      masterWeight: z.number().int().min(0).max(255).optional(),
      lowThreshold: z.number().int().min(0).max(255).optional(),
      medThreshold: z.number().int().min(0).max(255).optional(),
      highThreshold: z.number().int().min(0).max(255).optional(),
      homeDomain: z.string().optional()
    },
    async ({
      sourceAccount,
      signer,
      masterWeight,
      lowThreshold,
      medThreshold,
      highThreshold,
      homeDomain
    }) => {
      try {
        const stellar = createStellarClients(config);

        // Fail fast if source key does not match (before any network calls)
        if (config.secretKey) {
          assertSourceKeyMatch(config.validatedKeypair!, sourceAccount, "stellar_set_options");
        }

        const account = await stellar.runHorizon(
          stellar.horizon.loadAccount(sourceAccount),
          "load_source_account"
        );

        const builder = new TransactionBuilder(account, {
          fee: "100", // base fee, in a real scenario recommendFeeStroops could be used
          networkPassphrase: stellar.networkPassphrase
        });

        const setOptionsOpts: any = {};
        if (signer) setOptionsOpts.signer = signer;
        if (masterWeight !== undefined) setOptionsOpts.masterWeight = masterWeight;
        if (lowThreshold !== undefined) setOptionsOpts.lowThreshold = lowThreshold;
        if (medThreshold !== undefined) setOptionsOpts.medThreshold = medThreshold;
        if (highThreshold !== undefined) setOptionsOpts.highThreshold = highThreshold;
        if (homeDomain !== undefined) setOptionsOpts.homeDomain = homeDomain;

        builder.addOperation(Operation.setOptions(setOptionsOpts));
        builder.setTimeout(30);

        const tx = builder.build();

        const isUnsignedMode =
          config.autoSignPolicy === "safe" ||
          (config.autoSignPolicy === "guarded" && config.autoSignLimit === 0) ||
          (!config.autoSignPolicy && !config.autoSign);

        if (!isUnsignedMode && config.secretKey) {
          tx.sign(config.validatedKeypair!);
        }

        if (isUnsignedMode || !config.secretKey) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "unsigned",
                  message:
                    "Transaction built. Auto-sign policy requires external signature.",
                  unsignedXdr: tx.toXDR()
                }, null, 2)
              }
            ]
          };
        }

        const submission = await stellar.runHorizon(
          stellar.horizon.submitTransaction(tx),
          "submit_set_options"
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
                  feeCharged: (submission as any).fee_meta_xdr || null,
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
