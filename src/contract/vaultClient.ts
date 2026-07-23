// On-chain bridge to the app's ParticipationVault smart contract via TVM SDK.
//
// REAL concepts (from dev.ackinacki.com "Add Acki Nacki to your backend" + SDK
// reference): the TVM SDK (@tvmsdk/core + lib-web) exposes modules `abi`, `net`,
// `processing`, `client`, `boc`, `crypto`. You encode an ABI message body with
// `abi.encode_message_body`, send it with `processing.send_message`, and query
// chain state with `net.query` (GraphQL) or `abi.run_get_method` for get-methods.
//
// ILLUSTRATIVE: the exact `@tvmsdk/core` import paths and function signatures
// below are scaffolded to match the documented module surface; pin them to the
// installed SDK's typings when you wire this against a live node. The
// ParticipationVault contract itself is in src/contract/ParticipationVault.sol
// and its ABI in src/abi/participation.abi.json.

import type { NetworkConfig } from "../bee/client";
import participationAbi from "../abi/participation.abi.json";

/** Canonical dApp-scoped address form on Acki Nacki: `<dapp>::<account>`. */
export type Address = string;

export interface VaultConfig {
  network: NetworkConfig;
  /** Deployed ParticipationVault contract address (dapp-scoped). */
  vaultAddress: Address;
}

export interface SessionRecord {
  miner: Address;
  day: string; // YYYY-MM-DD
  streakDays: number;
  boostX100: number; // boost * 100, integer
  weight: string; // u64 as string (exceeds 2^53)
}

/**
 * Submit a participation session to the on-chain vault. In a freemium Dapp the
 * gas is paid from the DappConfig credit limit (see DappConfig.sol), so the
 * user signs/authorizes but does not need SHELL.
 *
 * Flow: encode body -> ask the connected wallet to sign -> send external
 * message via a Block Manager endpoint -> poll for the transaction.
 */
export async function submitSession(
  cfg: VaultConfig,
  record: SessionRecord,
  signerWallet: unknown
): Promise<{ transactionId: string }> {
  // Pseudocode that mirrors the TVM SDK surface; replace with the real calls
  // from @tvmsdk/core once wired to a node.
  //
  // const { abi } = await import("@tvmsdk/core");
  // const body = await abi.encode_message_body({
  //   abi: { type: "Contract", value: participationAbi },
  //   signer: signerWallet,
  //   is_internal: false,
  //   call_method: "submitSession",
  //   params: { ...record },
  //   ...,
  // });
  // const { processing } = await import("@tvmsdk/core");
  // const sent = await processing.send_message({
  //   message: body.message,
  //   send_events: false,
  //   abi: { type: "Contract", value: participationAbi },
  // });
  // return { transactionId: sent.transaction_id };
  await Promise.resolve();
  void participationAbi; void signerWallet;
  return { transactionId: `sim-tx-${record.miner}-${record.day}-${record.boostX100}` };
}

/** Read a miner's aggregate participation from the vault via a get-method. */
export async function getMinerStats(
  cfg: VaultConfig,
  miner: Address
): Promise<{ streakDays: number; totalWeight: string; lastDay: string }> {
  // const { abi } = await import("@tvmsdk/core");
  // const out = await abi.run_get_method({
  //   address: cfg.vaultAddress,
  //   method: "getMinerStats",
  //   params: { miner },
  //   ...,
  // });
  await Promise.resolve();
  void cfg;
  return { streakDays: 0, totalWeight: "0", lastDay: "" };
}

/** GraphQL helper for richer event/log queries (real: net.query). */
export async function queryChain<T>(cfg: VaultConfig, query: string, variables?: Record<string, unknown>): Promise<T> {
  // const { net } = await import("@tvmsdk/core");
  // return net.query({ query, variables }) as Promise<T>;
  await Promise.resolve();
  void cfg; void query; void variables;
  return [] as unknown as T;
}
