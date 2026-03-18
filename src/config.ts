import { z } from "zod";

import type { RuntimeTransport, StellarNetwork } from "./types.js";

const EnvSchema = z.object({
  MCP_TRANSPORT: z.enum(["stdio", "http-sse"]).optional(),
  STELLAR_NETWORK: z.enum(["mainnet", "testnet"]).default("testnet"),
  STELLAR_HORIZON_URL: z.string().url().optional(),
  STELLAR_RPC_URL: z.string().url().optional(),
  STELLAR_SECRET_KEY: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000)
});

export interface AppConfig {
  transport: RuntimeTransport;
  network: StellarNetwork;
  horizonUrl?: string;
  rpcUrl?: string;
  secretKey?: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  return {
    transport: parsed.MCP_TRANSPORT ?? "stdio",
    network: parsed.STELLAR_NETWORK,
    horizonUrl: parsed.STELLAR_HORIZON_URL,
    rpcUrl: parsed.STELLAR_RPC_URL,
    secretKey: parsed.STELLAR_SECRET_KEY,
    port: parsed.PORT
  };
}
