/** Runs one scheduler cycle (all due, approved standing orders) and exits. */
import { buildRuntime } from "../src/centavo.js";
import { logError, logInfo } from "../src/log.js";
import { Scheduler } from "../src/orders/scheduler.js";

try {
  const runtime = buildRuntime();
  const scheduler = new Scheduler(runtime.store, runtime.runner, logInfo);
  const ran = await scheduler.cycle();
  logInfo("cycle complete", { ordersRun: ran, chain: runtime.cfg.key, agent: runtime.agentAddress });
} catch (err) {
  logError("cycle failed", { error: (err as Error).message });
  process.exitCode = 1;
}
