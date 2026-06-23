import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Reads the storage slot where ERC1967 stores the implementation address.
async function getImpl(proxyAddr: string): Promise<string> {
  const slot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const raw = await ethers.provider.getStorage(proxyAddr, slot);
  return ethers.getAddress("0x" + raw.slice(-40));
}

async function verify(address: string, name: string) {
  console.log(`\nVerifying ${name} impl @ ${address}`);
  try {
    await run("verify:verify", {
      address,
      constructorArguments: [],
    });
    console.log(`✓ ${name}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Already Verified") || msg.includes("already verified")) {
      console.log(`✓ ${name} (already verified)`);
    } else {
      console.error(`✗ ${name}: ${msg}`);
    }
  }
}

async function main() {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No deployment file found at ${file} — deploy first`);
  }

  const dep = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`Verifying Shade contracts on ${network.name} (chainId ${dep.chainId})\n`);

  const contracts = [
    "ConfidentialUSDC",
    "PayrollVault",
    "PrivateEscrow",
    "BalanceProver",
    "StealthSend",
  ] as const;

  const seen = new Set<string>();

  for (const name of contracts) {
    const proxy = dep[name];
    if (!proxy) { console.warn(`No address for ${name}, skipping`); continue; }
    const impl = await getImpl(proxy);
    console.log(`${name}: proxy=${proxy} → impl=${impl}`);
    if (seen.has(impl)) {
      console.log(`  (same impl as a previous contract, skipping duplicate verify)`);
      continue;
    }
    seen.add(impl);
    await verify(impl, name);
  }

  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
