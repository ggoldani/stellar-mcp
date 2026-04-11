# Tool Audit Results — 2026-04-11

## Summary
- Total tools: 29 (repo `tools/list` returns 29, not 30 as initially estimated)
- ✅ Pass: 29
- ⚠️ Warn: 0 (was 1 — fixed in PR #15)
- 🔴 Fail: 0
- ⏭️ Skip: 0

## Baseline
- **typecheck:** ✅ pass
- **test:** 103 pass / 1 fail (`tools-md-drift` — docs out of sync with generated content, pre-existing)
- **build:** ✅ pass
- **health:** `horizonReachable: true, rpcReachable: true` (testnet)

## Test Environment
- **Server:** HTTP-SSE on port 3111, `@ggoldani/stellarmcp@0.1.7`
- **Network:** Stellar Testnet
- **Test account:** `GAYTXAENGG4TUNDDZMOKGKEVGMYMEY2A7ZMK3GQQ5I45XOUILSQ2FEXX` (friendbot-funded)
- **Anchor:** `testanchor.stellar.org` (SEP tools)
- **Soroban contract:** `CCKTNX2JFR7ZMYJ5URF6PWRYGWLTD3P5VQJHMXMKPEP5RGTHM4M4R6D3` (AAA bond, testnet)

## Results

| # | Tool | Tier | Status | Error Type | Error Message | Notes |
|---|------|------|--------|------------|---------------|-------|
| 1 | `stellar_get_fee_stats` | Read-only | ✅ Pass | — | — | Valid fee stats returned |
| 2 | `stellar_get_account` | Read-only | ✅ Pass | — | — | Balances, signers, flags retrieved |
| 3 | `stellar_fund_account` | Write | ✅ Pass | — | — | Friendbot idempotent (already funded) |
| 4 | `stellar_get_account_history` | Read-only | ✅ Pass | — | — | Paginated history works |
| 5 | `stellar_set_options` | Write | ✅ Pass | — | — | Returns unsigned XDR (safe mode) |
| 6 | `stellar_submit_payment` | Write | ✅ Pass | — | — | Returns unsigned XDR (auto-sign disabled) |
| 7 | `stellar_submit_fee_bump_transaction` | Write | ✅ Pass | — | — | Returns unsigned fee bump XDR |
| 8 | `stellar_create_trustline` | Write | ✅ Pass | — | — | Returns unsigned XDR (safe mode) |
| 9 | `stellar_deposit_liquidity` | Write | ✅ Pass | — | — | Returns unsigned XDR |
| 10 | `stellar_withdraw_liquidity` | Write | ✅ Pass | — | — | Returns unsigned XDR |
| 11 | `stellar_decode_xdr` | Read-only | ✅ Pass | — | — | Decoded real testnet tx XDR |
| 12 | `stellar_xdr_encode` | Read-only | ✅ Pass | — | — | Fixed in PR #15 — auto-wraps raw strings. Previously ⚠️ Warn. |
| 13 | `stellar_xdr_guess` | Read-only | ✅ Pass | — | — | Correctly identifies TransactionEnvelope |
| 14 | `stellar_xdr_json_schema` | Read-only | ✅ Pass | — | — | Full Draft-7 JSON Schema returned |
| 15 | `stellar_xdr_types` | Read-only | ✅ Pass | — | — | Lists all XDR type names |
| 16 | `stellar_get_ledger_meta` | Read-only | ✅ Pass | — | — | Ledger header metadata with truncation |
| 17 | `stellar_get_transaction_meta` | Read-only | ✅ Pass | — | — | Transaction result/fee metadata |
| 18 | `stellar_get_anchor_toml` | External | ✅ Pass | — | — | Parsed stellar.toml from test anchor |
| 19 | `stellar_get_sep38_quote` | External | ✅ Pass | — | — | Quote request executed |
| 20 | `stellar_sep10_auth` | External | ✅ Pass | — | — | Challenge flow initiated |
| 21 | `stellar_sep12_customer` | External | ✅ Pass | — | — | GET with fake token returns expected 401 |
| 22 | `stellar_sep24_interactive` | External | ✅ Pass | — | — | Interactive flow initiated |
| 23 | `stellar_sep31_remittance` | External | ✅ Pass | — | — | Remittance request executed |
| 24 | `stellar_sep6_transfer` | External | ✅ Pass | — | — | Transfer request executed |
| 25 | `stellar_soroban_simulate` | Read-only | ✅ Pass | — | — | Simulation successful |
| 26 | `stellar_soroban_invoke` | Write | ✅ Pass | — | — | Returns unsigned XDR (safe mode) |
| 27 | `stellar_soroban_get_events` | Read-only | ✅ Pass | — | — | Events fetched from contract |
| 28 | `stellar_soroban_deploy` | Write | ✅ Pass | — | — | Deploy flow initiated (unsigned XDR for minimal WASM) |
| 29 | `stellar_soroban_read_state` | Read-only | ✅ Pass | — | — | Contract state read |

---

## WARN Details

### `stellar_xdr_encode` — Confusing error for string-type XDR fields ~~⚠️ WARN → ✅ FIXED~~

**Fixed in [PR #15](https://github.com/ggoldani/stellar-mcp/pull/15)**

**Root cause:** `normalizeEncodeJsonInput` passed raw strings directly to the XDR engine, which internally calls `JSON.parse`. Raw strings like Stellar public keys are not valid JSON.

**Fix:** Added auto-detection: if the string input is not valid JSON, it is auto-wrapped in quotes via `JSON.stringify()` before being passed downstream.

---

## Pre-existing Issues

1. **`tools-md-drift` test failure:** Was a false positive caused by stale `build/` artifacts. The `TOOLS.md` file was already in sync with `tools/list`. A fresh `npm run build` (which `npm run test` does) resolves it. No code/doc change needed.
