---
name: stellarskills-accounts
source: https://raw.githubusercontent.com/ggoldani/stellarskills/main/accounts/SKILL.md
license: MIT
---

# STELLARSKILLS — Accounts

## Key Account Facts

- Keypair generation does not create on-chain account.
- Accounts must be explicitly funded/created before use.
- Never log or expose secret keys (`S...`).

## Minimum Balance

Formula:

`minimumBalance = (2 + numSubentries) * baseReserve + liabilities`

Operational implication:

- Trustlines/signers/data entries increase required reserve.
- Outgoing payments must leave enough reserve headroom.

## Sequence Safety

- Sequence number is strict monotonic per source account.
- Parallel submissions from same source can yield `tx_bad_seq`.

## Common Errors (high signal)

- `op_no_destination`: destination account does not exist.
- `op_low_reserve`: reserve floor violation.
- `op_underfunded`: insufficient spendable balance.
- `tx_bad_seq`: stale sequence number.
- `tx_insufficient_fee`: fee too low under surge.
