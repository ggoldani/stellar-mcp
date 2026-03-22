#!/usr/bin/env node
import { parseArgs } from "node:util";

import { generateProject } from "./emit.js";
import { loadSpecFromPath } from "./loadSpec.js";
import { slugSegment } from "./naming.js";
import { redactSensitiveText } from "../lib/redact.js";

function printHelp(): void {
  console.log(`stellarmcp-generate — Soroban contract → MCP server (Phase C)

Usage:
  stellarmcp-generate --input <wasm|json> --out <dir> [--name pkg] [--alias tools]

Options:
  --input, -i   Path to contract .wasm or stellarmcp-contract-spec-v1 JSON
  --out, -o     Output directory (created; contents overwritten from template)
  --name        npm package name (kebab-case; default: generated-soroban-mcp)
  --alias       MCP tool name prefix (default: derived from --name)
  --help, -h    Show this message

Environment for the generated server is documented in the parent README (generator section).
`);
}

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      input: { type: "string", short: "i" },
      out: { type: "string", short: "o" },
      name: { type: "string", default: "generated-soroban-mcp" },
      alias: { type: "string" },
      help: { type: "boolean", short: "h", default: false }
    },
    allowPositionals: false,
    strict: true
  });

  if (values.help) {
    printHelp();
    return;
  }

  if (!values.input || !values.out) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const packageName = values.name ?? "generated-soroban-mcp";
  const toolAlias =
    values.alias ??
    slugSegment(packageName.replace(/-/g, "_").replace(/\./g, "_"));

  const loaded = loadSpecFromPath(values.input);
  generateProject({
    outDir: values.out,
    packageName,
    toolAlias,
    loaded
  });

  console.error(
    `Generated MCP package at ${values.out} (tools prefix: ${toolAlias}_*). Run npm install && npm run build inside output.`
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSensitiveText(message));
  process.exit(1);
}
