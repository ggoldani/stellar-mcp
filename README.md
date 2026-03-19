# StellarMCP

Execution-grade MCP server for Stellar with agent-first DX and anchor-focused workflows.

## Features

- Tier-1 launch tools:
  - `stellar_get_account`
  - `stellar_submit_payment`
  - `stellar_create_trustline`
  - `stellar_get_fee_stats`
- Launch differentiators:
  - `stellar_sep10_auth`
  - `stellar_get_sep38_quote`
- Strict TypeScript, Zod input validation, actionable error mapping, sanitized `_debug`.
- Transport support:
  - `stdio` (Claude Desktop)
  - Streamable HTTP/SSE (`/mcp`) for Cursor/Windsurf integrations.

## Installation

```bash
npm install
npm run build
```

## Configuration

Required baseline:

```bash
STELLAR_NETWORK=testnet
```

Optional endpoints and signer:

```bash
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_SECRET_KEY=S...
STELLAR_SEP38_URL=https://anchor.example.com/price
STELLAR_AUTO_SIGN=false
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

## Deployment Security Modes

Recommended default: Local-First.

- Local-First (recommended): run over `stdio` or local `http-sse` on your machine, keep `STELLAR_SECRET_KEY` only in your local environment.
- Cloud Read-Only: deploy with no `STELLAR_SECRET_KEY`; write tools return unsigned XDR for external signing.
- Cloud Auto-Sign Hardened: only for mature ops teams with strict secret management, network controls, monitoring, and incident response.

## Auto-Sign Policy

Write tools (`stellar_submit_payment`, `stellar_create_trustline`) enforce:

- `STELLAR_AUTO_SIGN=false` (default): never auto-sign; return unsigned XDR.
- `STELLAR_AUTO_SIGN=true` and `STELLAR_AUTO_SIGN_LIMIT=0`: sign+submit automatically.
- `STELLAR_AUTO_SIGN=true` and `STELLAR_AUTO_SIGN_LIMIT>0`: sign only when a reliable USDC valuation is available and within the limit.
- Fail-closed: if reliable valuation is unavailable, the server returns unsigned XDR with an explicit confirmation message.

## Run

stdio mode:

```bash
npm run start:stdio
```

HTTP/SSE mode:

```bash
MCP_TRANSPORT=http-sse PORT=3000 npm run start:http
```

## Client Examples

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

Cursor/Windsurf (`http-sse` via `/mcp`):

```json
{
  "mcpServers": {
    "stellarmcp": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Verification

Local foundation smoke:

```bash
npm run smoke:phase1
```

Autonomy policy smoke without real keys/network writes:

```bash
npm run smoke:autonomy:mock
```

Live Tier-1 smoke on testnet (performs real tx):

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

## npm Publish

Recommended release flow:

```bash
npm version patch
npm publish --access public
```

## Inspired by stellarskills

Knowledge layer powered by [stellarskills](https://github.com/ggoldani/stellarskills), execution layer powered by StellarMCP.
