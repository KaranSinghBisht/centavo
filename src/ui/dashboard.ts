/**
 * The Centavo dashboard — a single self-contained HTML page (Celo yellow on
 * near-black). All data renders client-side from /api/state, so nothing
 * dynamic is interpolated into this template server-side (no injection
 * surface); the page builds DOM nodes with textContent.
 */
export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Centavo — payments steward on Celo</title>
<style>
  :root { --yellow:#FCFF52; --bg:#0b0b0c; --panel:#141416; --line:#26262a; --text:#e8e8e3; --dim:#9a9a92; --green:#7CFFA0; --red:#ff7c7c; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .wrap { max-width:1060px; margin:0 auto; padding:28px 20px 60px; }
  header { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; border-bottom:2px solid var(--yellow); padding-bottom:14px; }
  h1 { margin:0; font-size:26px; letter-spacing:1px; color:var(--yellow); }
  .sub { color:var(--dim); }
  .pill { border:1px solid var(--line); border-radius:999px; padding:2px 10px; font-size:12px; color:var(--dim); }
  .pill.on { color:var(--green); border-color:var(--green); }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin:18px 0; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
  .card .k { color:var(--dim); font-size:11px; text-transform:uppercase; letter-spacing:1px; }
  .card .v { font-size:18px; margin-top:4px; word-break:break-all; }
  .card .v a { color:var(--yellow); text-decoration:none; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:2px; color:var(--dim); margin:26px 0 10px; }
  table { width:100%; border-collapse:collapse; background:var(--panel); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  th,td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--dim); font-size:11px; text-transform:uppercase; letter-spacing:1px; }
  tr:last-child td { border-bottom:none; }
  button { background:var(--yellow); color:#000; border:none; border-radius:6px; padding:5px 10px; font:inherit; font-size:12px; cursor:pointer; }
  button.ghost { background:transparent; color:var(--dim); border:1px solid var(--line); }
  .ok { color:var(--green); } .bad { color:var(--red); } .dim { color:var(--dim); }
  .feed { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:6px 0; max-height:420px; overflow:auto; }
  .feed .row { padding:7px 14px; border-bottom:1px solid var(--line); display:flex; gap:10px; flex-wrap:wrap; }
  .feed .row:last-child { border-bottom:none; }
  .feed a { color:var(--yellow); text-decoration:none; }
  .ts { color:var(--dim); font-size:12px; white-space:nowrap; }
  footer { margin-top:30px; color:var(--dim); font-size:12px; line-height:1.8; }
  footer a { color:var(--yellow); text-decoration:none; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>CENTAVO</h1>
    <span class="sub">budget-capped payments steward on Celo</span>
    <span class="pill" id="chain">…</span>
    <span class="pill" id="x402pill">x402 …</span>
    <span class="pill" id="drypill" hidden>DRY RUN</span>
  </header>

  <div class="grid" id="cards"></div>

  <h2>Standing orders <span class="dim">— approve once; every run stays inside the policy caps</span></h2>
  <table>
    <thead><tr><th>Order</th><th>Cadence</th><th>Runs</th><th>Last result</th><th>Status</th><th></th></tr></thead>
    <tbody id="orders"></tbody>
  </table>

  <h2>Live on-chain activity</h2>
  <div class="feed" id="feed"></div>

  <footer id="foot"></footer>
</div>
<script>
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

function card(k, v, href) {
  const c = el("div", "card");
  c.appendChild(el("div", "k", k));
  const val = el("div", "v");
  if (href) { const a = el("a", "", v); a.href = href; a.target = "_blank"; val.appendChild(a); }
  else val.textContent = v;
  c.appendChild(val);
  return c;
}

async function post(url) { await fetch(url, { method: "POST" }); await refresh(); }

function renderOrders(s) {
  const tb = $("orders"); tb.replaceChildren();
  for (const o of s.orders) {
    const tr = el("tr");
    const t1 = el("td"); t1.appendChild(el("div", "", o.title)); t1.appendChild(el("div", "dim", o.instruction.slice(0, 110) + (o.instruction.length > 110 ? "…" : ""))); tr.appendChild(t1);
    tr.appendChild(el("td", "", "every " + o.intervalMinutes + "m"));
    tr.appendChild(el("td", "", String(o.runCount)));
    const lr = el("td");
    if (o.lastRun) { lr.appendChild(el("span", o.lastRun.ok ? "ok" : "bad", o.lastRun.ok ? "ok" : "failed")); lr.appendChild(el("div", "dim", (o.lastRun.summary || "").slice(0, 90))); }
    else lr.appendChild(el("span", "dim", "—"));
    tr.appendChild(lr);
    const st = el("td");
    st.appendChild(el("div", o.approvedAt ? "ok" : "dim", o.approvedAt ? "approved" : "needs approval"));
    st.appendChild(el("div", o.enabled ? "ok" : "dim", o.enabled ? "active" : "paused"));
    tr.appendChild(st);
    const act = el("td");
    if (!o.approvedAt) { const b = el("button", "", "Approve & start"); b.onclick = () => post("/api/orders/" + o.id + "/approve"); act.appendChild(b); }
    else { const b = el("button", "ghost", o.enabled ? "Pause" : "Resume"); b.onclick = () => post("/api/orders/" + o.id + "/toggle"); act.appendChild(b); }
    tr.appendChild(act);
    tb.appendChild(tr);
  }
}

function renderFeed(s) {
  const f = $("feed"); f.replaceChildren();
  if (!s.audit.length) f.appendChild(el("div", "row dim", "No activity yet — approve an order to begin."));
  for (const e of s.audit) {
    const r = el("div", "row");
    r.appendChild(el("span", "ts", new Date(e.ts).toISOString().replace("T", " ").slice(0, 19)));
    r.appendChild(el("span", e.ok === false || String(e.kind).includes("failed") ? "bad" : "", String(e.kind)));
    if (e.title) r.appendChild(el("span", "dim", String(e.title)));
    if (e.summary) r.appendChild(el("span", "dim", String(e.summary).slice(0, 120)));
    for (const u of e.txUrls || []) { const a = el("a", "", "tx↗"); a.href = u; a.target = "_blank"; r.appendChild(a); }
    f.appendChild(r);
  }
}

async function refresh() {
  const s = await (await fetch("/api/state")).json();
  $("chain").textContent = s.chain + " (" + s.chainId + ")";
  $("x402pill").textContent = "x402 " + (s.x402Enabled ? "live" : "off");
  $("x402pill").className = "pill" + (s.x402Enabled ? " on" : "");
  $("drypill").hidden = !s.dryRun;
  const cards = $("cards"); cards.replaceChildren();
  cards.appendChild(card("Agent wallet", s.agentAddress || "(dry run)", s.agentAddress ? s.explorerBase + "/address/" + s.agentAddress : undefined));
  cards.appendChild(card("ERC-8004 agentId", s.identity ? "#" + s.identity.agentId : "not registered", s.identity ? s.identity.scanUrl : undefined));
  cards.appendChild(card("Reputation", s.reputation ? s.reputation.count + " reviews · avg " + s.reputation.average.toFixed(1) : "—"));
  cards.appendChild(card("Spent today", "$" + Number(s.spentToday).toFixed(4)));
  for (const b of s.balances) cards.appendChild(card(b.symbol, b.amount));
  renderOrders(s); renderFeed(s);
  $("foot").innerHTML = "";
  const foot = $("foot");
  foot.appendChild(el("div", "", "Agent card: "));
  const a1 = el("a", "", "/.well-known/agent-card.json"); a1.href = "/.well-known/agent-card.json"; foot.lastChild.appendChild(a1);
  const d2 = el("div", "", "x402 paid endpoint: GET /api/quote?from=cUSD&to=KESm&amount=1 — other agents pay " + "per quote in USDC.");
  foot.appendChild(d2);
}
refresh(); setInterval(refresh, 10000);
</script>
</body>
</html>`;
}
