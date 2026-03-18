import { Horizon, Networks, rpc } from "@stellar/stellar-sdk";

import type { AppConfig } from "../config.js";

const DEFAULT_ENDPOINTS = {
  testnet: {
    horizon: "https://horizon-testnet.stellar.org",
    rpc: "https://soroban-testnet.stellar.org",
    passphrase: Networks.TESTNET
  },
  mainnet: {
    horizon: "https://horizon.stellar.org",
    rpc: "https://soroban.stellar.org",
    passphrase: Networks.PUBLIC
  }
} as const;

export interface StellarClients {
  horizon: Horizon.Server;
  rpc: rpc.Server;
  networkPassphrase: string;
}

export function createStellarClients(config: AppConfig): StellarClients {
  const defaults = DEFAULT_ENDPOINTS[config.network];
  const horizonUrl = config.horizonUrl ?? defaults.horizon;
  const rpcUrl = config.rpcUrl ?? defaults.rpc;

  return {
    horizon: new Horizon.Server(horizonUrl),
    rpc: new rpc.Server(rpcUrl),
    networkPassphrase: defaults.passphrase
  };
}
