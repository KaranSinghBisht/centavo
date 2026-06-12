/**
 * Generates a dedicated agent wallet and appends it to .env (refuses to
 * overwrite an existing key). Fund it with a small amount of CELO only.
 */
import fs from "node:fs";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ENV_PATH = ".env";

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
if (/^AGENT_PRIVATE_KEY=0x/m.test(existing)) {
  print("AGENT_PRIVATE_KEY already set in .env — refusing to overwrite.");
  process.exit(1);
}

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
fs.appendFileSync(ENV_PATH, `AGENT_PRIVATE_KEY=${privateKey}\n`, { mode: 0o600 });
print(`Agent address: ${account.address}`);
print("Private key written to .env (gitignored). Fund with a SMALL amount of CELO only.");
