# Changelog

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
