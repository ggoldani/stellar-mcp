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
- Auto-sign policy with fail-closed valuation and unsigned-XDR fallback for write tools.
- 3-level auto-sign policy runtime (`safe`, `guarded`, `expert`) with legacy env compatibility.
- Stellarskills-aligned hardening via upstream source URLs (without local mirror in repo).
- SEP-10 hardening:
  - discovered `WEB_AUTH_ENDPOINT` constrained to `https` and anchor domain scope.
  - challenge URL building preserves existing query parameters.
  - challenge payload validation checks transaction presence and network passphrase match.
  - token extraction now fails fast when JWT token is missing.
- Payment UX hardening:
  - advisory when sending credit assets without memo in anchor-like flows.
- Error DX hardening:
  - expanded actionable mappings for `tx_no_source_account`, `op_malformed`.
  - clearer network passphrase guidance on `tx_bad_auth`.
- Verification hardening:
  - added non-live autonomy smoke: `npm run smoke:autonomy:mock`.
  - added live Tier-1 friendbot smoke: `npm run smoke:tier1:friendbot`.
  - release gate executed successfully (`typecheck`, `test`, `smoke:phase1`, `smoke:autonomy:mock`, `smoke:tier1:friendbot`).
- Repository hygiene:
  - removed local `stellarskills` mirror files to avoid drift.
- Trustline capped auto-sign UX:
  - kept strict fail-closed behavior and added explicit user-facing rationale message.

## In Progress

- None.

## Next Steps

- Bump package version from `0.1.0` to align with current changelog state.
- Run final release checks (`npm pack`) and publish when desired.
- Optionally run `smoke:tier1:testnet` with dedicated persistent testnet keys as an additional external validation.
