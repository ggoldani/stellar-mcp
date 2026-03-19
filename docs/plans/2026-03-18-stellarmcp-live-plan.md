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
- Repository hygiene:
  - removed local `stellarskills` mirror files to avoid drift.

## In Progress

- None.

## Next Steps

- Execute live `smoke:tier1:testnet` when environment secrets are available.
- Decide trustline policy UX under capped auto-sign (`STELLAR_AUTO_SIGN_LIMIT>0`):
  - keep strict fail-closed as-is, or
  - classify trustline as non-monetary and allow auto-sign when explicitly enabled.
