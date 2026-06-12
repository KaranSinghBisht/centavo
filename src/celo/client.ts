/**
 * viem clients for Celo. The chain definitions from viem/chains carry the Celo
 * formatters (fee currency etc.), so standard EVM tooling works unchanged.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { ChainConfig } from "../chains.js";

export interface CeloClients {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, Account>;
  account: Account;
}

export function makeClients(cfg: ChainConfig, privateKey: `0x${string}`, rpcOverride?: string): CeloClients {
  const transport = http(rpcOverride ?? cfg.rpcDefault);
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: cfg.chain, transport }) as PublicClient;
  const walletClient = createWalletClient({ account, chain: cfg.chain, transport });
  return { publicClient, walletClient, account };
}
