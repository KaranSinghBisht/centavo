/**
 * Append-only JSONL audit trail of every order run — the dashboard's live feed
 * and the submission's proof-of-activity source.
 */
import fs from "node:fs";
import path from "node:path";

export interface AuditEntry extends Record<string, unknown> {
  ts: number;
  kind: string;
}

export class AuditLog {
  constructor(private readonly filePath: string) {}

  append(entry: AuditEntry): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`);
  }

  recent(limit = 50): AuditEntry[] {
    if (!fs.existsSync(this.filePath)) return [];
    const lines = fs.readFileSync(this.filePath, "utf8").trim().split("\n");
    const slice = lines.slice(-limit);
    const entries: AuditEntry[] = [];
    for (const line of slice) {
      try {
        entries.push(JSON.parse(line) as AuditEntry);
      } catch {
        // Skip a torn line (crash mid-append) rather than failing the feed.
      }
    }
    return entries.reverse();
  }
}
