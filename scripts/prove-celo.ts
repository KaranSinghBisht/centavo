/**
 * Proof-of-activity snapshot for the submission writeup: identity, on-chain tx
 * count (Blockscout), reputation summary, and recent order runs with explorer
 * links. Read-only.
 */
import { buildRuntime } from "../src/centavo.js";
import { explorerTxUrl } from "../src/chains.js";
import { config } from "../src/config.js";
import { loadIdentity } from "../src/erc8004/identity.js";
import { getReputationSummary } from "../src/erc8004/registry.js";
import { logInfo } from "../src/log.js";

const runtime = buildRuntime();
const identity = loadIdentity(config.dataDir);
logInfo("identity", identity ? { ...identity } : { registered: false });

if (runtime.clients) {
  try {
    const res = await fetch(
      `https://celo.blockscout.com/api/v2/addresses/${runtime.agentAddress}`,
    );
    if (res.ok) {
      const info = (await res.json()) as { transactions_count?: string };
      logInfo("on-chain transactions (agent wallet)", {
        address: runtime.agentAddress,
        count: info.transactions_count ?? "unknown",
      });
    }
  } catch (err) {
    logInfo("blockscout lookup failed", { error: (err as Error).message });
  }
  if (identity && runtime.cfg.erc8004) {
    const summary = await getReputationSummary(runtime.clients, runtime.cfg.erc8004, BigInt(identity.agentId));
    logInfo("reputation", {
      feedbackCount: summary.count.toString(),
      avg: summary.count > 0n ? Number(summary.summaryValue) / Number(summary.count) : 0,
    });
  }
}

const runs = runtime.audit.recent(1000).filter((e) => e.kind === "order_run");
const ok = runs.filter((e) => e.ok === true);
const txs = runs.flatMap((e) => (Array.isArray(e.txHashes) ? (e.txHashes as string[]) : []));
logInfo("order runs", { total: runs.length, ok: ok.length, txs: txs.length });
for (const h of txs.slice(0, 10)) {
  logInfo("sample tx", { url: explorerTxUrl(runtime.cfg, h) });
}
