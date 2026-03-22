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
  - [x] Phase B: `npm run verify:phase:b`
  - [x] Phase C: `npm run verify:phase:c`
  - [ ] Phase D: deferred by master plan; not applicable until owner re-approves D after C sign-off
- [x] Impacted-domain regressions were run (Accounts, Payments, SEP, Soroban, XDR, Meta).
  - **Note:** `verify:phase:c` includes full `npm run test`, `smoke:phase1`, `smoke:autonomy:mock`, `pack:sanity`, and full generator E2E (baseline + exotic nested `npm install`/`typecheck`).
- [x] Security checks validated (redaction, allowlist, policy behavior).
  - **Note:** Generator copies `errors.ts`/`redact.ts` with byte-for-byte conformance tests; generated `contractInvoke` uses `normalizeStellarError`, `redactSensitiveText`, `sanitizeDebugPayload`, signing policy parity.

## Evidence and Sign-off

- [x] Evidence Note is attached with commands and key outputs (see PR body / merge request).
- [x] README/CHANGELOG updated if behavior changed.
- [ ] Owner explicitly approved Phase C. **Pending:** await owner decision after PR review (APPROVED / CHANGES_REQUESTED).
- [ ] Phase D only starts after Phase C owner approval and explicit D re-approval per master plan.

---

_Phase A closure checkpoint completed: 2026-03-21 (verification re-run + PR)._

_Phase B closure checkpoint completed: 2026-03-22 (merged to main)._

_Phase C closure checkpoint prepared: 2026-03-22 (`verify:phase:c` + CI + PR)._
