/**
 * Centavo server: the human dashboard (orders, approvals, live on-chain feed),
 * the ERC-8004 agent card, our x402-paid FX quote endpoint, and the integrated
 * scheduler loop — one process runs the whole agent.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { erc20Abi, formatUnits } from "viem";

import { buildRuntime } from "./centavo.js";
import { explorerTxUrl } from "./chains.js";
import { config } from "./config.js";
import { buildAgentCard } from "./erc8004/agentCard.js";
import { loadIdentity } from "./erc8004/identity.js";
import { getReputationSummary } from "./erc8004/registry.js";
import { logError, logInfo } from "./log.js";
import { Scheduler } from "./orders/scheduler.js";
import { makeQuoteHandler } from "./x402/paidRoute.js";
import { buildX402, type X402Setup } from "./x402/x402.js";
import { dashboardHtml } from "./ui/dashboard.js";

const dryRun = !process.env.AGENT_PRIVATE_KEY;
const runtime = buildRuntime({ dryRun });
const scheduler = new Scheduler(runtime.store, runtime.runner, logInfo);

let x402: X402Setup | null = null;
if (!dryRun) {
  x402 = buildX402({
    chainKey: runtime.cfg.key,
    agentPrivateKey: config.agentPrivateKey(),
    agentAddress: runtime.agentAddress as `0x${string}`,
    secretKey: config.thirdwebSecretKey(),
    serverWalletAddress: config.thirdwebServerWallet(),
  });
}

let cycleBusy = false;
async function runCycle(): Promise<void> {
  if (cycleBusy) return;
  cycleBusy = true;
  try {
    await scheduler.cycle();
  } catch (err) {
    logError("cycle error", { error: (err as Error).message });
  } finally {
    cycleBusy = false;
  }
}
if (!dryRun) setInterval(() => void runCycle(), 60_000);

interface BalanceView {
  symbol: string;
  amount: string;
}

let balanceCache: { ts: number; data: BalanceView[] } = { ts: 0, data: [] };
async function balances(): Promise<BalanceView[]> {
  if (!runtime.clients) return [];
  if (Date.now() - balanceCache.ts < 20_000) return balanceCache.data;
  const out: BalanceView[] = [];
  const native = await runtime.clients.publicClient.getBalance({
    address: runtime.clients.account.address,
  });
  out.push({ symbol: "CELO (gas)", amount: Number(formatUnits(native, 18)).toFixed(4) });
  for (const t of Object.values(runtime.cfg.tokens)) {
    try {
      const raw = await runtime.clients.publicClient.readContract({
        address: t.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [runtime.clients.account.address],
      });
      if (raw > 0n || t.spendable) {
        out.push({ symbol: t.symbol, amount: Number(formatUnits(raw, t.decimals)).toFixed(4) });
      }
    } catch {
      // RPC hiccup on one token — skip it this round rather than failing the view.
    }
  }
  balanceCache = { ts: Date.now(), data: out };
  return out;
}

let repCache: { ts: number; data: { count: string; average: number } | null } = { ts: 0, data: null };
async function reputation(): Promise<{ count: string; average: number } | null> {
  const identity = loadIdentity(config.dataDir);
  if (!identity || !runtime.clients || !runtime.cfg.erc8004) return null;
  if (Date.now() - repCache.ts < 60_000) return repCache.data;
  try {
    const s = await getReputationSummary(runtime.clients, runtime.cfg.erc8004, BigInt(identity.agentId));
    const average = s.count > 0n ? Number(s.summaryValue) / Number(s.count) / 10 ** s.summaryValueDecimals : 0;
    repCache = { ts: Date.now(), data: { count: s.count.toString(), average } };
  } catch {
    repCache = { ts: Date.now(), data: repCache.data };
  }
  return repCache.data;
}

const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true, chain: runtime.cfg.key, dryRun }));

app.get("/", (c) => c.html(dashboardHtml()));

app.get("/api/state", async (c) => {
  const identity = loadIdentity(config.dataDir);
  return c.json({
    chain: runtime.cfg.key,
    chainId: runtime.cfg.chain.id,
    dryRun,
    agentAddress: runtime.agentAddress,
    explorerBase: runtime.cfg.explorerBase,
    identity,
    x402Enabled: x402 !== null,
    balances: await balances(),
    reputation: await reputation(),
    spentToday: formatUnits(runtime.ledger.spentToday(), 18),
    orders: runtime.store.list(),
    audit: runtime.audit.recent(40).map((e) => ({
      ...e,
      txUrls: Array.isArray(e.txHashes)
        ? (e.txHashes as string[]).map((h) => explorerTxUrl(runtime.cfg, h))
        : e.txHash
          ? [explorerTxUrl(runtime.cfg, String(e.txHash))]
          : [],
    })),
  });
});

app.post("/api/orders/:id/approve", (c) => {
  const id = c.req.param("id");
  try {
    runtime.store.setApproval(id, true);
    const order = runtime.store.setEnabled(id, true);
    logInfo("order approved", { id, title: order.title });
    void runCycle();
    return c.json({ ok: true, order });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message }, 404);
  }
});

app.post("/api/orders/:id/toggle", (c) => {
  const id = c.req.param("id");
  try {
    const current = runtime.store.get(id);
    if (!current) return c.json({ ok: false, error: "unknown order" }, 404);
    const order = runtime.store.setEnabled(id, !current.enabled);
    return c.json({ ok: true, order });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message }, 404);
  }
});

app.get(
  "/api/quote",
  makeQuoteHandler({
    cfg: runtime.cfg,
    venue: runtime.venue,
    x402,
    priceUsd: config.x402PriceUsd,
  }),
);

app.get("/.well-known/agent-card.json", (c) => {
  const identity = loadIdentity(config.dataDir);
  if (!runtime.cfg.erc8004 || !runtime.agentAddress) {
    return c.json({ error: "agent not registered on this chain" }, 404);
  }
  const card = buildAgentCard({
    name: "Centavo",
    description:
      "Budget-capped autonomous payments steward on Celo: allowances, savings DCA and Mento FX remittance corridors as real on-chain transactions, with x402-paid FX quotes for other agents.",
    imageUrl: "https://raw.githubusercontent.com/KaranSinghBisht/centavo/main/docs/centavo.svg",
    publicBaseUrl: config.publicBaseUrl() ?? new URL(c.req.url).origin,
    agentAddress: runtime.agentAddress,
    chainId: runtime.cfg.chain.id,
    identityRegistry: runtime.cfg.erc8004.identityRegistry,
    agentId: identity ? BigInt(identity.agentId) : undefined,
  });
  return c.json(card);
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  logInfo("centavo server up", {
    port: info.port,
    chain: runtime.cfg.key,
    dryRun,
    agent: runtime.agentAddress,
    x402: x402 !== null,
  });
});
