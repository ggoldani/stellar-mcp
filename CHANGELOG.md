# Changelog

## 0.1.5 - 2026-03-22

- Phase B (historical meta): add read-only `stellar_get_ledger_meta` and `stellar_get_transaction_meta` with Horizon-first upstream, Soroban RPC fallback, bounded base64 XDR fields (truncation metadata), freshness/cache metadata, and optional `operation_index` via `TransactionMeta` JSON decode.
- Add disk-backed TTL cache (`STELLAR_META_CACHE_*`) and `STELLAR_META_MAX_XDR_CHARS` default; treat `NotFoundError` as Horizon miss for fallback.
- Add `tests/meta.test.ts` plus `isHorizonAxiosNotFound` coverage in `tests/errors.test.ts`.
- Extract `buildTransactionMetaOperationSlice` (`src/lib/metaOperationSlice.ts`) with fixture-backed tests for complete, truncated, out-of-range, and invalid-XDR paths; CI runs `npm run verify:phase:b`; README documents meta cache operational risks.

## 0.1.4 - 2026-03-21

- Phase A (XDR parity): add `stellar_xdr_types`, `stellar_xdr_json_schema`, `stellar_xdr_guess`, and `stellar_xdr_encode` using `@stellar/stellar-xdr-json` (WASM initialized via `initSync` and `require.resolve` for Node).
- Register XDR tools in `src/tools/xdr.ts`; keep `stellar_decode_xdr` behavior as the existing `Transaction`-based decoder (moved from `network.ts` with the same output shape).
- Add `tests/xdr.test.ts` (roundtrip, guess, error-hint coverage).

## 0.1.3 - 2026-03-18

- Add 3-level auto-sign policy runtime:
  - `safe` (default recommended): always unsigned XDR.
  - `guarded`: requires `STELLAR_AUTO_SIGN_LIMIT > 0` with fail-closed valuation behavior.
  - `expert`: unlimited auto-sign and submit.
- Preserve backward compatibility when policy is unset by honoring legacy envs:
  - `STELLAR_AUTO_SIGN`
  - `STELLAR_AUTO_SIGN_LIMIT`
- Add config test coverage for all policy modes and guarded validation.

## 0.1.2 - 2026-03-18

- Harden SEP-10 flow:
  - enforce strict anchor-domain host input (`anchorDomain` host-only validation).
  - validate discovered `WEB_AUTH_ENDPOINT` is `https` and scoped to anchor domain/subdomain.
  - preserve existing query params when building challenge URL.
  - validate challenge payload fields and expected network passphrase before signing.
  - fail fast if SEP-10 token response omits `token`.
- Improve payment/anchor DX with advisory on credit-asset payments without memo.
- Expand actionable error mapping guidance for:
  - `tx_no_source_account`
  - `op_malformed`
  - `tx_bad_auth` with explicit network passphrase mismatch hint.
- Add non-live autonomy smoke verification:
  - `npm run smoke:autonomy:mock`
- Remove local copied `stellarskills` mirror files from repo to avoid documentation drift (use upstream sources directly).

## 0.1.1 - 2026-03-18

- Remove plan bifurcation by keeping a single authoritative planning document.
- Add auto-sign environment controls:
  - `STELLAR_AUTO_SIGN`
  - `STELLAR_AUTO_SIGN_LIMIT`
  - `STELLAR_USDC_ISSUER`
- Add centralized signing policy engine with fail-closed behavior when valuation is unavailable.
- Add USDC valuation utility with canonical USDC fast path and SEP-38 quote fallback.
- Apply auto-sign policy to transaction-writing tools:
  - `stellar_submit_payment`
  - `stellar_create_trustline`
- Add unit tests for signing policy and valuation helpers.
- Add in-repo live execution plan snapshot at `docs/plans/2026-03-18-stellarmcp-live-plan.md`.

## 0.1.0 - 2026-03-18

- Bootstrap strict TypeScript MCP server foundation with stdio and Streamable HTTP/SSE transports.
- Add security hardening primitives:
  - endpoint allowlist validation
  - redaction and debug payload sanitization
  - HTTP rate/concurrency/payload guards
  - network timeout wrappers (30s max)
- Implement launch tools:
  - `stellar_get_account`
  - `stellar_submit_payment`
  - `stellar_create_trustline`
  - `stellar_get_fee_stats`
  - `stellar_sep10_auth`
  - `stellar_get_sep38_quote`
- Add smoke test suite for foundation startup and live Tier-1 testnet execution script.
