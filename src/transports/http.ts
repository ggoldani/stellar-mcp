import { createServer as createHttpServer } from "node:http";
import type { Server } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AppConfig } from "../config.js";
import { createServer } from "../server.js";
import { createStellarClients } from "../lib/stellar.js";
import { NetworkError, StellarProtocolError } from "../lib/errors.js";

interface HealthResponse {
  status: "ok" | "degraded" | "error";
  network: "mainnet" | "testnet";
  transport: "http-sse";
  horizonReachable: boolean;
  rpcReachable: boolean;
  version: string;
}

async function getHealthResponse(config: AppConfig): Promise<HealthResponse> {
  const clients = createStellarClients(config);

  const [horizonResult, rpcResult] = await Promise.allSettled([
    clients.runHorizon(clients.horizon.feeStats(), "fee_stats"),
    clients.runRpc(clients.rpc.getHealth(), "health")
  ]);

  const horizonReachable = horizonResult.status === "fulfilled";
  const rpcReachable = rpcResult.status === "fulfilled";

  const status: HealthResponse["status"] =
    horizonReachable && rpcReachable
      ? "ok"
      : horizonReachable || rpcReachable
        ? "degraded"
        : "error";

  return {
    status,
    network: config.network,
    transport: "http-sse",
    horizonReachable,
    rpcReachable,
    version: "0.1.0"
  };
}

export async function startHttpServer(config: AppConfig): Promise<Server> {
  const mcpServer = createServer();
  const mcpTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });
  await mcpServer.connect(mcpTransport);

  const server = createHttpServer(async (req, res) => {
    if (req.url === "/health") {
      const health = await getHealthResponse(config);
      const statusCode =
        health.status === "ok" ? 200 : health.status === "degraded" ? 206 : 503;
      res.writeHead(statusCode, { "content-type": "application/json" });
      res.end(JSON.stringify(health));
      return;
    }

    if (req.url === "/mcp") {
      if (!req.method || !["GET", "POST", "DELETE"].includes(req.method)) {
        res.writeHead(405, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      try {
        await mcpTransport.handleRequest(req, res);
      } catch (error) {
        const mapped =
          error instanceof NetworkError || error instanceof StellarProtocolError
            ? error
            : new Error("Unhandled MCP transport error.");
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: mapped.message }));
      }
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port, resolve);
  });

  const address = server.address();
  if (address && typeof address === "object") {
    console.error(`StellarMCP HTTP transport listening on :${address.port}.`);
  } else {
    console.error("StellarMCP HTTP transport started.");
  }

  return server;
}
