// Tiny reactive store so the React UI can subscribe without pulling in a state
// library. For a production app swap this for your preferred store.

import { useSyncExternalStore } from "react";
import type { ParticipationState } from "./participation";
import { freshParticipation } from "./participation";
import type { MiningStats, MiningBatch } from "../bee/mining";

export type Phase = "disconnected" | "wallet-connected" | "mining-authorized" | "mining";

export interface AppState {
  phase: Phase;
  walletName: string | null;
  walletAddress: string | null;
  minerAddress: string | null;
  deepLink: string | null;
  participation: ParticipationState;
  mining: MiningStats;
  lastBatch: MiningBatch | null;
  lastXpDelta: number;
  lastTx: string | null;
  error: string | null;
}

const initial: AppState = {
  phase: "disconnected",
  walletName: null,
  walletAddress: null,
  minerAddress: null,
  deepLink: null,
  participation: freshParticipation(),
  mining: { totalHashes: 0, batchesSealed: 0, startedAt: null, running: false },
  lastBatch: null,
  lastXpDelta: 0,
  lastTx: null,
  error: null,
};

let state: AppState = initial;
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function resetParticipation(): void {
  setState({ participation: freshParticipation() });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}
