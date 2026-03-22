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

## Testing & Verification

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
