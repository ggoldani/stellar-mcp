import { loadConfig } from "../src/config.js";

function runSmokeChecks(): void {
  const config = loadConfig({
    STELLAR_NETWORK: "testnet",
    PORT: "3000"
  });

  if (config.network !== "testnet") {
    throw new Error("Smoke check failed: expected default testnet config.");
  }
}

runSmokeChecks();
console.error("Smoke checks passed.");
