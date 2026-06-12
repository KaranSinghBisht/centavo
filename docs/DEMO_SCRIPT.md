# Demo script (≤ 3 min)

**One-liner to open:** "Centavo is an AI steward with a wallet on Celo — it runs your everyday
micro-payments as real on-chain transactions, and it can only ever act inside a budget you approved."

1. **(0:00) Dashboard tour** — `npm run dev`, open localhost:8787. Point at: agent wallet on
   celoscan, **ERC-8004 agentId card linking to 8004scan**, reputation count, live balances
   (cUSD, USDC, KESm — "it holds Kenyan shillings it bought itself").
2. **(0:35) Standing orders** — show the four orders in plain language. "I approved each envelope
   once; every run since has been autonomous but capped: ≤ $0.50/tx, ≤ $10/day, allowlisted
   recipients. A raw contract call would stop and ask me."
3. **(1:05) Live run** — click Resume on the Kenya remittance DCA (or wait for a due cycle). Watch
   the feed: brain proposes the swap with a reason → policy passes it → Mento swap lands → click
   the tx↗ link to celoscan. "That's the LLM deciding, the policy bounding, the chain settling."
4. **(1:45) Reputation** — show the `reputation_feedback` events: "after each delivered order the
   counterparty wallet files ERC-8004 feedback — that's why Centavo ranks on 8004scan."
5. **(2:05) x402, agents paying agents** — `npm run pay` in a terminal: a second wallet hits
   `/api/quote`, gets a 402, auto-pays a fraction of a cent in USDC via the thirdweb facilitator,
   and receives a live Mento FX quote. Show the USDC transfer on celoscan.
6. **(2:35) Close on 8004scan** — the agent's public page: identity, metadata, feedback, activity.
   "Registered identity, real utility, sustained on-chain activity — an agent, not a demo."
