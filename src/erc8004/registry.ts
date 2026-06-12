/**
 * ERC-8004 registry client: registers Centavo's on-chain identity (an ERC-721
 * agentId), updates its agentURI, and reads/writes reputation feedback.
 */
import { parseEventLogs } from "viem";

import type { Erc8004Config } from "../chains.js";
import type { CeloClients } from "../celo/client.js";
import { identityRegistryAbi, reputationRegistryAbi } from "./abi.js";

export interface RegistrationResult {
  agentId: bigint;
  txHash: `0x${string}`;
}

export async function registerAgent(
  clients: CeloClients,
  cfg: Erc8004Config,
  agentURI: string,
): Promise<RegistrationResult> {
  const txHash = await clients.walletClient.writeContract({
    address: cfg.identityRegistry,
    abi: identityRegistryAbi,
    functionName: "register",
    args: [agentURI],
  });
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`register() reverted (tx ${txHash})`);
  const logs = parseEventLogs({
    abi: identityRegistryAbi,
    eventName: "Registered",
    logs: receipt.logs,
  });
  const registered = logs[0];
  if (!registered) throw new Error(`register() succeeded but no Registered event found (tx ${txHash})`);
  return { agentId: registered.args.agentId, txHash };
}

export async function updateAgentURI(
  clients: CeloClients,
  cfg: Erc8004Config,
  agentId: bigint,
  newURI: string,
): Promise<`0x${string}`> {
  const txHash = await clients.walletClient.writeContract({
    address: cfg.identityRegistry,
    abi: identityRegistryAbi,
    functionName: "setAgentURI",
    args: [agentId, newURI],
  });
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`setAgentURI() reverted (tx ${txHash})`);
  return txHash;
}

export interface FeedbackInput {
  agentId: bigint;
  /** Score 0-100 (valueDecimals 0). */
  value: number;
  tag1: string;
  tag2?: string;
  endpoint?: string;
}

/** Submit reputation feedback — must be sent by a client wallet, never the agent owner. */
export async function giveFeedback(
  clients: CeloClients,
  cfg: Erc8004Config,
  input: FeedbackInput,
): Promise<`0x${string}`> {
  const txHash = await clients.walletClient.writeContract({
    address: cfg.reputationRegistry,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: [
      input.agentId,
      BigInt(Math.round(input.value)),
      0,
      input.tag1,
      input.tag2 ?? "",
      input.endpoint ?? "",
      "",
      `0x${"0".repeat(64)}`,
    ],
  });
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`giveFeedback() reverted (tx ${txHash})`);
  return txHash;
}

export interface ReputationSummary {
  count: bigint;
  summaryValue: bigint;
  summaryValueDecimals: number;
}

export async function getReputationSummary(
  clients: CeloClients,
  cfg: Erc8004Config,
  agentId: bigint,
): Promise<ReputationSummary> {
  const [count, summaryValue, summaryValueDecimals] = await clients.publicClient.readContract({
    address: cfg.reputationRegistry,
    abi: reputationRegistryAbi,
    functionName: "getSummary",
    args: [agentId, [], "", ""],
  });
  return { count, summaryValue, summaryValueDecimals };
}
