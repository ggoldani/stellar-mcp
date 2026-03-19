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
  assert.equal(config.autoSign, false);
  assert.equal(config.autoSignLimit, 0);
  assert.equal(config.autoSignPolicy, "legacy");
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

test("loadConfig rejects insecure http override on mainnet", () => {
  assert.throws(
    () =>
      loadConfig({
        STELLAR_NETWORK: "mainnet",
        STELLAR_HORIZON_URL: "http://horizon.stellar.org"
      }),
    /https/i
  );
});

test("loadConfig rejects private host override", () => {
  assert.throws(
    () =>
      loadConfig({
        STELLAR_NETWORK: "testnet",
        STELLAR_RPC_URL: "https://127.0.0.1:8000"
      }),
    /private/i
  );
});

test("loadConfig rejects IPv6 localhost override", () => {
  assert.throws(
    () =>
      loadConfig({
        STELLAR_NETWORK: "testnet",
        STELLAR_RPC_URL: "https://[::1]:8000"
      }),
    /private/i
  );
});

test("loadConfig allows custom override host when explicitly allowlisted", () => {
  const config = loadConfig({
    STELLAR_NETWORK: "testnet",
    STELLAR_ALLOWED_HOSTS: "custom.stellar-provider.example",
    STELLAR_RPC_URL: "https://custom.stellar-provider.example"
  });

  assert.equal(config.rpcUrl, "https://custom.stellar-provider.example");
});

test("loadConfig parses auto-sign envs", () => {
  const config = loadConfig({
    STELLAR_AUTO_SIGN: "true",
    STELLAR_AUTO_SIGN_LIMIT: "25.5"
  });

  assert.equal(config.autoSign, true);
  assert.equal(config.autoSignLimit, 25.5);
  assert.equal(config.autoSignPolicy, "legacy");
});

test("loadConfig policy safe forces unsigned mode", () => {
  const config = loadConfig({
    STELLAR_AUTO_SIGN_POLICY: "safe",
    STELLAR_AUTO_SIGN: "true",
    STELLAR_AUTO_SIGN_LIMIT: "999"
  });

  assert.equal(config.autoSignPolicy, "safe");
  assert.equal(config.autoSign, false);
  assert.equal(config.autoSignLimit, 0);
});

test("loadConfig policy guarded requires positive limit and enables auto-sign", () => {
  const config = loadConfig({
    STELLAR_AUTO_SIGN_POLICY: "guarded",
    STELLAR_AUTO_SIGN_LIMIT: "10"
  });

  assert.equal(config.autoSignPolicy, "guarded");
  assert.equal(config.autoSign, true);
  assert.equal(config.autoSignLimit, 10);
});

test("loadConfig policy guarded rejects missing positive limit", () => {
  assert.throws(
    () =>
      loadConfig({
        STELLAR_AUTO_SIGN_POLICY: "guarded",
        STELLAR_AUTO_SIGN_LIMIT: "0"
      }),
    /requires STELLAR_AUTO_SIGN_LIMIT > 0/i
  );
});

test("loadConfig policy expert enables unlimited auto-sign", () => {
  const config = loadConfig({
    STELLAR_AUTO_SIGN_POLICY: "expert",
    STELLAR_AUTO_SIGN_LIMIT: "15"
  });

  assert.equal(config.autoSignPolicy, "expert");
  assert.equal(config.autoSign, true);
  assert.equal(config.autoSignLimit, 0);
});
