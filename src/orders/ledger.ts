/**
 * Global daily spend ledger (normalized 18-dec units) shared across all runs,
 * so the policy's daily cap holds for the whole agent — not per run. Resets at
 * UTC midnight.
 */
import fs from "node:fs";
import path from "node:path";

interface LedgerState {
  date: string;
  spent: string;
}

function utcDate(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export class SpendLedger {
  constructor(private readonly filePath: string) {}

  private read(now: number): LedgerState {
    const today = utcDate(now);
    if (!fs.existsSync(this.filePath)) return { date: today, spent: "0" };
    try {
      const state = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as LedgerState;
      return state.date === today ? state : { date: today, spent: "0" };
    } catch {
      return { date: today, spent: "0" };
    }
  }

  private write(state: LedgerState): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, this.filePath);
  }

  spentToday(now = Date.now()): bigint {
    return BigInt(this.read(now).spent);
  }

  add(amount: bigint, now = Date.now()): void {
    if (amount <= 0n) return;
    const state = this.read(now);
    state.spent = (BigInt(state.spent) + amount).toString();
    this.write(state);
  }
}
