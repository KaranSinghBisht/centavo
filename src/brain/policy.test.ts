import { describe, expect, it } from "vitest";

import { checkPolicy, normalize, spendOf, type Policy } from "./policy.js";
import type { ProposedAction } from "./types.js";

const CUSD = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const;
const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const;
const FAMILY = "0x1111111111111111111111111111111111111111" as const;

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    tokens: {
      [CUSD.toLowerCase()]: { symbol: "cUSD", decimals: 18 },
      [USDC.toLowerCase()]: { symbol: "USDC", decimals: 6 },
    },
    receiveTokens: new Set([CUSD.toLowerCase(), USDC.toLowerCase()]),
    maxPerTx: 10n ** 18n, // 1.0 normalized
    maxPerDay: 3n * 10n ** 18n,
    allowedTargets: new Set([FAMILY.toLowerCase()]),
    preApproved: false,
    ...overrides,
  };
}

function transfer(amount: string, token: `0x${string}` = CUSD): ProposedAction {
  return { kind: "transfer", to: FAMILY, token, amount, reason: "test" };
}

describe("normalize", () => {
  it("scales 6-dec USDC to 18-dec units", () => {
    expect(normalize(1_000_000n, 6)).toBe(10n ** 18n);
  });
  it("leaves 18-dec amounts unchanged", () => {
    expect(normalize(5n, 18)).toBe(5n);
  });
});

describe("checkPolicy transfers", () => {
  it("blocks targets off the allowlist", () => {
    const v = checkPolicy({ ...transfer("10"), to: USDC }, policy(), 0n);
    expect(v.allowed).toBe(false);
  });
  it("blocks unknown spend tokens", () => {
    const v = checkPolicy(transfer("10", FAMILY), policy(), 0n);
    expect(v.allowed).toBe(false);
  });
  it("blocks per-tx cap breaches, mixed decimals", () => {
    // 1.5 USDC (6 dec) > 1.0 normalized cap
    const v = checkPolicy(transfer("1500000", USDC), policy(), 0n);
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain("per-transaction cap");
  });
  it("blocks daily-cap breaches", () => {
    const v = checkPolicy(transfer((10n ** 18n).toString()), policy(), 25n * 10n ** 17n);
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain("daily cap");
  });
  it("requires approval when not pre-approved", () => {
    const v = checkPolicy(transfer("1000"), policy(), 0n);
    expect(v).toMatchObject({ allowed: true, requiresApproval: true });
  });
  it("auto-approves inside a pre-approved envelope", () => {
    const v = checkPolicy(transfer("1000"), policy({ preApproved: true }), 0n);
    expect(v).toMatchObject({ allowed: true, requiresApproval: false });
  });
});

describe("checkPolicy swaps and calls", () => {
  it("validates swaps by tokenIn within caps", () => {
    const action: ProposedAction = {
      kind: "swap",
      tokenIn: CUSD,
      tokenOut: USDC,
      amountIn: (10n ** 17n).toString(),
      reason: "fx",
    };
    const v = checkPolicy(action, policy({ preApproved: true }), 0n);
    expect(v).toMatchObject({ allowed: true, requiresApproval: false });
  });
  it("rejects swaps missing tokenOut", () => {
    const action: ProposedAction = { kind: "swap", tokenIn: CUSD, amountIn: "10", reason: "fx" };
    expect(checkPolicy(action, policy(), 0n).allowed).toBe(false);
  });
  it("always gates raw calls behind a human", () => {
    const action: ProposedAction = { kind: "call", to: FAMILY, data: "0x", reason: "admin" };
    const v = checkPolicy(action, policy({ preApproved: true }), 0n);
    expect(v).toMatchObject({ allowed: true, requiresApproval: true });
  });
});

describe("spendOf", () => {
  it("normalizes transfer spend", () => {
    expect(spendOf(transfer("2000000", USDC), policy())).toBe(2n * 10n ** 18n);
  });
  it("returns 0 for calls", () => {
    expect(spendOf({ kind: "call", to: FAMILY, reason: "x" }, policy())).toBe(0n);
  });
});
