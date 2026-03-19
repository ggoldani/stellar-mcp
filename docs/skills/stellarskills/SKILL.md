---
name: stellarskills
description: The missing knowledge between AI agents and production Stellar Network applications.
source: https://raw.githubusercontent.com/ggoldani/stellarskills/main/SKILL.md
license: MIT
---

# STELLARSKILLS — Stellar Knowledge for AI Agents

> Snapshot copied from `ggoldani/stellarskills` for local consultation.

## What is Stellar?

Stellar is a layer-1 blockchain optimized for payments, asset issuance, and financial infrastructure. Key differences from EVM:

- No mempool; quick finality.
- Built-in DEX (orderbook + AMM).
- Accounts must be created/funded.
- Transactions contain typed operations.
- Soroban smart contracts are Rust/WASM.
- Strong anchor/SEP ecosystem.

## Critical Mental Models

1. Accounts must exist before receiving funds.
2. Trustlines are required for non-native assets.
3. Transactions are atomic.
4. Horizon handles classic protocol; Soroban uses RPC.
5. Correct network passphrase is mandatory for signing.

## High-Value Skills for StellarMCP

- Accounts: `accounts/SKILL.md`
- Assets: `assets/SKILL.md`
- Horizon: `horizon/SKILL.md`
- SEPs: `seps/SKILL.md`
- Anchors: `anchors/SKILL.md`
- Operations: `operations/SKILL.md`
- Fees: `fees/SKILL.md`

## Upstream Raw URLs

- https://raw.githubusercontent.com/ggoldani/stellarskills/main/accounts/SKILL.md
- https://raw.githubusercontent.com/ggoldani/stellarskills/main/assets/SKILL.md
- https://raw.githubusercontent.com/ggoldani/stellarskills/main/horizon/SKILL.md
- https://raw.githubusercontent.com/ggoldani/stellarskills/main/seps/SKILL.md
- https://raw.githubusercontent.com/ggoldani/stellarskills/main/anchors/SKILL.md
- https://raw.githubusercontent.com/ggoldani/stellarskills/main/operations/SKILL.md
- https://raw.githubusercontent.com/ggoldani/stellarskills/main/fees/SKILL.md
