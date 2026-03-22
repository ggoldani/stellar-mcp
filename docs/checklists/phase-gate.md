# Phase Gate Checklist

Use this checklist before requesting phase sign-off.

## Definition of Ready (before coding)

- [x] Scope is fixed for the current phase.
- [x] Touched files are identified.
- [x] Acceptance checks are defined.
- [x] Known risks and fallback approach are documented.

## Required Verification (before "done")

- [x] `npm run verify:base` passes.
- [x] Phase-specific verification command passes:
  - [x] Phase A: `npm run verify:phase:a`
  - [ ] Phase B: `npm run verify:phase:b` (not started; blocked until Phase A owner approval)
  - [ ] Phase C: `npm run verify:phase:c` (not started; blocked until Phase A owner approval)
- [x] Impacted-domain regressions were run (Accounts, Payments, SEP, Soroban, XDR).
  - **Note:** Full `npm run test` (87 tests) + `smoke:phase1` cover existing domains; XDR covered by `tests/xdr.test.ts` and new tools.
- [x] Security checks validated (redaction, allowlist, policy behavior).
  - **Note:** XDR tool errors use `redactSensitiveText`; `_debug` via `sanitizeDebugPayload`. Allowlist/policy unchanged; no new network surfaces for XDR JSON tools beyond existing config patterns.

## Evidence and Sign-off

- [x] Evidence Note is attached with commands and key outputs (see PR body / merge request).
- [x] README/CHANGELOG updated if behavior changed.
- [ ] Owner explicitly approved this phase. **Gap:** Awaiting owner decision after PR review (APPROVED / CHANGES_REQUESTED).
- [x] Next phase only starts after approval (Phase B remains out of scope until sign-off).

---

_Phase A closure checkpoint completed: 2026-03-21 (verification re-run + PR)._
