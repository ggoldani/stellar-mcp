# StellarMCP Live Plan

This file is the in-repo execution snapshot for implementation status and next steps.

## Authoritative Plan

- Primary plan: `.cursor/plans/stellarmcp-phase1-foundation_6251af2a.plan.md`
- Secondary plan files were removed to avoid drift and ambiguity.

## Completed

- Foundation setup with strict TypeScript and MCP transport split (`stdio` + `http-sse`).
- Hardened configuration loading, endpoint allowlist checks, and 30s timeout enforcement.
- Actionable Stellar error mapping and shared Zod validators.
- HTTP hardening: health endpoint, rate limiting, payload caps, and concurrency controls.
- Tier 1 launch tools: `stellar_get_account`, `stellar_submit_payment`, `stellar_create_trustline`, `stellar_get_fee_stats`.
- Launch-critical SEP tools: `stellar_sep10_auth`, `stellar_get_sep38_quote`.
- Documentation baseline in `README.md` and `CHANGELOG.md`.

## In Progress

- Auto-sign autonomy policy integration:
  - Added env configuration for `STELLAR_AUTO_SIGN`, `STELLAR_AUTO_SIGN_LIMIT`, and `STELLAR_USDC_ISSUER`.
  - Added central signing policy decision engine with fail-closed behavior.
  - Added USDC valuation utility with canonical-asset fast path and SEP-38 fallback.
  - Applied policy flow to payment and trustline write tools.
  - Added unit tests for autonomy and valuation helpers.

## Next Steps

- Run full verification (`npm run typecheck`, `npm test`, `npm run smoke:phase1`).
- Patch findings from tests/smoke and rerun until green.
- Update `README.md` and `CHANGELOG.md` with:
  - Local-first recommended deployment mode.
  - Auto-sign behavior matrix and fail-closed valuation policy.
- Execute live `smoke:tier1:testnet` when environment secrets are available.
