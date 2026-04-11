import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Horizon, Transaction, rpc } from "@stellar/stellar-sdk";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import {
  isHorizonAxiosNotFound,
  normalizeStellarError
} from "../lib/errors.js";
import { truncateBase64Xdr } from "../lib/metaBounds.js";
import { buildTransactionMetaOperationSlice } from "../lib/metaOperationSlice.js";
import { MetaDiskCache } from "../lib/metaCache.js";
import { redactSensitiveText, sanitizeDebugPayload } from "../lib/redact.js";
import { createStellarClients } from "../lib/stellar.js";

const ledgerSequenceSchema = z
  .number()
  .int()
  .positive()
  .max(4_294_967_295)
  .describe("Ledger sequence number (closed ledger)");

const transactionHashSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{64}$/, "Expected 64-character hex transaction hash")
  .describe("64-character lowercase hex transaction hash")
  .transform((h) => h.toLowerCase());

const maxXdrCharsSchema = z
  .number()
  .int()
  .min(256)
  .max(1_000_000)
  .optional()
  .describe("Max base64 characters per XDR field (truncation metadata when exceeded)");

type HorizonPlainLedger = {
  id: string;
  paging_token: string;
  hash: string;
  prev_hash: string;
  sequence: number;
  successful_transaction_count: number;
  failed_transaction_count: number;
  operation_count: number;
  tx_set_operation_count: number | null;
  closed_at: string;
  total_coins: string;
  fee_pool: string;
  max_tx_set_size: number;
  protocol_version: number;
  header_xdr: string;
  base_fee_in_stroops: number;
  base_reserve_in_stroops: number;
};

type HorizonPlainTx = {
  hash: string;
  ledger: number;
  successful: boolean;
  created_at: string;
  operation_count: number;
  envelope_xdr: string;
  result_xdr: string;
  result_meta_xdr: string;
  fee_meta_xdr: string;
  fee_charged: string | number;
};

type CachedLedgerBlob =
  | { kind: "horizon"; plain: HorizonPlainLedger; upstreamFetchedAt: string }
  | {
      kind: "rpc";
      ledger: rpc.Api.RawLedgerResponse;
      upstreamFetchedAt: string;
    };

type CachedTxBlob = {
  plain: HorizonPlainTx;
  upstreamFetchedAt: string;
  sourceTag: "horizon" | "rpc";
};

function ledgerRecordToPlain(ledger: Horizon.ServerApi.LedgerRecord): HorizonPlainLedger {
  return {
    id: ledger.id,
    paging_token: ledger.paging_token,
    hash: ledger.hash,
    prev_hash: ledger.prev_hash,
    sequence: ledger.sequence,
    successful_transaction_count: ledger.successful_transaction_count,
    failed_transaction_count: ledger.failed_transaction_count,
    operation_count: ledger.operation_count,
    tx_set_operation_count: ledger.tx_set_operation_count,
    closed_at: ledger.closed_at,
    total_coins: ledger.total_coins,
    fee_pool: ledger.fee_pool,
    max_tx_set_size: ledger.max_tx_set_size,
    protocol_version: ledger.protocol_version,
    header_xdr: ledger.header_xdr,
    base_fee_in_stroops: ledger.base_fee_in_stroops,
    base_reserve_in_stroops: ledger.base_reserve_in_stroops
  };
}

function transactionRecordToPlain(tx: Horizon.ServerApi.TransactionRecord): HorizonPlainTx {
  return {
    hash: tx.hash,
    ledger: tx.ledger_attr,
    successful: tx.successful,
    created_at: tx.created_at,
    operation_count: tx.operation_count,
    envelope_xdr: tx.envelope_xdr,
    result_xdr: tx.result_xdr,
    result_meta_xdr: tx.result_meta_xdr ?? "",
    fee_meta_xdr: tx.fee_meta_xdr ?? "",
    fee_charged: tx.fee_charged
  };
}

function cacheKeyLedger(network: string, sequence: number): string {
  return `ledger:${network}:${sequence}`;
}

function cacheKeyTx(network: string, hash: string): string {
  return `tx:${network}:${hash}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function effectiveMaxChars(config: AppConfig, override?: number): number {
  const base = override ?? config.metaMaxXdrChars;
  return Math.min(1_000_000, Math.max(256, base));
}

function buildFreshness(args: {
  servedAt: string;
  upstreamFetchedAt: string;
  cacheHit: boolean;
  cacheTtlMs: number;
  cacheStoredAtMs: number | null;
  cacheWriteOk: boolean | null;
}): Record<string, unknown> {
  const cacheExpiresAt =
    args.cacheHit && args.cacheStoredAtMs !== null
      ? new Date(args.cacheStoredAtMs + args.cacheTtlMs).toISOString()
      : null;

  return {
    servedAt: args.servedAt,
    upstreamFetchedAt: args.upstreamFetchedAt,
    cacheHit: args.cacheHit,
    cacheExpiresAt,
    cacheWriteOk: args.cacheWriteOk
  };
}

function buildLedgerBody(args: {
  config: AppConfig;
  blob: CachedLedgerBlob;
  maxChars: number;
  servedAt: string;
  cacheHit: boolean;
  cacheTtlMs: number;
  cacheStoredAtMs: number | null;
  cacheWriteOk: boolean | null;
}): Record<string, unknown> {
  const { blob, maxChars } = args;

  if (blob.kind === "horizon") {
    const p = blob.plain;
    const headerXdr = truncateBase64Xdr(p.header_xdr, maxChars);
    return {
      network: args.config.network,
      upstream: { primary: "horizon", fallbackUsed: false },
      retentionNote:
        "Horizon exposes ledger header XDR. Full ledger close metadata (LedgerCloseMeta) is available from Soroban RPC getLedgers when the ledger is within the RPC retention window.",
      freshness: buildFreshness({
        servedAt: args.servedAt,
        upstreamFetchedAt: blob.upstreamFetchedAt,
        cacheHit: args.cacheHit,
        cacheTtlMs: args.cacheTtlMs,
        cacheStoredAtMs: args.cacheStoredAtMs,
        cacheWriteOk: args.cacheWriteOk
      }),
      ledger: {
        sequence: p.sequence,
        hash: p.hash,
        prevHash: p.prev_hash,
        closedAt: p.closed_at,
        protocolVersion: p.protocol_version,
        successfulTransactionCount: p.successful_transaction_count,
        failedTransactionCount: p.failed_transaction_count,
        operationCount: p.operation_count,
        txSetOperationCount: p.tx_set_operation_count,
        baseFeeInStroops: p.base_fee_in_stroops,
        baseReserveInStroops: p.base_reserve_in_stroops
      },
      xdr: {
        headerXdr,
        metadataXdr: {
          encoding: "base64" as const,
          value: null,
          truncated: false,
          originalLength: 0,
          maxChars,
          note: "Not provided by Horizon for this resource; use Soroban RPC fallback or getLedgers when available."
        }
      },
      degradation: null,
      _debug: sanitizeDebugPayload({
        source: "horizon",
        headerXdrTruncated: headerXdr.truncated
      })
    };
  }

  const L = blob.ledger;
  const headerXdr = truncateBase64Xdr(L.headerXdr, maxChars);
  const metadataXdr = truncateBase64Xdr(L.metadataXdr, maxChars);

  return {
    network: args.config.network,
    upstream: { primary: "horizon", fallbackUsed: true, secondary: "rpc" },
    retentionNote:
      "Soroban RPC retains a bounded ledger window; older ledgers may be unavailable. Horizon may still list metadata for archived ledgers when configured.",
    freshness: buildFreshness({
      servedAt: args.servedAt,
      upstreamFetchedAt: blob.upstreamFetchedAt,
      cacheHit: args.cacheHit,
      cacheTtlMs: args.cacheTtlMs,
      cacheStoredAtMs: args.cacheStoredAtMs,
      cacheWriteOk: args.cacheWriteOk
    }),
    ledger: {
      sequence: L.sequence,
      hash: L.hash,
      prevHash: null,
      closedAt: L.ledgerCloseTime,
      protocolVersion: null,
      successfulTransactionCount: null,
      failedTransactionCount: null,
      operationCount: null,
      txSetOperationCount: null,
      baseFeeInStroops: null,
      baseReserveInStroops: null
    },
    xdr: {
      headerXdr: headerXdr,
      metadataXdr: metadataXdr
    },
    degradation: {
      code: "HORIZON_LEDGER_NOT_FOUND",
      message:
        "Ledger was not returned by Horizon (404 or missing); response fields are filled from Soroban RPC getLedgers.",
      remediation:
        "Confirm the ledger exists on this network. If Horizon and RPC both lack the ledger, use a history archive or different deployment."
    },
    _debug: sanitizeDebugPayload({
      source: "rpc",
      headerXdrTruncated: headerXdr.truncated,
      metadataXdrTruncated: metadataXdr.truncated
    })
  };
}

function buildTxBody(args: {
  config: AppConfig;
  blob: CachedTxBlob;
  maxChars: number;
  servedAt: string;
  operationIndex?: number;
  cacheHit: boolean;
  cacheTtlMs: number;
  cacheStoredAtMs: number | null;
  cacheWriteOk: boolean | null;
}): Record<string, unknown> {
  const { blob, maxChars } = args;
  const plain = blob.plain;
  const fallbackUsed = blob.sourceTag === "rpc";

  const resultMeta = truncateBase64Xdr(plain.result_meta_xdr, maxChars);
  const feeMeta = truncateBase64Xdr(plain.fee_meta_xdr, maxChars);
  const envelope = truncateBase64Xdr(plain.envelope_xdr, maxChars);
  const result = truncateBase64Xdr(plain.result_xdr, maxChars);

  let operationSlice: Record<string, unknown> | null = null;
  if (args.operationIndex !== undefined) {
    operationSlice = buildTransactionMetaOperationSlice({
      operationIndex: args.operationIndex,
      operationCount: plain.operation_count,
      resultMetaXdr: plain.result_meta_xdr,
      resultMetaFieldTruncated: resultMeta.truncated
    });
  }

  const degradation =
    fallbackUsed
      ? {
          code: "HORIZON_TX_NOT_FOUND",
          message:
            "Transaction was not returned by Horizon (404 or missing); XDR fields are filled from Soroban RPC getTransaction.",
          remediation:
            "Confirm hash and network. For older classic transactions, Horizon is usually authoritative; RPC covers recent Soroban-heavy history."
        }
      : null;

  return {
    network: args.config.network,
    upstream: {
      primary: "horizon",
      fallbackUsed,
      ...(fallbackUsed ? { secondary: "rpc" } : {})
    },
    freshness: buildFreshness({
      servedAt: args.servedAt,
      upstreamFetchedAt: blob.upstreamFetchedAt,
      cacheHit: args.cacheHit,
      cacheTtlMs: args.cacheTtlMs,
      cacheStoredAtMs: args.cacheStoredAtMs,
      cacheWriteOk: args.cacheWriteOk
    }),
    transaction: {
      hash: plain.hash,
      ledger: plain.ledger,
      successful: plain.successful,
      createdAt: plain.created_at,
      operationCount: plain.operation_count,
      feeCharged: plain.fee_charged
    },
    xdr: {
      resultMetaXdr: resultMeta,
      feeMetaXdr: feeMeta,
      envelopeXdr: envelope,
      resultXdr: result
    },
    operationSlice,
    degradation,
    _debug: sanitizeDebugPayload({
      source: blob.sourceTag,
      resultMetaTruncated: resultMeta.truncated,
      feeMetaTruncated: feeMeta.truncated
    })
  };
}

async function loadLedgerBlob(
  stellar: ReturnType<typeof createStellarClients>,
  sequence: number
): Promise<CachedLedgerBlob> {
  const upstreamFetchedAt = isoNow();
  try {
    const pageOrRecord = await stellar.runHorizon(
      stellar.horizon.ledgers().ledger(String(sequence)).call(),
      "ledger_meta"
    );
    const ledger =
      "records" in pageOrRecord && Array.isArray(pageOrRecord.records)
        ? pageOrRecord.records[0]
        : pageOrRecord;
    if (!ledger || typeof ledger !== "object" || !("header_xdr" in ledger)) {
      throw new Error(
        `Horizon returned no ledger record for sequence ${sequence}.`
      );
    }
    return {
      kind: "horizon",
      plain: ledgerRecordToPlain(ledger),
      upstreamFetchedAt
    };
  } catch (error) {
    if (!isHorizonAxiosNotFound(error)) {
      throw error;
    }
  }

  const raw = await stellar.runRpc(
    stellar.rpc._getLedgers({
      startLedger: sequence,
      pagination: { limit: 1 }
    }),
    "ledger_meta_rpc_fallback"
  );
  if (raw.ledgers.length === 0) {
    throw new Error(
      `Ledger ${sequence} not found on Horizon (404) and Soroban RPC getLedgers returned no ledgers (check RPC retention window and sequence).`
    );
  }
  const match = raw.ledgers.find((l) => l.sequence === sequence);
  if (!match) {
    throw new Error(
      `Ledger ${sequence} not found on Horizon (404) and not present in Soroban RPC getLedgers page (check RPC retention window and sequence).`
    );
  }

  return {
    kind: "rpc",
    ledger: match,
    upstreamFetchedAt
  };
}

async function loadTxBlob(
  config: AppConfig,
  stellar: ReturnType<typeof createStellarClients>,
  hash: string
): Promise<CachedTxBlob> {
  const upstreamFetchedAt = isoNow();
  try {
    const pageOrRecord = await stellar.runHorizon(
      stellar.horizon.transactions().transaction(hash).call(),
      "transaction_meta"
    );
    const tx =
      "records" in pageOrRecord && Array.isArray(pageOrRecord.records)
        ? pageOrRecord.records[0]
        : pageOrRecord;
    if (!tx || typeof tx !== "object") {
      throw new Error(`Horizon returned no transaction record for hash ${hash}.`);
    }
    return {
      plain: transactionRecordToPlain(tx),
      upstreamFetchedAt,
      sourceTag: "horizon"
    };
  } catch (error) {
    if (!isHorizonAxiosNotFound(error)) {
      throw error;
    }
  }

  const parsed = await stellar.runRpc(
    stellar.rpc.getTransaction(hash),
    "transaction_meta_rpc_fallback"
  );
  if (parsed.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    throw new Error(
      `Transaction ${hash} not found on Horizon (404) or Soroban RPC (NOT_FOUND).`
    );
  }

  const envelopeXdr = parsed.envelopeXdr.toXDR("base64");
  const resultXdr = parsed.resultXdr.toXDR("base64");
  const resultMetaXdr = parsed.resultMetaXdr.toXDR("base64");

  let operationCount = 0;
  try {
    operationCount = new Transaction(
      envelopeXdr,
      config.networkPassphrase
    ).operations.length;
  } catch {
    operationCount = 0;
  }

  return {
    plain: {
      hash: parsed.txHash,
      ledger: parsed.ledger,
      successful: parsed.status === rpc.Api.GetTransactionStatus.SUCCESS,
      created_at: new Date(parsed.createdAt * 1000).toISOString(),
      operation_count: operationCount,
      envelope_xdr: envelopeXdr,
      result_xdr: resultXdr,
      result_meta_xdr: resultMetaXdr,
      fee_meta_xdr: "",
      fee_charged: ""
    },
    upstreamFetchedAt,
    sourceTag: "rpc"
  };
}

/**
 * Register historical ledger / transaction meta tools (read-only, bounded, cached).
 */
export function registerMetaTools(server: McpServer, config: AppConfig): void {
  server.tool(
    "stellar_get_ledger_meta",
    "Fetch closed ledger header metadata from Horizon (primary) with Soroban RPC getLedgers fallback. Responses are bounded with truncation metadata; results may be cached on disk with TTL.",
    {
      ledgerSequence: ledgerSequenceSchema,
      maxXdrCharsPerField: maxXdrCharsSchema
    },
    async ({ ledgerSequence, maxXdrCharsPerField }) => {
      const servedAt = isoNow();
      const maxChars = effectiveMaxChars(config, maxXdrCharsPerField);
      const cache = new MetaDiskCache(
        config.metaCacheDir,
        config.metaCacheEnabled
      );
      const key = cacheKeyLedger(config.network, ledgerSequence);

      try {
        const cached = await cache.get<CachedLedgerBlob>(key);
        let blob: CachedLedgerBlob;
        let cacheHit = false;
        let cacheStoredAtMs: number | null = null;
        let cacheWriteOk: boolean | null = null;

        if (cached) {
          blob = cached.data;
          cacheHit = true;
          cacheStoredAtMs = cached.storedAtMs;
          cacheWriteOk = null;
        } else {
          const stellar = createStellarClients(config);
          blob = await loadLedgerBlob(stellar, ledgerSequence);
          cacheWriteOk = await cache.set(key, config.metaCacheTtlMs, blob);
        }

        const body = buildLedgerBody({
          config,
          blob,
          maxChars,
          servedAt,
          cacheHit,
          cacheTtlMs: config.metaCacheTtlMs,
          cacheStoredAtMs,
          cacheWriteOk
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(body, null, 2)
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
    "stellar_get_transaction_meta",
    "Fetch transaction result / fee metadata XDR from Horizon (primary) with Soroban RPC getTransaction fallback. Payloads are bounded with truncation metadata; optional operation_index slices decoded TransactionMeta when not truncated.",
    {
      transactionHash: transactionHashSchema,
      operationIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Optional operation index inside TransactionMeta.operations"),
      maxXdrCharsPerField: maxXdrCharsSchema
    },
    async ({ transactionHash, operationIndex, maxXdrCharsPerField }) => {
      const servedAt = isoNow();
      const maxChars = effectiveMaxChars(config, maxXdrCharsPerField);
      const cache = new MetaDiskCache(
        config.metaCacheDir,
        config.metaCacheEnabled
      );
      const key = cacheKeyTx(config.network, transactionHash);

      try {
        const parsedHash = transactionHashSchema.parse(transactionHash);
        const cached = await cache.get<CachedTxBlob>(key);
        let blob: CachedTxBlob;
        let cacheHit = false;
        let cacheStoredAtMs: number | null = null;
        let cacheWriteOk: boolean | null = null;

        if (cached) {
          blob = cached.data;
          cacheHit = true;
          cacheStoredAtMs = cached.storedAtMs;
          cacheWriteOk = null;
        } else {
          const stellar = createStellarClients(config);
          blob = await loadTxBlob(config, stellar, parsedHash);
          cacheWriteOk = await cache.set(key, config.metaCacheTtlMs, blob);
        }

        const body = buildTxBody({
          config,
          blob,
          maxChars,
          servedAt,
          operationIndex,
          cacheHit,
          cacheTtlMs: config.metaCacheTtlMs,
          cacheStoredAtMs,
          cacheWriteOk
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(body, null, 2)
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
