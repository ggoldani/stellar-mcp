#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { startHttpServer } from "./transports/http.js";
import { startStdioServer } from "./transports/stdio.js";

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.transport === "http-sse") {
    await startHttpServer(config);
    return;
  }

  await startStdioServer();
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
