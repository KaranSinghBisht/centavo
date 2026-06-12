/**
 * CeloExecutor — performs approved actions as real transactions on Celo via
 * viem: ERC-20 transfers, Mento swaps (through an injected SwapVenue so the
 * brain stays venue-agnostic), and raw calls. Waits for the receipt so every
 * ExecutionResult reflects on-chain truth, not just submission.
 */
import { erc20Abi } from "viem";

import type { Executor } from "../brain/planner.js";
import type { ExecutionResult, ProposedAction } from "../brain/types.js";
import type { CeloClients } from "./client.js";

export interface SwapVenue {
  quote(tokenIn: `0x${string}`, tokenOut: `0x${string}`, amountIn: bigint): Promise<bigint>;
  swap(
    tokenIn: `0x${string}`,
    tokenOut: `0x${string}`,
    amountIn: bigint,
    minAmountOut: bigint,
  ): Promise<`0x${string}`>;
}

function sanitizeError(err: unknown): string {
  const message =
    (err as { shortMessage?: string }).shortMessage ?? (err as Error).message ?? "unknown error";
  return message.slice(0, 300);
}

export class CeloExecutor implements Executor {
  constructor(
    private readonly clients: CeloClients,
    private readonly swapVenue?: SwapVenue,
    private readonly slippageBps = 100,
  ) {}

  async execute(action: ProposedAction): Promise<ExecutionResult> {
    try {
      switch (action.kind) {
        case "transfer":
          return await this.transfer(action);
        case "swap":
          return await this.swap(action);
        case "call":
          return await this.call(action);
      }
    } catch (err) {
      return { ok: false, error: sanitizeError(err) };
    }
  }

  private async confirm(txHash: `0x${string}`, detail: string): Promise<ExecutionResult> {
    const receipt = await this.clients.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      return { ok: false, txHash, error: `transaction reverted (${detail})` };
    }
    return { ok: true, txHash, detail };
  }

  private async transfer(action: ProposedAction): Promise<ExecutionResult> {
    if (!action.to || !action.token || !action.amount) {
      return { ok: false, error: "transfer requires to, token and amount" };
    }
    const txHash = await this.clients.walletClient.writeContract({
      address: action.token,
      abi: erc20Abi,
      functionName: "transfer",
      args: [action.to, BigInt(action.amount)],
    });
    return this.confirm(txHash, `transfer ${action.amount} of ${action.token} to ${action.to}`);
  }

  private async swap(action: ProposedAction): Promise<ExecutionResult> {
    if (!this.swapVenue) {
      return { ok: false, error: "no swap venue configured on this chain" };
    }
    if (!action.tokenIn || !action.tokenOut || !action.amountIn) {
      return { ok: false, error: "swap requires tokenIn, tokenOut and amountIn" };
    }
    const amountIn = BigInt(action.amountIn);
    const quoted = await this.swapVenue.quote(action.tokenIn, action.tokenOut, amountIn);
    const minOut = (quoted * BigInt(10_000 - this.slippageBps)) / 10_000n;
    const txHash = await this.swapVenue.swap(action.tokenIn, action.tokenOut, amountIn, minOut);
    return this.confirm(txHash, `swap ${action.amountIn} ${action.tokenIn} -> ≥${minOut} ${action.tokenOut}`);
  }

  private async call(action: ProposedAction): Promise<ExecutionResult> {
    if (!action.to) return { ok: false, error: "call requires a target" };
    const txHash = await this.clients.walletClient.sendTransaction({
      to: action.to,
      data: action.data ?? "0x",
    });
    return this.confirm(txHash, `call ${action.to}`);
  }
}
