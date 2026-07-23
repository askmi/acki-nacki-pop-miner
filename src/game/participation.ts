// App-side participation layer.
//
// This is the "Proof-of-Participation" glue that turns user activity into the
// signals the Bee Engine reward game and the on-chain ParticipationVault use.
// Acki Nacki's Mobile Verifier reward game already distributes NACKL based on
// an on-chain game of "Boosts" and verifier slots; this module is the app-level
// analog that:
//   - tracks daily streaks and task completion,
//   - applies light anti-bot heuristics (real projects do device fingerprinting
//     + behavioural checks server-side; here we keep it client-visible for the
//     demo),
//   - computes a Boost multiplier that the app can submit alongside mining work.
//
// ILLUSTRATIVE: the exact weights and task list are a sensible starting point,
// not an official spec. Tune them per product.

import type { MiningBatch } from "../bee/mining";

export interface Task {
  id: string;
  title: string;
  rewardXp: number;
  done: boolean;
}

export interface ParticipationState {
  /** Consecutive UTC days the user sealed at least one batch. */
  streakDays: number;
  /** Last UTC day (YYYY-MM-DD) a batch was counted toward the streak. */
  lastActiveDay: string | null;
  totalXp: number;
  tasks: Task[];
  /** Suspicion score 0..1; > threshold mutes boosts. */
  botSuspicion: number;
  /** Active boost multiplier applied to participation-weighted work. */
  boostMultiplier: number;
}

export const DEFAULT_TASKS: Task[] = [
  { id: "open", title: "Open the app today", rewardXp: 10, done: false },
  { id: "session24h", title: "Run a mining session for 24h", rewardXp: 50, done: false },
  { id: "refer1", title: "Invite 1 active friend", rewardXp: 80, done: false },
  { id: "vote", title: "Vote in a community poll", rewardXp: 20, done: false },
];

export function freshParticipation(): ParticipationState {
  return {
    streakDays: 0,
    lastActiveDay: null,
    totalXp: 0,
    tasks: DEFAULT_TASKS.map((t) => ({ ...t })),
    botSuspicion: 0,
    boostMultiplier: 1,
  };
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  return Math.round(
    (Date.parse(b) - Date.parse(a)) / 86_400_000
  );
}

/**
 * Ingest a sealed mining batch: advance the streak, award XP for the daily
 * "open" task, run anti-bot checks, and recompute the boost multiplier.
 * Returns the updated state plus the XP delta for this batch.
 */
export function ingestBatch(
  state: ParticipationState,
  batch: MiningBatch
): { state: ParticipationState; xpDelta: number } {
  let xpDelta = 0;
  const next: ParticipationState = { ...state, tasks: state.tasks.map((t) => ({ ...t })) };

  // --- streak ---
  const today = todayUtc();
  if (state.lastActiveDay === null) {
    next.streakDays = 1;
  } else if (state.lastActiveDay === today) {
    // already counted today; keep streak
  } else {
    const d = dayDiff(state.lastActiveDay, today);
    next.streakDays = d === 1 ? state.streakDays + 1 : 1;
  }
  next.lastActiveDay = today;

  // --- daily "open" task ---
  const openTask = next.tasks.find((t) => t.id === "open");
  if (openTask && !openTask.done) {
    openTask.done = true;
    xpDelta += openTask.rewardXp;
  }

  // participation XP scales gently with work, capped so farming is weak
  const workXp = Math.min(25, Math.floor(batch.hashes / 200));
  xpDelta += workXp;
  next.totalXp = state.totalXp + xpDelta;

  // --- anti-bot heuristics (illustrative) ---
  next.botSuspicion = scoreSuspicion(state, batch);

  // --- boost ---
  next.boostMultiplier = computeBoost(next);

  return { state: next, xpDelta };
}

/** Mark an arbitrary task done by id (e.g. user clicked "claim referral"). */
export function completeTask(state: ParticipationState, taskId: string): ParticipationState {
  const next: ParticipationState = { ...state, tasks: state.tasks.map((t) => ({ ...t })) };
  const t = next.tasks.find((x) => x.id === taskId);
  if (t && !t.done) {
    t.done = true;
    next.totalXp += t.rewardXp;
    next.boostMultiplier = computeBoost(next);
  }
  return next;
}

/**
 * Boost = product of a streak bonus and a task-completion bonus, muted when the
 * anti-bot score is high. Mirrors the on-chain "Boosts" idea in Acki Nacki's
 * Mobile Verifier reward game, but expressed as an app-side multiplier.
 */
export function computeBoost(s: ParticipationState): number {
  const streakBonus = 1 + Math.min(s.streakDays, 30) * 0.02; // up to +60%
  const doneCount = s.tasks.filter((t) => t.done).length;
  const taskBonus = 1 + doneCount * 0.05; // up to +20% for 4 tasks
  const honesty = 1 - Math.min(s.botSuspicion, 1) * 0.9; // near-zero when suspicious
  return Number((streakBonus * taskBonus * honesty).toFixed(3));
}

/**
 * Lightweight suspicion score. A real deployment pushes device fingerprint,
 * timing entropy, and behavioural signals to a server; here we keep a few
 * cheap client-side checks so the concept is visible.
 */
function scoreSuspicion(prev: ParticipationState, batch: MiningBatch): number {
  let s = prev.botSuspicion * 0.7; // decay over time
  // Penalize implausibly large batches (a bot fabricating work).
  if (batch.hashes > 50_000) s = Math.min(1, s + 0.4);
  // Penalize perfectly uniform difficulty (bots tend to be too regular).
  if (batch.bestDifficulty % 1 === 0 && prev.botSuspicion > 0.3) s = Math.min(1, s + 0.05);
  // Reward realistic variance.
  if (batch.hashes > 0 && batch.hashes < 50_000) s = Math.max(0, s - 0.05);
  return Number(s.toFixed(3));
}

/**
 * Participation-weighted work: what the app effectively "claims" for this batch
 * toward reward distribution. In the real system the on-chain Mobile Verifier
 * contracts verify the Merkle root and the protocol applies its own Boost game;
 * this value is the app's proposed contribution and is only honoured if the
 * on-chain verification passes.
 */
export function participationWeight(batch: MiningBatch, boost: number): number {
  return Math.round(batch.hashes * boost);
}
