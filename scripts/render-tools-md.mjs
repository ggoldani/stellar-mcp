#!/usr/bin/env node
/**
 * Generate docs/TOOLS.md from a live MCP tools/list against build/src/index.js.
 * Usage: node scripts/render-tools-md.mjs [--check]
 *   --check  Regenerate in memory and exit 1 if docs/TOOLS.md differs (CI drift gate).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "docs", "TOOLS.md");

const CATEGORY_ORDER = [
  "Accounts & history",
  "Payments & fees",
  "Assets & AMM",
  "Network",
  "XDR",
  "Historical meta",
  "SEP & anchors",
  "Soroban",
  "Other"
];

function toolCategory(name) {
  if (
    name === "stellar_get_account_history" ||
    name === "stellar_get_account" ||
    name === "stellar_fund_account" ||
    name === "stellar_set_options"
  ) {
    return "Accounts & history";
  }
  if (name.startsWith("stellar_submit")) return "Payments & fees";
  if (
    name === "stellar_create_trustline" ||
    name === "stellar_deposit_liquidity" ||
    name === "stellar_withdraw_liquidity"
  ) {
    return "Assets & AMM";
  }
  if (name === "stellar_get_fee_stats") return "Network";
  if (
    name.startsWith("stellar_xdr_") ||
    name === "stellar_decode_xdr"
  ) {
    return "XDR";
  }
  if (name === "stellar_get_ledger_meta" || name === "stellar_get_transaction_meta") {
    return "Historical meta";
  }
  if (
    name.startsWith("stellar_sep") ||
    name === "stellar_get_anchor_toml" ||
    name === "stellar_get_sep38_quote"
  ) {
    return "SEP & anchors";
  }
  if (name.startsWith("stellar_soroban_")) return "Soroban";
  return "Other";
}

function categorySortKey(cat) {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i === -1 ? 99 : i;
}

/**
 * @param {Record<string, unknown>} schema - JSON Schema (object)
 */
function formatInputSchema(schema) {
  if (!schema || typeof schema !== "object") {
    return "_No schema._\n";
  }

  const type = schema.type;
  const props =
    schema.properties && typeof schema.properties === "object"
      ? schema.properties
      : null;
  const required = Array.isArray(schema.required)
    ? new Set(schema.required)
    : new Set();

  if (type === "object" && (!props || Object.keys(props).length === 0)) {
    return "_No parameters._\n";
  }

  if (!props) {
    return "```json\n" + JSON.stringify(schema, null, 2) + "\n```\n";
  }

  const lines = ["| Parameter | Type | Required | Description |", "|-----------|------|----------|-------------|"];

  for (const [key, sub] of Object.entries(props)) {
    if (!sub || typeof sub !== "object") continue;
    const s = /** @type {Record<string, unknown>} */ (sub);
    const t = formatSchemaType(s);
    const req = required.has(key) ? "yes" : "no";
    const desc =
      typeof s.description === "string"
        ? s.description.replace(/\|/g, "\\|").replace(/\n/g, " ")
        : "—";
    lines.push(`| \`${key}\` | ${t} | ${req} | ${desc} |`);
  }

  return lines.join("\n") + "\n";
}

function formatSchemaType(s) {
  if (Array.isArray(s.anyOf) && s.anyOf.length) {
    return s.anyOf.map((x) => formatSchemaType(x)).join(" \\| ");
  }
  if (Array.isArray(s.enum)) {
    return "`enum`";
  }
  const t = s.type;
  if (t === "array" && s.items) {
    return "`array`";
  }
  if (typeof t === "string") {
    return `\`${t}\``;
  }
  if (Array.isArray(t)) {
    return t.map((x) => `\`${x}\``).join(" \\| ");
  }
  return "`any`";
}

async function collectToolsList() {
  const entry = join(root, "build", "src", "index.js");
  const transport = new StdioClientTransport({
    command: "node",
    args: [entry],
    cwd: root,
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter((e) => typeof e[1] === "string")
      ),
      MCP_TRANSPORT: "stdio",
      STELLAR_NETWORK: "testnet"
    }
  });

  const client = new Client({
    name: "stellarmcp-tools-doc",
    version: "0.0.0"
  });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    return tools;
  } finally {
    await client.close();
    await transport.close();
  }
}

function buildMarkdown(tools) {
  const sorted = [...tools].sort((a, b) => {
    const ca = toolCategory(a.name);
    const cb = toolCategory(b.name);
    const da = categorySortKey(ca) - categorySortKey(cb);
    if (da !== 0) return da;
    return a.name.localeCompare(b.name);
  });

  const byCat = new Map();
  for (const t of sorted) {
    const c = toolCategory(t.name);
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(t);
  }

  let md = `# StellarMCP — tools reference

This file is **auto-generated**. Do not edit by hand.

- **Source of truth:** the running server’s \`tools/list\` (same JSON Schema your MCP client sees).
- **Regenerate:** \`npm run docs:tools\` (runs \`npm run build\` then updates this file).
- **Drift check:** \`npm run test\` includes a gate that fails if this file is stale.

---

## How agents should use this

1. Configure the StellarMCP server in your MCP host ([README](../README.md#connect-your-mcp-client)).
2. Call \`tools/call\` with \`name\` set to one of the tool names below and \`arguments\` matching the **Parameters** table (JSON types).
3. Read-only tools work **without** \`STELLAR_SECRET_KEY\`. Writes depend on [auto-sign policy](../README.md#security).

---

`;

  for (const cat of CATEGORY_ORDER) {
    const list = byCat.get(cat);
    if (!list?.length) continue;

    md += `## ${cat}\n\n`;

    for (const tool of list) {
      const desc =
        typeof tool.description === "string" && tool.description.trim()
          ? tool.description.trim()
          : "_No description._";

      md += `### \`${tool.name}\`\n\n`;
      md += `${desc}\n\n`;
      md += "**Parameters** (JSON Schema → table)\n\n";
      md += formatInputSchema(
        tool.inputSchema && typeof tool.inputSchema === "object"
          ? /** @type {Record<string, unknown>} */ (tool.inputSchema)
          : {}
      );
      md += "\n";
    }
  }

  return md.trimEnd() + "\n";
}

async function main() {
  const check = process.argv.includes("--check");

  const probe = join(root, "build", "src", "index.js");
  try {
    readFileSync(probe);
  } catch {
    console.error("render-tools-md: run `npm run build` first (missing build/src/index.js).");
    process.exit(1);
  }

  const tools = await collectToolsList();
  const md = buildMarkdown(tools);

  if (check) {
    let existing;
    try {
      existing = readFileSync(outPath, "utf8");
    } catch {
      console.error(`render-tools-md --check: missing ${outPath}; run npm run docs:tools`);
      process.exit(1);
    }
    if (existing !== md) {
      console.error(
        "docs/TOOLS.md is out of date. Run: npm run docs:tools\n(Diff omitted; file differs from regenerated content.)"
      );
      process.exit(1);
    }
    console.error("docs/TOOLS.md OK (matches tools/list).");
    return;
  }

  writeFileSync(outPath, md, "utf8");
  console.error(`Wrote ${outPath} (${tools.length} tools).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
