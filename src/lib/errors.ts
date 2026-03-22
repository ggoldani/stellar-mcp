import { NotFoundError as StellarNotFoundError } from "@stellar/stellar-sdk";

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class StellarProtocolError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "StellarProtocolError";
  }
}

const TX_CODE_MESSAGES: Record<string, string> = {
  tx_bad_auth: "Transaction failed: tx_bad_auth — invalid signatures. Rebuild and sign with required account signers, and verify network passphrase matches STELLAR_NETWORK.",
  tx_bad_seq: "Transaction failed: tx_bad_seq — sequence number is stale. Reload the source account and rebuild the transaction.",
  tx_no_source_account: "Transaction failed: tx_no_source_account — source account does not exist on this network. Create/fund the account first.",
  tx_failed: "Transaction failed: tx_failed — one or more operations were rejected. Inspect operation result codes for actionable remediation.",
  tx_insufficient_fee: "Transaction failed: tx_insufficient_fee — offered fee is too low. Retry using stellar_get_fee_stats recommendation.",
  tx_internal_error: "Transaction failed: tx_internal_error — temporary Stellar internal issue. Retry the request.",
  tx_too_early: "Transaction failed: tx_too_early — transaction time bounds not yet valid. Rebuild with current time bounds.",
  tx_too_late: "Transaction failed: tx_too_late — transaction expired. Rebuild and submit again.",
  tx_missing_operation: "Transaction failed: tx_missing_operation — no operations found. Build transaction with at least one operation.",
  tx_bad_auth_extra: "Transaction failed: tx_bad_auth_extra — unexpected signatures present. Remove extra signatures and retry."
};

const OP_CODE_MESSAGES: Record<string, string> = {
  op_malformed: "Operation failed: op_malformed — invalid operation structure/parameters. Validate fields and rebuild transaction.",
  op_bad_auth: "Operation failed: op_bad_auth — source account authorization failed. Verify signer/threshold configuration.",
  op_no_source_account: "Operation failed: op_no_source_account — source account does not exist on this network.",
  op_not_supported: "Operation failed: op_not_supported — operation not supported on current network/protocol version.",
  op_too_many_subentries: "Operation failed: op_too_many_subentries — account reached subentry limits. Clean up trustlines/offers/signers.",
  op_exceeded_work_limit: "Operation failed: op_exceeded_work_limit — operation exceeded work limit. Retry with smaller transaction scope.",
  op_underfunded: "Operation failed: op_underfunded — source account does not have enough balance after reserve constraints.",
  op_no_destination: "Operation failed: op_no_destination — destination account does not exist. Create and fund account first.",
  op_low_reserve: "Operation failed: op_low_reserve — balance would drop below minimum reserve. Add XLM headroom and retry.",
  op_no_trust: "Operation failed: op_no_trust — destination account has no trustline for this asset. Call stellar_create_trustline first.",
  op_not_authorized: "Operation failed: op_not_authorized — trustline is not authorized by issuer. Request issuer authorization first.",
  op_line_full: "Operation failed: op_line_full — destination trustline limit reached. Increase trustline limit.",
  op_offer_not_found: "Operation failed: op_offer_not_found — target offer does not exist.",
  op_cross_self: "Operation failed: op_cross_self — operation would cross your own offer. Adjust order parameters.",
  op_sell_no_trust: "Operation failed: op_sell_no_trust — source account lacks trustline for selling asset.",
  op_buy_no_trust: "Operation failed: op_buy_no_trust — source account lacks trustline for buying asset.",
  op_sell_not_authorized: "Operation failed: op_sell_not_authorized — source account is not authorized to sell this asset.",
  op_buy_not_authorized: "Operation failed: op_buy_not_authorized — source account is not authorized to buy this asset.",
  op_no_issuer: "Operation failed: op_no_issuer — referenced asset issuer account does not exist.",
  op_self_not_allowed: "Operation failed: op_self_not_allowed — source and destination cannot be the same for this operation.",
  op_too_few_offers: "Operation failed: op_too_few_offers — no valid path/offers found. Retry with different assets/amount/slippage."
};

const SOROBAN_MESSAGES: Record<string, string> = {
  auth_not_authorized: "Soroban invocation failed: auth_not_authorized — required signer authorization missing. Ensure require_auth signer is present.",
  wasm_vm_error: "Soroban invocation failed: wasm_vm_error — contract execution trapped or exceeded budget. Inspect contract logic and simulation output.",
  storage_not_live: "Soroban invocation failed: storage_not_live — contract storage entry expired. Extend TTL and retry.",
  invoke_error: "Soroban invocation failed: invoke_error — contract returned an execution error. Inspect returned events and result XDR.",
  tx_resource_limit_exceeded: "Soroban invocation failed: tx_resource_limit_exceeded — CPU/memory/resource footprint exceeded. Re-simulate and reduce invocation size."
};

function messageFor(code: string, fallbackPrefix: string): string {
  return (
    OP_CODE_MESSAGES[code] ??
    TX_CODE_MESSAGES[code] ??
    SOROBAN_MESSAGES[code] ??
    `${fallbackPrefix}: ${code} — no mapped remediation yet.`
  );
}

export function mapStellarResultCodes(
  transactionCode?: string,
  operationCode?: string
): StellarProtocolError {
  if (operationCode) {
    return new StellarProtocolError(
      messageFor(operationCode, "Operation failed"),
      operationCode
    );
  }

  if (transactionCode) {
    return new StellarProtocolError(
      messageFor(transactionCode, "Transaction failed"),
      transactionCode
    );
  }

  return new StellarProtocolError(
    "Stellar protocol failure: unknown result code. Inspect Horizon/RPC result payload for details."
  );
}

function isNetworkLikeMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network")
  );
}

function extractResultCodes(error: unknown): {
  transaction?: string;
  operation?: string;
} {
  const maybe = error as {
    response?: {
      data?: {
        extras?: {
          result_codes?: {
            transaction?: string;
            operations?: string[];
          };
        };
      };
    };
  };

  const resultCodes = maybe.response?.data?.extras?.result_codes;
  return {
    transaction: resultCodes?.transaction,
    operation: resultCodes?.operations?.[0]
  };
}

export function normalizeStellarError(error: unknown): Error {
  if (error instanceof NetworkError || error instanceof StellarProtocolError) {
    return error;
  }

  const { transaction, operation } = extractResultCodes(error);
  if (transaction || operation) {
    return mapStellarResultCodes(transaction, operation);
  }

  if (error instanceof Error && isNetworkLikeMessage(error.message)) {
    return new NetworkError(
      `Network request failed: ${error.message}. Verify endpoint availability and retry.`
    );
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    const code = (error as { code: string }).code;
    if (["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT"].includes(code)) {
      return new NetworkError(
        `Network request failed: ${code}. Verify endpoint connectivity and retry.`
      );
    }
  }

  return mapUnknownError(error);
}

export function mapUnknownError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error("Unexpected non-error exception thrown.");
}

/**
 * Detect Horizon HTTP 404 (resource missing) for RPC fallback paths.
 * Walks Error.cause when present (SDK / fetch wrappers).
 */
export function isHorizonAxiosNotFound(error: unknown): boolean {
  if (error instanceof StellarNotFoundError) {
    return true;
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const any = error as {
    response?: { status?: number };
    cause?: unknown;
  };
  if (any.response?.status === 404) {
    return true;
  }
  if (any.cause) {
    return isHorizonAxiosNotFound(any.cause);
  }
  return false;
}
