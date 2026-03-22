import type { xdr } from "@stellar/stellar-sdk";

export type ZodAndTs = { zod: string; ts: string };

/**
 * Maps Soroban ScSpecTypeDef to Zod source fragments and TypeScript types for generated tools + typed client.
 * Unsupported shapes fall back to z.unknown() with an explicit description (documented deviation).
 */
export function scSpecTypeToZodAndTs(typeDef: xdr.ScSpecTypeDef, depth = 0): ZodAndTs {
  if (depth > 12) {
    return {
      zod: `z.unknown().describe("Nested spec type too deep for static Zod; validate via simulation.")`,
      ts: "unknown"
    };
  }

  const arm = typeDef.switch().name;

  switch (arm) {
    case "scSpecTypeVoid":
      return { zod: "z.undefined()", ts: "void" };
    case "scSpecTypeBool":
      return { zod: "z.boolean()", ts: "boolean" };
    case "scSpecTypeU32":
      return {
        zod: "z.number().int().min(0).max(4294967295)",
        ts: "number"
      };
    case "scSpecTypeI32":
      return {
        zod: "z.number().int().min(-2147483648).max(2147483647)",
        ts: "number"
      };
    case "scSpecTypeU64":
    case "scSpecTypeTimepoint":
    case "scSpecTypeDuration":
      return {
        zod: "z.string().regex(/^([1-9][0-9]*|0)$/).min(1).max(20)",
        ts: "string"
      };
    case "scSpecTypeI64":
      return {
        zod: "z.string().regex(/^(-?[1-9][0-9]*|0)$/).min(1).max(21)",
        ts: "string"
      };
    case "scSpecTypeU128":
      return {
        zod: "z.string().regex(/^([1-9][0-9]*|0)$/).min(1).max(39)",
        ts: "string"
      };
    case "scSpecTypeI128":
      return {
        zod: "z.string().regex(/^(-?[1-9][0-9]*|0)$/).min(1).max(40)",
        ts: "string"
      };
    case "scSpecTypeU256":
      return {
        zod: "z.string().regex(/^([1-9][0-9]*|0)$/).min(1).max(78)",
        ts: "string"
      };
    case "scSpecTypeI256":
      return {
        zod: "z.string().regex(/^(-?[1-9][0-9]*|0)$/).min(1).max(79)",
        ts: "string"
      };
    case "scSpecTypeString":
      return { zod: "z.string()", ts: "string" };
    case "scSpecTypeSymbol":
      return { zod: "z.string()", ts: "string" };
    case "scSpecTypeAddress":
      return {
        zod: 'z.string().describe("Stellar address (G... public key or C... contract)")',
        ts: "string"
      };
    case "scSpecTypeMuxedAddress":
      return {
        zod: 'z.string().describe("Muxed Stellar address (M...)")',
        ts: "string"
      };
    case "scSpecTypeOption": {
      const inner = typeDef.option().valueType();
      const mapped = scSpecTypeToZodAndTs(inner, depth + 1);
      if (mapped.zod.startsWith("z.undefined()")) {
        return {
          zod: "z.undefined().optional()",
          ts: `${mapped.ts} | undefined`
        };
      }
      return {
        zod: `${mapped.zod}.optional()`,
        ts: `${mapped.ts} | undefined`
      };
    }
    case "scSpecTypeVec": {
      const inner = typeDef.vec().elementType();
      const mapped = scSpecTypeToZodAndTs(inner, depth + 1);
      return {
        zod: `z.array(${mapped.zod})`,
        ts: `${mapped.ts}[]`
      };
    }
    case "scSpecTypeMap": {
      return {
        zod: `z.record(z.string(), z.unknown()).describe("Map args: validate at simulation (generator maps Soroban map to loose record).")`,
        ts: "Record<string, unknown>"
      };
    }
    case "scSpecTypeTuple": {
      return {
        zod: `z.array(z.unknown()).describe("Tuple args: pass array matching contract order; validated at simulation.")`,
        ts: "unknown[]"
      };
    }
    case "scSpecTypeBytes":
    case "scSpecTypeBytesN":
      return {
        zod: 'z.string().describe("Bytes as base64 or hex per simulation expectations")',
        ts: "string"
      };
    case "scSpecTypeUdt":
      return {
        zod: `z.unknown().describe("User-defined Soroban type; validated when building ScVals via Spec.funcArgsToScVals.")`,
        ts: "unknown"
      };
    case "scSpecTypeResult":
    case "scSpecTypeError":
    default:
      return {
        zod: `z.unknown().describe("Spec arm ${arm} — use simulation for strict validation.")`,
        ts: "unknown"
      };
  }
}
