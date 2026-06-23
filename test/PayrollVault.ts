import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import * as hre from "hardhat";
import { ethers } from "hardhat";

const { fhevm, upgrades } = hre as any;

async function enc64(contractAddr: string, user: HardhatEthersSigner, value: bigint | number) {
  const input = fhevm.createEncryptedInput(contractAddr, user.address);
  input.add64(value);
  const enc = await input.encrypt();
  return { handle: enc.handles[0], proof: enc.inputProof };
}

async function deployFixture() {
  const [deployer, employer, bob, carol, dave] = await ethers.getSigners();

  const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
  await usdc.waitForDeployment();

  const cusdc = await upgrades.deployProxy(
    await ethers.getContractFactory("ConfidentialUSDC"),
    [await usdc.getAddress(), deployer.address],
    { kind: "uups" },
  );
  await cusdc.waitForDeployment();
  const cusdcAddr = await cusdc.getAddress();

  const vault = await upgrades.deployProxy(
    await ethers.getContractFactory("PayrollVault"),
    [cusdcAddr, deployer.address],
    { kind: "uups" },
  );
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();

  // Give the employer 10_000 cUSDC.
  await (await usdc.mint(employer.address, 10_000)).wait();
  await (await usdc.connect(employer).approve(cusdcAddr, 10_000)).wait();
  await (await cusdc.connect(employer).shield(10_000)).wait();

  return { usdc, cusdc, cusdcAddr, vault, vaultAddr, deployer, employer, bob, carol, dave };
}

async function bal(cusdc: any, cusdcAddr: string, who: HardhatEthersSigner) {
  return fhevm.userDecryptEuint(FhevmType.euint64, await cusdc.balanceOf(who.address), cusdcAddr, who);
}

/** Run salaries for [bob, carol, dave] = [100,200,300]; returns runId. */
async function createFundedRun(ctx: any) {
  const { cusdc, cusdcAddr, vault, vaultAddr, employer, bob, carol, dave } = ctx;
  await (await vault.connect(employer).createTemplate([bob.address, carol.address, dave.address])).wait();
  const templateId = await vault.templateCount();

  const s1 = await enc64(vaultAddr, employer, 100);
  const s2 = await enc64(vaultAddr, employer, 200);
  const s3 = await enc64(vaultAddr, employer, 300);
  await (
    await vault
      .connect(employer)
      .createRun(templateId, [s1.handle, s2.handle, s3.handle], [s1.proof, s2.proof, s3.proof])
  ).wait();
  const runId = await vault.runCount();

  // Approve and fund (total = 600).
  const ap = await enc64(cusdcAddr, employer, 600);
  await (await cusdc.connect(employer).approve(vaultAddr, ap.handle, ap.proof)).wait();
  await (await vault.connect(employer).fundRun(runId)).wait();
  return runId;
}

describe("PayrollVault", function () {
  it("full happy path: template -> run -> fund -> execute (3 employees)", async function () {
    const ctx = await deployFixture();
    const { cusdc, cusdcAddr, vault, vaultAddr, employer } = ctx;

    const runId = await createFundedRun(ctx);

    // Employer balance dropped by the total (600), which is now held by the vault.
    expect(await bal(cusdc, cusdcAddr, employer)).to.eq(9_400n);

    await expect(vault.connect(employer).executeRun(runId)).to.emit(vault, "RunExecuted");

    const status = await vault.getRunStatus(runId);
    expect(status.funded).to.eq(true);
    expect(status.executed).to.eq(true);
  });

  it("employee claims their salary into cUSDC", async function () {
    const ctx = await deployFixture();
    const { cusdc, cusdcAddr, vault, employer, bob } = ctx;
    const runId = await createFundedRun(ctx);
    await (await vault.connect(employer).executeRun(runId)).wait();

    await (await vault.connect(bob).claim()).wait();
    expect(await bal(cusdc, cusdcAddr, bob)).to.eq(100n);
  });

  it("employee cannot read another employee's salary handle", async function () {
    const ctx = await deployFixture();
    const { vault, vaultAddr, bob, dave } = ctx;
    const runId = await createFundedRun(ctx);

    // bob reads his own salary fine.
    const bobSalary = await vault.salaryOf(runId, bob.address);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, bobSalary, vaultAddr, bob)).to.eq(100n);

    // dave cannot decrypt bob's salary.
    await expect(fhevm.userDecryptEuint(FhevmType.euint64, bobSalary, vaultAddr, dave)).to.be.rejected;
  });

  it("employer cannot execute an unfunded run", async function () {
    const ctx = await deployFixture();
    const { vault, vaultAddr, employer, bob } = ctx;

    await (await vault.connect(employer).createTemplate([bob.address])).wait();
    const templateId = await vault.templateCount();
    const s = await enc64(vaultAddr, employer, 50);
    await (await vault.connect(employer).createRun(templateId, [s.handle], [s.proof])).wait();
    const runId = await vault.runCount();

    await expect(vault.connect(employer).executeRun(runId)).to.be.revertedWith("not funded");
  });

  it("cancel returns funded cUSDC to the employer", async function () {
    const ctx = await deployFixture();
    const { cusdc, cusdcAddr, vault, employer } = ctx;
    const runId = await createFundedRun(ctx);

    expect(await bal(cusdc, cusdcAddr, employer)).to.eq(9_400n);
    await expect(vault.connect(employer).cancelRun(runId)).to.emit(vault, "RunCancelled");
    expect(await bal(cusdc, cusdcAddr, employer)).to.eq(10_000n); // fully refunded
  });

  it("non-employer cannot create a run on a template", async function () {
    const ctx = await deployFixture();
    const { vault, vaultAddr, employer, bob } = ctx;
    await (await vault.connect(employer).createTemplate([bob.address])).wait();
    const templateId = await vault.templateCount();
    const s = await enc64(vaultAddr, bob, 50);
    await expect(vault.connect(bob).createRun(templateId, [s.handle], [s.proof])).to.be.revertedWith(
      "not employer",
    );
  });
});
