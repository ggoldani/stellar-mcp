# Stellar MCP Competitive Baseline (Phase 0)

Goal: decide what to adopt, adapt, or reject from existing Stellar MCP servers before implementation.

## Repositories Reviewed

- `syronlabs/stellar-mcp`
- `JoseCToscano/stellar-mcp`
- `grandmastr/chronos-mcp`
- `kalepail/stellar-mcp-server`
- `leighmcculloch/mcp-stellar-xdr`
- `kaankacar/stellar-analytics-mcp` (not auditable yet, repo unavailable)

## Decision Matrix

### syronlabs/stellar-mcp
- **Transport architecture:** Adapt
  - Keep separation between classic and soroban concerns.
  - Avoid direct tool switching logic in one file for maintainability.
- **Validation and errors:** Reject
  - Generic error messages are not sufficient for agent DX.
  - Missing explicit network vs protocol error taxonomy.
- **Security baseline:** Reject
  - Secret key passed directly in tool args as default pattern.
- **Packaging/distribution:** Adopt
  - `npx`-friendly distribution and simple client setup docs are useful.

### JoseCToscano/stellar-mcp
- **Security guidance docs:** Adapt
  - Reuse checklist concepts (rate limiting, CORS, headers, audit logging).
  - Re-implement with this project's stricter defaults.
- **Resources pattern:** Adapt
  - Resource exposure is useful, but do not expose sensitive local files.
- **External service dependencies:** Reject (for phase 1 baseline)
  - Launchtube/Mercury/passkey stack adds complexity to critical path.
- **SEP coverage:** Reject as baseline reference
  - Does not satisfy this project's SEP-first differentiator.

### grandmastr/chronos-mcp
- **Minimal stdio flow:** Adopt (as baseline reference only)
  - Good for simple startup shape and low dependency mindset.
- **Tool security and validation depth:** Reject
  - Not sufficient for strict robustness requirements.

### kalepail/stellar-mcp-server
- **Remote MCP SSE on Cloudflare:** Adapt
  - Useful for HTTP/SSE transport patterns and remote operation concepts.
  - Do not inherit authless defaults.
- **Dynamic contract-tool generation:** Adapt (future/TIER2+)
  - Interesting for soroban-heavy flows, not a phase 1 blocker.
- **Security posture as production baseline:** Reject
  - Demo/authless orientation is not acceptable for launch baseline.

### leighmcculloch/mcp-stellar-xdr
- **XDR diagnostics patterns:** Adopt
  - Use as design reference for `_debug` and transaction introspection.
- **Scope model:** Adapt
  - Keep small, precise tool surfaces where possible.
- **As full product baseline:** Reject
  - Utility server only; does not cover payments/SEPs execution scope.

### kaankacar/stellar-analytics-mcp
- **Status:** Pending
  - Public repository was not accessible for code audit at review time.
  - No adopt/adapt/reject decision until source is verifiable.

## Approved Patterns for StellarMCP Phase 1

- Strict input validation before any network call.
- Actionable English error messages with protocol-specific recovery guidance.
- Explicit separation of network failures vs stellar protocol failures.
- `stdio` plus `http/sse` transports with shared core server logic.
- Security hardening as default (redaction, endpoint allowlist, safe `_debug`).
- Minimal dependency philosophy and clear `npx` install path.

## Blocked Anti-Patterns

- Logging secrets or returning unsanitized debug payloads.
- Using generic catch-all errors without actionable remediation.
- Accepting insecure defaults for production transport/auth.
- Coupling launch-critical path to optional third-party services.

## Strategy Confirmation

- Launch differentiation remains:
  - Tier 1 execution tools plus SEP-10 and SEP-38.
  - Agent-first DX (`_debug`, dry-run signaling, corrective errors).
  - Alignment with `stellarskills` ecosystem for knowledge + execution loop.
