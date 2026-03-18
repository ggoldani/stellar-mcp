import { Horizon, Networks, rpc } from "@stellar/stellar-sdk";

import type { AppConfig } from "../config.js";
import { NetworkError } from "./errors.js";

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
  withTimeout<T>(operation: Promise<T>, operationName: string): Promise<T>;
}

export function createStellarClients(config: AppConfig): StellarClients {
  const defaults = DEFAULT_ENDPOINTS[config.network];
  const horizonUrl = config.horizonUrl ?? defaults.horizon;
  const rpcUrl = config.rpcUrl ?? defaults.rpc;

  return {
    horizon: new Horizon.Server(horizonUrl),
    rpc: new rpc.Server(rpcUrl),
    networkPassphrase: config.networkPassphrase ?? defaults.passphrase,
    withTimeout<T>(operation: Promise<T>, operationName: string): Promise<T> {
      return withTimeout(
        operation,
        operationName,
        config.requestTimeoutMs
      );
    }
  };
}

function withTimeout<T>(
  operation: Promise<T>,
  operationName: string,
  timeoutMs: number
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new NetworkError(
          `${operationName} timed out after ${timeoutMs}ms.`
        )
      );
    }, timeoutMs);
  });

  return Promise.race([operation, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}
