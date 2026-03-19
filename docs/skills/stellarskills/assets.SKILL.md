---
name: stellarskills-assets
source: https://raw.githubusercontent.com/ggoldani/stellarskills/main/assets/SKILL.md
license: MIT
---

# STELLARSKILLS — Assets

## Identity Rules

- Native asset: XLM.
- Credit assets are always `code + issuer`.
- Same code with different issuer is a different asset.

## Canonical Issuer Reminder

- USDC (mainnet): `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`.
- Always verify issuer from official sources before production use.

## Trustline Rules

- Destination must have trustline before receiving credit assets.
- Trustline consumes reserve (subentry cost).
- Remove trustline with `limit: "0"` only when trustline balance is zero.

## Common Errors (high signal)

- `op_no_trust`: destination has no trustline.
- `op_not_authorized`: issuer authorization missing/revoked.
- `op_line_full`: trustline limit exceeded.
- `op_low_reserve`: insufficient XLM reserve headroom.
