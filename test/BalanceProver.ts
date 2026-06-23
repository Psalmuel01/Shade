import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
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
  const [deployer, user, viewer] = await ethers.getSigners();

  const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
  await usdc.waitForDeployment();

  const cusdc = await upgrades.deployProxy(
    await ethers.getContractFactory("ConfidentialUSDC"),
    [await usdc.getAddress(), deployer.address],
    { kind: "uups" },
  );
  await cusdc.waitForDeployment();
  const cusdcAddr = await cusdc.getAddress();

  const prover = await upgrades.deployProxy(
    await ethers.getContractFactory("BalanceProver"),
    [cusdcAddr, deployer.address],
    { kind: "uups" },
  );
  await prover.waitForDeployment();
  const proverAddr = await prover.getAddress();

  // user shields 1000 cUSDC.
  await (await usdc.mint(user.address, 1000)).wait();
  await (await usdc.connect(user).approve(cusdcAddr, 1000)).wait();
  await (await cusdc.connect(user).shield(1000)).wait();

  return { usdc, cusdc, cusdcAddr, prover, proverAddr, deployer, user, viewer };
}

/** Run the full async proof: authorize -> proveAbove -> publicDecrypt -> publishProof. */
async function runProof(ctx: any, threshold: number) {
  const { cusdc, cusdcAddr, prover, proverAddr, user } = ctx;

  await (await cusdc.connect(user).authorizeBalanceRead(proverAddr)).wait();
  const t = await enc64(proverAddr, user, threshold);
  await (await prover.connect(user).proveAbove(t.handle, t.proof)).wait();

  const handle = await prover.pendingHandle(user.address);
  // Off-chain relayer (mock): produce the KMS-signed cleartext for the ebool.
  const res = await fhevm.publicDecrypt([handle]);
  await (
    await prover.connect(user).publishProof(user.address, res.abiEncodedClearValues, res.decryptionProof)
  ).wait();
}

describe("BalanceProver", function () {
  it("threshold below balance => proof result is true", async function () {
    const ctx = await deployFixture();
    await runProof(ctx, 500); // balance 1000 >= 500

    const proof = await ctx.prover.getProof(ctx.user.address);
    expect(proof.exists).to.eq(true);
    expect(proof.result).to.eq(true);
  });

  it("threshold above balance => proof result is false", async function () {
    const ctx = await deployFixture();
    await runProof(ctx, 5000); // balance 1000 >= 5000 is false

    const proof = await ctx.prover.getProof(ctx.user.address);
    expect(proof.exists).to.eq(true);
    expect(proof.result).to.eq(false);
  });

  it("any third party can read a published proof", async function () {
    const ctx = await deployFixture();
    await runProof(ctx, 500);

    // viewer (unrelated account) reads the public result.
    const proof = await ctx.prover.connect(ctx.viewer).getProof(ctx.user.address);
    expect(proof.result).to.eq(true);
  });

  it("user can clear their own proof", async function () {
    const ctx = await deployFixture();
    await runProof(ctx, 500);
    expect((await ctx.prover.getProof(ctx.user.address)).exists).to.eq(true);

    await (await ctx.prover.connect(ctx.user).clearProof()).wait();
    expect((await ctx.prover.getProof(ctx.user.address)).exists).to.eq(false);
  });
});
