export type SigningMode = "unsigned_xdr" | "signed_submitted";

export type SigningReason =
  | "auto_sign_disabled"
  | "auto_signed"
  | "limit_exceeded"
  | "valuation_unavailable";

export interface SigningDecision {
  shouldSign: boolean;
  mode: SigningMode;
  reason: SigningReason;
  message?: string;
}

export function buildLimitExceededMessage(limitUsdc: number): string {
  return `Transaction requires confirmation — value exceeds auto-sign limit of $${limitUsdc} USDC. Review XDR before signing.`;
}

export function decideSigningPolicy(input: {
  autoSign: boolean;
  autoSignLimit: number;
  valueUsdc?: number;
}): SigningDecision {
  if (!input.autoSign) {
    return {
      shouldSign: false,
      mode: "unsigned_xdr",
      reason: "auto_sign_disabled",
      message:
        "Auto-sign is disabled. Returning unsigned XDR for external signing."
    };
  }

  if (input.autoSignLimit <= 0) {
    return {
      shouldSign: true,
      mode: "signed_submitted",
      reason: "auto_signed"
    };
  }

  if (typeof input.valueUsdc !== "number" || !Number.isFinite(input.valueUsdc)) {
    return {
      shouldSign: false,
      mode: "unsigned_xdr",
      reason: "valuation_unavailable",
      message:
        "Transaction requires confirmation — unable to derive reliable USDC valuation for auto-sign limit policy."
    };
  }

  if (input.valueUsdc > input.autoSignLimit) {
    return {
      shouldSign: false,
      mode: "unsigned_xdr",
      reason: "limit_exceeded",
      message: buildLimitExceededMessage(input.autoSignLimit)
    };
  }

  return {
    shouldSign: true,
    mode: "signed_submitted",
    reason: "auto_signed"
  };
}
