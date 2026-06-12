/**
 * Registers Centavo on the ERC-8004 IdentityRegistry (Celo) and stores the
 * agentId in data/identity.json. Two-step: register with a content-addressed
 * data: URI, then setAgentURI with the registrations back-link included
 * (the agentId only exists after the first tx). Idempotent — re-running
 * refreshes the URI instead of re-registering.
 */
import fs from "node:fs";
import path from "node:path";

import { makeClients } from "../src/celo/client.js";
import { resolveChain } from "../src/chains.js";
import { config } from "../src/config.js";
import { buildAgentCard, toDataUri, type AgentCardInput } from "../src/erc8004/agentCard.js";
import { registerAgent, updateAgentURI } from "../src/erc8004/registry.js";
import { logInfo } from "../src/log.js";

const AGENT_NAME = "Centavo";
const AGENT_DESCRIPTION =
  "Centavo is a budget-capped autonomous payments steward on Celo. It runs everyday " +
  "micro-payments — family allowances, savings DCA, FX remittance corridors via Mento " +
  "(cUSD to KESm/COPm/EURm) — as real on-chain transactions under hard policy caps with " +
  "human-approved standing orders, pays for data via x402, and sells x402-paid FX quotes " +
  "to other agents.";

interface IdentityFile {
  chain: string;
  agentId: string;
  registryTx: string;
  identityRegistry: string;
  scanUrl: string;
}

const cfg = resolveChain(config.chainName);
if (!cfg.erc8004) {
  throw new Error(`ERC-8004 registries are not configured for chain '${cfg.key}'`);
}
const clients = makeClients(cfg, config.agentPrivateKey(), config.rpcUrlOverride());
const identityPath = path.join(config.dataDir, "identity.json");

const cardInput: AgentCardInput = {
  name: AGENT_NAME,
  description: AGENT_DESCRIPTION,
  imageUrl: "https://raw.githubusercontent.com/KaranSinghBisht/centavo/main/docs/centavo.svg",
  publicBaseUrl: config.publicBaseUrl() ?? "https://github.com/KaranSinghBisht/centavo",
  agentAddress: clients.account.address,
  chainId: cfg.chain.id,
  identityRegistry: cfg.erc8004.identityRegistry,
};

if (fs.existsSync(identityPath)) {
  const existing = JSON.parse(fs.readFileSync(identityPath, "utf8")) as IdentityFile;
  logInfo("already registered — refreshing agentURI", { agentId: existing.agentId });
  const card = buildAgentCard({ ...cardInput, agentId: BigInt(existing.agentId) });
  const txHash = await updateAgentURI(clients, cfg.erc8004, BigInt(existing.agentId), toDataUri(card));
  logInfo("agentURI refreshed", { txHash, scanUrl: existing.scanUrl });
} else {
  logInfo("registering agent", { chain: cfg.key, agent: clients.account.address });
  const { agentId, txHash } = await registerAgent(clients, cfg.erc8004, toDataUri(buildAgentCard(cardInput)));
  logInfo("registered", { agentId: agentId.toString(), txHash });

  const withBacklink = buildAgentCard({ ...cardInput, agentId });
  const uriTx = await updateAgentURI(clients, cfg.erc8004, agentId, toDataUri(withBacklink));
  const identity: IdentityFile = {
    chain: cfg.key,
    agentId: agentId.toString(),
    registryTx: txHash,
    identityRegistry: cfg.erc8004.identityRegistry,
    scanUrl: `https://8004scan.io/agents/celo/${agentId.toString()}`,
  };
  fs.mkdirSync(path.dirname(identityPath), { recursive: true });
  fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2));
  logInfo("identity saved", { ...identity, backlinkTx: uriTx });
  logInfo("REGISTRATION TWEET LINK", { url: identity.scanUrl });
}
