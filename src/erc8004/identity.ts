/** Reads the agent's persisted ERC-8004 identity (written by scripts/register-8004.ts). */
import fs from "node:fs";
import path from "node:path";

export interface AgentIdentity {
  chain: string;
  agentId: string;
  registryTx: string;
  identityRegistry: string;
  scanUrl: string;
}

export function loadIdentity(dataDir: string): AgentIdentity | null {
  const file = path.join(dataDir, "identity.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as AgentIdentity;
  } catch {
    return null;
  }
}
