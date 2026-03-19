import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.js";
import { createStellarClients, type StellarClients } from "../src/lib/stellar.js";
import { NetworkError } from "../src/lib/errors.js";

test("createStellarClients exposes timeout wrapper API", () => {
  const config = loadConfig({});
  const clients = createStellarClients(config);

  assert.equal(typeof clients.withTimeout, "function");
});

test("withTimeout rejects long-running promise as NetworkError", async () => {
  const config = loadConfig({
    STELLAR_REQUEST_TIMEOUT_MS: "25"
  });
  const clients: StellarClients = createStellarClients(config);

  const neverResolves = new Promise<string>(() => {});
  const start = Date.now();

  await assert.rejects(
    () => clients.withTimeout(neverResolves, "test_operation"),
    (error: unknown) =>
      error instanceof NetworkError &&
      error.message.includes("test_operation timed out")
  );

  assert.ok(Date.now() - start < 1_000);
});
