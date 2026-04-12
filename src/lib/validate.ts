import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

export const publicKeySchema = z
  .string()
  .trim()
  .refine((value) => StrKey.isValidEd25519PublicKey(value), {
    message: "Invalid Stellar public key (expected G... address)."
  });

export const secretKeySchema = z
  .string()
  .trim()
  .refine((value) => StrKey.isValidEd25519SecretSeed(value), {
    message: "Invalid Stellar secret key (expected S... seed)."
  });

export const contractIdSchema = z
  .string()
  .trim()
  .refine((value) => StrKey.isValidContract(value), {
    message: "Invalid Stellar contract ID (expected C... address)."
  });

export const safePathSchema = z
  .string()
  .describe("File path to a compiled .wasm file")
  .refine((path) => {
    const normalized = path.replace(/\\/g, "/");
    if (normalized.includes("..")) return false;
    const restrictedPrefixes = ["/etc/", "/proc/", "/sys/", "/dev/", "/root/", "/boot/", "/var/log/", "/run/"];
    return !restrictedPrefixes.some((prefix) => normalized.startsWith(prefix));
  }, {
    message: "File path contains forbidden traversal patterns or targets a restricted system directory."
  });

export function assertSourceKeyMatch(
  keypair: Keypair,
  sourceAccount: string,
  toolName: string
): void {
  if (keypair.publicKey() !== sourceAccount) {
    throw new Error(
      `${toolName}: source account does not match STELLAR_SECRET_KEY public key.`
    );
  }
}

export function isUnsafeUrlHost(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return true;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".local")) return true;
    if (hostname === "::1" || hostname.startsWith("fe80:")) return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      const octets = hostname.split(".").map(Number);
      if (octets.length !== 4) return true;
      const [a, b] = octets;
      if (a === 10 || a === 127 || (a === 169 && b === 254) ||
          (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function validateDiscoveredEndpoint(key: string, url: string): string {
  if (isUnsafeUrlHost(url)) {
    throw new Error(
      `Discovered ${key} endpoint targets private/local host. Refusing.`
    );
  }
  return url;
}

export const amountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,7})?$/, "Invalid amount format (max 7 decimals).")
  .refine((value) => Number.parseFloat(value) > 0, {
    message: "Amount must be greater than zero."
  });

export const assetSchema = z.object({
  code: z.string().trim().min(1).max(12),
  issuer: publicKeySchema
});

const nativeAssetSchema = z.object({
  type: z.literal("native")
});

const creditAssetSchema = z.object({
  type: z.literal("credit"),
  code: z.string().trim().min(1).max(12),
  issuer: publicKeySchema
});

export const assetInputSchema = z.union([nativeAssetSchema, creditAssetSchema]);

const textMemoSchema = z
  .object({
    type: z.literal("text"),
    value: z.string()
  })
  .refine((memo) => new TextEncoder().encode(memo.value).byteLength <= 28, {
    message: "Memo text exceeds 28-byte Stellar limit."
  });

const idMemoSchema = z.object({
  type: z.literal("id"),
  value: z
    .string()
    .regex(/^\d+$/, "Memo id must be an unsigned integer string.")
    .refine(
      (value) => {
        try {
          const parsed = BigInt(value);
          return parsed >= 0n && parsed <= 18446744073709551615n;
        } catch {
          return false;
        }
      },
      "Memo id must fit within uint64 range."
    )
});

const hashMemoSchema = z.object({
  type: z.literal("hash"),
  value: z
    .string()
    .regex(/^[A-Fa-f0-9]{64}$/, "Memo hash must be a 32-byte hex string.")
});

export const memoSchema = z.union([textMemoSchema, idMemoSchema, hashMemoSchema]);
