import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
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

async function bal(cusdc: any, cusdcAddr: string, who: HardhatEthersSigner) {
  return fhevm.userDecryptEuint(FhevmType.euint64, await cusdc.balanceOf(who.address), cusdcAddr, who);
}

async function deployFixture() {
  const [deployer, depositor, recipient, arbiter, outsider] = await ethers.getSigners();

  const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
  await usdc.waitForDeployment();

  const cusdc = await upgrades.deployProxy(
    await ethers.getContractFactory("ConfidentialUSDC"),
    [await usdc.getAddress(), deployer.address],
    { kind: "uups" },
  );
  await cusdc.waitForDeployment();
  const cusdcAddr = await cusdc.getAddress();

  const escrow = await upgrades.deployProxy(
    await ethers.getContractFactory("PrivateEscrow"),
    [cusdcAddr, deployer.address],
    { kind: "uups" },
  );
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();

  // Depositor gets 5000 cUSDC.
  await (await usdc.mint(depositor.address, 5000)).wait();
  await (await usdc.connect(depositor).approve(cusdcAddr, 5000)).wait();
  await (await cusdc.connect(depositor).shield(5000)).wait();

  return { usdc, cusdc, cusdcAddr, escrow, escrowAddr, deployer, depositor, recipient, arbiter, outsider };
}

/** create + fund an escrow of 1000 with the given arbiter; returns id. */
async function createFunded(ctx: any, arbiterAddr: string, timeout = 3600) {
  const { cusdc, cusdcAddr, escrow, escrowAddr, depositor, recipient } = ctx;
  await (await escrow.connect(depositor).createEscrow(recipient.address, arbiterAddr, timeout)).wait();
  const id = await escrow.escrowCount();

  const ap = await enc64(cusdcAddr, depositor, 1000);
  await (await cusdc.connect(depositor).approve(escrowAddr, ap.handle, ap.proof)).wait();
  const fa = await enc64(escrowAddr, depositor, 1000);
  await (await escrow.connect(depositor).fund(id, fa.handle, fa.proof)).wait();
  return id;
}

const STATE = { CREATED: 0, FUNDED: 1, RELEASED: 2, DISPUTED: 3, REFUNDED: 4, CANCELLED: 5 };

describe("PrivateEscrow", function () {
  it("happy path: create -> fund -> release", async function () {
    const ctx = await deployFixture();
    const { cusdc, cusdcAddr, escrow, depositor, recipient } = ctx;
    const id = await createFunded(ctx, ethers.ZeroAddress);

    expect(await bal(cusdc, cusdcAddr, depositor)).to.eq(4000n); // 5000 - 1000 locked
    await expect(escrow.connect(recipient).release(id)).to.emit(escrow, "EscrowReleased");

    expect(await bal(cusdc, cusdcAddr, recipient)).to.eq(1000n);
    expect((await escrow.getEscrow(id)).state).to.eq(STATE.RELEASED);
  });

  it("dispute -> resolveToRecipient", async function () {
    const ctx = await deployFixture();
    const { cusdc, cusdcAddr, escrow, depositor, recipient, arbiter } = ctx;
    const id = await createFunded(ctx, arbiter.address);

    await (await escrow.connect(depositor).dispute(id)).wait();
    await (await escrow.connect(arbiter).resolveToRecipient(id)).wait();

    expect(await bal(cusdc, cusdcAddr, recipient)).to.eq(1000n);
    expect((await escrow.getEscrow(id)).state).to.eq(STATE.RELEASED);
  });

  it("dispute -> resolveToDepositor", async function () {
    const ctx = await deployFixture();
    const { cusdc, cusdcAddr, escrow, depositor, recipient, arbiter } = ctx;
    const id = await createFunded(ctx, arbiter.address);

    await (await escrow.connect(recipient).dispute(id)).wait();
    await (await escrow.connect(arbiter).resolveToDepositor(id)).wait();

    expect(await bal(cusdc, cusdcAddr, depositor)).to.eq(5000n); // fully refunded
    expect((await escrow.getEscrow(id)).state).to.eq(STATE.REFUNDED);
  });

  it("timeout self-refund after the deadline", async function () {
    const ctx = await deployFixture();
    const { cusdc, cusdcAddr, escrow, depositor } = ctx;
    const id = await createFunded(ctx, ethers.ZeroAddress, 100);

    await expect(escrow.connect(depositor).timeout(id)).to.be.revertedWith("too early");
    await time.increase(101);
    await (await escrow.connect(depositor).timeout(id)).wait();

    expect(await bal(cusdc, cusdcAddr, depositor)).to.eq(5000n);
    expect((await escrow.getEscrow(id)).state).to.eq(STATE.REFUNDED);
  });

  it("non-arbiter cannot resolve", async function () {
    const ctx = await deployFixture();
    const { escrow, depositor, outsider, arbiter } = ctx;
    const id = await createFunded(ctx, arbiter.address);
    await (await escrow.connect(depositor).dispute(id)).wait();

    await expect(escrow.connect(outsider).resolveToRecipient(id)).to.be.revertedWith("not arbiter");
    await expect(escrow.connect(depositor).resolveToDepositor(id)).to.be.revertedWith("not arbiter");
  });

  it("non-recipient cannot release", async function () {
    const ctx = await deployFixture();
    const { escrow, depositor, outsider } = ctx;
    const id = await createFunded(ctx, ethers.ZeroAddress);
    await expect(escrow.connect(outsider).release(id)).to.be.revertedWith("not recipient");
    await expect(escrow.connect(depositor).release(id)).to.be.revertedWith("not recipient");
  });
});
