import { createServer as createHttpServer } from "node:http";

import type { AppConfig } from "../config.js";

export async function startHttpServer(config: AppConfig): Promise<void> {
  const server = createHttpServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          transport: "http-sse",
          network: config.network,
          version: "0.1.0"
        })
      );
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port, resolve);
  });

  console.error(`StellarMCP HTTP transport listening on :${config.port}.`);
}
