import assert from "node:assert/strict";
import { createServer as createNetServer } from "node:net";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { loadConfig } from "../src/config.js";

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to allocate free port for smoke test."));
        return;
      }
      const { port } = address;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForHealth(port: number): Promise<void> {
  const healthUrl = `http://127.0.0.1:${port}/health`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok || response.status === 206 || response.status === 503) {
        return;
      }
    } catch {
      // Retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("HTTP smoke failed: /health endpoint did not become ready.");
}

async function runConfigSmoke(): Promise<void> {
  const config = loadConfig({
    STELLAR_NETWORK: "testnet",
    PORT: "3000"
  });
  assert.equal(config.network, "testnet");
  assert.equal(config.networkPassphrase, "Test SDF Network ; September 2015");
}

async function runStdioSmoke(): Promise<void> {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["build/src/index.js"],
    cwd: process.cwd(),
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      ),
      MCP_TRANSPORT: "stdio",
      STELLAR_NETWORK: "testnet"
    }
  });
  await transport.start();
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.ok(transport.pid, "Expected stdio server process to stay alive.");
  } finally {
    await transport.close();
  }
}

async function runHttpSmoke(): Promise<void> {
  const port = await getFreePort();
  const transport = new StdioClientTransport({
    command: "node",
    args: ["build/src/index.js"],
    cwd: process.cwd(),
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      ),
      MCP_TRANSPORT: "http-sse",
      STELLAR_NETWORK: "testnet",
      PORT: String(port)
    }
  });

  await transport.start();
  try {
    await waitForHealth(port);

    const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
    const health = (await healthResponse.json()) as {
      status: string;
      network: string;
      transport: string;
      horizonReachable: boolean;
      rpcReachable: boolean;
      version: string;
    };

    assert.ok(["ok", "degraded", "error"].includes(health.status));
    assert.equal(health.network, "testnet");
    assert.equal(health.transport, "http-sse");
    assert.equal(typeof health.horizonReachable, "boolean");
    assert.equal(typeof health.rpcReachable, "boolean");
    assert.equal(health.version, "0.1.0");

    const mcpResponse = await fetch(`http://127.0.0.1:${port}/mcp`);
    assert.notEqual(
      mcpResponse.status,
      404,
      "Expected /mcp endpoint to be registered."
    );
  } finally {
    await transport.close();
  }
}

await runConfigSmoke();
await runStdioSmoke();
await runHttpSmoke();
console.error("Smoke checks passed.");
