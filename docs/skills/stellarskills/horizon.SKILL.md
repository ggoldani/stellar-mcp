---
name: stellarskills-horizon
source: https://raw.githubusercontent.com/ggoldani/stellarskills/main/horizon/SKILL.md
license: MIT
---

# STELLARSKILLS — Horizon API

## Scope Boundary

- Horizon: classic protocol (accounts, payments, trustlines, offers, submission).
- Soroban smart contract simulation/invocation uses Soroban RPC, not Horizon.

## Production Guidance

- Fetch `feeStats` before building txs in volatile conditions.
- Inspect `extras.result_codes` on failed submission for actionable diagnostics.
- Add retry/recovery strategy for timeouts and transient failures.

## Important Endpoints

- Mainnet: `https://horizon.stellar.org`
- Testnet: `https://horizon-testnet.stellar.org`

## Common Errors

- `tx_bad_seq`
- `tx_insufficient_fee`
- `op_underfunded`
- `op_no_destination`
- `op_no_trust`
- `op_line_full`
- `tx_too_late` / `tx_too_early`
