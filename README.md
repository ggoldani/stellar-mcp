# StellarMCP

Execution-grade MCP server for the Stellar network, focused on agent-first Developer Experience (DX) and integrations with Anchors (SEPs) and Smart Contracts (Soroban).

## Features

- Tier-1 foundation tools:
  - `stellar_get_account`
  - `stellar_submit_payment`
  - `stellar_create_trustline`
  - `stellar_get_fee_stats`
- XDR utilities (JSON schema engine via `@stellar/stellar-xdr-json`):
  - `stellar_xdr_types` — list supported XDR type names (optional `prefix` filter)
  - `stellar_xdr_json_schema` — Draft-7 JSON Schema for a type
  - `stellar_xdr_guess` — candidate types for a base64 XDR blob
  - `stellar_xdr_encode` — JSON (string or object) → base64 XDR
  - `stellar_decode_xdr` — classic transaction XDR → Horizon-style operation JSON (unchanged contract)
- Historical meta (read-only, bounded, Horizon-first with Soroban RPC fallback, optional disk cache):
  - `stellar_get_ledger_meta` — ledger header XDR (+ RPC `LedgerCloseMeta` when Horizon misses and the ledger is in RPC retention)
  - `stellar_get_transaction_meta` — transaction envelope/result/result-meta/fee-meta XDR with truncation metadata; optional `operation_index` slices decoded `TransactionMeta` when not truncated
- Anchor and Smart Contract integrations:
  - `stellar_sep10_auth`
  - `stellar_get_sep38_quote`
  - Full Soroban support (simulate, invoke, read)
- Strict typing with TypeScript, robust input validation via Zod, actionable error mapping, and sanitized `_debug` outputs.
- Multiple transport modes support:
  - `stdio` (Ideal for Claude Desktop)
  - Streamable HTTP/SSE via `/mcp` (Ideal for integrations like Cursor/Windsurf).

## Installation

```bash
npm install
npm run build
```

## Soroban MCP generator (Phase C)

Production scope is **CLI-first**: you generate a **standalone** Node MCP package (stdio) from a deployed contract’s WASM custom section or from a checked-in spec JSON. The template copies StellarMCP’s `normalizeStellarError` + `redact`/`sanitizeDebug` behavior into the output so generated servers stay aligned with the main server’s security baseline.

### Inputs

1. **Contract WASM** (`.wasm`) — `Spec.fromWasm` reads the `contractspecv0` section (same as `@stellar/stellar-sdk/contract` `Spec`).
2. **Spec JSON** — canonical manifest:

```json
{
  "format": "stellarmcp-contract-spec-v1",
  "version": 1,
  "entries": ["<base64 ScSpecEntry>", "..."]
}
```

Each `entries[]` element is one base64-encoded `ScSpecEntry` XDR value (as produced by the SDK from an on-disk WASM or your own tooling).

### Outputs (generated layout)

Under `--out <dir>`:

- `package.json`, `tsconfig.json` — pinned to the same `@modelcontextprotocol/sdk`, `@stellar/stellar-sdk`, and `zod` versions as the generator release.
- `src/index.ts` — stdio MCP entrypoint.
- `src/config.ts` — Zod-validated env (`STELLAR_CONTRACT_ID`, `STELLAR_NETWORK`, RPC/Horizon URLs, signing policy mirrors main server semantics).
- `src/registerContractTools.ts` — one MCP tool per contract function: `{alias}_{method}`.
- `src/generated/schemas.ts` — per-method Zod input shapes (plus `contractId` override and `sourceAccount`).
- `src/generated/specEntries.ts` — embedded spec entries.
- `src/generated/meta.ts` — `GENERATOR_ARTIFACT_VERSION`, `STELLARMCP_GENERATOR_SEMVER`, `SPEC_FINGERPRINT`, compatibility note.
- `src/generated/typedClient.ts` — typed argument helpers for non-MCP TypeScript callers.
- `src/lib/*` — `contractInvoke.ts`, `stellarClient.ts`, `policy.ts`, and **copies** of `errors.ts` / `redact.ts` from this repo at generation time.

### CLI

After `npm run build` in this repository:

```bash
node build/src/generator/cli.js --input path/to/contract.wasm --out ./my-contract-mcp --name my-contract-mcp --alias mytoken
# or
node build/src/generator/cli.js --input path/to/spec.json --out ./my-contract-mcp --name my-contract-mcp --alias mytoken
```

Published installs expose the same entry as `stellarmcp-generate`.

Then inside the output directory: `npm install && npm run build && STELLAR_CONTRACT_ID=C... STELLAR_NETWORK=testnet node build/src/index.js`.

### Explicit non-goals (current cycle)

- No generated HTTP/SSE transport (stdio only); add your own transport only if you accept the security review burden.
- No multi-contract orchestration, workspace monorepos, or automatic publish to npm.
- **Unknown or exotic spec shapes:** parameters that the generator does not model precisely are emitted as `z.unknown()`, `z.record(z.string(), z.unknown())`, or similar **loose** Zod at the edges. That passes MCP/schema plumbing but does **not** replace Soroban correctness: agents and operators must still supply arguments that `Spec.funcArgsToScVals` and RPC simulation accept (fix shapes when simulation fails).
- Deep tuples, some UDTs, and other rare arms follow the same pattern: static types are best-effort; **simulation-time** validation remains authoritative.
- Phase D CLI bridge remains **out of scope** (see master plan).

### Versioning and compatibility

- **`GENERATOR_ARTIFACT_VERSION`** bumps when the generator changes output shape or conventions.
- **`SPEC_FINGERPRINT`** hashes sorted spec entries; use it to detect unchanged contracts across regenerations.
- Regenerate after upgrading the parent `stellarmcp` package or changing the contract interface.

## Configuration

Start from the provided example:

```bash
cp .env.example .env
```

Required baseline configuration:

```bash
STELLAR_NETWORK=testnet # mainnet or testnet
```

Optional endpoints and signer credentials:

```bash
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_SECRET_KEY=S...
STELLAR_SEP38_URL=https://anchor.example.com/price
STELLAR_AUTO_SIGN_POLICY=safe
STELLAR_AUTO_SIGN_LIMIT=0
STELLAR_USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
```

Security-focused controls:

```bash
STELLAR_ALLOWED_HOSTS=custom.provider.example
STELLAR_TRUSTED_ANCHOR_DOMAINS=anchor.example.com
MCP_HTTP_RATE_LIMIT_PER_MIN=60
MCP_HTTP_MAX_CONCURRENT=20
MCP_HTTP_MAX_PAYLOAD_BYTES=262144
MCP_HTTP_TRUST_PROXY=false
```

Historical meta cache (optional; defaults on, under the system temp directory):

```bash
# STELLAR_META_CACHE_ENABLED=true
# STELLAR_META_CACHE_TTL_MS=300000
# STELLAR_META_CACHE_DIR=/path/to/writable/dir
# STELLAR_META_MAX_XDR_CHARS=8192
```

Operational notes for `STELLAR_META_*`: these variables only control cache directories, TTL, and per-field XDR size limits — they are not secret-bearing. Ensure `STELLAR_META_CACHE_DIR` (or the default temp path) is writable: read-only filesystems, strict container sandboxes, or full disks cause cache writes to fail silently (`freshness.cacheWriteOk` may be `false`); the tools still return upstream data. In Kubernetes or ephemeral containers, point `STELLAR_META_CACHE_DIR` at an emptyDir volume if you want caching across process lifetime.

If `MCP_HTTP_TRUST_PROXY=true`, ensure the server runs behind a trusted proxy that overwrites the `X-Forwarded-For` header; otherwise, client IP spoofing can severely weaken rate-limiting controls.

## Deployment Security Modes

Recommended default: Local-First.

- Local-First (recommended): run over `stdio` or local `http-sse` on your machine. Keep your `STELLAR_SECRET_KEY` strictly within your local environment.
- Cloud Read-Only: deploy without a `STELLAR_SECRET_KEY`. Write tools will return unsigned XDR payloads for external signing.
- Cloud Auto-Sign Hardened: recommended only for mature operations teams with strict secret management, tight network controls, active monitoring, and incident response plans.

## Auto-Sign Policy

Write tools (e.g., `stellar_submit_payment`, `stellar_create_trustline`) enforce the following policies:

- `STELLAR_AUTO_SIGN_POLICY=safe` (recommended default):
  - Forces unsigned mode (`autoSign=false`, `limit=0`).
  - All write tools return unsigned XDR payloads only.
- `STELLAR_AUTO_SIGN_POLICY=guarded`:
  - Forces auto-sign enabled, requiring a strictly positive cap (`STELLAR_AUTO_SIGN_LIMIT>0`).
  - Signs a transaction only when a reliable USDC valuation is available and the value falls within the established limit.
  - Fails closed (blocks signing) when an accurate valuation is unavailable.
- `STELLAR_AUTO_SIGN_POLICY=expert`:
  - Forces unlimited auto-sign (`autoSign=true`, `limit=0`).
  - Automatically signs and submits all write transactions.

Backward compatibility:

- If `STELLAR_AUTO_SIGN_POLICY` is unset, legacy environment variables are respected:
  - `STELLAR_AUTO_SIGN`
  - `STELLAR_AUTO_SIGN_LIMIT`

## Execution

`stdio` mode:

```bash
npm run start:stdio
```

HTTP/SSE mode:

```bash
MCP_TRANSPORT=http-sse PORT=3000 npm run start:http
```

## Client Integration Examples

Claude Desktop (`stdio`):

```json
{
  "mcpServers": {
    "stellarmcp": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/stellarmcp/build/src/index.js"],
      "env": {
        "STELLAR_NETWORK": "testnet",
        "STELLAR_SECRET_KEY": "S..."
      }
    }
  }
}
```

Cursor / Windsurf (`http-sse` via `/mcp`):

```json
{
  "mcpServers": {
    "stellarmcp": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## XDR tools (examples)

List types (optional prefix filter):

```json
{ "name": "stellar_xdr_types", "arguments": { "prefix": "Transaction" } }
```

Schema then encode (use the `schema` field from the response to shape `json`):

```json
{ "name": "stellar_xdr_json_schema", "arguments": { "type": "TransactionEnvelope" } }
```

```json
{ "name": "stellar_xdr_encode", "arguments": { "type": "TransactionEnvelope", "json": "<JSON string from decode or your builder>" } }
```

Guess type from raw XDR:

```json
{ "name": "stellar_xdr_guess", "arguments": { "xdr": "<base64>" } }
```

Classic transaction decode (SDK `Transaction` view; network passphrase from config):

```json
{ "name": "stellar_decode_xdr", "arguments": { "xdr": "<base64 transaction XDR>" } }
```

## Historical meta tools (examples)

Ledger header (closed ledger sequence):

```json
{ "name": "stellar_get_ledger_meta", "arguments": { "ledgerSequence": 123456 } }
```

Transaction meta with optional per-operation slice (when `resultMetaXdr` is not truncated):

```json
{
  "name": "stellar_get_transaction_meta",
  "arguments": {
    "transactionHash": "<64-char hex>",
    "operationIndex": 0,
    "maxXdrCharsPerField": 8192
  }
}
```

## Testing & Verification

Phase C gate (typecheck, full tests, Tier-1 smoke, autonomy mock, **`npm pack` sanity**, **generator full E2E**):

```bash
npm run verify:phase:c
```

`verify:phase:c` runs, in order: `verify:base` (includes `tests/generator.test.ts`, copy-drift checks, exotic fixture assertions), `smoke:phase1`, `smoke:autonomy:mock`, `pack:sanity` (dry-run tarball must include `templates/generated-mcp/**`, `src/lib/errors.ts`, `src/lib/redact.ts`, `build/src/generator/cli.js`), and `generator:e2e` with **`GENERATOR_E2E_FULL=1`**: regenerates `build/generator-phasec-fixture-out` and `build/generator-phasec-exotic-out`, runs `npm ci` when a lockfile exists else `npm install`, then `npm run typecheck` in each (timeouts default 180s / 120s; override with `GENERATOR_E2E_INSTALL_TIMEOUT_MS` / `GENERATOR_E2E_TYPECHECK_TIMEOUT_MS`).

Faster local generator smoke (file presence only, **no** nested `npm install` / typecheck):

```bash
npm run generator:e2e
```

On **CI**, `CI=true` also forces the full generator path even if you only run `generator:e2e`. To force full locally: `GENERATOR_E2E_FULL=1 npm run generator:e2e`. Explicit quick mode: `GENERATOR_E2E_QUICK=1 npm run generator:e2e` (refuses to combine with `CI` or `GENERATOR_E2E_FULL`).

Published npm tarballs list only `build/src` (not all of `build/`) so transient E2E directories under `build/` are never packed.

Local foundation smoke test:

```bash
npm run smoke:phase1
```

Autonomy policy smoke test without real keys or network writes:

```bash
npm run smoke:autonomy:mock
```

Live Tier-1 smoke test on testnet with ephemeral, Friendbot-funded accounts (uses no personal environment secrets):

```bash
npm run smoke:tier1:friendbot
```

Live Tier-1 smoke test on testnet (performs actual transactions):

```bash
export STELLAR_SECRET_KEY=S...
export STELLAR_SMOKE_DESTINATION_PUBLIC_KEY=G...
export STELLAR_SMOKE_ASSET_CODE=USDC
export STELLAR_SMOKE_ASSET_ISSUER=G...
npm run smoke:tier1:testnet
```

## Development Commands

```bash
npm run test
npm run typecheck
npm run build
```

## Inspired by stellarskills

Knowledge layer powered by [stellarskills](https://github.com/ggoldani/stellarskills), execution layer powered by StellarMCP.
