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
- Local `stellarskills` mirror for in-repo consultation: `docs/skills/stellarskills/`.

## In Progress

- Stellarskills-guided hardening pass:
  - SEP-10 discovery endpoint constraints (`https` + anchor-domain scope).
  - Anchor memo advisory in credit-asset payment flow.
  - Additional tests around hardening and memo guidance.

## Next Steps

- Run full verification (`npm run typecheck`, `npm test`, `npm run smoke:phase1`) after stellarskills-guided hardening updates.
- Add a non-live autonomy smoke (`mock`) to validate unsigned-XDR policy without real keys.
- Execute live `smoke:tier1:testnet` when environment secrets are available.
- Extend error messaging matrix with additional anchor/SEP-focused guidance from mirrored skills.
