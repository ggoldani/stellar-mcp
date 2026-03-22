import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppConfig } from "./config.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerAssetTools } from "./tools/assets.js";
import { registerMetaTools } from "./tools/meta.js";
import { registerNetworkTools } from "./tools/network.js";
import { registerPaymentTools } from "./tools/payments.js";
import { registerSepTools } from "./tools/seps.js";
import { registerSorobanTools } from "./tools/soroban.js";
import { registerXdrTools } from "./tools/xdr.js";

export function createServer(config: AppConfig): McpServer {
  const server = new McpServer({
    name: "stellarmcp",
    version: "0.1.0"
  });

  registerAccountTools(server, config);
  registerPaymentTools(server, config);
  registerAssetTools(server, config);
  registerNetworkTools(server, config);
  registerMetaTools(server, config);
  registerXdrTools(server, config);
  registerSepTools(server, config);
  registerSorobanTools(server, config);

  return server;
}
