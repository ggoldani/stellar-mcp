import { Keypair, Transaction } from "@stellar/stellar-sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { normalizeStellarError } from "../lib/errors.js";
import { fetchJsonWithTimeout, fetchTextWithTimeout } from "../lib/http.js";
import { redactSensitiveText, sanitizeDebugPayload } from "../lib/redact.js";
import { amountSchema, publicKeySchema, secretKeySchema } from "../lib/validate.js";

const sep10InputSchema = {
  anchorDomain: z.string().describe("Anchor domain, e.g. anchor.example.com"),
  publicKey: z.string().describe("Account public key that will authenticate.")
};

const sep38InputSchema = {
  sellAsset: z.string().describe("SEP-38 sell asset string, e.g. stellar:USDC:G..."),
  buyAsset: z.string().describe("SEP-38 buy asset string, e.g. iso4217:BRL"),
  amount: z.string().describe("Sell amount as decimal string")
};

interface Sep10ChallengeResponse {
  transaction: string;
  network_passphrase: string;
}

interface Sep10TokenResponse {
  token: string;
}

interface Sep38PriceResponse {
  price?: string;
  expires_at?: string;
  [key: string]: unknown;
}

export function normalizeAnchorDomain(anchorDomain: string): string {
  const trimmed = anchorDomain.trim().replace(/^https?:\/\//i, "");
  return trimmed.replace(/\/+$/, "");
}

export function parseTomlValue(rawToml: string, key: string): string | undefined {
  const regex = new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']\\s*$`, "m");
  const match = rawToml.match(regex);
  return match?.[1];
}

export function assertTrustedAnchor(domain: string, trustedAnchorDomains: string[]): void {
  if (trustedAnchorDomains.length === 0) {
    return;
  }
  if (!trustedAnchorDomains.includes(domain.toLowerCase())) {
    throw new Error(
      `Anchor domain ${domain} is not in STELLAR_TRUSTED_ANCHOR_DOMAINS allowlist.`
    );
  }
}

/**
 * Register SEP-focused tools.
 *
 * @example
 * {
 *   "name": "stellar_sep10_auth",
 *   "arguments": {
 *     "anchorDomain": "anchor.example.com",
 *     "publicKey": "G..."
 *   }
 * }
 */
export function registerSepTools(server: McpServer, config: AppConfig): void {
  server.tool(
    "stellar_sep10_auth",
    "Perform SEP-10 challenge signing flow and return JWT token.",
    sep10InputSchema,
    async ({ anchorDomain, publicKey }) => {
      try {
        const validatedPublicKey = publicKeySchema.parse(publicKey);
        const normalizedDomain = normalizeAnchorDomain(anchorDomain);
        assertTrustedAnchor(normalizedDomain, config.trustedAnchorDomains);

        if (!config.secretKey) {
          throw new Error(
            "SEP-10 signing is unavailable: STELLAR_SECRET_KEY is not configured."
          );
        }
        const signer = Keypair.fromSecret(secretKeySchema.parse(config.secretKey));
        if (signer.publicKey() !== validatedPublicKey) {
          throw new Error(
            "Public key mismatch: `publicKey` does not match STELLAR_SECRET_KEY public key."
          );
        }

        const toml = await fetchTextWithTimeout(
          `https://${normalizedDomain}/.well-known/stellar.toml`,
          { method: "GET", headers: { accept: "text/plain" } },
          config.requestTimeoutMs
        );

        const webAuthEndpoint = parseTomlValue(toml, "WEB_AUTH_ENDPOINT");
        if (!webAuthEndpoint) {
          throw new Error(
            "SEP-10 discovery failed: WEB_AUTH_ENDPOINT not found in anchor stellar.toml."
          );
        }

        const challenge = await fetchJsonWithTimeout<Sep10ChallengeResponse>(
          `${webAuthEndpoint}?account=${encodeURIComponent(validatedPublicKey)}`,
          { method: "GET", headers: { accept: "application/json" } },
          config.requestTimeoutMs
        );

        const challengeTx = new Transaction(
          challenge.transaction,
          challenge.network_passphrase
        );
        challengeTx.sign(signer);

        const tokenResponse = await fetchJsonWithTimeout<Sep10TokenResponse>(
          webAuthEndpoint,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ transaction: challengeTx.toXDR() })
          },
          config.requestTimeoutMs
        );

        const response = {
          token: tokenResponse.token,
          ...(config.network === "testnet"
            ? {
                dryRunWarning:
                  "Network is testnet. SEP tokens are non-production and anchor behavior may differ from mainnet."
              }
            : {}),
          _debug: sanitizeDebugPayload({
            anchorDomain: normalizedDomain,
            webAuthEndpoint
          })
        };

        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
        };
      } catch (error) {
        const mapped = normalizeStellarError(error);
        return {
          isError: true,
          content: [{ type: "text", text: redactSensitiveText(mapped.message) }]
        };
      }
    }
  );

  server.tool(
    "stellar_get_sep38_quote",
    "Request a SEP-38 indicative quote and return rate metadata.",
    sep38InputSchema,
    async ({ sellAsset, buyAsset, amount }) => {
      try {
        const validatedAmount = amountSchema.parse(amount);
        if (!config.sep38Url) {
          throw new Error(
            "SEP-38 quote endpoint is not configured. Set STELLAR_SEP38_URL."
          );
        }

        const quote = await fetchJsonWithTimeout<Sep38PriceResponse>(
          `${config.sep38Url}?${new URLSearchParams({
            sell_asset: sellAsset,
            buy_asset: buyAsset,
            sell_amount: validatedAmount
          }).toString()}`,
          { method: "GET", headers: { accept: "application/json" } },
          config.requestTimeoutMs
        );

        const response = {
          price: quote.price ?? null,
          expiresAt: quote.expires_at ?? null,
          raw: quote,
          ...(config.network === "testnet"
            ? {
                dryRunWarning:
                  "Network is testnet. SEP quote behavior may differ from production anchors."
              }
            : {}),
          _debug: sanitizeDebugPayload({
            sep38Url: config.sep38Url
          })
        };

        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
        };
      } catch (error) {
        const mapped = normalizeStellarError(error);
        return {
          isError: true,
          content: [{ type: "text", text: redactSensitiveText(mapped.message) }]
        };
      }
    }
  );
}
