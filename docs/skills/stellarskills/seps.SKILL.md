---
name: stellarskills-seps
source: https://raw.githubusercontent.com/ggoldani/stellarskills/main/seps/SKILL.md
license: MIT
---

# STELLARSKILLS — SEPs

## Core Standards

- SEP-1: `stellar.toml` discovery.
- SEP-10: challenge/response auth with signed XDR.
- SEP-6: programmatic deposit/withdraw.
- SEP-24: hosted interactive deposit/withdraw.
- SEP-12: KYC data API.
- SEP-31: cross-border payments.
- SEP-38: indicative/firm quotes.

## SEP-10 Flow

1. `GET /auth?account=G...` -> challenge XDR + passphrase.
2. Client signs challenge (no network broadcast).
3. `POST /auth` with signed challenge XDR.
4. Receive JWT and use `Authorization: Bearer <token>`.

## SEP-1 / TOML Requirements

- File path: `https://<domain>/.well-known/stellar.toml`.
- Must expose key endpoints (e.g. `WEB_AUTH_ENDPOINT`, quote server, transfer servers).
- Should include CORS permissive headers where required by wallet integrations.

## SEP-38 Notes

- `GET /price` for indicative rate.
- `POST /quote` for firm quote with expiry.
- Quote IDs can be consumed by transfer flows.

## Implementation Checklist (from upstream)

- `stellar.toml` exists and is parseable.
- SEP-10 challenge has valid time bounds.
- JWT protected endpoints for transfer/quote/KYC flows.
- Memo requirements from anchor responses are preserved end-to-end.
