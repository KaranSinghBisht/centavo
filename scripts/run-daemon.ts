/**
 * The 24/7 activity daemon: checks for due standing orders every minute and
 * runs them. Errors are logged and isolated — the daemon itself never dies.
 */
import { buildRuntime } from "../src/centavo.js";
import { logError, logInfo } from "../src/log.js";
import { Scheduler } from "../src/orders/scheduler.js";

const CHECK_INTERVAL_MS = 60_000;

const runtime = buildRuntime();
const scheduler = new Scheduler(runtime.store, runtime.runner, logInfo);
logInfo("daemon started", {
  chain: runtime.cfg.key,
  agent: runtime.agentAddress,
  orders: runtime.store.list().map((o) => ({ title: o.title, enabled: o.enabled, approved: o.approvedAt !== null })),
});

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
  logInfo("daemon stopping (SIGINT)");
});
process.on("SIGTERM", () => {
  stopping = true;
  logInfo("daemon stopping (SIGTERM)");
});

let cycles = 0;
while (!stopping) {
  try {
    const ran = await scheduler.cycle();
    if (ran > 0) logInfo("cycle ran orders", { ran });
  } catch (err) {
    logError("cycle error", { error: (err as Error).message });
  }
  cycles += 1;
  if (cycles % 30 === 0) {
    logInfo("daemon heartbeat", { cycles, due: scheduler.dueOrders().length });
  }
  await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS));
}
logInfo("daemon stopped", { cycles });
