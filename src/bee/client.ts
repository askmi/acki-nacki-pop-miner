// Bee Engine client bootstrap.
//
// What is REAL here (from the official docs / npm README of @teamgosh/bee-sdk):
//   - `init({ module_or_path })` must run once before anything else (WASM).
//   - `new Wallet(endpoints, archiveEndpoints, beeInfraBackend, appId)`.
//   - `new BeeConnect()` + `create_shared_key_session(appId, ttlSeconds, payload)`
//     returns a session object exposing `deep_link`, followed by
//     `wait_wallet_hello(...)` to complete the round trip with the AN Wallet app.
//   - `get_miner_address_by_wallet_name({ client_config, wallet_name })` resolves
//     the miner (Mobile Verifier) address tied to a wallet.
//   - Currency IDs on Acki Nacki: 1 = NACKL, 2 = SHELL, 3 = USDC.
//
// What is ILLUSTRATIVE: the exact field names of the session object beyond
// `deep_link`, and the small convenience wrappers. The Bee Engine SDK
// "Integration Documentation" page is marked "under development" upstream, so
// treat this module as a typed scaffold that follows the documented concept.

import initBeeSdk, {
  Wallet,
  BeeConnect,
  get_miner_address_by_wallet_name,
} from "@teamgosh/bee-sdk";
// Vite emits the .wasm as a static asset URL.
import wasmUrl from "@teamgosh/bee-sdk/bee_sdk_bg.wasm?url";

/** Acki Nacki public endpoints. Shellnet = testnet, mainnet = production. */
export type NetworkName = "shellnet" | "mainnet";

export interface NetworkConfig {
  name: NetworkName;
  endpoints: string[];
  beeInfraBackend: string;
}

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  shellnet: {
    name: "shellnet",
    endpoints: ["https://shellnet.ackinacki.org"],
    beeInfraBackend: "https://app-backend.ackinacki.org/api",
  },
  mainnet: {
    name: "mainnet",
    endpoints: ["https://mainnet.ackinacki.org"],
    beeInfraBackend: "https://app-backend.ackinacki.org/api",
  },
};

/**
 * App ID identifies this Dapp in wallet-connect sessions. In a real deploy you
 * register an app with the Bee infra backend and get a 32-byte hex id. The
 * zero id is the documented placeholder used in the SDK examples.
 */
export const APP_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Currency ids on Acki Nacki (from bee-sdk README). */
export const CURRENCY = { NACKL: "1", SHELL: "2", USDC: "3" } as const;

let booted = false;

/** Initialize the Bee SDK WebAssembly module exactly once. Idempotent. */
export async function bootBeeSdk(): Promise<void> {
  if (booted) return;
  await initBeeSdk({ module_or_path: wasmUrl });
  booted = true;
}

/** A wallet-connect session created by BeeConnect. */
export interface ConnectSession {
  /** Deep link / QR payload to present to the AN Wallet app. */
  deep_link: string;
  /** Opaque handle used to await the wallet's hello response. */
  handle: unknown;
}

/**
 * Start a wallet-connect handshake. Present `deep_link` as a QR code or button
 * to the user; they scan it in AN Wallet, approve, and `waitWalletHello`
 * resolves with the wallet name/address. This is the "Wallet Authentication"
 * step from the official "Connecting an AN Wallet and Setting Up Mining Keys"
 * guide — no private keys or seed phrases leave the wallet.
 */
export async function startWalletConnect(
  network: NetworkConfig,
  ttlSeconds = 300
): Promise<ConnectSession> {
  await bootBeeSdk();
  const connect = new BeeConnect();
  // create_shared_key_session(appId, ttl, payload)
  const session = connect.create_shared_key_session(APP_ID, ttlSeconds, null);
  return { deep_link: session.deep_link, handle: session };
}

export interface WalletIdentity {
  walletName: string;
  walletAddress: string;
}

/**
 * Resolve the Mobile Verifier (miner) address bound to a connected wallet.
 * This is the address that receives NACKL mining rewards. It is separate from
 * the wallet's spending address — the app only learns the miner address, never
 * the wallet's private keys.
 */
export async function resolveMinerAddress(
  network: NetworkConfig,
  walletName: string
): Promise<string> {
  await bootBeeSdk();
  const res = await get_miner_address_by_wallet_name({
    client_config: { network: { endpoints: network.endpoints } },
    wallet_name: walletName,
  });
  // bee-sdk returns the miner address; surface it as a string.
  return String((res as { miner_address?: string; address?: string }).miner_address ??
    (res as { address?: string }).address ??
    res);
}

/**
 * Build a high-level Wallet client. Used for read queries (balances) and as the
 * bridge to the on-chain ParticipationVault contract. Only constructed after a
 * successful wallet-connect so we never hold wallet secrets without consent.
 */
export function makeWalletClient(network: NetworkConfig): Wallet {
  return new Wallet(network.endpoints, null, network.beeInfraBackend, APP_ID);
}

export { bootBeeSdk as ensureBooted };
