/**
 * Keyless executor for demos and tests: pretends every action succeeded without
 * touching a chain, so the dashboard and planner can run with zero secrets.
 */
import type { Executor } from "./planner.js";
import type { ExecutionResult, ProposedAction } from "./types.js";

export class DryRunExecutor implements Executor {
  readonly executed: ProposedAction[] = [];

  async execute(action: ProposedAction): Promise<ExecutionResult> {
    this.executed.push(action);
    return {
      ok: true,
      txHash: `0x${"0".repeat(64)}` as `0x${string}`,
      detail: `dry-run ${action.kind}`,
    };
  }
}
