/**
 * Celo chain configuration. viem ships the Celo chains (incl. the L2 fee-currency
 * formatters), so the plumbing is an import — not a rewrite.
 *
 * Every address below is sourced from the official Celopedia contract registry
 * (docs.celo.org/tooling/contracts) and the ERC-8004 deployment table, and the
 * registries were re-verified against Blockscout's verified-contract API
 * (see docs/erc8004-*.abi.json). Do not add guessed addresses.
 */
import type { Chain } from "viem";
import { celo, celoSepolia } from "viem/chains";

export interface TokenInfo {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  /** May the agent spend this token (transfers / swap input)? */
  spendable: boolean;
}

export interface Erc8004Config {
  identityRegistry: `0x${string}`;
  reputationRegistry: `0x${string}`;
}

export interface MentoConfig {
  broker: `0x${string}`;
  biPoolManager: `0x${string}`;
}

export interface ChainConfig {
  key: string;
  chain: Chain;
  rpcDefault: string;
  explorerBase: string;
  isTestnet: boolean;
  tokens: Record<string, TokenInfo>;
  erc8004: Erc8004Config | null;
  mento: MentoConfig | null;
}

function token(
  address: `0x${string}`,
  symbol: string,
  decimals: number,
  spendable = false,
): TokenInfo {
  return { address, symbol, decimals, spendable };
}

export const CHAINS: Record<string, ChainConfig> = {
  celo: {
    key: "celo",
    chain: celo,
    rpcDefault: "https://forno.celo.org",
    explorerBase: "https://celoscan.io",
    isTestnet: false,
    tokens: {
      CELO: token("0x471EcE3750Da237f93B8E339c536989b8978a438", "CELO", 18, true),
      cUSD: token("0x765DE816845861e75A25fCA122bb6898B8B1282a", "cUSD", 18, true),
      USDC: token("0xcebA9300f2b948710d2653dD7B07f33A8B32118C", "USDC", 6, true),
      // Mento local stablecoins — the FX corridors Centavo can hold/deliver.
      EURm: token("0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73", "EURm", 18),
      BRLm: token("0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787", "BRLm", 18),
      KESm: token("0x456a3D042C0DbD3db53D5489e98dFb038553B0d0", "KESm", 18),
      COPm: token("0x8A567e2aE79CA692Bd748aB832081C45de4041eA", "COPm", 18),
      GHSm: token("0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313", "GHSm", 18),
      PHPm: token("0x105d4A9306D2E55a71d2Eb95B81553AE1dC20d7B", "PHPm", 18),
    },
    erc8004: {
      identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    },
    mento: {
      broker: "0x777A8255cA72412f0d706dc03C9D1987306B4CaD",
      biPoolManager: "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901",
    },
  },
  celoSepolia: {
    key: "celoSepolia",
    chain: celoSepolia,
    rpcDefault: "https://forno.celo-sepolia.celo-testnet.org",
    explorerBase: "https://celo-sepolia.blockscout.com",
    isTestnet: true,
    tokens: {
      CELO: token("0x471EcE3750Da237f93B8E339c536989b8978a438", "CELO", 18, true),
      cUSD: token("0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80", "cUSD", 18, true),
      USDC: token("0x01C5C0122039549AD1493B8220cABEdD739BC44E", "USDC", 6, true),
      KESm: token("0xC7e4635651E3e3Af82b61d3E23c159438daE3BbF", "KESm", 18),
    },
    erc8004: null,
    mento: null,
  },
};

export function resolveChain(name: string): ChainConfig {
  const cfg = CHAINS[name];
  if (!cfg) {
    throw new Error(`Unknown chain '${name}'. Options: ${Object.keys(CHAINS).join(", ")}`);
  }
  return cfg;
}

export function explorerTxUrl(cfg: ChainConfig, hash: string): string {
  return `${cfg.explorerBase}/tx/${hash}`;
}

export function tokenByAddress(cfg: ChainConfig, address: string): TokenInfo | undefined {
  const lower = address.toLowerCase();
  return Object.values(cfg.tokens).find((t) => t.address.toLowerCase() === lower);
}
