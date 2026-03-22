export interface BoundedXdrField {
  encoding: "base64";
  value: string | null;
  truncated: boolean;
  originalLength: number;
  maxChars: number;
}

export function truncateBase64Xdr(
  raw: string | null | undefined,
  maxChars: number
): BoundedXdrField {
  if (raw === null || raw === undefined || raw.length === 0) {
    return {
      encoding: "base64",
      value: null,
      truncated: false,
      originalLength: 0,
      maxChars
    };
  }

  const originalLength = raw.length;
  if (originalLength <= maxChars) {
    return {
      encoding: "base64",
      value: raw,
      truncated: false,
      originalLength,
      maxChars
    };
  }

  return {
    encoding: "base64",
    value: raw.slice(0, maxChars),
    truncated: true,
    originalLength,
    maxChars
  };
}

/**
 * Walk TransactionMeta JSON (stellar-xdr-json decode) and return the operations array when present.
 */
export function extractOperationsFromTransactionMetaJson(
  decoded: unknown
): unknown[] | null {
  if (!decoded || typeof decoded !== "object") {
    return null;
  }
  const root = decoded as Record<string, unknown>;
  for (const key of ["v4", "v3", "v2", "v1"] as const) {
    const arm = root[key];
    if (arm && typeof arm === "object" && "operations" in arm) {
      const ops = (arm as { operations?: unknown }).operations;
      if (Array.isArray(ops)) {
        return ops;
      }
    }
  }
  return null;
}
