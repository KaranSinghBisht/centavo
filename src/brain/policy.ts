/**
 * The off-chain policy gate, ported from Steward and extended for Celo:
 * multi-token spends (mixed decimals normalized to 18) and Mento swaps.
 * `preApproved` models a standing order's envelope — a human approved the
 * order once, so executions inside the caps run without a per-tx gate.
 * Pure + unit-tested.
 */
import type { ProposedAction } from "./types.js";

export interface TokenMeta {
  symbol: string;
  decimals: number;
}

export interface Policy {
  /** Spendable tokens: lowercased address -> meta. */
  tokens: Record<string, TokenMeta>;
  /** Lowercased token addresses the agent may receive via swaps (tokenOut). */
  receiveTokens: Set<string>;
  /** Per-transaction cap, normalized 18-dec units. */
  maxPerTx: bigint;
  /** Rolling daily cap, normalized 18-dec units. */
  maxPerDay: bigint;
  /** Lowercased addresses the agent is allowed to pay. */
  allowedTargets: Set<string>;
  /** Standing-order envelope: a human pre-approved repeats inside the caps. */
  preApproved: boolean;
}

export interface PolicyVerdict {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
}

function block(reason: string): PolicyVerdict {
  return { allowed: false, requiresApproval: false, reason };
}

/** Scale an amount in `decimals` base units to normalized 18-dec units. */
export function normalize(amount: bigint, decimals: number): bigint {
  if (decimals > 18) throw new Error(`unsupported decimals ${decimals}`);
  return amount * 10n ** BigInt(18 - decimals);
}

function parseAmount(raw: string | undefined): bigint | null {
  if (!raw) return null;
  try {
    const v = BigInt(raw);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Normalized 18-dec spend an action represents (0 for plain calls). */
export function spendOf(action: ProposedAction, policy: Policy): bigint {
  const spendToken = action.kind === "swap" ? action.tokenIn : action.token;
  const raw = action.kind === "swap" ? action.amountIn : action.amount;
  const meta = spendToken ? policy.tokens[spendToken.toLowerCase()] : undefined;
  const amount = parseAmount(raw);
  if (!meta || amount === null) return 0n;
  return normalize(amount, meta.decimals);
}

export function checkPolicy(
  action: ProposedAction,
  policy: Policy,
  spentToday: bigint,
): PolicyVerdict {
  if (action.kind === "call") {
    if (!action.to || !policy.allowedTargets.has(action.to.toLowerCase())) {
      return block(`call target ${action.to ?? "(none)"} is not on the allowed list`);
    }
    return { allowed: true, requiresApproval: true, reason: "arbitrary call requires human approval" };
  }

  const spendToken = action.kind === "swap" ? action.tokenIn : action.token;
  const meta = spendToken ? policy.tokens[spendToken.toLowerCase()] : undefined;
  if (!spendToken || !meta) {
    return block(`token ${spendToken ?? "(none)"} is not a spendable policy token`);
  }

  if (action.kind === "transfer") {
    if (!action.to || !policy.allowedTargets.has(action.to.toLowerCase())) {
      return block(`target ${action.to ?? "(none)"} is not on the allowed list`);
    }
  } else if (!action.tokenOut || !policy.receiveTokens.has(action.tokenOut.toLowerCase())) {
    return block(`swap output token ${action.tokenOut ?? "(none)"} is not on the receivable list`);
  }

  const amount = parseAmount(action.kind === "swap" ? action.amountIn : action.amount);
  if (amount === null) {
    return block("amount must be a positive integer in base units");
  }

  const spend = normalize(amount, meta.decimals);
  if (spend > policy.maxPerTx) {
    return block(`amount exceeds the per-transaction cap (${policy.maxPerTx} normalized)`);
  }
  if (spentToday + spend > policy.maxPerDay) {
    return block(`amount would exceed the daily cap (${policy.maxPerDay} normalized)`);
  }
  return policy.preApproved
    ? { allowed: true, requiresApproval: false, reason: "within the pre-approved standing-order envelope" }
    : { allowed: true, requiresApproval: true, reason: "spend within budget; human approval required" };
}
