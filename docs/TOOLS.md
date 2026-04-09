# StellarMCP — tools reference

This file is **auto-generated**. Do not edit by hand.

- **Source of truth:** the running server’s `tools/list` (same JSON Schema your MCP client sees).
- **Regenerate:** `npm run docs:tools` (runs `npm run build` then updates this file).
- **Drift check:** `npm run test` includes a gate that fails if this file is stale.

---

## How agents should use this

1. Configure the StellarMCP server in your MCP host ([README](../README.md#connect-your-mcp-client)).
2. Call `tools/call` with `name` set to one of the tool names below and `arguments` matching the **Parameters** table (JSON types).
3. Read-only tools work **without** `STELLAR_SECRET_KEY`. Writes depend on [auto-sign policy](../README.md#security).

---

## Accounts & history

### `stellar_fund_account`

Fund a Stellar testnet account with 10,000 testnet XLM using Friendbot.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `publicKey` | `string` | yes | Stellar account public key (G...) |

### `stellar_get_account`

Fetch account details including balances, signers, flags, and calculated minimum balance.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `publicKey` | `string` | yes | Stellar account public key (G...) |

### `stellar_get_account_history`

Fetch the paginated transaction history for a Stellar account.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `publicKey` | `string` | yes | Stellar account public key (G...) |
| `limit` | `integer` | no | Number of records to return (max 200) |
| `cursor` | `string` | no | Pagination cursor to fetch results after a specific transaction |
| `includeOperations` | `boolean` | no | Include per-transaction operation details (type, source). Bounded by limit. Default false for backward compat. |

### `stellar_set_options`

Modify account options (e.g., adding a signer, setting weights/thresholds, or updating flags). Returns unsigned XDR by default unless policy allows.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sourceAccount` | `string` | yes | The account applying the options |
| `signer` | `object` | no | Add, update, or remove a signer (set weight to 0 to remove) |
| `masterWeight` | `integer` | no | — |
| `lowThreshold` | `integer` | no | — |
| `medThreshold` | `integer` | no | — |
| `highThreshold` | `integer` | no | — |
| `homeDomain` | `string` | no | — |

## Payments & fees

### `stellar_submit_fee_bump_transaction`

Sponsor the fees for an existing transaction using a Fee Bump Transaction. Submits to the network.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `innerTxXdr` | `string` | yes | Base64 encoded inner transaction XDR (must be signed by the inner source account) |
| `feeAccount` | `string` | yes | Account that will pay the fees (sponsor) |
| `maxFee` | `string` | no | Maximum fee to pay (in stroops). Defaults to a reasonable minimum. |

### `stellar_submit_payment`

Submit a Stellar payment transaction and return the transaction hash.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | `string` | yes | Source account public key (G...) |
| `to` | `string` | yes | Destination account public key (G...) |
| `asset` | `object` | yes | Asset descriptor: native or credit with code+issuer. |
| `amount` | `string` | yes | Amount to send (up to 7 decimals). |
| `memo` | `object` | no | Optional memo payload. |

## Assets & AMM

### `stellar_create_trustline`

Create a trustline for a non-native Stellar asset and return transaction hash.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account` | `string` | yes | Account public key that will hold the trustline. |
| `asset_code` | `string` | yes | Credit asset code. |
| `asset_issuer` | `string` | yes | Issuer public key for the credit asset. |
| `limit` | `string` | no | Optional trustline limit. Defaults to max representable amount. |

### `stellar_deposit_liquidity`

Deposit liquidity into a classic Stellar AMM liquidity pool.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sourceAccount` | `string` | yes | Account providing liquidity |
| `assetA` | `object` \| `object` | yes | First asset of the liquidity pool |
| `assetB` | `object` \| `object` | yes | Second asset of the liquidity pool |
| `maxAmountA` | `string` | yes | Maximum amount of asset A to deposit |
| `maxAmountB` | `string` | yes | Maximum amount of asset B to deposit |
| `minPrice` | `string` | yes | Minimum price of asset A in terms of asset B |
| `maxPrice` | `string` | yes | Maximum price of asset A in terms of asset B |
| `fee` | `integer` | no | Liquidity pool fee in basis points (usually 30) |

### `stellar_withdraw_liquidity`

Withdraw liquidity from a classic Stellar AMM liquidity pool.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sourceAccount` | `string` | yes | Account withdrawing liquidity |
| `assetA` | `object` \| `object` | yes | First asset of the liquidity pool |
| `assetB` | `object` \| `object` | yes | Second asset of the liquidity pool |
| `amount` | `string` | yes | Amount of pool shares to withdraw |
| `minAmountA` | `string` | yes | Minimum amount of asset A to receive |
| `minAmountB` | `string` | yes | Minimum amount of asset B to receive |
| `fee` | `integer` | no | Liquidity pool fee in basis points (usually 30) |

## Network

### `stellar_get_fee_stats`

Fetch current fee statistics and return recommended fee for reliable inclusion.

**Parameters** (JSON Schema → table)

_No parameters._

## XDR

### `stellar_decode_xdr`

Decode a base64 encoded Stellar transaction XDR into a readable JSON format showing operations and parameters.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `xdr` | `string` | yes | Base64 encoded transaction XDR |

### `stellar_xdr_encode`

Encode JSON into base64 XDR for a named type (roundtrip with stellar_xdr_json_schema + decode tools).

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | `string` | yes | Stellar XDR type name (see stellar_xdr_types), e.g. TransactionEnvelope |
| `json` | `string` \| `object` | yes | — |

### `stellar_xdr_guess`

Given base64 XDR, return which XDR types decode successfully (single value only; not streams).

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `xdr` | `string` | yes | Single XDR value as standard base64 (no data: URL prefix) |

### `stellar_xdr_json_schema`

Return Draft-7 JSON Schema for a Stellar XDR type (use with stellar_xdr_encode).

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | `string` | yes | Stellar XDR type name (see stellar_xdr_types), e.g. TransactionEnvelope |

### `stellar_xdr_types`

List supported Stellar XDR type names for encode/decode/schema (from the bundled XDR JSON engine).

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prefix` | `string` | no | Optional case-insensitive prefix filter applied to type names |

## Historical meta

### `stellar_get_ledger_meta`

Fetch closed ledger header metadata from Horizon (primary) with Soroban RPC getLedgers fallback. Responses are bounded with truncation metadata; results may be cached on disk with TTL.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ledgerSequence` | `integer` | yes | Ledger sequence number (closed ledger) |
| `maxXdrCharsPerField` | `integer` | no | Max base64 characters per XDR field (truncation metadata when exceeded) |

### `stellar_get_transaction_meta`

Fetch transaction result / fee metadata XDR from Horizon (primary) with Soroban RPC getTransaction fallback. Payloads are bounded with truncation metadata; optional operation_index slices decoded TransactionMeta when not truncated.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `transactionHash` | `string` | yes | 64-character lowercase hex transaction hash |
| `operationIndex` | `integer` | no | Optional operation index inside TransactionMeta.operations |
| `maxXdrCharsPerField` | `integer` | no | Max base64 characters per XDR field (truncation metadata when exceeded) |

## SEP & anchors

### `stellar_get_anchor_toml`

Fetch and parse the stellar.toml file for a given anchor domain to discover SEP support (SEP-10, SEP-24, etc).

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `anchorDomain` | `string` | yes | Anchor domain, e.g. anchor.example.com |

### `stellar_get_sep38_quote`

Request a SEP-38 indicative quote and return rate metadata.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sellAsset` | `string` | yes | SEP-38 sell asset string, e.g. stellar:USDC:G... |
| `buyAsset` | `string` | yes | SEP-38 buy asset string, e.g. iso4217:BRL |
| `amount` | `string` | yes | Sell amount as decimal string |

### `stellar_sep10_auth`

Perform SEP-10 challenge signing flow and return JWT token.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `anchorDomain` | `string` | yes | Anchor domain, e.g. anchor.example.com |
| `publicKey` | `string` | yes | Account public key that will authenticate. |

### `stellar_sep12_customer`

GET or PUT customer KYC data to an Anchor's SEP-12 KYC_SERVER.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `anchorDomain` | `string` | yes | Anchor domain, e.g. anchor.example.com |
| `method` | `enum` | yes | HTTP method to use |
| `token` | `string` | yes | SEP-10 JWT authentication token |
| `kycFields` | `object` | no | Key-value pairs of KYC fields to PUT (e.g. first_name, last_name, email) |

### `stellar_sep24_interactive`

Initiate a SEP-24 interactive deposit or withdrawal. Returns the interactive URL to present to the user.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `anchorDomain` | `string` | yes | Anchor domain, e.g. anchor.example.com |
| `type` | `enum` | yes | Transaction type: deposit or withdraw |
| `assetCode` | `string` | yes | Stellar asset code, e.g. USDC |
| `token` | `string` | yes | SEP-10 JWT authentication token |

### `stellar_sep31_remittance`

Initiate a SEP-31 cross-border remittance payment.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `anchorDomain` | `string` | yes | Anchor domain, e.g. anchor.example.com |
| `token` | `string` | yes | SEP-10 JWT authentication token |
| `amount` | `string` | yes | Amount to remit |
| `assetCode` | `string` | yes | Stellar asset code to send |
| `destinationAsset` | `string` | yes | Asset code the recipient will receive (e.g. NGN) |
| `senderId` | `string` | yes | Sender's KYC ID (from SEP-12) |
| `receiverId` | `string` | yes | Receiver's KYC ID (from SEP-12) |
| `fields` | `object` | no | Additional SEP-31 fields (e.g. routing details) |

### `stellar_sep6_transfer`

Initiate a SEP-6 programmatic deposit or withdrawal.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `anchorDomain` | `string` | yes | Anchor domain, e.g. anchor.example.com |
| `type` | `enum` | yes | Transaction type: deposit or withdraw |
| `assetCode` | `string` | yes | Stellar asset code, e.g. USDC |
| `token` | `string` | yes | SEP-10 JWT authentication token |
| `amount` | `string` | no | Amount to transfer |
| `typeField` | `string` | no | Type of deposit or withdrawal (e.g. bank_account, SEPA) |
| `destOrAccount` | `string` | no | Destination account or bank details routing |

## Soroban

### `stellar_soroban_deploy`

Upload and deploy a Soroban smart contract from a local .wasm file. Submits to the network if policy allows.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wasmFilePath` | `string` | yes | Absolute or relative path to the compiled .wasm file |
| `sourceAccount` | `string` | yes | Source account public key (G...) to deploy from |

### `stellar_soroban_get_events`

Fetch historical events emitted by a Soroban smart contract.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startLedger` | `integer` | yes | The ledger sequence number to start fetching events from |
| `contractIds` | `array` | no | Array of contract IDs (C...) to filter by |
| `topics` | `array` | no | Array of topic strings (e.g. 'transfer', '*') to filter by |
| `limit` | `integer` | no | Maximum number of events to return |

### `stellar_soroban_invoke`

Invoke a Soroban smart contract. Simulates the transaction, extracts the footprint, and submits it to the network if policy allows.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contractId` | `string` | yes | Soroban contract ID (C...) |
| `method` | `string` | yes | Contract method name to invoke |
| `sourceAccount` | `string` | yes | Source account public key (G...) to use for simulation. |
| `args` | `array` | no | List of arguments for the contract invocation. |

### `stellar_soroban_read_state`

Read the state of a specific contract data entry directly from the ledger without simulating a transaction.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contractId` | `string` | yes | Soroban contract ID (C...) |
| `keyType` | `enum` | yes | The ScVal type of the ledger key |
| `keyValue` | `any` | yes | The value of the ledger key |

### `stellar_soroban_simulate`

Simulate a Soroban smart contract invocation to get footprint, events, and results. Does NOT submit transaction.

**Parameters** (JSON Schema → table)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contractId` | `string` | yes | Soroban contract ID (C...) |
| `method` | `string` | yes | Contract method name to invoke |
| `sourceAccount` | `string` | yes | Source account public key (G...) to use for simulation. |
| `args` | `array` | no | List of arguments for the contract invocation. |
