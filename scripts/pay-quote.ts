/**
 * The agent-pays-agent demo: a client wallet pays Centavo's x402-protected
 * /api/quote endpoint in USDC via the thirdweb facilitator. Run against a
 * live server (npm run dev). Requires THIRDWEB_SECRET_KEY + a funded payer.
 */
import { config } from "../src/config.js";
import { logError, logInfo } from "../src/log.js";
import { buildX402, makePaidFetch } from "../src/x402/x402.js";

const base = process.env.QUOTE_BASE_URL ?? `http://localhost:${config.port}`;
const payerKey = config.familyWalletKey() ?? config.agentPrivateKey();

const x402 = buildX402({
  chainKey: config.chainName,
  agentPrivateKey: payerKey,
  agentAddress: "0x0000000000000000000000000000000000000000",
  secretKey: config.thirdwebSecretKey(),
  serverWalletAddress: config.thirdwebServerWallet(),
});
if (!x402) {
  logError("x402 not configured — set THIRDWEB_SECRET_KEY and THIRDWEB_SERVER_WALLET");
  process.exit(2);
}

const paidFetch = makePaidFetch(x402);
const url = `${base}/api/quote?from=cUSD&to=KESm&amount=1`;
logInfo("requesting paid quote", { url });
const res = await paidFetch(url);
const body = await res.json();
logInfo("paid quote response", { status: res.status, body });
