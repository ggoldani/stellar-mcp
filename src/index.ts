#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { redactSensitiveText } from "./lib/redact.js";
import { startHttpServer } from "./transports/http.js";
import { startStdioServer } from "./transports/stdio.js";

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.transport === "http-sse") {
    await startHttpServer(config);
    return;
  }

  await startStdioServer(config);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Fatal startup error:", redactSensitiveText(message));
  process.exit(1);
});
