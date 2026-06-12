/** Standing orders — the genuine, repeatable payment tasks Centavo runs. */

export interface OrderRecipient {
  label: string;
  address: `0x${string}`;
}

export interface OrderRunSummary {
  ts: number;
  ok: boolean;
  summary: string;
  txHashes: string[];
}

export interface StandingOrder {
  id: string;
  title: string;
  /** Natural-language instruction handed to the brain each cycle. */
  instruction: string;
  /** Labeled addresses this order may pay (joined into the policy allowlist). */
  recipients: OrderRecipient[];
  intervalMinutes: number;
  /** Epoch ms of the next due execution. */
  nextRunAt: number;
  enabled: boolean;
  /** Human approval of the order's envelope; auto-runs require it. */
  approvedAt: number | null;
  runCount: number;
  lastRun?: OrderRunSummary;
}
