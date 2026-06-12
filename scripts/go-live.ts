/**
 * One-shot mainnet go-live: verifies funding, registers on ERC-8004, gives the
 * family wallet feedback gas, approves + enables every seeded standing order,
 * runs the first cycle, and prints the registration tweet. Idempotent.
 */
import { formatUnits, parseUnits } from "viem";

import { buildRuntime } from "../src/centavo.js";
import { config } from "../src/config.js";
import { ensureRegistered } from "../src/erc8004/registerFlow.js";
import { logError, logInfo } from "../src/log.js";
import { Scheduler } from "../src/orders/scheduler.js";

const MIN_GAS = parseUnits("0.005", 18);
const FAMILY_GAS_TARGET = parseUnits("0.05", 18);
const FAMILY_GAS_SEND = parseUnits("0.3", 18);

const runtime = buildRuntime();
if (!runtime.clients || !runtime.agentAddress) {
  throw new Error("go-live needs AGENT_PRIVATE_KEY set");
}
const { clients } = runtime;

const balance = await clients.publicClient.getBalance({ address: clients.account.address });
logInfo("agent balance", { celo: formatUnits(balance, 18) });
if (balance < MIN_GAS) {
  logError("wallet not funded yet — send CELO first", { address: clients.account.address });
  process.exit(2);
}

const { identity, created } = await ensureRegistered(clients, runtime.cfg, config.dataDir, config.publicBaseUrl());
logInfo(created ? "ERC-8004 registered" : "ERC-8004 already registered", {
  agentId: identity.agentId,
  scanUrl: identity.scanUrl,
});

const family = process.env.FAMILY_WALLET as `0x${string}` | undefined;
if (family) {
  const familyBal = await clients.publicClient.getBalance({ address: family });
  if (familyBal < FAMILY_GAS_TARGET) {
    // Never send more than a quarter of the agent's gas (testnet drips are tiny).
    const send = balance / 4n < FAMILY_GAS_SEND ? balance / 4n : FAMILY_GAS_SEND;
    const tx = await clients.walletClient.sendTransaction({ to: family, value: send });
    await clients.publicClient.waitForTransactionReceipt({ hash: tx });
    logInfo("family wallet gassed for reputation feedback", { tx, celo: formatUnits(send, 18) });
  }
}

for (const order of runtime.store.list()) {
  if (!order.approvedAt) runtime.store.setApproval(order.id, true);
  if (!order.enabled) runtime.store.setEnabled(order.id, true);
}
logInfo("standing orders approved + enabled", {
  orders: runtime.store.list().map((o) => o.title),
});

const scheduler = new Scheduler(runtime.store, runtime.runner, logInfo);
const ran = await scheduler.cycle();
logInfo("first cycle complete", { ordersRun: ran });

logInfo("GO-LIVE COMPLETE — start the daemon with: npm run dev (or npm run daemon)");
logInfo("REGISTRATION TWEET", {
  text:
    "I am building for the @CeloDevs Agent Hackathon 🟡 Working on: Centavo — a budget-capped AI " +
    "steward that runs everyday micro-payments (allowances, savings DCA, Mento FX remittances) as " +
    `real Celo transactions. Registered onchain → ${identity.scanUrl} Let's go 🛠 #CeloAgents`,
});
