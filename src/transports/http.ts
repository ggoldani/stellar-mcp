import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AppConfig } from "../config.js";
import { createServer } from "../server.js";
import { createStellarClients } from "../lib/stellar.js";
import { NetworkError, StellarProtocolError } from "../lib/errors.js";
import { redactSensitiveText } from "../lib/redact.js";

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

  const requestHistory = new Map<string, number[]>();
  let activeRequests = 0;
  const windowMs = 60_000;

  const getClientIp = (req: IncomingMessage): string => {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      return forwarded.split(",")[0].trim();
    }
    return req.socket.remoteAddress ?? "unknown";
  };

  const allowRequest = (req: IncomingMessage): { ok: true } | { ok: false; status: number; error: string } => {
    if (activeRequests >= config.httpMaxConcurrent) {
      return {
        ok: false,
        status: 503,
        error: "Server is handling maximum concurrent requests. Retry shortly."
      };
    }

    const ip = getClientIp(req);
    const now = Date.now();
    const cutoff = now - windowMs;
    const history = requestHistory.get(ip) ?? [];
    const fresh = history.filter((timestamp) => timestamp > cutoff);

    if (fresh.length >= config.httpRateLimitPerMinute) {
      requestHistory.set(ip, fresh);
      return {
        ok: false,
        status: 429,
        error: "Rate limit exceeded for current client identity."
      };
    }

    fresh.push(now);
    requestHistory.set(ip, fresh);
    return { ok: true };
  };

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

      const concurrencyAndRate = allowRequest(req);
      if (!concurrencyAndRate.ok) {
        res.writeHead(concurrencyAndRate.status, {
          "content-type": "application/json"
        });
        res.end(JSON.stringify({ error: concurrencyAndRate.error }));
        return;
      }

      if (req.method === "POST") {
        const contentType = req.headers["content-type"] ?? "";
        if (!String(contentType).toLowerCase().includes("application/json")) {
          res.writeHead(415, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "POST /mcp requires application/json content-type." }));
          return;
        }

        const contentLength = Number.parseInt(req.headers["content-length"] ?? "0", 10);
        if (
          Number.isFinite(contentLength) &&
          contentLength > config.httpMaxPayloadBytes
        ) {
          res.writeHead(413, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "MCP request payload exceeds configured maximum size." }));
          return;
        }
      }

      activeRequests += 1;
      try {
        await mcpTransport.handleRequest(req, res);
      } catch (error) {
        const mapped =
          error instanceof NetworkError || error instanceof StellarProtocolError
            ? error
            : new Error("Unhandled MCP transport error.");
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: redactSensitiveText(mapped.message) }));
      } finally {
        activeRequests = Math.max(0, activeRequests - 1);
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
