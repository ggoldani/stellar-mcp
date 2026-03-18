import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.js";

test("loadConfig defaults to testnet passphrase and stdio transport", () => {
  const config = loadConfig({});

  assert.equal(config.network, "testnet");
  assert.equal(config.transport, "stdio");
  assert.equal(
    config.networkPassphrase,
    "Test SDF Network ; September 2015"
  );
});

test("loadConfig derives mainnet passphrase from STELLAR_NETWORK", () => {
  const config = loadConfig({
    STELLAR_NETWORK: "mainnet"
  });

  assert.equal(config.network, "mainnet");
  assert.equal(
    config.networkPassphrase,
    "Public Global Stellar Network ; September 2015"
  );
});
