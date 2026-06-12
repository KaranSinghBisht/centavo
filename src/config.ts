/**
 * Environment-driven config. No secrets are ever hardcoded; everything sensitive
 * is read lazily from the process environment (see .env.example) so the brain and
 * tests can load without keys.
 */
import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} (see .env.example)`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  chainName: optional("CHAIN", "celo"),
  port: Number(optional("PORT", "8787")),
  agentDomain: optional("AGENT_DOMAIN", "localhost:8787"),
  dataDir: optional("DATA_DIR", "data"),
  veniceBaseUrl: optional("VENICE_BASE_URL", "https://api.venice.ai/api/v1"),
  veniceModel: optional("VENICE_MODEL", "zai-org-glm-4.7"),
  x402PriceUsd: optional("X402_QUOTE_PRICE", "$0.005"),
  // Lazy/optional: only required once something actually signs or reasons.
  rpcUrlOverride: (): string | undefined => process.env.CELO_RPC_URL || undefined,
  veniceApiKey: (): string => required("VENICE_API_KEY"),
  agentPrivateKey: (): `0x${string}` => required("AGENT_PRIVATE_KEY") as `0x${string}`,
  thirdwebSecretKey: (): string | undefined => process.env.THIRDWEB_SECRET_KEY || undefined,
  thirdwebServerWallet: (): string | undefined => process.env.THIRDWEB_SERVER_WALLET || undefined,
  publicBaseUrl: (): string | undefined => process.env.PUBLIC_BASE_URL || undefined,
  familyWalletKey: (): `0x${string}` | undefined =>
    (process.env.FAMILY_WALLET_KEY as `0x${string}` | undefined) || undefined,
};
