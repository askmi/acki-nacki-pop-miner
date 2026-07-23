# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **reference/learning scaffold** (not production) for a mobile/web **Proof-of-Participation NACKL mining app** on the [Acki Nacki](https://ackinacki.com) blockchain, built on the official `@teamgosh/bee-sdk` (Bee Engine) and `@tvmsdk/core` (TVM SDK). React 18 + Vite + TypeScript. The full README is the canonical narrative; read it for the domain model and the mermaid diagrams.

The single most important convention: **every file explicitly labels what is REAL (from official Acki Nacki docs / npm SDK) vs ILLUSTRATIVE (this repo's sensible-but-unofficial design).** Preserve that distinction in any edit — do not present illustrative scaffolding as spec, and do not "upgrade" a simulated stub to look real without wiring the actual SDK call behind it.

## Commands

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173
npm run typecheck  # tsc --noEmit — the primary correctness gate
npm run build      # tsc --noEmit && vite build
npm run preview    # serve the production build
```

There is **no test runner, no linter, and no CI** configured. `npm run typecheck` (strict mode) is the only automated check — run it after any change. Do not invent a test command; if tests are needed, propose the setup first.

## Runtime requirements that constrain the code

- **`@teamgosh/bee-sdk` ships an ~8 MB WASM binary** built with `wasm-pack --target web`. It requires async WebAssembly + top-level await, so `vite.config.ts` sets `build.target: "esnext"` and excludes the SDK from `optimizeDeps`. The `.wasm` is imported as a URL (`?url`) and passed to `init({ module_or_path })` — see `src/bee/client.ts`.
- **SharedArrayBuffer is required**, so the dev server sets COOP/COEP headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) in `vite.config.ts`. Any hosting for the built app must set the same headers or the SDK won't boot.
- `bootBeeSdk()` is idempotent and must run once before any SDK use; every entry point awaits it.

## Architecture: the four-phase loop

State is a single `AppState` in a `useSyncExternalStore`-based store (`src/game/store.ts`) — no external state lib. The app is a linear state machine driven by `App.tsx`:

```
disconnected → wallet-connected → mining-authorized → mining
```

Data flow when mining: `MiningSession` seals a batch every 30s → `App.tsx` listener reads **fresh** store state (via `getState()`, not the closure's stale `s`) → `ingestBatch()` updates streak/tasks/anti-bot/boost → `participationWeight()` → `submitSession()` records it on-chain → `setState()` re-renders.

Two reward paths, kept deliberately separate (this mirrors the real protocol):
1. **Protocol mining reward** — the Bee Engine client's Merkle root is verified by the on-chain Mobile Verifier subsystem, which distributes NACKL. The app never mints; it only produces provable work. (Validated against `dev.ackinacki.com/bee-engine/bee-engine-overview`.)
2. **App-side participation record** — `ParticipationVault` stores daily streak/boost/weight for a queryable history. It *complements*, does not replace, path 1.

### Module map (each maps to a concept in the docs)

- `src/bee/client.ts` — SDK boot, `Wallet` client, `BeeConnect` shared-key session (produces the wallet-connect deep link), `get_miner_address_by_wallet_name`. Networks (`shellnet`/`mainnet`), `APP_ID`, currency IDs (1=NACKL, 2=SHELL, 3=USDC) live here.
- `src/bee/mining.ts` — `MiningSession`: **simulated** background PoW loop emitting `MiningBatch {id, sealedAt, hashes, bestDifficulty, merkleRoot}`. The real "drive a miner" SDK surface is upstream "under development" (confirmed via `llms.txt`), which is *why* this is a throttled `setInterval` stand-in with a `pseudoMerkleRoot`.
- `src/game/participation.ts` — PoP glue: streaks, tasks, client-side anti-bot heuristics, `computeBoost` multiplier. All weights are illustrative and pure/testable functions.
- `src/game/store.ts` — the reactive store + `Phase` type.
- `src/contract/vaultClient.ts` — TVM-SDK bridge. **The real SDK calls are commented pseudocode**; the functions currently return sim values (`sim-tx-…`). The commented code shows the intended `abi.encode_message_body` → `processing.send_message` → `net.query` surface. Wire against installed typings before going live.
- `src/contract/ParticipationVault.sol` — TVM-Solidity (`pragma ton-solidity >= 0.81.0`) participation record, idempotent per `(miner, day)`, emits `SessionSubmitted`. Kept in sync with `src/abi/participation.abi.json` — **edit both together.**
- `src/contract/DappConfig.sol` — sketch of the freemium fee-subsidy contract. Note: you normally **do not hand-write DappConfig**; you deploy the canonical one from the "Dapp ID Full Guide" and top it up. It has no owner and mints VMSHELL 1:1 via `gosh.mintshell` (validated against the Dapp ID guide).

## Going from simulated → live

The demo runs in simulated mode (`NETWORK = "shellnet"`, mining loop faked, on-chain calls stubbed). The four switch points, per the README §5:
1. Register an App ID with the Bee infra backend, replace `APP_ID` in `src/bee/client.ts` (currently the all-zero placeholder).
2. Deploy `ParticipationVault` + canonical `DappConfig`, put the address in `VAULT_ADDRESS` in `src/App.tsx` (currently all-zero).
3. Wire `connect.wait_wallet_hello(...)` in `client.ts` to complete the real wallet-connect round trip.
4. Replace the simulated `MiningSession` loop with the real bee-sdk miner calls once the Integration API ships.

## Known inconsistency to fix when touching wallet-connect

`startWalletConnect()` in `src/bee/client.ts` returns `ConnectSession { deep_link, handle }` (snake_case), but `App.tsx` reads `session.deepLink` (camelCase). These don't match — `deepLink` is `undefined` at runtime and this should surface under strict typecheck. Reconcile the field name on both sides if you work in this area.

## Editing conventions

- **Match the "real vs illustrative" comment style.** Files open with a block comment citing the source doc; keep citations accurate when you change behavior.
- Keep `ParticipationVault.sol`, its ABI JSON, and `vaultClient.ts`/`SessionRecord` in agreement — the `submitSession` signature spans all three.
- `weight` is a `u64`-as-`string` in TS (exceeds 2^53) and `uint256` on-chain; boost is passed as `boostX100` fixed-point integer (TVM has no floats). Don't reintroduce floats across the boundary.
- Validate domain claims against the official docs (`dev.ackinacki.com`, index at `dev.ackinacki.com/llms.txt`; `docs.ackinacki.com`) rather than assuming — the SDK surface is young and partly "under development."
