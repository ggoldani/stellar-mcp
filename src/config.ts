import { z } from "zod";
import { Networks } from "@stellar/stellar-sdk";

import type { AutoSignPolicy, RuntimeTransport, StellarNetwork } from "./types.js";

const EnvSchema = z.object({
  MCP_TRANSPORT: z.enum(["stdio", "http-sse"]).optional(),
  STELLAR_NETWORK: z.enum(["mainnet", "testnet"]).default("testnet"),
  STELLAR_HORIZON_URL: z.string().url().optional(),
  STELLAR_RPC_URL: z.string().url().optional(),
  STELLAR_SEP38_URL: z.string().url().optional(),
  STELLAR_ALLOWED_HOSTS: z.string().optional(),
  STELLAR_TRUSTED_ANCHOR_DOMAINS: z.string().optional(),
  STELLAR_SECRET_KEY: z.string().optional(),
  STELLAR_AUTO_SIGN_POLICY: z.enum(["safe", "guarded", "expert"]).optional(),
  STELLAR_AUTO_SIGN: z.coerce.boolean().default(false),
  STELLAR_AUTO_SIGN_LIMIT: z.coerce.number().min(0).default(0),
  STELLAR_USDC_ISSUER: z
    .string()
    .default("GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  STELLAR_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(30_000),
  MCP_HTTP_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),
  MCP_HTTP_MAX_CONCURRENT: z.coerce.number().int().positive().default(20),
  MCP_HTTP_MAX_PAYLOAD_BYTES: z.coerce.number().int().positive().default(262_144),
  MCP_HTTP_TRUST_PROXY: z.coerce.boolean().default(false)
});

const NETWORK_PASSPHRASE: Record<StellarNetwork, string> = {
  mainnet: Networks.PUBLIC,
  testnet: Networks.TESTNET
};

export interface AppConfig {
  transport: RuntimeTransport;
  network: StellarNetwork;
  horizonUrl?: string;
  rpcUrl?: string;
  sep38Url?: string;
  secretKey?: string;
  autoSignPolicy: AutoSignPolicy;
  autoSign: boolean;
  autoSignLimit: number;
  usdcIssuer: string;
  port: number;
  networkPassphrase: string;
  requestTimeoutMs: number;
  allowedHosts: string[];
  httpRateLimitPerMinute: number;
  httpMaxConcurrent: number;
  httpMaxPayloadBytes: number;
  httpTrustProxy: boolean;
  trustedAnchorDomains: string[];
}

const DEFAULT_ALLOWED_HOSTS = new Set<string>([
  "horizon.stellar.org",
  "horizon-testnet.stellar.org",
  "soroban.stellar.org",
  "soroban-testnet.stellar.org"
]);

function isPrivateOrLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".local")) {
    return true;
  }

  if (normalized === "::1" || normalized.startsWith("fe80:")) {
    return true;
  }

  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
    return false;
  }

  const [a, b] = normalized.split(".").map((segment) => Number.parseInt(segment, 10));
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function parseAllowedHosts(raw?: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function deriveAutoSignRuntime(input: {
  policyRaw?: "safe" | "guarded" | "expert";
  autoSignRaw: boolean;
  autoSignLimitRaw: number;
}): {
  autoSignPolicy: AutoSignPolicy;
  autoSign: boolean;
  autoSignLimit: number;
} {
  if (!input.policyRaw) {
    return {
      autoSignPolicy: "legacy",
      autoSign: input.autoSignRaw,
      autoSignLimit: input.autoSignLimitRaw
    };
  }

  if (input.policyRaw === "safe") {
    return {
      autoSignPolicy: "safe",
      autoSign: false,
      autoSignLimit: 0
    };
  }

  if (input.policyRaw === "guarded") {
    if (input.autoSignLimitRaw <= 0) {
      throw new Error(
        "STELLAR_AUTO_SIGN_POLICY=guarded requires STELLAR_AUTO_SIGN_LIMIT > 0."
      );
    }
    return {
      autoSignPolicy: "guarded",
      autoSign: true,
      autoSignLimit: input.autoSignLimitRaw
    };
  }

  return {
    autoSignPolicy: "expert",
    autoSign: true,
    autoSignLimit: 0
  };
}

function validateEndpointOverride(
  endpointName: "STELLAR_HORIZON_URL" | "STELLAR_RPC_URL" | "STELLAR_SEP38_URL",
  value: string | undefined,
  allowedHosts: Set<string>
): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error(`${endpointName} must use https.`);
  }

  if (isPrivateOrLocalHost(parsed.hostname)) {
    throw new Error(`${endpointName} cannot target private or local hosts.`);
  }

  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error(
      `${endpointName} host ${parsed.hostname} is not in STELLAR_ALLOWED_HOSTS allowlist.`
    );
  }

  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const customAllowedHosts = parseAllowedHosts(parsed.STELLAR_ALLOWED_HOSTS);
  const allowedHosts = new Set<string>([
    ...Array.from(DEFAULT_ALLOWED_HOSTS),
    ...customAllowedHosts
  ]);

  const trustedAnchorDomains = parseAllowedHosts(parsed.STELLAR_TRUSTED_ANCHOR_DOMAINS);

  const horizonUrl = validateEndpointOverride(
    "STELLAR_HORIZON_URL",
    parsed.STELLAR_HORIZON_URL,
    allowedHosts
  );

  const rpcUrl = validateEndpointOverride(
    "STELLAR_RPC_URL",
    parsed.STELLAR_RPC_URL,
    allowedHosts
  );
  const sep38Url = validateEndpointOverride(
    "STELLAR_SEP38_URL",
    parsed.STELLAR_SEP38_URL,
    allowedHosts
  );
  const autoSignRuntime = deriveAutoSignRuntime({
    policyRaw: parsed.STELLAR_AUTO_SIGN_POLICY,
    autoSignRaw: parsed.STELLAR_AUTO_SIGN,
    autoSignLimitRaw: parsed.STELLAR_AUTO_SIGN_LIMIT
  });

  return {
    transport: parsed.MCP_TRANSPORT ?? "stdio",
    network: parsed.STELLAR_NETWORK,
    horizonUrl,
    rpcUrl,
    sep38Url,
    secretKey: parsed.STELLAR_SECRET_KEY,
    autoSignPolicy: autoSignRuntime.autoSignPolicy,
    autoSign: autoSignRuntime.autoSign,
    autoSignLimit: autoSignRuntime.autoSignLimit,
    usdcIssuer: parsed.STELLAR_USDC_ISSUER,
    port: parsed.PORT,
    networkPassphrase: NETWORK_PASSPHRASE[parsed.STELLAR_NETWORK],
    requestTimeoutMs: parsed.STELLAR_REQUEST_TIMEOUT_MS,
    allowedHosts: Array.from(allowedHosts),
    httpRateLimitPerMinute: parsed.MCP_HTTP_RATE_LIMIT_PER_MIN,
    httpMaxConcurrent: parsed.MCP_HTTP_MAX_CONCURRENT,
    httpMaxPayloadBytes: parsed.MCP_HTTP_MAX_PAYLOAD_BYTES,
    httpTrustProxy: parsed.MCP_HTTP_TRUST_PROXY,
    trustedAnchorDomains
  };
}
