/**
 * The activity engine: finds due, human-approved standing orders and runs them
 * sequentially (one signer — sequential execution avoids nonce races). Each
 * order failure is recorded and isolated so one bad order never stalls the rest.
 */
import type { OrderStore } from "./store.js";
import type { OrderRunSummary, StandingOrder } from "./types.js";

export interface OrderRunner {
  run(order: StandingOrder): Promise<OrderRunSummary>;
}

export class Scheduler {
  constructor(
    private readonly store: OrderStore,
    private readonly runner: OrderRunner,
    private readonly log: (message: string, data?: Record<string, unknown>) => void,
  ) {}

  dueOrders(now = Date.now()): StandingOrder[] {
    return this.store
      .list()
      .filter((o) => o.enabled && o.approvedAt !== null && o.nextRunAt <= now)
      .sort((a, b) => a.nextRunAt - b.nextRunAt);
  }

  /** Runs every due order once; returns how many ran. */
  async cycle(now = Date.now()): Promise<number> {
    const due = this.dueOrders(now);
    for (const order of due) {
      this.log("order run start", { id: order.id, title: order.title });
      let run: OrderRunSummary;
      try {
        run = await this.runner.run(order);
      } catch (err) {
        run = { ts: Date.now(), ok: false, summary: (err as Error).message.slice(0, 300), txHashes: [] };
      }
      const nextRunAt = now + order.intervalMinutes * 60_000;
      this.store.markRun(order.id, run, nextRunAt);
      this.log("order run done", { id: order.id, ok: run.ok, txs: run.txHashes.length });
    }
    return due.length;
  }
}
