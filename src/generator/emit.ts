import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Spec } from "@stellar/stellar-sdk/contract";

import { GENERATOR_ARTIFACT_VERSION } from "./version.js";
import { scSpecTypeToZodAndTs } from "./specTypes.js";
import { kebabPackage, slugSegment, tsIdentifierForMethod } from "./naming.js";
import type { LoadedSpec } from "./loadSpec.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function findStellarMcpPackageRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 12; i++) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
        const n = pkg.name ?? "";
        // Unscoped (dev clone) or scoped publish e.g. @ggoldani/stellarmcp
        const isStellarMcpRoot =
          n === "stellarmcp" || /^@[^/]+\/stellarmcp$/.test(n);
        if (isStellarMcpRoot) {
          return dir;
        }
      } catch {
        /* keep walking */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(
    "Could not locate @scope/stellarmcp (or stellarmcp) package.json (walked up from generator). Install from npm or run from this repository."
  );
}

export type GenerateProjectOptions = {
  /** Output directory (created; parent must exist). */
  outDir: string;
  /** npm package name (kebab-case applied). */
  packageName: string;
  /** Prefix for MCP tool names, e.g. "mytoken" -> mytoken_increment */
  toolAlias: string;
  loaded: LoadedSpec;
};

function templateRoot(root: string): string {
  return join(root, "templates/generated-mcp");
}

function readParentPackageJson(root: string): {
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  engines?: { node?: string };
} {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
}

function readErrorsTs(root: string): string {
  const path = join(root, "src/lib/errors.ts");
  if (!existsSync(path)) {
    throw new Error(
      "Missing src/lib/errors.ts — required for stellarmcp-generate (ship this path in the published package)."
    );
  }
  return readFileSync(path, "utf8");
}

function readRedactTs(root: string): string {
  const path = join(root, "src/lib/redact.ts");
  if (!existsSync(path)) {
    throw new Error(
      "Missing src/lib/redact.ts — required for stellarmcp-generate (ship this path in the published package)."
    );
  }
  return readFileSync(path, "utf8");
}

function specFingerprint(entries: string[]): string {
  return createHash("sha256").update(entries.slice().sort().join("|")).digest("hex").slice(0, 16);
}

function escapeTemplateString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function funcDocLine(spec: Spec, fnName: string): string {
  try {
    const f = spec.getFunc(fnName);
    const d = f.doc().toString().trim();
    if (d.length > 0) {
      return escapeTemplateString(d.slice(0, 400));
    }
  } catch {
    /* ignore */
  }
  return `Soroban contract method \`${escapeTemplateString(fnName)}\` (generated).`;
}

export function generateProject(options: GenerateProjectOptions): void {
  const { outDir, packageName, toolAlias, loaded } = options;
  const { spec, entriesBase64 } = loaded;
  const stellarRoot = findStellarMcpPackageRoot();
  const parentPkg = readParentPackageJson(stellarRoot);
  const fingerprint = specFingerprint(entriesBase64);

  mkdirSync(outDir, { recursive: true });
  cpSync(templateRoot(stellarRoot), outDir, { recursive: true });
  mkdirSync(join(outDir, "src/generated"), { recursive: true });

  const errorsSrc = readErrorsTs(stellarRoot);
  const redactSrc = readRedactTs(stellarRoot);
  writeFileSync(join(outDir, "src/lib/errors.ts"), errorsSrc, "utf8");
  writeFileSync(join(outDir, "src/lib/redact.ts"), redactSrc, "utf8");

  const kebabName = kebabPackage(packageName);
  const pkgJson = {
    name: kebabName,
    version: "0.0.0",
    private: true,
    type: "module",
    description: `Generated Soroban MCP server (${kebabName})`,
    main: "build/src/index.js",
    bin: { [kebabName]: "build/src/index.js" },
    scripts: {
      build: "tsc -p tsconfig.json",
      start: "node build/src/index.js",
      typecheck: "tsc --noEmit -p tsconfig.json"
    },
    engines: parentPkg.engines ?? { node: ">=20" },
    dependencies: {
      "@modelcontextprotocol/sdk": parentPkg.dependencies["@modelcontextprotocol/sdk"],
      "@stellar/stellar-sdk": parentPkg.dependencies["@stellar/stellar-sdk"],
      zod: parentPkg.dependencies["zod"]
    },
    devDependencies: {
      "@types/node": parentPkg.devDependencies["@types/node"],
      typescript: parentPkg.devDependencies["typescript"]
    }
  };
  writeFileSync(join(outDir, "package.json"), `${JSON.stringify(pkgJson, null, 2)}\n`, "utf8");

  const specEntriesTs = `/** Auto-generated — do not edit. Contract spec entries (base64 XDR). */
export const SPEC_ENTRIES = ${JSON.stringify(entriesBase64, null, 2)} as const;
`;
  writeFileSync(join(outDir, "src/generated/specEntries.ts"), specEntriesTs, "utf8");

  const metaTs = `/** Generator metadata and compatibility expectations. */
export const GENERATOR_ARTIFACT_VERSION = "${GENERATOR_ARTIFACT_VERSION}";
export const STELLARMCP_GENERATOR_SEMVER = "${parentPkg.version}";
export const SPEC_FINGERPRINT = "${fingerprint}";
/**
 * Compatibility: this layout (artifact v${GENERATOR_ARTIFACT_VERSION}) targets MCP SDK and Stellar SDK versions
 * pinned by the generating StellarMCP release (\`${parentPkg.version}\`). Re-run code generation after upgrading
 * the parent generator or changing the contract interface.
 */
export const COMPATIBILITY_NOTE =
  "Generated package must use the same major MCP protocol expectations as @modelcontextprotocol/sdk v1.x and @stellar/stellar-sdk v14.x family unless you regenerate with a newer stellarmcp-generate.";
`;
  writeFileSync(join(outDir, "src/generated/meta.ts"), metaTs, "utf8");

  const funcs = spec.funcs();
  const schemaBlocks: string[] = [];
  const clientTypes: string[] = [];
  const clientConstEntries: string[] = [];
  const registerBlocks: string[] = [];

  schemaBlocks.push(`import { z } from "zod";
import { StrKey } from "@stellar/stellar-sdk";

const contractIdOverride = z
  .string()
  .trim()
  .optional()
  .describe("Optional Soroban contract id (C...). Defaults to STELLAR_CONTRACT_ID.");

const sourceAccountField = z
  .string()
  .trim()
  .refine((value) => StrKey.isValidEd25519PublicKey(value), {
    message: "Invalid Stellar public key (expected G... source account)."
  })
  .describe("Source account public key (G...) used to build the transaction.");
`);

  for (const fn of funcs) {
    const fnName = fn.name().toString();
    const id = tsIdentifierForMethod(fnName);
    const toolName = `${slugSegment(toolAlias)}_${slugSegment(fnName)}`;
    const schemaExport = `${id}InputSchema`;

    const inputFields: string[] = ["contractId: contractIdOverride", "sourceAccount: sourceAccountField"];
    const argNames: string[] = [];
    const tsFields: string[] = [];

    for (const input of fn.inputs()) {
      const argNameRaw = input.name().toString();
      const argId = tsIdentifierForMethod(argNameRaw);
      const mapped = scSpecTypeToZodAndTs(input.type());
      if (mapped.ts === "void") {
        continue;
      }
      argNames.push(argId);
      inputFields.push(`${argId}: ${mapped.zod}.describe(${JSON.stringify(`Contract argument ${argNameRaw}`)})`);
      tsFields.push(`${argId}: ${mapped.ts}`);
    }

    schemaBlocks.push(`
export const ${schemaExport} = {
${inputFields.map((l) => `  ${l}`).join(",\n")}
};
`);

    const argsTypeName = `${id.charAt(0).toUpperCase() + id.slice(1)}Args`;

    if (tsFields.length === 0) {
      clientTypes.push(`export type ${argsTypeName} = Record<string, never>;`);
      clientConstEntries.push(`  ${JSON.stringify(fnName)}: (_args?: Record<string, never>) => ({})`);
    } else {
      const typeName = argsTypeName;
      clientTypes.push(`export type ${typeName} = { ${tsFields.join("; ")} };`);
      clientConstEntries.push(
        `  ${JSON.stringify(fnName)}: (args: ${typeName}) => ({ ${argNames.map((a) => `${a}: args.${a}`).join(", ")} })`
      );
    }

    const argsObj =
      argNames.length === 0
        ? "{}"
        : `{ ${argNames.map((a) => `${a}: input.${a}`).join(", ")} }`;

    const desc = funcDocLine(spec, fnName);

    registerBlocks.push(`  server.tool(
    ${JSON.stringify(toolName)},
    ${JSON.stringify(desc)},
    G.${schemaExport},
    async (input) => {
      const contractId = input.contractId ?? config.contractId;
      return invokeContractMethod(config, spec, {
        contractId,
        sourceAccount: input.sourceAccount,
        method: ${JSON.stringify(fnName)},
        args: ${argsObj}
      });
    }
  );`);
  }

  writeFileSync(
    join(outDir, "src/generated/schemas.ts"),
    `${schemaBlocks.join("\n")}\n`,
    "utf8"
  );

  const typedClientTs = `${clientTypes.join("\n")}

/** Narrow helper for building \`args\` passed to Spec.funcArgsToScVals in custom integrations. */
export const GeneratedContractCalls = {
${clientConstEntries.map((e) => `  ${e}`).join(",\n")}
} as const;
`;
  writeFileSync(join(outDir, "src/generated/typedClient.ts"), `${typedClientTs}\n`, "utf8");

  const registerTs = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Spec } from "@stellar/stellar-sdk/contract";

import type { AppConfig } from "./config.js";
import { invokeContractMethod } from "./lib/contractInvoke.js";
import { SPEC_ENTRIES } from "./generated/specEntries.js";
import * as G from "./generated/schemas.js";

const spec = new Spec([...SPEC_ENTRIES]);

export function registerContractTools(server: McpServer, config: AppConfig): void {
${registerBlocks.join("\n\n")}
}
`;
  writeFileSync(join(outDir, "src/registerContractTools.ts"), registerTs, "utf8");

  const configTs = `import { Networks, StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

const EnvSchema = z.object({
  STELLAR_NETWORK: z.enum(["mainnet", "testnet"]).default("testnet"),
  STELLAR_RPC_URL: z.string().url().optional(),
  STELLAR_HORIZON_URL: z.string().url().optional(),
  STELLAR_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(30_000),
  STELLAR_CONTRACT_ID: z
    .string()
    .trim()
    .min(1)
    .refine((value) => StrKey.isValidContract(value), {
      message: "Invalid Soroban contract id (expected C... contract strkey)."
    }),
  STELLAR_SECRET_KEY: z.string().optional(),
  STELLAR_AUTO_SIGN_POLICY: z.enum(["safe", "guarded", "expert"]).optional(),
  STELLAR_AUTO_SIGN: z.coerce.boolean().default(false),
  STELLAR_AUTO_SIGN_LIMIT: z.coerce.number().min(0).default(0)
});

export type AutoSignPolicy = "safe" | "guarded" | "expert";

export interface AppConfig {
  network: "mainnet" | "testnet";
  rpcUrl?: string;
  horizonUrl?: string;
  requestTimeoutMs: number;
  contractId: string;
  secretKey?: string;
  autoSignPolicy?: AutoSignPolicy;
  autoSign: boolean;
  autoSignLimit: number;
  networkPassphrase: string;
}

export function loadConfig(): AppConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(\`Invalid environment: \${parsed.error.message}\`);
  }
  const env = parsed.data;
  const passphrase =
    env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
  return {
    network: env.STELLAR_NETWORK,
    rpcUrl: env.STELLAR_RPC_URL,
    horizonUrl: env.STELLAR_HORIZON_URL,
    requestTimeoutMs: env.STELLAR_REQUEST_TIMEOUT_MS,
    contractId: env.STELLAR_CONTRACT_ID,
    secretKey: env.STELLAR_SECRET_KEY,
    autoSignPolicy: env.STELLAR_AUTO_SIGN_POLICY,
    autoSign: env.STELLAR_AUTO_SIGN,
    autoSignLimit: env.STELLAR_AUTO_SIGN_LIMIT,
    networkPassphrase: passphrase
  };
}
`;
  writeFileSync(join(outDir, "src/config.ts"), configTs, "utf8");

  const serverTs = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppConfig } from "./config.js";
import { registerContractTools } from "./registerContractTools.js";

export function createServer(config: AppConfig): McpServer {
  const server = new McpServer({
    name: ${JSON.stringify(kebabName)},
    version: "0.0.0"
  });
  registerContractTools(server, config);
  return server;
}
`;
  writeFileSync(join(outDir, "src/server.ts"), serverTs, "utf8");

  const indexTs = `#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { redactSensitiveText } from "./lib/redact.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(${JSON.stringify(`${kebabName} MCP (stdio) ready.`)});
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Fatal startup error:", redactSensitiveText(message));
  process.exit(1);
});
`;
  writeFileSync(join(outDir, "src/index.ts"), indexTs, "utf8");
}
