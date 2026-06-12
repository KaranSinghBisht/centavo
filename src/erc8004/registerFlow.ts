/**
 * Idempotent ERC-8004 registration flow shared by scripts/register-8004.ts and
 * scripts/go-live.ts. Two-step: register with a content-addressed data: URI,
 * then setAgentURI with the registrations back-link (the agentId only exists
 * after the first tx). Persists data/identity.json.
 */
import fs from "node:fs";
import path from "node:path";

import type { CeloClients } from "../celo/client.js";
import type { ChainConfig } from "../chains.js";
import { buildAgentCard, toDataUri, type AgentCardInput } from "./agentCard.js";
import { loadIdentity, type AgentIdentity } from "./identity.js";
import { registerAgent, updateAgentURI } from "./registry.js";

export const AGENT_NAME = "Centavo";
export const AGENT_DESCRIPTION =
  "Centavo is a budget-capped autonomous payments steward on Celo. It runs everyday " +
  "micro-payments — family allowances, savings DCA, FX remittance corridors via Mento " +
  "(cUSD to KESm/COPm/EURm) — as real on-chain transactions under hard policy caps with " +
  "human-approved standing orders, pays for data via x402, and sells x402-paid FX quotes " +
  "to other agents.";

export function cardInputFor(
  cfg: ChainConfig,
  agentAddress: `0x${string}`,
  publicBaseUrl: string | undefined,
): AgentCardInput {
  if (!cfg.erc8004) throw new Error(`ERC-8004 registries are not configured for chain '${cfg.key}'`);
  return {
    name: AGENT_NAME,
    description: AGENT_DESCRIPTION,
    imageUrl: "https://raw.githubusercontent.com/KaranSinghBisht/centavo/main/docs/centavo.svg",
    publicBaseUrl: publicBaseUrl ?? "https://github.com/KaranSinghBisht/centavo",
    agentAddress,
    chainId: cfg.chain.id,
    identityRegistry: cfg.erc8004.identityRegistry,
  };
}

export interface RegisterFlowResult {
  identity: AgentIdentity;
  created: boolean;
}

export async function ensureRegistered(
  clients: CeloClients,
  cfg: ChainConfig,
  dataDir: string,
  publicBaseUrl: string | undefined,
): Promise<RegisterFlowResult> {
  if (!cfg.erc8004) throw new Error(`ERC-8004 registries are not configured for chain '${cfg.key}'`);
  const input = cardInputFor(cfg, clients.account.address, publicBaseUrl);
  const existing = loadIdentity(dataDir);
  if (existing && existing.chain === cfg.key) {
    const card = buildAgentCard({ ...input, agentId: BigInt(existing.agentId) });
    await updateAgentURI(clients, cfg.erc8004, BigInt(existing.agentId), toDataUri(card));
    return { identity: existing, created: false };
  }

  const { agentId, txHash } = await registerAgent(clients, cfg.erc8004, toDataUri(buildAgentCard(input)));
  await updateAgentURI(clients, cfg.erc8004, agentId, toDataUri(buildAgentCard({ ...input, agentId })));
  const identity: AgentIdentity = {
    chain: cfg.key,
    agentId: agentId.toString(),
    registryTx: txHash,
    identityRegistry: cfg.erc8004.identityRegistry,
    // 8004scan indexes mainnet; for testnets link the registration tx instead.
    scanUrl: cfg.isTestnet
      ? `${cfg.explorerBase}/tx/${txHash}`
      : `https://8004scan.io/agents/celo/${agentId.toString()}`,
  };
  const file = path.join(dataDir, "identity.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(identity, null, 2));
  return { identity, created: true };
}
