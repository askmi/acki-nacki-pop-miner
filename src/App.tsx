// Main orchestrator: Wallet Authentication -> Mining Authorization ->
// background Bee Engine mining -> participation layer -> on-chain submit.
//
// This component demonstrates the full Proof-of-Participation loop on Acki
// Nacki as described in the official "Connecting an AN Wallet and Setting Up
// Mining Keys" guide plus the Bee Engine architecture.

import { useEffect, useRef, useState } from "react";
import { NETWORKS, startWalletConnect, resolveMinerAddress, type NetworkName } from "./bee/client";
import { MiningSession } from "./bee/mining";
import { ingestBatch, completeTask, participationWeight, freshParticipation } from "./game/participation";
import { useAppState, setState, getState, resetParticipation } from "./game/store";
import { submitSession, type VaultConfig } from "./contract/vaultClient";

const NETWORK: NetworkName = "shellnet";
// In a real deploy this is the address of the ParticipationVault you deployed.
const VAULT_ADDRESS = "0:0000000000000000000000000000000000000000000000000000000000000000";

const vault: VaultConfig = { network: NETWORKS[NETWORK], vaultAddress: VAULT_ADDRESS };

export default function App() {
  const s = useAppState();
  const sessionRef = useRef<MiningSession | null>(null);
  const [busy, setBusy] = useState(false);

  // --- Step 1: Wallet Authentication ---
  async function connectWallet() {
    setBusy(true);
    try {
      const net = NETWORKS[NETWORK];
      const session = await startWalletConnect(net);
      setState({ deepLink: session.deepLink });
      // In the real flow the user opens AN Wallet, scans the QR (deep_link),
      // and approves. `wait_wallet_hello` on the session handle then resolves
      // with the wallet name + address. Here we surface the deep link for the
      // demo UI; wire `connect.wait_wallet_hello(...)` to complete the loop.
      // For the scaffold we assume approval and move forward with a stub name.
      const walletName = "demo-wallet";
      const minerAddress = await resolveMinerAddress(net, walletName);
      setState({
        phase: "wallet-connected",
        walletName,
        walletAddress: minerAddress, // wallet address resolved via the miner lookup
        minerAddress,
      });
    } catch (e) {
      setState({ error: String(e) });
    } finally {
      setBusy(false);
    }
  }

  // --- Step 2: Mining Authorization ---
  // User taps "Allow Mining" inside AN Wallet; the app appears under
  // Settings -> Connected Mining Apps and receives Mining Keys. This is a
  // user action in the wallet, so the app just flips phase once authorized.
  function authorizeMining() {
    setState({ phase: "mining-authorized" });
  }

  // --- Step 3: Start/stop background mining + participation loop ---
  function startMining() {
    if (!s.minerAddress) return;
    const net = NETWORKS[NETWORK];
    const session = new MiningSession(s.minerAddress, net);
    sessionRef.current = session;
    session.on((batch) => {
      // Read fresh state from the store so the participation layer accumulates
      // correctly across batches (the closure would otherwise capture a stale `s`).
      const cur = getState();
      const { state: pnext, xpDelta } = ingestBatch(cur.participation, batch);
      const weight = participationWeight(batch, pnext.boostMultiplier);
      // Submit the participation session to the on-chain vault (freemium gas
      // via DappConfig). The actual NACKL mining reward comes from the
      // protocol's Mobile Verifier subsystem, which verifies the Bee Engine
      // Merkle root independently of this app-side record.
      const miner = cur.minerAddress ?? s.minerAddress;
      if (miner) {
        submitSession(vault, {
          miner,
          day: new Date(batch.sealedAt * 1000).toISOString().slice(0, 10),
          streakDays: pnext.streakDays,
          boostX100: Math.round(pnext.boostMultiplier * 100),
          weight: String(weight),
        }, /*signerWallet*/ null).then((r) => setState({ lastTx: r.transactionId }));
      }

      setState({
        participation: pnext,
        mining: session.stats,
        lastBatch: batch,
        lastXpDelta: xpDelta,
        phase: "mining",
      });
    });
    session.start();
    setState({ phase: "mining", mining: session.stats });
  }

  function stopMining() {
    sessionRef.current?.stop();
    setState({ phase: "mining-authorized", mining: { totalHashes: s.mining.totalHashes, batchesSealed: s.mining.batchesSealed, startedAt: s.mining.startedAt, running: false } });
  }

  useEffect(() => () => sessionRef.current?.stop(), []);

  return (
    <div style={styles.wrap}>
      <h1 style={styles.h1}>Acki Nacki — Proof-of-Participation Demo</h1>
      <p style={styles.sub}>Bee Engine background NACKL mining + streaks/tasks/boosts, verified on-chain.</p>

      <div style={styles.card}>
        <Row label="Network" value={NETWORK} />
        <Row label="Phase" value={s.phase} />
        <Row label="Wallet" value={s.walletName ?? "—"} />
        <Row label="Miner address" value={s.minerAddress ?? "—"} mono />
        <Row label="Boost" value={`${s.participation.boostMultiplier.toFixed(3)}×`} />
        <Row label="Suspicion" value={`${(s.participation.botSuspicion * 100).toFixed(0)}%`} />
      </div>

      <div style={styles.actions}>
        {s.phase === "disconnected" && (
          <button disabled={busy} onClick={connectWallet}>{busy ? "Connecting…" : "1. Connect AN Wallet"}</button>
        )}
        {s.phase === "wallet-connected" && (
          <button onClick={authorizeMining}>2. Authorize Mining (in AN Wallet → Allow Mining)</button>
        )}
        {s.phase === "mining-authorized" && (
          <button onClick={startMining}>3. Start mining session</button>
        )}
        {s.phase === "mining" && (
          <button onClick={stopMining}>Stop mining</button>
        )}
        <button onClick={() => { stopMining(); resetParticipation(); setState({ phase: s.minerAddress ? "mining-authorized" : "disconnected" }); }}>Reset participation</button>
      </div>

      {s.deepLink && (
        <div style={styles.card}>
          <div style={styles.muted}>Wallet-connect deep link / QR payload (present to AN Wallet):</div>
          <pre style={styles.pre}>{s.deepLink}</pre>
        </div>
      )}

      <div style={styles.card}>
        <h2 style={styles.h2}>Mining</h2>
        <Row label="Running" value={s.mining.running ? "yes" : "no"} />
        <Row label="Batches sealed" value={String(s.mining.batchesSealed)} />
        <Row label="Total hashes (sim)" value={s.mining.totalHashes.toLocaleString()} />
        {s.lastBatch && (
          <>
            <Row label="Last batch" value={`#${s.lastBatch.id} • ${s.lastBatch.hashes} hashes • diff ${s.lastBatch.bestDifficulty}`} />
            <Row label="Merkle root" value={s.lastBatch.merkleRoot} mono />
          </>
        )}
        {s.lastTx && <Row label="On-chain tx (sim)" value={s.lastTx} mono />}
      </div>

      <div style={styles.card}>
        <h2 style={styles.h2}>Participation</h2>
        <Row label="Streak" value={`${s.participation.streakDays} day(s)`} />
        <Row label="Total XP" value={String(s.participation.totalXp)} />
        <Row label="Last XP delta" value={`+${s.lastXpDelta}`} />
        <ul style={styles.ul}>
          {s.participation.tasks.map((t) => (
            <li key={t.id} style={{ opacity: t.done ? 0.5 : 1 }}>
              <span>{t.done ? "✅" : "⬜"} {t.title} (+{t.rewardXp} XP)</span>
              {!t.done && t.id !== "open" && (
                <button style={styles.small} onClick={() => setState({ participation: completeTask(s.participation, t.id) })}>claim</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {s.error && <div style={styles.error}>{s.error}</div>}
      <div style={styles.muted}>Reference scaffold — see README for what is real vs illustrative.</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
      <span style={{ ...styles.value, ...(mono ? styles.mono : {}) }}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: 16, color: "#e7e7ea", background: "#0d0f14", minHeight: "100vh" },
  h1: { fontSize: 20, margin: "0 0 4px" },
  h2: { fontSize: 16, margin: "0 0 8px" },
  sub: { color: "#9aa0aa", marginTop: 0 },
  card: { background: "#161a22", border: "1px solid #232a36", borderRadius: 12, padding: 14, margin: "12px 0" },
  row: { display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0" },
  label: { color: "#9aa0aa" },
  value: { textAlign: "right", wordBreak: "break-all" },
  mono: { fontFamily: "ui-monospace, monospace", fontSize: 12 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" },
  pre: { whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#0d0f14", padding: 8, borderRadius: 8, fontSize: 12 },
  ul: { listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 6 },
  small: { marginLeft: 8, padding: "2px 8px", fontSize: 12 },
  muted: { color: "#7a808a", fontSize: 12 },
  error: { color: "#ff6b6b", background: "#2a1414", padding: 10, borderRadius: 8, margin: "12px 0" },
};

// keep freshParticipation referenced for tree-shaking safety in tooling
void freshParticipation;
