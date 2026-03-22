import { extractOperationsFromTransactionMetaJson } from "./metaBounds.js";
import { xdrDecodeToJsonString } from "./xdrJson.js";

/**
 * Build `operationSlice` for stellar_get_transaction_meta when `operation_index` is set.
 * Shared with tests so Horizon vs RPC sources share identical semantics.
 */
export function buildTransactionMetaOperationSlice(input: {
  operationIndex: number;
  operationCount: number;
  resultMetaXdr: string;
  resultMetaFieldTruncated: boolean;
}): Record<string, unknown> {
  const idx = input.operationIndex;
  if (idx < 0 || idx >= input.operationCount) {
    return {
      requestedIndex: idx,
      available: false,
      reason: `operation_index out of range (transaction reports operation_count=${input.operationCount}).`
    };
  }
  if (input.resultMetaFieldTruncated || !input.resultMetaXdr) {
    return {
      requestedIndex: idx,
      available: false,
      reason:
        "Cannot slice operation meta: result_meta_xdr missing or truncated. Increase maxXdrCharsPerField or call stellar_decode_xdr with type TransactionMeta on full base64 from a non-truncated source."
    };
  }
  try {
    const json = xdrDecodeToJsonString("TransactionMeta", input.resultMetaXdr);
    const decoded = JSON.parse(json) as unknown;
    const ops = extractOperationsFromTransactionMetaJson(decoded);
    const picked = ops && idx < ops.length ? ops[idx] : null;
    return {
      requestedIndex: idx,
      available: picked !== null,
      operationMeta: picked,
      operationsDecoded: ops?.length ?? null
    };
  } catch (e) {
    return {
      requestedIndex: idx,
      available: false,
      reason: `TransactionMeta decode failed: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}
