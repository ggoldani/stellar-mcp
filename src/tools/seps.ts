import { Keypair, Transaction } from "@stellar/stellar-sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { normalizeStellarError } from "../lib/errors.js";
import { fetchJsonWithTimeout, fetchTextWithTimeout } from "../lib/http.js";
import { redactSensitiveText, sanitizeDebugPayload } from "../lib/redact.js";
import { amountSchema, publicKeySchema, secretKeySchema, validateDiscoveredEndpoint } from "../lib/validate.js";

const sep10InputSchema = {
  anchorDomain: z.string().describe("Anchor domain, e.g. anchor.example.com"),
  publicKey: publicKeySchema.describe("Account public key that will authenticate.")
};

const sep38InputSchema = {
  sellAsset: z.string().describe("SEP-38 sell asset string, e.g. stellar:USDC:G..."),
  buyAsset: z.string().describe("SEP-38 buy asset string, e.g. iso4217:BRL"),
  amount: z.string().describe("Sell amount as decimal string")
};

interface Sep10ChallengeResponse {
  transaction?: string;
  network_passphrase?: string;
}

interface Sep10TokenResponse {
  token?: string;
}

interface Sep38PriceResponse {
  price?: string;
  expires_at?: string;
  [key: string]: unknown;
}

export function normalizeAnchorDomain(anchorDomain: string): string {
  const raw = anchorDomain.trim();
  if (!raw) {
    throw new Error("anchorDomain must be a non-empty host.");
  }

  const hasScheme = /^https?:\/\//i.test(raw);
  const parsed = new URL(hasScheme ? raw : `https://${raw}`);
  const hasUnexpectedParts =
    parsed.pathname !== "/" ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    parsed.port.length > 0 ||
    parsed.username.length > 0 ||
    parsed.password.length > 0;

  if (hasUnexpectedParts) {
    throw new Error(
      "anchorDomain must be a host only (no path, query, fragment, credentials, or port)."
    );
  }

  return parsed.hostname.toLowerCase();
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

function isSameOrSubdomain(hostname: string, rootDomain: string): boolean {
  const host = hostname.toLowerCase();
  const root = rootDomain.toLowerCase();
  return host === root || host.endsWith(`.${root}`);
}

export function validateDiscoveredWebAuthEndpoint(
  endpoint: string,
  anchorDomain: string
): string {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:") {
    throw new Error("SEP-10 discovery failed: WEB_AUTH_ENDPOINT must use https.");
  }
  if (!isSameOrSubdomain(parsed.hostname, anchorDomain)) {
    throw new Error(
      "SEP-10 discovery failed: WEB_AUTH_ENDPOINT must be on anchor domain or its subdomain."
    );
  }
  return parsed.toString();
}

export function buildSep10ChallengeUrl(webAuthEndpoint: string, publicKey: string): string {
  const challengeUrl = new URL(webAuthEndpoint);
  challengeUrl.searchParams.set("account", publicKey);
  return challengeUrl.toString();
}

export function validateSep10ChallengePayload(
  payload: Sep10ChallengeResponse,
  expectedNetworkPassphrase: string
): { transaction: string; networkPassphrase: string } {
  if (!payload.transaction || payload.transaction.trim().length === 0) {
    throw new Error("SEP-10 challenge response is invalid: missing challenge transaction.");
  }
  if (!payload.network_passphrase || payload.network_passphrase.trim().length === 0) {
    throw new Error("SEP-10 challenge response is invalid: missing network passphrase.");
  }
  if (payload.network_passphrase !== expectedNetworkPassphrase) {
    throw new Error(
      `SEP-10 challenge response has unexpected network passphrase. Expected "${expectedNetworkPassphrase}", got "${payload.network_passphrase}".`
    );
  }
  return {
    transaction: payload.transaction,
    networkPassphrase: payload.network_passphrase
  };
}

export function extractSep10Token(payload: Sep10TokenResponse): string {
  if (!payload.token || payload.token.trim().length === 0) {
    throw new Error("SEP-10 auth response did not return a token.");
  }
  return payload.token;
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
        const signer = config.validatedKeypair!;
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
        const safeWebAuthEndpoint = validateDiscoveredWebAuthEndpoint(
          webAuthEndpoint,
          normalizedDomain
        );

        const challenge = await fetchJsonWithTimeout<Sep10ChallengeResponse>(
          buildSep10ChallengeUrl(safeWebAuthEndpoint, validatedPublicKey),
          { method: "GET", headers: { accept: "application/json" } },
          config.requestTimeoutMs
        );
        const challengePayload = validateSep10ChallengePayload(
          challenge,
          config.networkPassphrase
        );

        const challengeTx = new Transaction(
          challengePayload.transaction,
          challengePayload.networkPassphrase
        );
        challengeTx.sign(signer);

        const tokenResponse = await fetchJsonWithTimeout<Sep10TokenResponse>(
          safeWebAuthEndpoint,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ transaction: challengeTx.toXDR() })
          },
          config.requestTimeoutMs
        );

        const response = {
          token: extractSep10Token(tokenResponse),
          ...(config.network === "testnet"
            ? {
                dryRunWarning:
                  "Network is testnet. SEP tokens are non-production and anchor behavior may differ from mainnet."
              }
            : {}),
          _debug: sanitizeDebugPayload({
            anchorDomain: normalizedDomain,
            webAuthEndpoint: safeWebAuthEndpoint
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
    "stellar_sep6_transfer",
    "Initiate a SEP-6 programmatic deposit or withdrawal.",
    {
      anchorDomain: z.string().describe("Anchor domain, e.g. anchor.example.com"),
      type: z.enum(["deposit", "withdraw"]).describe("Transaction type: deposit or withdraw"),
      assetCode: z.string().describe("Stellar asset code, e.g. USDC"),
      token: z.string().describe("SEP-10 JWT authentication token"),
      amount: z.string().optional().describe("Amount to transfer"),
      typeField: z.string().optional().describe("Type of deposit or withdrawal (e.g. bank_account, SEPA)"),
      destOrAccount: z.string().optional().describe("Destination account or bank details routing")
    },
    async ({ anchorDomain, type, assetCode, token, amount, typeField, destOrAccount }) => {
      try {
        const normalizedDomain = normalizeAnchorDomain(anchorDomain);
        const tomlUrl = `https://${normalizedDomain}/.well-known/stellar.toml`;

        const toml = await fetchTextWithTimeout(
          tomlUrl,
          { method: "GET" },
          config.requestTimeoutMs
        );

        const transferServer = parseTomlValue(toml, "TRANSFER_SERVER");
        if (!transferServer) {
          throw new Error(
            `SEP-6 discovery failed: TRANSFER_SERVER not found in stellar.toml of ${normalizedDomain}.`
          );
        }
        validateDiscoveredEndpoint("TRANSFER_SERVER", transferServer);

        const endpointUrl = new URL(
          `${transferServer.replace(/\/$/, "")}/${type}`
        );

        const formData = new URLSearchParams();
        formData.append("asset_code", assetCode);
        if (amount) formData.append("amount", amount);
        if (typeField) formData.append("type", typeField);
        if (destOrAccount) {
          if (type === "deposit") formData.append("account", destOrAccount);
          if (type === "withdraw") formData.append("dest", destOrAccount);
        }

        const authHeader = `Bearer ${token}`;
        const responseUrl = endpointUrl.toString() + "?" + formData.toString();

        const responseJson = await fetchJsonWithTimeout<any>(
          responseUrl,
          {
            method: "GET",
            headers: {
              "Authorization": authHeader,
              "Accept": "application/json"
            }
          },
          config.requestTimeoutMs
        );

        return {
          content: [{ type: "text", text: JSON.stringify(responseJson, null, 2) }]
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
    "stellar_sep12_customer",
    "GET or PUT customer KYC data to an Anchor's SEP-12 KYC_SERVER.",
    {
      anchorDomain: z.string().describe("Anchor domain, e.g. anchor.example.com"),
      method: z.enum(["GET", "PUT"]).describe("HTTP method to use"),
      token: z.string().describe("SEP-10 JWT authentication token"),
      kycFields: z.record(z.string(), z.any()).optional().describe("Key-value pairs of KYC fields to PUT (e.g. first_name, last_name, email)")
    },
    async ({ anchorDomain, method, token, kycFields }) => {
      try {
        const normalizedDomain = normalizeAnchorDomain(anchorDomain);
        const tomlUrl = `https://${normalizedDomain}/.well-known/stellar.toml`;

        const toml = await fetchTextWithTimeout(
          tomlUrl,
          { method: "GET" },
          config.requestTimeoutMs
        );

        const kycServer = parseTomlValue(toml, "KYC_SERVER");
        if (!kycServer) {
          throw new Error(
            `SEP-12 discovery failed: KYC_SERVER not found in stellar.toml of ${normalizedDomain}.`
          );
        }
        validateDiscoveredEndpoint("KYC_SERVER", kycServer);

        const endpointUrl = new URL(
          `${kycServer.replace(/\/$/, "")}/customer`
        ).toString();

        let responseJson: any;

        if (method === "GET") {
          responseJson = await fetchJsonWithTimeout(
            endpointUrl.toString(),
            {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json"
              }
            },
            config.requestTimeoutMs
          );
        } else if (method === "PUT") {
          const formData = new URLSearchParams();
          if (kycFields) {
            for (const [k, v] of Object.entries(kycFields)) {
              formData.append(k, String(v));
            }
          }

          responseJson = await fetchJsonWithTimeout(
            endpointUrl.toString(),
            {
              method: "PUT",
              headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json"
              },
              body: formData.toString()
            },
            config.requestTimeoutMs
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                data: responseJson,
                _debug: sanitizeDebugPayload({
                  kycServer: kycServer ?? ""
                })
              }, null, 2)
            }
          ]
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
    "stellar_sep31_remittance",
    "Initiate a SEP-31 cross-border remittance payment.",
    {
      anchorDomain: z.string().describe("Anchor domain, e.g. anchor.example.com"),
      token: z.string().describe("SEP-10 JWT authentication token"),
      amount: z.string().describe("Amount to remit"),
      assetCode: z.string().describe("Stellar asset code to send"),
      destinationAsset: z.string().describe("Asset code the recipient will receive (e.g. NGN)"),
      senderId: z.string().describe("Sender's KYC ID (from SEP-12)"),
      receiverId: z.string().describe("Receiver's KYC ID (from SEP-12)"),
      fields: z.record(z.string(), z.any()).optional().describe("Additional SEP-31 fields (e.g. routing details)")
    },
    async ({ anchorDomain, token, amount, assetCode, destinationAsset, senderId, receiverId, fields }) => {
      try {
        const normalizedDomain = normalizeAnchorDomain(anchorDomain);
        const tomlUrl = `https://${normalizedDomain}/.well-known/stellar.toml`;

        const toml = await fetchTextWithTimeout(
          tomlUrl,
          { method: "GET" },
          config.requestTimeoutMs
        );

        const directPaymentServer = parseTomlValue(toml, "DIRECT_PAYMENT_SERVER");
        if (!directPaymentServer) {
          throw new Error(
            `SEP-31 discovery failed: DIRECT_PAYMENT_SERVER not found in stellar.toml of ${normalizedDomain}.`
          );
        }
        validateDiscoveredEndpoint("DIRECT_PAYMENT_SERVER", directPaymentServer);

        const endpointUrl = new URL(
          `${directPaymentServer.replace(/\/$/, "")}/transactions`
        );

        const payload = {
          amount,
          asset_code: assetCode,
          destination_asset: destinationAsset,
          sender_id: senderId,
          receiver_id: receiverId,
          fields: fields || {}
        };

        const responseJson = await fetchJsonWithTimeout<any>(
          endpointUrl.toString(),
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            body: JSON.stringify(payload)
          },
          config.requestTimeoutMs
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                data: responseJson,
                _debug: sanitizeDebugPayload({
                  directPaymentServer
                })
              }, null, 2)
            }
          ]
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
    "stellar_sep24_interactive",
    "Initiate a SEP-24 interactive deposit or withdrawal. Returns the interactive URL to present to the user.",
    {
      anchorDomain: z.string().describe("Anchor domain, e.g. anchor.example.com"),
      type: z.enum(["deposit", "withdraw"]).describe("Transaction type: deposit or withdraw"),
      assetCode: z.string().describe("Stellar asset code, e.g. USDC"),
      token: z.string().describe("SEP-10 JWT authentication token")
    },
    async ({ anchorDomain, type, assetCode, token }) => {
      try {
        const normalizedDomain = normalizeAnchorDomain(anchorDomain);
        const tomlUrl = `https://${normalizedDomain}/.well-known/stellar.toml`;

        const toml = await fetchTextWithTimeout(
          tomlUrl,
          { method: "GET" },
          config.requestTimeoutMs
        );

        const transferServerSep24 = parseTomlValue(toml, "TRANSFER_SERVER_SEP0024");
        if (!transferServerSep24) {
          throw new Error(
            `SEP-24 discovery failed: TRANSFER_SERVER_SEP0024 not found in stellar.toml of ${normalizedDomain}.`
          );
        }
        validateDiscoveredEndpoint("TRANSFER_SERVER_SEP0024", transferServerSep24);

        const endpointUrl = new URL(
          `${transferServerSep24.replace(/\/$/, "")}/transactions/${type}/interactive`
        );

        const formData = new URLSearchParams();
        formData.append("asset_code", assetCode);

        interface Sep24InteractiveResponse {
          type: string;
          url: string;
          id: string;
        }

        const authHeader = `Bearer ${token}`;
        const responseJson = await fetchJsonWithTimeout<Sep24InteractiveResponse>(
          endpointUrl.toString(),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Authorization": authHeader
            },
            body: formData.toString()
          },
          config.requestTimeoutMs
        );

        const response = {
          type: responseJson.type,
          url: responseJson.url,
          id: responseJson.id,
          instructions: "Open the returned URL in a browser to complete the interactive flow.",
          _debug: sanitizeDebugPayload({
            transferServerSep24
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
    "stellar_get_anchor_toml",
    "Fetch and parse the stellar.toml file for a given anchor domain to discover SEP support (SEP-10, SEP-24, etc).",
    {
      anchorDomain: z.string().describe("Anchor domain, e.g. anchor.example.com")
    },
    async ({ anchorDomain }) => {
      try {
        const normalizedDomain = normalizeAnchorDomain(anchorDomain);
        const tomlUrl = `https://${normalizedDomain}/.well-known/stellar.toml`;

        const toml = await fetchTextWithTimeout(
          tomlUrl,
          { method: "GET" },
          config.requestTimeoutMs
        );

        const webAuthEndpoint = parseTomlValue(toml, "WEB_AUTH_ENDPOINT");
        const kycServer = parseTomlValue(toml, "KYC_SERVER");
        const transferServer = parseTomlValue(toml, "TRANSFER_SERVER");
        const transferServerSep24 = parseTomlValue(toml, "TRANSFER_SERVER_SEP0024");
        const directPaymentServer = parseTomlValue(toml, "DIRECT_PAYMENT_SERVER");
        const anchorQuoteServer = parseTomlValue(toml, "ANCHOR_QUOTE_SERVER");

        const response = {
          domain: normalizedDomain,
          discoveredEndpoints: {
            webAuthEndpoint: webAuthEndpoint ?? null,
            kycServer: kycServer ?? null,
            transferServer: transferServer ?? null, // SEP-6
            transferServerSep24: transferServerSep24 ?? null, // SEP-24
            directPaymentServer: directPaymentServer ?? null, // SEP-31
            anchorQuoteServer: anchorQuoteServer ?? null // SEP-38
          },
          rawTomlPreview: toml.substring(0, 1000) + (toml.length > 1000 ? "... (truncated)" : ""),
          _debug: sanitizeDebugPayload({
            tomlUrl
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
