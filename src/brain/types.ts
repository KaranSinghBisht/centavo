/**
 * Core agent types, ported from the proven Steward core. An action is an
 * on-chain *intent* the agent wants to take; the policy gate and executor
 * decide whether and how it happens.
 */
import type { ChatMessage } from "./reasoner.js";

export type RunStatus = "running" | "awaiting_approval" | "done" | "failed";

export interface ProposedAction {
  kind: "transfer" | "swap" | "call";
  /** Transfer/call target. */
  to?: `0x${string}`;
  /** ERC-20 token for a transfer. */
  token?: `0x${string}`;
  /** Transfer amount, integer base units. */
  amount?: string;
  /** Swap input token. */
  tokenIn?: `0x${string}`;
  /** Swap output token. */
  tokenOut?: `0x${string}`;
  /** Swap input amount, integer base units. */
  amountIn?: string;
  /** Calldata for a `call`. */
  data?: `0x${string}`;
  /** The agent's justification — surfaced at the approval gate and in the audit log. */
  reason: string;
}

export interface ApprovalRequest {
  id: string;
  action: ProposedAction;
  policyReason: string;
}

export interface AgentEvent {
  ts: number;
  kind: string;
  data: Record<string, unknown>;
}

export interface ExecutionResult {
  ok: boolean;
  txHash?: `0x${string}`;
  detail?: string;
  error?: string;
}

export interface RunState {
  id: string;
  goal: string;
  status: RunStatus;
  messages: ChatMessage[];
  audit: AgentEvent[];
  pending: ApprovalRequest | null;
  /** Normalized (18-dec) units spent so far in this run, for the daily-cap check. */
  spentToday: string;
  result: string | null;
  error: string | null;
  stepsUsed: number;
}
