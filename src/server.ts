import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppConfig } from "./config.js";
import { registerAccountTools } from "./tools/accounts.js";

export function createServer(config: AppConfig): McpServer {
  const server = new McpServer({
    name: "stellarmcp",
    version: "0.1.0"
  });

  registerAccountTools(server, config);

  return server;
}
