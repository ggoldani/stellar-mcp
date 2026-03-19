---
name: stellarskills-anchors
source: https://raw.githubusercontent.com/ggoldani/stellarskills/main/anchors/SKILL.md
license: MIT
---

# STELLARSKILLS — Anchors

## Mental Model

Anchors bridge fiat rails and Stellar assets via SEP standards.

- Discovery: `stellar.toml` (SEP-1)
- Auth: SEP-10
- Transfer flows: SEP-6 / SEP-24 / SEP-31
- Quotes: SEP-38

## Critical Integration Rules

- Ensure trustline exists before receiving anchor-issued asset.
- Respect memo requirements returned by anchor APIs in withdrawal/send flows.
- Missing or wrong memo can cause unrecoverable operational failures.

## Practical Wallet/Agent Guardrails

- Validate asset issuer, not code only.
- Surface explicit warning when anchor memo is required.
- Keep SEP-10 tokens scoped and short-lived.
