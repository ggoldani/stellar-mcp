import { z } from "zod";
import { Networks } from "@stellar/stellar-sdk";

import type { RuntimeTransport, StellarNetwork } from "./types.js";

const EnvSchema = z.object({
  MCP_TRANSPORT: z.enum(["stdio", "http-sse"]).optional(),
  STELLAR_NETWORK: z.enum(["mainnet", "testnet"]).default("testnet"),
  STELLAR_HORIZON_URL: z.string().url().optional(),
  STELLAR_RPC_URL: z.string().url().optional(),
  STELLAR_SECRET_KEY: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  STELLAR_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(30_000)
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
  secretKey?: string;
  port: number;
  networkPassphrase: string;
  requestTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  return {
    transport: parsed.MCP_TRANSPORT ?? "stdio",
    network: parsed.STELLAR_NETWORK,
    horizonUrl: parsed.STELLAR_HORIZON_URL,
    rpcUrl: parsed.STELLAR_RPC_URL,
    secretKey: parsed.STELLAR_SECRET_KEY,
    port: parsed.PORT,
    networkPassphrase: NETWORK_PASSPHRASE[parsed.STELLAR_NETWORK],
    requestTimeoutMs: parsed.STELLAR_REQUEST_TIMEOUT_MS
  };
}
