/**
 * x402 wiring via thirdweb (the hackathon's designated payment rail). Builds
 * the facilitator (server side: verify+settle) and a payer wallet (client
 * side: auto-pay 402 challenges). Entirely env-gated: without a thirdweb
 * secret key the agent still runs — paid endpoints just serve in free mode.
 */
import { createThirdwebClient, type ThirdwebClient } from "thirdweb";
import { celo, celoSepoliaTestnet } from "thirdweb/chains";
import { createWalletAdapter, privateKeyToAccount, type Wallet } from "thirdweb/wallets";
import { facilitator, wrapFetchWithPayment, type ThirdwebX402Facilitator } from "thirdweb/x402";

type ThirdwebChain = typeof celo;

export interface X402Setup {
  client: ThirdwebClient;
  chain: ThirdwebChain;
  facilitator: ThirdwebX402Facilitator;
  payerWallet: Wallet;
  /** Where our paid endpoint's revenue lands (the agent wallet). */
  payTo: `0x${string}`;
}

export interface X402Env {
  chainKey: string;
  agentPrivateKey: `0x${string}`;
  agentAddress: `0x${string}`;
  secretKey?: string;
  serverWalletAddress?: string;
}

export function buildX402(env: X402Env): X402Setup | null {
  if (!env.secretKey || !env.serverWalletAddress) return null;
  const client = createThirdwebClient({ secretKey: env.secretKey });
  const chain = env.chainKey === "celo" ? celo : celoSepoliaTestnet;
  const fac = facilitator({
    client,
    serverWalletAddress: env.serverWalletAddress,
    waitUntil: "confirmed",
  });
  const adaptedAccount = privateKeyToAccount({ client, privateKey: env.agentPrivateKey });
  const payerWallet = createWalletAdapter({
    client,
    adaptedAccount,
    chain,
    onDisconnect: () => undefined,
    switchChain: () => undefined,
  });
  return { client, chain, facilitator: fac, payerWallet, payTo: env.agentAddress };
}

/** fetch that automatically settles 402 challenges (cap in USDC base units). */
export function makePaidFetch(setup: X402Setup, maxValue = 50_000n): typeof globalThis.fetch {
  return wrapFetchWithPayment(globalThis.fetch, setup.client, setup.payerWallet, { maxValue });
}
