import { ethers, upgrades, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys a fresh PrivateEscrow proxy against the already-deployed ConfidentialUSDC.
 * Use this when the contract has breaking state changes (e.g. new enum values)
 * that make an in-place upgrade unsafe.
 *
 * Usage:
 *   npx hardhat run scripts/deployEscrow.ts --network sepolia
 *
 * The existing ConfidentialUSDC address is read from deployments/<network>.json.
 * The new PrivateEscrow address is written back to that file.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}  network: ${network.name}`);

  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No deployment file found at ${file}. Run the full deploy script first.`);
  }

  const existing = JSON.parse(fs.readFileSync(file, "utf8"));
  const cusdcAddress: string = existing.ConfidentialUSDC;
  if (!cusdcAddress) throw new Error("ConfidentialUSDC address missing from deployment file");

  console.log(`Using ConfidentialUSDC: ${cusdcAddress}`);
  console.log(`Old PrivateEscrow:      ${existing.PrivateEscrow ?? "none"}`);

  const escrow = await upgrades.deployProxy(
    await ethers.getContractFactory("PrivateEscrow"),
    [cusdcAddress, deployer.address],
    { kind: "uups", initializer: "initialize" },
  );
  await escrow.waitForDeployment();
  const newAddr = await escrow.getAddress();
  console.log(`New PrivateEscrow:      ${newAddr}`);

  existing.PrivateEscrow = newAddr;
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
  console.log(`Updated ${file}`);
  console.log(`\nNext: set NEXT_PUBLIC_PRIVATE_ESCROW=${newAddr} in your frontend env`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
