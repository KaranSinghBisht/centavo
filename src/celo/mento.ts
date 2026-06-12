/**
 * Mento swap venue — Celo's native stablecoin FX (cUSD ⇄ KESm/COPm/EURm/…).
 * Wraps the official @mento-protocol/mento-sdk v3: the SDK finds the route
 * (v2 BiPools + v3 FPMM), checks allowance, and builds approval + swap txs;
 * we execute them with the agent's wallet and wait for receipts.
 */
import { Mento, deadlineFromMinutes } from "@mento-protocol/mento-sdk";

import type { SwapVenue } from "./executor.js";
import type { CeloClients } from "./client.js";

interface MentoCallParams {
  to: string;
  data: string;
  value: string;
}

export class MentoVenue implements SwapVenue {
  private sdk?: Mento;

  constructor(
    private readonly clients: CeloClients,
    private readonly chainId: number,
    private readonly rpcUrl: string,
    private readonly slippagePct = 1,
  ) {}

  private async mento(): Promise<Mento> {
    if (!this.sdk) {
      // Pass the RPC URL (not our client) so the SDK builds its own viem client —
      // avoids structural type clashes between viem copies.
      this.sdk = await Mento.create(this.chainId, this.rpcUrl);
    }
    return this.sdk;
  }

  async quote(tokenIn: `0x${string}`, tokenOut: `0x${string}`, amountIn: bigint): Promise<bigint> {
    const mento = await this.mento();
    return mento.quotes.getAmountOut(tokenIn, tokenOut, amountIn);
  }

  private async send(params: MentoCallParams): Promise<`0x${string}`> {
    const txHash = await this.clients.walletClient.sendTransaction({
      to: params.to as `0x${string}`,
      data: params.data as `0x${string}`,
      value: params.value ? BigInt(params.value) : 0n,
    });
    const receipt = await this.clients.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new Error(`mento tx reverted (${txHash})`);
    return txHash;
  }

  async swap(
    tokenIn: `0x${string}`,
    tokenOut: `0x${string}`,
    amountIn: bigint,
    minAmountOut: bigint,
  ): Promise<`0x${string}`> {
    const mento = await this.mento();
    const owner = this.clients.account.address;
    const { approval, swap } = await mento.swap.buildSwapTransaction(
      tokenIn,
      tokenOut,
      amountIn,
      owner,
      owner,
      { slippageTolerance: this.slippagePct, deadline: deadlineFromMinutes(5) },
    );
    if (swap.amountOutMin < minAmountOut) {
      throw new Error(
        `mento min-out ${swap.amountOutMin} below executor floor ${minAmountOut} — aborting swap`,
      );
    }
    if (approval) await this.send(approval as MentoCallParams);
    return this.send(swap.params as MentoCallParams);
  }
}
