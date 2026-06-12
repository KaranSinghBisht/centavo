/**
 * Default standing orders — genuine, small, repeatable payment tasks. All seeds
 * start enabled=false / unapproved: a human reviews and approves each envelope
 * before the scheduler will ever touch them. Swap-based orders stay disabled
 * until the Mento venue is wired.
 */
import { randomUUID } from "node:crypto";

import type { StandingOrder } from "./types.js";

function order(
  partial: Pick<StandingOrder, "title" | "instruction" | "recipients" | "intervalMinutes">,
): StandingOrder {
  return {
    id: randomUUID(),
    nextRunAt: Date.now(),
    enabled: false,
    approvedAt: null,
    runCount: 0,
    ...partial,
  };
}

export function buildSeedOrders(familyWallet?: `0x${string}`): StandingOrder[] {
  const seeds: StandingOrder[] = [];
  if (familyWallet) {
    seeds.push(
      order({
        title: "Family allowance",
        instruction:
          "Send 0.05 cUSD to the family wallet as the scheduled allowance installment, then finalize.",
        recipients: [{ label: "family wallet", address: familyWallet }],
        intervalMinutes: 240,
      }),
    );
  }
  seeds.push(
    order({
      title: "Digital-dollar savings DCA",
      instruction:
        "Swap 0.10 cUSD into USDC as the scheduled savings installment, then finalize. If the cUSD balance is below 0.20, finalize without acting and say why.",
      recipients: [],
      intervalMinutes: 360,
    }),
    order({
      title: "Kenya remittance DCA (cUSD → cKES)",
      instruction:
        "Swap 0.10 cUSD into cKES (Kenyan shilling stablecoin) as the scheduled remittance installment, then finalize. If the cUSD balance is below 0.20, finalize without acting and say why.",
      recipients: [],
      intervalMinutes: 480,
    }),
    order({
      title: "Operating float top-up",
      instruction:
        "Maintain the agent's stablecoin float: if the cUSD balance is below 1.00 and the CELO balance is above 0.10, swap 0.10 CELO into cUSD; otherwise finalize without acting and report the balances.",
      recipients: [],
      intervalMinutes: 720,
    }),
  );
  return seeds;
}
