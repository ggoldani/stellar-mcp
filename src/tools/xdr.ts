import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Transaction } from "@stellar/stellar-sdk";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { normalizeStellarError } from "../lib/errors.js";
import { redactSensitiveText, sanitizeDebugPayload } from "../lib/redact.js";
import { createStellarClients } from "../lib/stellar.js";
import {
  xdrEncodeFromJsonString,
  xdrGuessTypes,
  xdrSchemaJsonString,
  xdrTypesList
} from "../lib/xdrJson.js";

const xdrTypeNameSchema = z
  .string()
  .trim()
  .min(1)
  .describe("Stellar XDR type name (see stellar_xdr_types), e.g. TransactionEnvelope");

const xdrBase64Schema = z
  .string()
  .trim()
  .min(1)
  .describe("Single XDR value as standard base64 (no data: URL prefix)");

const encodeJsonSchema = z.union([
  z
    .string()
    .min(1)
    .describe("JSON string that validates against stellar_xdr_json_schema for the chosen type"),
  z
    .record(z.string(), z.unknown())
    .describe("JSON object; serialized with JSON.stringify before encoding")
]);

function stringifyThrownMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function formatXdrJsonToolError(
  operation: string,
  context: { type?: string },
  error: unknown
): string {
  const raw = stringifyThrownMessage(error);
  const lower = raw.toLowerCase();

  if (lower.includes("unknown type")) {
    const t = context.type ? `"${context.type}"` : "that type";
    return [
      `Unknown XDR type ${t}: ${raw}`,
      "Call stellar_xdr_types for the authoritative list of type names (e.g. TransactionEnvelope, TransactionResult)."
    ].join(" ");
  }

  if (lower.includes("string length limit exceeded") || lower.includes("invalid digit") || lower.includes("invalid character")) {
    return [
      `Invalid XDR payload during ${operation}: ${raw}`,
      "Expected a single base64-encoded XDR value (no data: prefix, no PEM headers). If unsure of the type, use stellar_xdr_guess."
    ].join(" ");
  }

  if (lower.includes("eof while parsing") || lower.includes("json")) {
    return [
      `JSON input error during ${operation}: ${raw}`,
      "Validate the document against stellar_xdr_json_schema for your type, then pass the same structure as json (object or stringified JSON)."
    ].join(" ");
  }

  return `${operation} failed: ${raw}`;
}

function normalizeEncodeJsonInput(value: string | Record<string, unknown>): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Register XDR-focused MCP tools (JSON schema parity + classic transaction decode).
 */
export function registerXdrTools(server: McpServer, config: AppConfig): void {
  server.tool(
    "stellar_xdr_types",
    "List supported Stellar XDR type names for encode/decode/schema (from the bundled XDR JSON engine).",
    {
      prefix: z
        .string()
        .trim()
        .optional()
        .describe("Optional case-insensitive prefix filter applied to type names")
    },
    async ({ prefix }) => {
      try {
        const all = xdrTypesList();
        const filtered =
          prefix && prefix.length > 0
            ? all.filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()))
            : all;

        const response = {
          types: filtered,
          count: filtered.length,
          totalDefined: all.length,
          _debug: sanitizeDebugPayload({
            filteredByPrefix: prefix ?? null
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
    "stellar_xdr_json_schema",
    "Return Draft-7 JSON Schema for a Stellar XDR type (use with stellar_xdr_encode).",
    {
      type: xdrTypeNameSchema
    },
    async ({ type }) => {
      try {
        const parsedType = xdrTypeNameSchema.parse(type);
        const schemaString = xdrSchemaJsonString(parsedType);
        let parsed: unknown;
        try {
          parsed = JSON.parse(schemaString) as unknown;
        } catch {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "stellar_xdr_json_schema produced non-JSON output; report this as a bug with the requested type name."
              }
            ]
          };
        }

        const response = {
          type: parsedType,
          schema: parsed,
          _debug: sanitizeDebugPayload({
            schemaBytes: schemaString.length
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
        const message = formatXdrJsonToolError("stellar_xdr_json_schema", { type }, error);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: redactSensitiveText(message)
            }
          ]
        };
      }
    }
  );

  server.tool(
    "stellar_xdr_guess",
    "Given base64 XDR, return which XDR types decode successfully (single value only; not streams).",
    {
      xdr: xdrBase64Schema
    },
    async ({ xdr }) => {
      try {
        const parsedXdr = xdrBase64Schema.parse(xdr);
        const candidates = xdrGuessTypes(parsedXdr);
        const response = {
          candidates,
          count: candidates.length,
          _debug: sanitizeDebugPayload({
            inputLength: parsedXdr.length
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
        const message = formatXdrJsonToolError("stellar_xdr_guess", {}, error);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: redactSensitiveText(message)
            }
          ]
        };
      }
    }
  );

  server.tool(
    "stellar_xdr_encode",
    "Encode JSON into base64 XDR for a named type (roundtrip with stellar_xdr_json_schema + decode tools).",
    {
      type: xdrTypeNameSchema,
      json: encodeJsonSchema
    },
    async ({ type, json }) => {
      try {
        const parsedType = xdrTypeNameSchema.parse(type);
        const jsonString = normalizeEncodeJsonInput(encodeJsonSchema.parse(json));
        const xdrOut = xdrEncodeFromJsonString(parsedType, jsonString);
        const response = {
          type: parsedType,
          xdr: xdrOut,
          _debug: sanitizeDebugPayload({
            jsonLength: jsonString.length
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
        const message = formatXdrJsonToolError("stellar_xdr_encode", { type }, error);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: redactSensitiveText(message)
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
