/**
 * JSON-file persistence for standing orders. Writes go through a temp file +
 * rename so a crash mid-write never corrupts the store.
 */
import fs from "node:fs";
import path from "node:path";

import type { OrderRunSummary, StandingOrder } from "./types.js";

export class OrderStore {
  private orders: StandingOrder[] = [];

  constructor(private readonly filePath: string) {
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;
    const raw = fs.readFileSync(this.filePath, "utf8");
    try {
      this.orders = JSON.parse(raw) as StandingOrder[];
    } catch (err) {
      throw new Error(`orders store ${this.filePath} is corrupt: ${(err as Error).message}`);
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.orders, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  list(): StandingOrder[] {
    return [...this.orders];
  }

  get(id: string): StandingOrder | undefined {
    return this.orders.find((o) => o.id === id);
  }

  upsert(order: StandingOrder): void {
    const idx = this.orders.findIndex((o) => o.id === order.id);
    if (idx >= 0) this.orders[idx] = order;
    else this.orders.push(order);
    this.save();
  }

  setApproval(id: string, approved: boolean): StandingOrder {
    const order = this.require(id);
    order.approvedAt = approved ? Date.now() : null;
    this.save();
    return order;
  }

  setEnabled(id: string, enabled: boolean): StandingOrder {
    const order = this.require(id);
    order.enabled = enabled;
    if (enabled && order.nextRunAt < Date.now()) order.nextRunAt = Date.now();
    this.save();
    return order;
  }

  markRun(id: string, run: OrderRunSummary, nextRunAt: number): StandingOrder {
    const order = this.require(id);
    order.lastRun = run;
    order.runCount += 1;
    order.nextRunAt = nextRunAt;
    this.save();
    return order;
  }

  seedIfEmpty(seeds: StandingOrder[]): void {
    if (this.orders.length > 0) return;
    this.orders = seeds;
    this.save();
  }

  private require(id: string): StandingOrder {
    const order = this.get(id);
    if (!order) throw new Error(`unknown order ${id}`);
    return order;
  }
}
