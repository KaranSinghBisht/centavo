# Centavo — Celo Onchain Agents Hackathon (LIVE BUILD)

> **Status: GO.** Decision taken 2026-06-12: re-point the proven Steward agent core at Celo.
> Deadline: **June 15, 2026, 9:00 AM GMT = 2:30 PM IST.** Registration tweet also due by Jun 15.
> This file is the live build plan; the old strategy memo it replaces said "only if Steward is
> done" — Steward's spine is proven on-chain (see `../metamask-dev-cookoff/BUILD_STATE.md`), so the gate passed.

## The product

**Centavo — a budget-capped AI steward that runs your everyday micro-payments on Celo.**
Tell it your standing orders in plain language ("send the family wallet 0.05 cUSD every 4 hours",
"DCA 0.10 cUSD into cKES daily", "keep a small savings sweep going"). On every cycle the LLM brain
reviews due orders, balances and Mento FX quotes, proposes actions, and a **policy gate** (per-tx cap,
daily cap, allowlist) executes them — autonomously inside each order's pre-approved envelope, with
human approval for anything else. Every action lands as a **real Celo mainnet transaction** with a
logged reason.

- **Identity:** registered on **ERC-8004** (agentId + agent card), visible/ranked on **8004scan**
- **Payments:** cUSD/USDC transfers + **Mento** FX swaps (cUSD→cKES/cCOP/… — the remittance story)
- **Agent economy:** pays for data via **x402**, and **exposes its own x402-paid API** so other agents can pay it
- **Safety:** dedicated low-balance wallet, hard caps, allowlist, HITL approvals, full audit log

### Why this wins the tracks
| Track | How |
|---|---|
| 1 Best Agent ($2.5K/1K/0.5K) | Real-world everyday payments + full Celo agent stack (ERC-8004, x402, Mento, Self attempt) + HITL safety story |
| 2 Most Activity ($500) | 24/7 scheduler executing genuine standing orders — sustained, varied, sybil-defensible (each tx maps to a stated order) |
| 3 Highest 8004scan rank ($500) | Early registration + agent card + reputation feedback + constant activity from the registered wallet |

## Architecture

```
standing orders (data/) ──▶ scheduler (cron cycle)
                                 │ due orders + balances + Mento quotes
                                 ▼
                       Centavo brain (LLM via Venice)        ← ported Steward core
                                 │ propose {transfer|swap|call}
                                 ▼
                       policy gate (caps, allowlist, HITL)   ← ported + swap support
                                 │ approved
                                 ▼
                       CeloExecutor (viem, chainId 42220)
                        ├─ ERC-20 transfers (cUSD/USDC)
                        ├─ Mento swaps (cUSD→cKES/…)
                        └─ x402 payments (pay APIs)
                                 │
        ERC-8004 IdentityRegistry (agentId) ◀── 8004scan ranks the wallet's activity
        Hono server: dashboard + agent card + our x402-paid /quote endpoint
```

## Live checklist (mirrors the session task board)

1. [x] Scaffold + port Steward brain (planner/policy/reasoner, + `swap` action) — 13/13 tests
2. [x] Verified Celo config + Mento swaps — live mainnet quote confirmed (1 cUSD → 128.25 KESm)
3. [x] ERC-8004 code (registry client, agent card, register script) — **on-chain registration awaits funding**
4. [x] x402 payer + paid `/api/quote` endpoint — paid mode awaits THIRDWEB_SECRET_KEY (free signup)
5. [x] Standing orders + scheduler + spend ledger + reputation feedback wiring
6. [x] Dashboard UI (Celo theme) — smoke-tested live
7. [ ] **Mainnet go-live** — BLOCKED on funding (watcher polling; auto-resumes on arrival)
8. [ ] Self Agent ID via Aadhaar — user phone flow at https://app.ai.self.xyz/register
9. [x] README + mermaid diagram + MIT license + public repo: https://github.com/KaranSinghBisht/centavo
10. [ ] Registration tweet (user, needs agentId from step 7) + submission before Jun 15, 9 AM GMT

## 🚨 User actions needed (Karan)

1. **FUND THE AGENT WALLET (blocks mainnet activity — do this first):**
   send **~10 CELO** on **Celo mainnet (chainId 42220)** to
   **`0xE70F4Aa015384fA141CFFd94e238Bb36ED1C2873`**
   (Binance/Coinbase withdraw on Celo network works; the agent self-provisions cUSD via Mento.
   Gas is sub-cent — this funds thousands of real txs. Never send from/expose your main keys.)
2. **Registration quote-tweet** (deadline Jun 15): I'll hand you the exact text once the ERC-8004
   registry link exists (after step 3 + funding).
3. **Self Agent ID — India IS supported via Aadhaar** (mAadhaar app, no passport NFC needed):
   register the agent at https://app.ai.self.xyz/register (you verify once with Aadhaar; the agent
   keypair gets bound via a soulbound NFT on Celo). ~10 min on your phone; judges explicitly reward it.
4. Stay in the hackathon **Telegram** group for submission announcements.

> Submission tooling note (vetted): `celobuilders.xyz` just redirects to the Notion page. The real,
> safe references are `celo-org/celopedia-skills` (static markdown — verified contract addresses,
> ERC-8004 + x402 patterns) and the submission flow runs via Karma Gap / AgentScan + an X post.

## Env (.env — gitignored, never committed)

`CHAIN` (celo|celoAlfajores) · `CELO_RPC_URL` (optional, defaults to Forno) · `AGENT_PRIVATE_KEY`
(dedicated hackathon wallet) · `VENICE_API_KEY/BASE_URL/MODEL` (LLM) · `PORT` · `AGENT_DOMAIN`
(public host for the agent card) · `DATA_DIR`

## House rules carried over

Small files (200–400 lines) · functions <50 lines · explicit error handling · no secrets in source ·
no console.log in committed code · activity must be genuine (judges screen sybil) · don't hardcode
ERC-8004/x402 specifics from memory — they come from the research pass and get verified on-chain.
