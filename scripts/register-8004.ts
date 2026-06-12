/**
 * Registers Centavo on the ERC-8004 IdentityRegistry (idempotent — re-running
 * refreshes the agentURI). Prints the 8004scan link for the registration tweet.
 */
import { makeClients } from "../src/celo/client.js";
import { resolveChain } from "../src/chains.js";
import { config } from "../src/config.js";
import { ensureRegistered } from "../src/erc8004/registerFlow.js";
import { logInfo } from "../src/log.js";

const cfg = resolveChain(config.chainName);
const clients = makeClients(cfg, config.agentPrivateKey(), config.rpcUrlOverride());
const { identity, created } = await ensureRegistered(clients, cfg, config.dataDir, config.publicBaseUrl());
logInfo(created ? "registered" : "already registered — agentURI refreshed", {
  agentId: identity.agentId,
  registryTx: identity.registryTx,
  scanUrl: identity.scanUrl,
});
