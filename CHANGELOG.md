# Changelog

## 0.1.1 - 2026-03-18

- Remove plan bifurcation by keeping a single authoritative planning document.
- Add auto-sign environment controls:
  - `STELLAR_AUTO_SIGN`
  - `STELLAR_AUTO_SIGN_LIMIT`
  - `STELLAR_USDC_ISSUER`
- Add centralized signing policy engine with fail-closed behavior when valuation is unavailable.
- Add USDC valuation utility with canonical USDC fast path and SEP-38 quote fallback.
- Apply auto-sign policy to transaction-writing tools:
  - `stellar_submit_payment`
  - `stellar_create_trustline`
- Add unit tests for signing policy and valuation helpers.
- Add in-repo live execution plan snapshot at `docs/plans/2026-03-18-stellarmcp-live-plan.md`.

## 0.1.0 - 2026-03-18

- Bootstrap strict TypeScript MCP server foundation with stdio and Streamable HTTP/SSE transports.
- Add security hardening primitives:
  - endpoint allowlist validation
  - redaction and debug payload sanitization
  - HTTP rate/concurrency/payload guards
  - network timeout wrappers (30s max)
- Implement launch tools:
  - `stellar_get_account`
  - `stellar_submit_payment`
  - `stellar_create_trustline`
  - `stellar_get_fee_stats`
  - `stellar_sep10_auth`
  - `stellar_get_sep38_quote`
- Add smoke test suite for foundation startup and live Tier-1 testnet execution script.
