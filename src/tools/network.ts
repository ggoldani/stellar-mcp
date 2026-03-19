import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Transaction } from "@stellar/stellar-sdk";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { normalizeStellarError } from "../lib/errors.js";
import { createStellarClients } from "../lib/stellar.js";
import { redactSensitiveText, sanitizeDebugPayload } from "../lib/redact.js";

export function recommendFeeStroops(p99: string, baseFee: string): string {
  const p99Value = Number.parseInt(p99, 10);
  const baseValue = Number.parseInt(baseFee, 10);
  if (Number.isFinite(p99Value) && p99Value > baseValue) {
    return String(p99Value);
  }
  return String(baseValue);
}

/**
 * Register network tools.
 *
 * @example
 * {
 *   "name": "stellar_get_fee_stats",
 *   "arguments": {}
 * }
 */
export function registerNetworkTools(server: McpServer, config: AppConfig): void {
  server.tool(
    "stellar_get_fee_stats",
    "Fetch current fee statistics and return recommended fee for reliable inclusion.",
    {},
    async () => {
      try {
        const stellar = createStellarClients(config);
        const feeStats = await stellar.runHorizon(
          stellar.horizon.feeStats(),
          "fee_stats"
        );

        const recommendation = recommendFeeStroops(
          feeStats.fee_charged.p99,
          feeStats.last_ledger_base_fee
        );

        const response = {
          baseFee: feeStats.last_ledger_base_fee,
          p50: feeStats.fee_charged.p50,
          p99: feeStats.fee_charged.p99,
          recommendedFee: recommendation,
          ...(config.network === "testnet"
            ? {
                dryRunWarning:
                  "Network is testnet. Fee behavior may differ from production conditions."
              }
            : {}),
          _debug: sanitizeDebugPayload({
            ledgerCapacityUsage: feeStats.ledger_capacity_usage
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
    "stellar_decode_xdr",
    "Decode a base64 encoded Stellar transaction XDR into a readable JSON format showing operations and parameters.",
    {
      xdr: z.string().describe("Base64 encoded transaction XDR")
    },
    async ({ xdr }) => {
      try {
        const stellar = createStellarClients(config);

        const transaction = new Transaction(xdr, stellar.networkPassphrase);

        const decoded = {
          source: transaction.source,
          fee: transaction.fee,
          sequence: transaction.sequence,
          memo: transaction.memo.type === "none" ? null : {
            type: transaction.memo.type,
            value: transaction.memo.value
          },
          timeBounds: transaction.timeBounds ? {
            minTime: transaction.timeBounds.minTime,
            maxTime: transaction.timeBounds.maxTime
          } : null,
          operations: transaction.operations.map(op => ({
            ...op,
            _type: op.type,
            _source: op.source
          })),
          signaturesCount: transaction.signatures.length,
          _debug: sanitizeDebugPayload({
            networkPassphrase: stellar.networkPassphrase
          })
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(decoded, null, 2)
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
