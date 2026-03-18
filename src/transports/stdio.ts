import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import type { AppConfig } from "../config.js";
import { createServer } from "../server.js";

export async function startStdioServer(config: AppConfig): Promise<void> {
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("StellarMCP running over stdio transport.");
}
