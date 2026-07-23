# Verification Report

Code verified against the official Acki Nacki docs (`dev.ackinacki.com` Bee Engine
Overview, SDK reference, `llms.txt` index) on 2026-07-23.

**Caveat:** `npm run typecheck` was **not** run — `node_modules` is not installed
and `tsc` is not on PATH. Type findings below are from static reading, not a
compiler run.

## Verdict

Architecture is sound and mirrors the official model. The two-path reward
separation — protocol-level Mobile Verifier verifies the Bee client's Merkle tree
and distributes NACKL, while the app-side `ParticipationVault` only records
participation — matches the Bee Engine Overview exactly. The app never mints.

Below: 3 real correctness bugs, plus doc-fidelity issues.

---

## Confirmed bugs

### 1. `deepLink` vs `deep_link` mismatch (breaks typecheck)
- **Files:** `src/bee/client.ts:70,91` (defines `ConnectSession.deep_link`),
  `src/App.tsx:32` (reads `session.deepLink`).
- **Problem:** field name mismatch. At runtime `s.deepLink` is always `undefined`,
  so the QR / deep-link card (`src/App.tsx:137`) never renders. Under strict `tsc`
  this is a TS2339 error — the project does not pass its own primary correctness
  gate. (Also noted in CLAUDE.md.)
- **Severity:** High.

### 2. Address truncation in `ParticipationVault.sol`
- **File:** `src/contract/ParticipationVault.sol:93-96` (`toUint256`).
- **Problem:** `uint256(uint160(a))` truncates to Ethereum's 160-bit address width,
  discarding 96 bits and inviting mapping-key collisions. The comment one line above
  says "Acki Nacki addresses are 256-bit" — the code contradicts it. This is an
  EVM-ism leaking into a TVM contract; the key should preserve the full 256-bit
  account id.
- **Severity:** High (contract correctness).

### 3. Dead anti-bot condition in `participation.ts`
- **File:** `src/game/participation.ts:147`.
- **Problem:** `batch.bestDifficulty % 1 === 0` is always true because
  `bestDifficulty` is produced as an integer (`src/bee/mining.ts:105`). The
  "penalize perfectly uniform difficulty" heuristic never measures uniformity; it
  collapses to just `prev.botSuspicion > 0.3`. Code does not match its comment.
- **Severity:** Medium (logic smell in illustrative heuristic).

---

## Doc-fidelity / "real vs illustrative" concerns

### 4. Overstated "REAL" claims in `client.ts` header
- **File:** `src/bee/client.ts:3-11`.
- **Problem:** header asserts `wait_wallet_hello`, `create_shared_key_session`,
  `get_miner_address_by_wallet_name`, BeeConnect, and currency IDs as REAL "from the
  official docs." But the Bee Engine SDK Integration page is "under development", and
  the public Overview doc mentions none of these APIs, nor "BeeConnect" / "Mobile
  Verifier" by those names (it says "Mobile Verifiers Miner Subsystem" and "Merkle
  Tree", not "Merkle root"). These are npm-README-level claims, not doc-confirmed —
  label them as "from the SDK typings/README" rather than "official docs."
- **Severity:** Medium (violates repo's core real-vs-illustrative convention).

### 5. Wrong TVM SDK surface in `vaultClient.ts` pseudocode
- **File:** `src/contract/vaultClient.ts:52-66`.
- **Problem:** for an external call into a contract, the surface is
  `abi.encode_message` (full signed message) → `processing.process_message`.
  `abi.encode_message_body` returns `{ body, data_to_sign }` (a body BOC), not a
  `{ message }` field — so `send_message({ message: body.message })` won't line up
  with the real SDK. Explicitly commented pseudocode, so low-severity, but tighten so
  nobody copies the wrong surface.
- **Severity:** Low.

### 6. Duplicate backend endpoint for both networks
- **File:** `src/bee/client.ts:40,44`.
- **Problem:** `beeInfraBackend` is identical for `shellnet` and `mainnet`. Testnet
  and mainnet almost certainly differ; looks like a copy-paste placeholder.
- **Severity:** Low.

### 7. Wallet address conflated with miner address
- **File:** `src/App.tsx:42-44`.
- **Problem:** the miner-lookup result is assigned to both `walletAddress` and
  `minerAddress`, contradicting `src/bee/client.ts:99-104` which stresses these are
  distinct. Acknowledged in the comment, but conflates two things the docs keep
  separate.
- **Severity:** Low.

---

## Good practices confirmed
- WASM boot (`?url` + `init({module_or_path})`), COOP/COEP headers, and
  `build.target: esnext` in `vite.config.ts` correctly satisfy the documented
  SharedArrayBuffer + top-level-await requirements.
- `boostX100` fixed-point integer across the TS↔TVM boundary — no floats cross.
- `submitSession` signature agrees across `ParticipationVault.sol`,
  `participation.abi.json`, and `SessionRecord` (5 fields, types aligned).
- Fresh `getState()` read inside the batch listener (`src/App.tsx:69`) avoids the
  stale-closure trap.
- Idempotent-per-`(miner, day)` design is present.
- Boost math is internally consistent: max ≈ 1.92×, well under the contract's
  `boostX100 <= 1000` cap.
