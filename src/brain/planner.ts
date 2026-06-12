/**
 * Centavo planner loop, ported from the proven Steward core. Stateless w.r.t. a
 * run (all state in RunState), so runs pause at the approval gate and resume
 * later. The LLM reasons; the policy gate bounds every action; an injected
 * Executor performs the on-chain work on Celo.
 */
import { randomUUID } from "node:crypto";

import type { Reasoner } from "./reasoner.js";
import { checkPolicy, spendOf, type Policy } from "./policy.js";
import type { ExecutionResult, ProposedAction, RunState } from "./types.js";

export interface Executor {
  execute(action: ProposedAction): Promise<ExecutionResult>;
}

type Decision =
  | { kind: "propose"; action: ProposedAction }
  | { kind: "final"; output: string };

const SYSTEM = `You are Centavo, an autonomous payments steward on Celo. You run small real-world
payment tasks — allowances, savings sweeps, FX conversions, service payments — in stablecoins, and
you can ONLY act inside a cryptographic budget policy.
Reply with a SINGLE JSON object and nothing else, one of:
  {"action":"propose","proposal":{"kind":"transfer","to":"0x..","token":"0x..","amount":"<base units>","reason":"why"}}
  {"action":"propose","proposal":{"kind":"swap","tokenIn":"0x..","tokenOut":"0x..","amountIn":"<base units>","reason":"why"}}
  {"action":"final","output":"<summary for the user>"}
Rules: act ONE step at a time and use each execution result to choose the next step; never invent
addresses, tokens or amounts — use only values given in the task context; amounts are integer base
units (cUSD/CELO have 18 decimals, USDC has 6); if the goal is already met, impossible, or unsafe,
return action "final" and say why.`;

export function parseDecision(text: string): Decision {
  let raw = text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`invalid JSON: ${(err as Error).message}`);
  }
  if (obj.action === "final") {
    return { kind: "final", output: String(obj.output ?? "") };
  }
  if (obj.action === "propose") {
    const p = (obj.proposal ?? {}) as Record<string, unknown>;
    const kind = p.kind as ProposedAction["kind"];
    if (kind !== "transfer" && kind !== "swap" && kind !== "call") {
      throw new Error("proposal.kind must be transfer | swap | call");
    }
    return {
      kind: "propose",
      action: {
        kind,
        to: p.to as `0x${string}` | undefined,
        token: p.token as `0x${string}` | undefined,
        amount: p.amount === undefined ? undefined : String(p.amount),
        tokenIn: p.tokenIn as `0x${string}` | undefined,
        tokenOut: p.tokenOut as `0x${string}` | undefined,
        amountIn: p.amountIn === undefined ? undefined : String(p.amountIn),
        data: p.data as `0x${string}` | undefined,
        reason: String(p.reason ?? ""),
      },
    };
  }
  throw new Error("unknown or missing 'action'");
}

export class Centavo {
  constructor(
    private readonly reasoner: Reasoner,
    private readonly policy: Policy,
    private readonly executor: Executor,
    private readonly maxSteps = 8,
  ) {}

  start(goal: string): RunState {
    const state: RunState = {
      id: randomUUID(),
      goal,
      status: "running",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: goal },
      ],
      audit: [],
      pending: null,
      spentToday: "0",
      result: null,
      error: null,
      stepsUsed: 0,
    };
    this.record(state, "start", { goal });
    return state;
  }

  async resume(state: RunState): Promise<RunState> {
    while (state.status === "running" && state.stepsUsed < this.maxSteps) {
      state.stepsUsed += 1;
      const keepGoing = await this.tick(state);
      if (!keepGoing) return state;
    }
    if (state.status === "running") {
      state.status = "failed";
      state.error = "max steps reached without completion";
    }
    return state;
  }

  async approve(state: RunState, approved: boolean, note = ""): Promise<RunState> {
    if (state.status !== "awaiting_approval" || !state.pending) return state;
    const { action } = state.pending;
    state.pending = null;
    state.status = "running";
    if (approved) {
      this.record(state, "approval_granted", { note });
      await this.run(state, action);
    } else {
      this.record(state, "approval_rejected", { note });
      state.messages.push({
        role: "user",
        content: `A human REJECTED the action. Note: ${note || "none"}. Choose another approach or finalize.`,
      });
    }
    return this.resume(state);
  }

  private async tick(state: RunState): Promise<boolean> {
    let text: string;
    try {
      text = await this.reasoner.complete(state.messages);
    } catch (err) {
      state.status = "failed";
      state.error = (err as Error).message;
      this.record(state, "reasoner_error", { error: state.error });
      return false;
    }
    state.messages.push({ role: "assistant", content: text });

    let decision: Decision;
    try {
      decision = parseDecision(text);
    } catch (err) {
      this.record(state, "parse_error", { error: (err as Error).message });
      state.messages.push({ role: "user", content: "Invalid reply. Respond with ONLY the required JSON object." });
      return true;
    }

    if (decision.kind === "final") {
      state.result = decision.output;
      state.status = "done";
      this.record(state, "final", { output: decision.output });
      return false;
    }
    return this.consider(state, decision.action);
  }

  private async consider(state: RunState, action: ProposedAction): Promise<boolean> {
    const verdict = checkPolicy(action, this.policy, BigInt(state.spentToday));
    if (!verdict.allowed) {
      this.record(state, "policy_block", { reason: verdict.reason, action });
      state.messages.push({
        role: "user",
        content: `Policy blocked that action: ${verdict.reason}. Propose something within budget or finalize.`,
      });
      return true;
    }
    if (verdict.requiresApproval) {
      state.pending = { id: randomUUID(), action, policyReason: verdict.reason };
      state.status = "awaiting_approval";
      this.record(state, "approval_requested", { action, reason: verdict.reason });
      return false;
    }
    await this.run(state, action);
    return true;
  }

  private async run(state: RunState, action: ProposedAction): Promise<void> {
    const result = await this.executor.execute(action);
    this.record(state, "executed", {
      ok: result.ok,
      txHash: result.txHash,
      detail: result.detail,
      error: result.error,
      action,
    });
    if (result.ok) {
      state.spentToday = (BigInt(state.spentToday) + spendOf(action, this.policy)).toString();
    }
    const observation = result.ok
      ? `executed (tx ${result.txHash ?? "n/a"}${result.detail ? `, ${result.detail}` : ""})`
      : `FAILED: ${result.error}`;
    state.messages.push({ role: "user", content: `Execution result: ${observation}` });
  }

  private record(state: RunState, kind: string, data: Record<string, unknown>): void {
    state.audit.push({ ts: Date.now(), kind, data });
  }
}
