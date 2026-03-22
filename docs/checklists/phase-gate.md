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
  - [ ] Phase C: `npm run verify:phase:c` (intentionally unchecked — blocked until Phase B owner approval)
  - [ ] Phase D: deferred by master plan; not applicable until C completes and D is re-approved
- [x] Impacted-domain regressions were run (Accounts, Payments, SEP, Soroban, XDR, Meta).
  - **Note:** Full `npm run test` + `smoke:phase1` + `smoke:autonomy:mock` (via `verify:phase:b`) cover domains; meta covered by `tests/meta.test.ts` and operation-slice tests.
- [x] Security checks validated (redaction, allowlist, policy behavior).
  - **Note:** Meta tools use `redactSensitiveText` / `sanitizeDebugPayload`; read-only; `STELLAR_META_*` envs are non-secret.

## Evidence and Sign-off

- [x] Evidence Note is attached with commands and key outputs (see PR body / merge request).
- [x] README/CHANGELOG updated if behavior changed.
- [ ] Owner explicitly approved Phase B. **Pending:** await owner decision after PR review (APPROVED / CHANGES_REQUESTED).
- [x] Next phase (C) only starts after Phase B owner approval.

---

_Phase A closure checkpoint completed: 2026-03-21 (verification re-run + PR)._

_Phase B closure checkpoint prepared: 2026-03-22 (verify:phase:b + CI alignment + review)._
