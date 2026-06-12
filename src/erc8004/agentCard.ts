/**
 * ERC-8004 registration metadata ("agent card") builder. Follows the current
 * spec shape exactly — `type` is the versioned registration URI, `services`
 * (not `endpoints`) with `endpoint` keys, content-addressed URI — because
 * 8004scan validates all of this and warnings lower the agent's score.
 * ValidationRegistry is not deployed on Celo, so supportedTrust is
 * reputation-only.
 */

export interface AgentCardInput {
  name: string;
  description: string;
  imageUrl: string;
  /** Public https base (no trailing slash) for web/A2A/x402 endpoints. */
  publicBaseUrl: string;
  agentAddress: `0x${string}`;
  chainId: number;
  identityRegistry: `0x${string}`;
  /** Known after first registration; adds the registrations back-link. */
  agentId?: bigint;
}

export function buildAgentCard(input: AgentCardInput): Record<string, unknown> {
  const card: Record<string, unknown> = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: input.name,
    description: input.description,
    image: input.imageUrl,
    services: [
      { name: "web", endpoint: input.publicBaseUrl },
      {
        name: "A2A",
        endpoint: `${input.publicBaseUrl}/.well-known/agent-card.json`,
        version: "0.3.0",
        a2aSkills: ["finance/payments/stablecoin", "finance/payments/cross-border"],
      },
      { name: "agentWallet", endpoint: `eip155:${input.chainId}:${input.agentAddress}` },
    ],
    active: true,
    x402Support: true,
    supportedTrust: ["reputation"],
    updatedAt: Math.floor(Date.now() / 1000),
  };
  if (input.agentId !== undefined) {
    card.registrations = [
      {
        agentId: Number(input.agentId),
        agentRegistry: `eip155:${input.chainId}:${input.identityRegistry}`,
      },
    ];
  }
  return card;
}

/** Content-addressed on-chain URI — no IPFS pinning dependency. */
export function toDataUri(card: Record<string, unknown>): string {
  const json = JSON.stringify(card);
  return `data:application/json;base64,${Buffer.from(json, "utf8").toString("base64")}`;
}
