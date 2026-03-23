# StellarMCP

[MCP](https://modelcontextprotocol.io) server for **Stellar**: accounts, payments, XDR, Horizon/Soroban RPC, AMM liquidity, SEP anchors, and Soroban (simulate, invoke, events, deploy, contract state). Intended for **agents and IDE integrations** (Cursor, Claude Desktop, etc.) with strict validation, normalized errors, and redacted `_debug` fields.

**All tools (names, descriptions, parameters):** **[`docs/TOOLS.md`](docs/TOOLS.md)** — auto-generated from the same `tools/list` your MCP client sees; attach or paste it when asking an agent *how to use this server*.

**Requirements:** Node.js **≥ 20**. · **Source:** [github.com/ggoldani/stellar-mcp](https://github.com/ggoldani/stellar-mcp)

---

## Table of contents

- [Quick start](#quick-start)
- [Sanity check (first call)](#sanity-check-first-call)
- [Run the server](#run-the-server)
- [Connect your MCP client](#connect-your-mcp-client)
- [Environment variables](#environment-variables)
- [Security](#security)
- [Tools reference](#tools-reference)
- [Example tool calls](#example-tool-calls)
- [Tools reference (detailed — docs/TOOLS.md)](docs/TOOLS.md)
- [Soroban contract MCP generator](#soroban-contract-mcp-generator)
- [Troubleshooting](#troubleshooting)
- [Development & testing](#development--testing)

---

## Quick start

### From a clone (this repository)

```bash
git clone https://github.com/ggoldani/stellar-mcp.git
cd stellar-mcp
npm install
npm run build
```

Run the server (see [Run the server](#run-the-server)), then [connect your MCP client](#connect-your-mcp-client).

### From npm

**Package on npm:** [`@ggoldani/stellarmcp`](https://www.npmjs.com/package/@ggoldani/stellarmcp) (scoped package).

The published tarball includes **`build/src`**, **`templates/`**, **generator inputs** (`src/lib/errors.ts`, `redact.ts`), **`.env.example`**, and docs — enough to run the server and `stellarmcp-generate` without cloning.

```bash
npm install @ggoldani/stellarmcp
npx stellarmcp
# or: npx @ggoldani/stellarmcp
```

- Env template: **`node_modules/@ggoldani/stellarmcp/.env.example`** → copy to your project as `.env` if needed.
- MCP **stdio** when the package is a dependency (example): `"args": ["${workspaceFolder}/node_modules/@ggoldani/stellarmcp/build/src/index.js"]`.

Prefer GitHub if you are **developing or patching** this repository ([clone](#from-a-clone-this-repository)).

---

## Sanity check (first call)

Use this to confirm wiring before deeper integration:

1. **HTTP mode:** with `MCP_TRANSPORT=http-sse` running, open `GET /health` (expect JSON with `network`, `horizonReachable`, `rpcReachable`).
2. **Any MCP host:** call tool **`stellar_get_fee_stats`** with **`{}`**. Expect fields like `baseFee`, `p99`, `recommendedFee` (see [Example tool calls](#example-tool-calls)).

If that works, Horizon is reachable and the server is usable for read-only tools without a secret key.

For **every tool name and argument shape**, use **[`docs/TOOLS.md`](docs/TOOLS.md)** (or your host’s MCP tool picker).

---

## Run the server


| Mode                | Command                                               | Notes                                                                                                               |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **stdio** (default) | `npm run start:stdio` or `node build/src/index.js`    | Best for Claude Desktop, Cursor stdio, local agents.                                                                |
| **Streamable HTTP** | `MCP_TRANSPORT=http-sse PORT=3000 npm run start:http` | MCP endpoint: `http://<host>:<PORT>/mcp`. Health: `GET /health` (JSON: network, Horizon/RPC reachability, version). |


After `npm run build`, the entrypoint is **`build/src/index.js`**.

---

## Connect your MCP client

### stdio (recommended locally)

Point your host at Node and the built entrypoint. Example shape (paths must be **absolute** or use your editor’s variable such as `${workspaceFolder}`):

```json
{
  "mcpServers": {
    "stellarmcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/stellarmcp/build/src/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "STELLAR_NETWORK": "testnet"
      }
    }
  }
}
```

- **Cursor:** project config `~/.cursor/mcp.json` or `.cursor/mcp.json` — see [Cursor MCP docs](https://cursor.com/docs/context/mcp) (interpolation: `${workspaceFolder}`, `${env:VAR}`).
- **Claude Desktop:** `claude_desktop_config.json` under the same `mcpServers` pattern.
- Optional: set `"envFile": "${workspaceFolder}/.env"` (stdio only in Cursor) to load secrets from a local `.env` **without** committing it.

**Never commit** real `STELLAR_SECRET_KEY` or anchor tokens.

### HTTP / SSE

1. Start the server with `MCP_TRANSPORT=http-sse` and choose `PORT`.
2. In the client, register the remote server, for example:

```json
{
  "mcpServers": {
    "stellarmcp": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

3. Verify **`GET http://localhost:3000/health`** before debugging MCP calls.

---

## Environment variables

**Authoritative template:** copy `[.env.example](./.env.example)` to `.env` and edit.


| Variable                         | Required | Purpose                                                                                          |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `MCP_TRANSPORT`                  | No       | `stdio` (default) or `http-sse`.                                                                 |
| `STELLAR_NETWORK`                | No       | `testnet` (default) or `mainnet`.                                                                |
| `STELLAR_HORIZON_URL`            | No       | Horizon base URL (**https**; host must be default-allowed or listed in `STELLAR_ALLOWED_HOSTS`). |
| `STELLAR_RPC_URL`                | No       | Soroban RPC URL (same rules as Horizon).                                                         |
| `STELLAR_SEP38_URL`              | No       | Anchor SEP-38 endpoint for quotes.                                                               |
| `STELLAR_ALLOWED_HOSTS`          | No       | Comma-separated extra hostnames allowed for the three URL vars above.                            |
| `STELLAR_TRUSTED_ANCHOR_DOMAINS` | No       | Comma-separated domains allowed for anchor/TOML and SEP flows.                                   |
| `STELLAR_SECRET_KEY`             | No       | Signing key; omit for read-only / unsigned-XDR-only operation.                                   |
| `STELLAR_AUTO_SIGN_POLICY`       | No       | `safe`, `guarded`, or `expert` — see [Security](#security).                  |
| `STELLAR_AUTO_SIGN`              | No       | Legacy if policy unset.                                                                          |
| `STELLAR_AUTO_SIGN_LIMIT`        | No       | Legacy / used with `guarded` (must be > 0).                                                      |
| `STELLAR_USDC_ISSUER`            | No       | USDC issuer for valuation in guarded signing (default is network USDC).                          |
| `PORT`                           | No       | HTTP server port (default `3000`).                                                               |
| `STELLAR_REQUEST_TIMEOUT_MS`     | No       | Upstream request timeout (max 30000).                                                            |
| `MCP_HTTP_*`                     | No       | Rate limit, concurrency, max POST body, `TRUST_PROXY` — see `.env.example`.                      |
| `STELLAR_META_*`                 | No       | Disk cache + XDR size limits for meta tools — see `.env.example`.                                |


Custom Horizon/RPC/SEP-38 URLs must use **https** and **non-private** hosts; unknown hosts require `STELLAR_ALLOWED_HOSTS`.

---

## Security

1. **Secrets:** Treat `STELLAR_SECRET_KEY` like production key material. Prefer env or `envFile`; never commit secrets; restrict file permissions on `.env`.
2. **Auto-sign policy** (write tools: payments, trustlines, liquidity, `set_options`, fee bump, Soroban invoke/deploy, relevant SEP flows):
   - **`safe`** (recommended): unsigned mode — write tools return **unsigned XDR** for external signing when applicable.
   - **`guarded`**: auto-sign enabled only with **`STELLAR_AUTO_SIGN_LIMIT` > 0** and USDC-based valuation rules; fails closed when value cannot be bounded.
   - **`expert`**: unlimited auto-sign — use only with full awareness of risk.
3. **Network exposure:** If you expose HTTP/SSE, use TLS in front, sane firewall rules, and review `MCP_HTTP_*`. **`MCP_HTTP_TRUST_PROXY=true`** only behind a **trusted** proxy that sets `X-Forwarded-For` correctly.
4. **Allowlists:** Use `STELLAR_ALLOWED_HOSTS` and `STELLAR_TRUSTED_ANCHOR_DOMAINS` when pointing at non-default infrastructure or anchors.
5. **Read-only deployments:** Omit `STELLAR_SECRET_KEY`; read and simulate tools still work; writes yield unsigned payloads or explicit errors.

---

## Tools reference

**Full detail for agents (every tool, descriptions, parameter tables from live `tools/list`):** **[`docs/TOOLS.md`](docs/TOOLS.md)** — auto-generated; refresh with `npm run docs:tools` after you change tools.

Summary below: **Read** = no transaction submission by this server; **Write** = may build/submit transactions, call Friendbot, or initiate anchor flows.

### Accounts & history


| Tool                          | Type  | Description                                                                       |
| ----------------------------- | ----- | --------------------------------------------------------------------------------- |
| `stellar_get_account`         | Read  | Balances, signers, flags, subentries, minimum balance.                            |
| `stellar_get_account_history` | Read  | Paginated transaction history (`limit`, optional `cursor`).                       |
| `stellar_fund_account`        | Write | **Testnet only** — funds via Friendbot HTTP (10k test XLM).                       |
| `stellar_set_options`         | Write | Account options (signers, weights, flags); unsigned unless policy allows signing. |


### Payments & fees


| Tool                                  | Type  | Description                                          |
| ------------------------------------- | ----- | ---------------------------------------------------- |
| `stellar_submit_payment`              | Write | Payment; hash or unsigned XDR per policy.            |
| `stellar_submit_fee_bump_transaction` | Write | Fee-bump an existing transaction (sponsor pays fee). |


### Assets & AMM


| Tool                         | Type  | Description                            |
| ---------------------------- | ----- | -------------------------------------- |
| `stellar_create_trustline`   | Write | Create trustline for non-native asset. |
| `stellar_deposit_liquidity`  | Write | Deposit into classic AMM pool.         |
| `stellar_withdraw_liquidity` | Write | Withdraw from classic AMM pool.        |


### Network


| Tool                    | Type | Description                            |
| ----------------------- | ---- | -------------------------------------- |
| `stellar_get_fee_stats` | Read | Fee stats + recommended fee (stroops). |


### XDR


| Tool                      | Type | Description                                                          |
| ------------------------- | ---- | -------------------------------------------------------------------- |
| `stellar_xdr_types`       | Read | List XDR type names (optional `prefix`).                             |
| `stellar_xdr_json_schema` | Read | Draft-7 JSON Schema for a type.                                      |
| `stellar_xdr_guess`       | Read | Candidate types for a base64 XDR blob.                               |
| `stellar_xdr_encode`      | Read | JSON → base64 XDR for a named type.                                  |
| `stellar_decode_xdr`      | Read | Classic transaction XDR → JSON (uses configured network passphrase). |


### Historical meta (Horizon-first, Soroban RPC fallback, bounded XDR)


| Tool                           | Type | Description                                                         |
| ------------------------------ | ---- | ------------------------------------------------------------------- |
| `stellar_get_ledger_meta`      | Read | Closed ledger header/metadata XDR (+ optional cache metadata).      |
| `stellar_get_transaction_meta` | Read | Tx envelope/result/result-meta/fee-meta; optional `operationIndex`. |


### SEP / anchors


| Tool                        | Type  | Description                                                         |
| --------------------------- | ----- | ------------------------------------------------------------------- |
| `stellar_get_anchor_toml`   | Read  | Fetch/parse `stellar.toml` for SEP discovery.                       |
| `stellar_sep10_auth`        | Write | SEP-10 challenge → JWT (requires signer / secret where applicable). |
| `stellar_sep6_transfer`     | Write | SEP-6 deposit/withdraw initiation.                                  |
| `stellar_sep12_customer`    | Mixed | GET/PUT KYC against anchor SEP-12 server.                           |
| `stellar_sep24_interactive` | Write | SEP-24 interactive URL for deposit/withdraw.                        |
| `stellar_sep31_remittance`  | Write | SEP-31 remittance initiation.                                       |
| `stellar_get_sep38_quote`   | Read  | SEP-38 indicative quote / rate metadata.                            |


### Soroban


| Tool                         | Type  | Description                                                        |
| ---------------------------- | ----- | ------------------------------------------------------------------ |
| `stellar_soroban_simulate`   | Read  | Simulate contract call (footprint, fees, events); does not submit. |
| `stellar_soroban_invoke`     | Write | Simulate, assemble, sign/submit per policy.                        |
| `stellar_soroban_get_events` | Read  | Contract events from RPC (`startLedger`, filters, `limit`).        |
| `stellar_soroban_deploy`     | Write | Deploy WASM from disk path; submit per policy.                     |
| `stellar_soroban_read_state` | Read  | Direct `getLedgerEntries` for a contract data key.                 |


---

## Example tool calls

JSON shapes are illustrative; your MCP host sends `tools/call` with `name` + `arguments`.

### Fee stats (testnet)

```json
{ "name": "stellar_get_fee_stats", "arguments": {} }
```

### XDR: list types → schema → encode

```json
{ "name": "stellar_xdr_types", "arguments": { "prefix": "Transaction" } }
```

```json
{ "name": "stellar_xdr_json_schema", "arguments": { "type": "TransactionEnvelope" } }
```

```json
{ "name": "stellar_xdr_encode", "arguments": { "type": "TransactionEnvelope", "json": "<JSON string>" } }
```

```json
{ "name": "stellar_xdr_guess", "arguments": { "xdr": "<base64>" } }
```

```json
{ "name": "stellar_decode_xdr", "arguments": { "xdr": "<base64 classic transaction XDR>" } }
```

### Historical meta

```json
{ "name": "stellar_get_ledger_meta", "arguments": { "ledgerSequence": 123456, "maxXdrCharsPerField": 8192 } }
```

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

For full argument schemas, use your client’s **tool list** / schema UI or inspect Zod definitions under `src/tools/`.

---

## Soroban contract MCP generator

Generate a **standalone** Node MCP package (stdio) from a deployed contract’s **WASM** (`contractspecv0`) or from a **spec JSON** manifest.

### Inputs

1. **WASM** — `Spec.fromWasm` reads the custom section (same idea as `@stellar/stellar-sdk` contract specs).
2. **Spec JSON** — format `stellarmcp-contract-spec-v1` with `entries[]` of base64 `ScSpecEntry` XDR values.

### CLI (from this repo after `npm run build`)

```bash
node build/src/generator/cli.js --input path/to/contract.wasm --out ./my-contract-mcp --name my-contract-mcp --alias mytoken
# or
node build/src/generator/cli.js --input path/to/spec.json --out ./my-contract-mcp --name my-contract-mcp --alias mytoken
```

Published installs: **`stellarmcp-generate`** (same flags).

Then in the output directory:

```bash
npm install && npm run build
STELLAR_CONTRACT_ID=C... STELLAR_NETWORK=testnet node build/src/index.js
```

### Non-goals (current generator)

- No generated HTTP/SSE transport in the scaffold (stdio only).
- Exotic spec shapes may emit loose Zod at the edges; **simulation on RPC remains authoritative**.
- Multi-contract workspaces / auto-publish are out of scope for the generator CLI.

Versioning artifacts in generated code: `GENERATOR_ARTIFACT_VERSION`, `SPEC_FINGERPRINT`, etc. — regenerate when upgrading `stellarmcp` or changing the contract interface.

---

## Troubleshooting


| Issue                      | What to check                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Client cannot start server | `node -v` ≥ 20; `npm run build`; path to `build/src/index.js` is correct.                               |
| Tools error on Horizon/RPC | `STELLAR_NETWORK` matches intended network; URLs https; hosts allowlisted if custom.                    |
| Signing / “unsigned only”  | `STELLAR_AUTO_SIGN_POLICY=safe` returns unsigned XDR; add key + policy only if you intend auto-sign.    |
| HTTP mode                  | `GET /health`; MCP at `POST`/`GET` **`/mcp`** per Streamable HTTP transport; see MCP Logs in Cursor.   |
| Meta cache                 | Writable `STELLAR_META_CACHE_DIR` or temp dir; `freshness.cacheWriteOk` may be `false` on read-only FS. |


---

## Development & testing

```bash
npm run typecheck
npm run test             # build + unit tests + docs/TOOLS.md drift check
npm run docs:tools       # regenerate docs/TOOLS.md after changing MCP tools
npm run verify:phase:c   # full maintainer gate (see package.json)
```

**Useful smokes:**

- `npm run smoke:phase1` — config + stdio + HTTP wiring.
- `npm run smoke:testnet:readonly` — real testnet reads + Soroban via MCP stdio (no secret key).
- `npm run smoke:tier1:friendbot` — Friendbot-funded flows on testnet.

---

## Inspired by stellarskills

Knowledge layer: [stellarskills](https://github.com/ggoldani/stellarskills). Execution layer: StellarMCP.

License: **MIT** (see repository).