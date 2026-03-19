import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { normalizeStellarError } from "../lib/errors.js";
import { createStellarClients } from "../lib/stellar.js";
import { redactSensitiveText, sanitizeDebugPayload } from "../lib/redact.js";
import { publicKeySchema } from "../lib/validate.js";

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
export function registerAccountTools(server: McpServer, config: AppConfig): void {
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
}
