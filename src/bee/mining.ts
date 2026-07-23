// Bee Engine background mining controller.
//
// REAL (from Bee Engine Overview doc):
//   Bee Engine has two components:
//     1) Client Bee Engine Miner — runs on the device: PoW hash computation,
//        result aggregation, builds a Merkle Tree of completed work, prepares
//        data for verification. Runs in the background / with resource limits
//        / in parallel with the app's main logic.
//     2) Mobile Verifiers Miner Subsystem Contracts (on-chain) — accept the
//        Merkle Tree, verify correctness, validate that work was actually done,
//        distribute NACKL rewards, and may weigh reputation/frequency/behaviour.
//   The subsystem fully distrusts the client: only cryptographically provable
//   data is verified. "Mining becomes part of the user experience, not a
//   separate process."
//
// ILLUSTRATIVE: the exact `Miner` API to "drive a miner" is not yet published
// (the Bee Engine SDK Integration doc is "under development"). This module
// models that loop with a throttled background task that emits periodic
// "work batches", so the participation layer (streaks/tasks/boosts) and the UI
// can be wired up today. Swap the simulated hash loop for the real SDK miner
// calls when the integration API ships.

import type { NetworkConfig } from "./client";

export interface MiningBatch {
  /** Monotonic batch id. */
  id: number;
  /** Epoch timestamp (s) the batch was sealed. */
  sealedAt: number;
  /** Simulated number of hashes in this batch (real: shares submitted). */
  hashes: number;
  /** Best PoW difficulty hit in the batch. */
  bestDifficulty: number;
  /** Merkle root of the batch (real SDK builds this from completed work). */
  merkleRoot: string;
}

export interface MiningStats {
  totalHashes: number;
  batchesSealed: number;
  startedAt: number | null;
  running: boolean;
}

export type MiningListener = (batch: MiningBatch) => void;

/**
 * Drives a single mining session for one miner address. One session per
 * connected wallet. The session is intentionally gentle on the device: it
 * seals a small batch every `sealIntervalMs` and emits it to listeners, which
 * is the cadence the participation layer and the on-chain verifier expect.
 */
export class MiningSession {
  private timer: ReturnType<typeof setInterval> | null = null;
  private batchId = 0;
  private totalHashes = 0;
  private batchesSealed = 0;
  private startedAt: number | null = null;
  private listeners = new Set<MiningListener>();
  private running = false;

  constructor(
    private readonly minerAddress: string,
    private readonly network: NetworkConfig,
    private readonly sealIntervalMs = 30_000
  ) {}

  get stats(): MiningStats {
    return {
      totalHashes: this.totalHashes,
      batchesSealed: this.batchesSealed,
      startedAt: this.startedAt,
      running: this.running,
    };
  }

  on(listener: MiningListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Begin background mining. Throttled so it never dominates the CPU. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = Date.now();
    // In the real SDK this calls into the bee-sdk "drive a miner" surface,
    // which runs the PoW loop off the main thread (WASM) and emits sealed
    // Merkle roots. Here we simulate the cadence.
    this.timer = setInterval(() => this.sealBatch(), this.sealIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  /** Seal one batch of completed work and notify listeners. */
  private sealBatch(): void {
    this.batchId += 1;
    // Real loop: hashes produced by the WASM PoW. Simulated with a modest,
    // device-friendly number so the demo never overheats a phone.
    const hashes = 1_000 + Math.floor(Math.random() * 4_000);
    const bestDifficulty = 8 + Math.floor(Math.random() * 6);
    const merkleRoot = pseudoMerkleRoot(this.minerAddress, this.batchId, hashes);
    this.totalHashes += hashes;
    this.batchesSealed += 1;
    const batch: MiningBatch = {
      id: this.batchId,
      sealedAt: Math.floor(Date.now() / 1000),
      hashes,
      bestDifficulty,
      merkleRoot,
    };
    for (const l of this.listeners) l(batch);
  }
}

/** Deterministic stand-in for the Merkle root the real miner builds. */
function pseudoMerkleRoot(miner: string, batchId: number, hashes: number): string {
  // NOTE: illustrative only. The real bee-sdk computes a Merkle root over the
  // completed work items and the on-chain Mobile Verifier contracts verify it.
  const h = `${miner}:${batchId}:${hashes}:${hashes * 2654435761}`;
  let x = 0x811c9dc5;
  for (let i = 0; i < h.length; i++) {
    x ^= h.charCodeAt(i);
    x = Math.imul(x, 0x01000193);
  }
  const hex = (x >>> 0).toString(16).padStart(8, "0");
  return `0x${hex.repeat(8)}`;
}
