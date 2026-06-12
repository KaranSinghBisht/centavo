/**
 * Centavo's own x402-paid service: live Mento FX corridor quotes. Other agents
 * (or our demo client) pay a fraction of a cent in USDC per quote via the
 * thirdweb facilitator. Without x402 configured it serves free with a notice,
 * so the endpoint is always demoable.
 */
import type { Context } from "hono";
import { formatUnits, parseUnits } from "viem";

import { settlePayment } from "thirdweb/x402";

import type { SwapVenue } from "../celo/executor.js";
import type { ChainConfig } from "../chains.js";
import type { X402Setup } from "./x402.js";

export interface QuoteRouteDeps {
  cfg: ChainConfig;
  venue?: SwapVenue;
  x402: X402Setup | null;
  /** e.g. "$0.005" per quote. */
  priceUsd: string;
}

export function makeQuoteHandler(deps: QuoteRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const fromSym = c.req.query("from") ?? "cUSD";
    const toSym = c.req.query("to") ?? "KESm";
    const amountStr = c.req.query("amount") ?? "1";
    const fromTok = deps.cfg.tokens[fromSym];
    const toTok = deps.cfg.tokens[toSym];
    if (!fromTok || !toTok) {
      return c.json({ error: `unknown token pair ${fromSym}/${toSym}` }, 400);
    }
    if (!deps.venue) {
      return c.json({ error: "FX venue not available on this chain" }, 503);
    }

    if (deps.x402) {
      const paymentData = c.req.header("PAYMENT-SIGNATURE") ?? c.req.header("X-PAYMENT") ?? null;
      const result = await settlePayment({
        resourceUrl: c.req.url,
        method: c.req.method,
        paymentData,
        payTo: deps.x402.payTo,
        network: deps.x402.chain,
        price: deps.priceUsd,
        facilitator: deps.x402.facilitator,
        routeConfig: {
          description: "Live Mento FX corridor quote (Centavo)",
          mimeType: "application/json",
        },
      });
      if (result.status !== 200) {
        return new Response(JSON.stringify(result.responseBody), {
          status: result.status,
          headers: result.responseHeaders as Record<string, string>,
        });
      }
      for (const [key, value] of Object.entries(result.responseHeaders ?? {})) {
        c.header(key, String(value));
      }
    }

    let amountIn: bigint;
    try {
      amountIn = parseUnits(amountStr, fromTok.decimals);
    } catch {
      return c.json({ error: "invalid amount" }, 400);
    }
    try {
      const amountOut = await deps.venue.quote(fromTok.address, toTok.address, amountIn);
      const rate = Number(formatUnits(amountOut, toTok.decimals)) / Number(formatUnits(amountIn, fromTok.decimals));
      return c.json({
        pair: `${fromSym}/${toSym}`,
        amountIn: amountIn.toString(),
        amountOut: amountOut.toString(),
        rate,
        venue: "mento",
        paid: deps.x402 !== null,
        ts: Date.now(),
      });
    } catch (err) {
      return c.json({ error: `quote failed: ${(err as Error).message.slice(0, 200)}` }, 502);
    }
  };
}
