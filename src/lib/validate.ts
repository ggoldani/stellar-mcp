import { StrKey } from "@stellar/stellar-sdk";
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

export const amountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,7})?$/, "Invalid amount format (max 7 decimals).");

export const assetSchema = z.object({
  code: z.string().trim().min(1).max(12),
  issuer: publicKeySchema
});
