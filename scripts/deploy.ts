import { ethers, upgrades, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys the Shade contracts as UUPS proxies and writes their addresses to
 * deployments/<network>.json for the frontend to consume.
 *
 * Build order matters (see the Shade spec): ConfidentialUSDC is the foundation
 * every other contract depends on.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}  network: ${network.name}`);

  // Resolve the backing USDC. On chains without a canonical USDC, deploy MockUSDC.
  let usdcAddress = process.env.USDC_ADDRESS ?? "";
  if (!usdcAddress) {
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();
    usdcAddress = await usdc.getAddress();
    console.log(`MockUSDC deployed:      ${usdcAddress}`);
  }

  // 1. ConfidentialUSDC — the foundation every other contract builds on.
  const cusdc = await upgrades.deployProxy(
    await ethers.getContractFactory("ConfidentialUSDC"),
    [usdcAddress, deployer.address],
    { kind: "uups", initializer: "initialize" },
  );
  await cusdc.waitForDeployment();
  const cusdcAddress = await cusdc.getAddress();
  console.log(`ConfidentialUSDC proxy: ${cusdcAddress}`);

  // 2-5. The feature contracts, each pointed at cUSDC.
  const cusdcConsumers = ["PayrollVault", "PrivateEscrow", "BalanceProver", "StealthSend"] as const;
  const addresses: Record<string, string> = {};
  for (const name of cusdcConsumers) {
    const c = await upgrades.deployProxy(
      await ethers.getContractFactory(name),
      [cusdcAddress, deployer.address],
      { kind: "uups", initializer: "initialize" },
    );
    await c.waitForDeployment();
    addresses[name] = await c.getAddress();
    console.log(`${name} proxy: ${addresses[name]}`);
  }

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    usdc: usdcAddress,
    ConfidentialUSDC: cusdcAddress,
    ...addresses,
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`Wrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
