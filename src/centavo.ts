/**
 * Composition root: wires chain config, viem clients, the Celo executor, the
 * policy gate, the LLM brain, and the orders/ledger/audit state into one
 * runtime object the scripts and server share.
 */
import path from "node:path";

import { erc20Abi, formatUnits } from "viem";

import { Centavo, type Executor } from "./brain/planner.js";
import { DryRunExecutor } from "./brain/dryRunExecutor.js";
import type { Policy } from "./brain/policy.js";
import { VeniceReasoner, type Reasoner } from "./brain/reasoner.js";
import type { RunState } from "./brain/types.js";
import { makeClients, type CeloClients } from "./celo/client.js";
import { CeloExecutor, type SwapVenue } from "./celo/executor.js";
import { MentoVenue } from "./celo/mento.js";
import { resolveChain, type ChainConfig } from "./chains.js";
import { config } from "./config.js";
import { loadIdentity } from "./erc8004/identity.js";
import { giveFeedback } from "./erc8004/registry.js";
import { AuditLog } from "./orders/audit.js";
import { SpendLedger } from "./orders/ledger.js";
import type { OrderRunner } from "./orders/scheduler.js";
import { buildSeedOrders } from "./orders/seeds.js";
import { OrderStore } from "./orders/store.js";
import type { OrderRunSummary, StandingOrder } from "./orders/types.js";

/** Normalized 18-dec caps: ≈ $0.50 per tx, ≈ $10 per day across all orders. */
const MAX_PER_TX = 5n * 10n ** 17n;
const MAX_PER_DAY = 10n * 10n ** 18n;

export interface AgentRun {
  agent: Centavo;
  state: RunState;
}

export interface Runtime {
  cfg: ChainConfig;
  clients: CeloClients | null;
  venue: SwapVenue | undefined;
  store: OrderStore;
  ledger: SpendLedger;
  audit: AuditLog;
  runner: OrderRunner;
  /** Start an ad-hoc goal (dashboard chat) with a human approval gate. */
  startGoal(goal: string, recipients: `0x${string}`[]): Promise<AgentRun>;
  agentAddress: `0x${string}` | null;
}

export interface RuntimeOptions {
  dryRun?: boolean;
  makeSwapVenue?: (clients: CeloClients, cfg: ChainConfig) => SwapVenue;
}

function buildPolicy(cfg: ChainConfig, targets: `0x${string}`[], preApproved: boolean): Policy {
  const tokens: Policy["tokens"] = {};
  const receiveTokens = new Set<string>();
  for (const t of Object.values(cfg.tokens)) {
    if (t.spendable) tokens[t.address.toLowerCase()] = { symbol: t.symbol, decimals: t.decimals };
    receiveTokens.add(t.address.toLowerCase());
  }
  return {
    tokens,
    receiveTokens,
    maxPerTx: MAX_PER_TX,
    maxPerDay: MAX_PER_DAY,
    allowedTargets: new Set(targets.map((t) => t.toLowerCase())),
    preApproved,
  };
}

export async function describeBalances(clients: CeloClients, cfg: ChainConfig): Promise<string[]> {
  const lines: string[] = [];
  const native = await clients.publicClient.getBalance({ address: clients.account.address });
  lines.push(`gas balance (native CELO): ${formatUnits(native, 18)}`);
  for (const t of Object.values(cfg.tokens)) {
    try {
      const raw = await clients.publicClient.readContract({
        address: t.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [clients.account.address],
      });
      lines.push(
        `${t.symbol}: ${formatUnits(raw, t.decimals)} (= ${raw.toString()} base units, address ${t.address}, ${t.decimals} decimals)`,
      );
    } catch {
      lines.push(`${t.symbol}: balance unavailable (address ${t.address})`);
    }
  }
  return lines;
}

function buildGoal(
  order: StandingOrder,
  cfg: ChainConfig,
  agentAddress: string,
  balances: string[],
  spentToday: bigint,
): string {
  const recipients =
    order.recipients.length > 0
      ? order.recipients.map((r) => `${r.label} => ${r.address}`).join("; ")
      : "(none — transfers are not available for this order)";
  return [
    `Standing order: ${order.instruction}`,
    "",
    "Live context:",
    `- chain: ${cfg.key} (chainId ${cfg.chain.id})`,
    `- agent wallet: ${agentAddress}`,
    ...balances.map((b) => `- ${b}`),
    `- recipients you may pay (ONLY these): ${recipients}`,
    `- policy: per-tx cap ${formatUnits(MAX_PER_TX, 18)}, daily cap ${formatUnits(MAX_PER_DAY, 18)} (normalized $); spent today ${formatUnits(spentToday, 18)}`,
    "Execute the order now, one action per step. If nothing is due or possible, finalize with the reason.",
  ].join("\n");
}

function harvest(state: RunState): { txHashes: string[]; summary: string } {
  const txHashes = state.audit
    .filter((e) => e.kind === "executed" && e.data.ok === true && typeof e.data.txHash === "string")
    .map((e) => e.data.txHash as string)
    .filter((h) => !h.startsWith(`0x${"0".repeat(64)}`.slice(0, 10)) || h !== `0x${"0".repeat(64)}`);
  const summary = state.result ?? state.error ?? "no summary";
  return { txHashes, summary };
}

/**
 * After a delivered order, the counterparty (family/client wallet — a separate
 * key) records ERC-8004 reputation feedback for the agent. Failures are logged
 * to the audit trail but never fail the order run.
 */
async function sendClientFeedback(
  cfg: ChainConfig,
  order: StandingOrder,
  audit: AuditLog,
): Promise<void> {
  const clientKey = config.familyWalletKey();
  const identity = loadIdentity(config.dataDir);
  if (!clientKey || !identity || !cfg.erc8004 || identity.chain !== cfg.key) return;
  try {
    const clientWallet = makeClients(cfg, clientKey, config.rpcUrlOverride());
    const txHash = await giveFeedback(clientWallet, cfg.erc8004, {
      agentId: BigInt(identity.agentId),
      value: 97,
      tag1: "starred",
      tag2: order.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32),
      endpoint: "standing-order",
    });
    audit.append({ ts: Date.now(), kind: "reputation_feedback", orderId: order.id, txHash });
  } catch (err) {
    audit.append({
      ts: Date.now(),
      kind: "reputation_feedback_failed",
      orderId: order.id,
      error: (err as Error).message.slice(0, 200),
    });
  }
}

export function buildRuntime(opts: RuntimeOptions = {}): Runtime {
  const cfg = resolveChain(config.chainName);
  const dataDir = config.dataDir;
  const store = new OrderStore(path.join(dataDir, "orders.json"));
  const ledger = new SpendLedger(path.join(dataDir, "ledger.json"));
  const audit = new AuditLog(path.join(dataDir, "audit.jsonl"));
  const reasoner: Reasoner = new VeniceReasoner();

  const dryRun = opts.dryRun ?? false;
  const clients = dryRun ? null : makeClients(cfg, config.agentPrivateKey(), config.rpcUrlOverride());
  const venue = clients
    ? opts.makeSwapVenue
      ? opts.makeSwapVenue(clients, cfg)
      : cfg.mento
        ? new MentoVenue(clients, cfg.chain.id, config.rpcUrlOverride() ?? cfg.rpcDefault)
        : undefined
    : undefined;
  const executor: Executor = clients ? new CeloExecutor(clients, venue) : new DryRunExecutor();
  const agentAddress = clients ? clients.account.address : null;

  const familyWallet = process.env.FAMILY_WALLET as `0x${string}` | undefined;
  store.seedIfEmpty(buildSeedOrders(familyWallet));

  const runner: OrderRunner = {
    async run(order: StandingOrder): Promise<OrderRunSummary> {
      const spentBefore = ledger.spentToday();
      const policy = buildPolicy(cfg, order.recipients.map((r) => r.address), true);
      const balances = clients ? await describeBalances(clients, cfg) : ["(dry run — no chain access)"];
      const goal = buildGoal(order, cfg, agentAddress ?? "(dry run)", balances, spentBefore);
      const agent = new Centavo(reasoner, policy, executor);
      const state = agent.start(goal);
      state.spentToday = spentBefore.toString();
      await agent.resume(state);
      // Auto-runs never block on approval: anything outside the envelope is rejected.
      if (state.status === "awaiting_approval") {
        await agent.approve(state, false, "scheduler runs cannot exceed the pre-approved envelope");
      }
      ledger.add(BigInt(state.spentToday) - spentBefore);
      const { txHashes, summary } = harvest(state);
      const run: OrderRunSummary = { ts: Date.now(), ok: state.status === "done", summary, txHashes };
      audit.append({ kind: "order_run", orderId: order.id, title: order.title, ...run });
      if (run.ok && txHashes.length > 0) await sendClientFeedback(cfg, order, audit);
      return run;
    },
  };

  return {
    cfg,
    clients,
    venue,
    store,
    ledger,
    audit,
    runner,
    agentAddress,
    async startGoal(goal: string, recipients: `0x${string}`[]): Promise<AgentRun> {
      const policy = buildPolicy(cfg, recipients, false);
      const agent = new Centavo(reasoner, policy, executor);
      const balances = clients ? await describeBalances(clients, cfg) : ["(dry run — no chain access)"];
      const fullGoal = [
        goal,
        "",
        "Live context:",
        `- chain: ${cfg.key} (chainId ${cfg.chain.id})`,
        `- agent wallet: ${agentAddress ?? "(dry run)"}`,
        ...balances.map((b) => `- ${b}`),
      ].join("\n");
      const state = agent.start(fullGoal);
      state.spentToday = ledger.spentToday().toString();
      await agent.resume(state);
      return { agent, state };
    },
  };
}
