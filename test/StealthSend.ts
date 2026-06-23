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

async function bal(cusdc: any, cusdcAddr: string, who: HardhatEthersSigner) {
  return fhevm.userDecryptEuint(FhevmType.euint64, await cusdc.balanceOf(who.address), cusdcAddr, who);
}

async function deployFixture() {
  const [deployer, sender, recipient, wrongUser] = await ethers.getSigners();

  const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
  await usdc.waitForDeployment();

  const cusdc = await upgrades.deployProxy(
    await ethers.getContractFactory("ConfidentialUSDC"),
    [await usdc.getAddress(), deployer.address],
    { kind: "uups" },
  );
  await cusdc.waitForDeployment();
  const cusdcAddr = await cusdc.getAddress();

  const stealth = await upgrades.deployProxy(
    await ethers.getContractFactory("StealthSend"),
    [cusdcAddr, deployer.address],
    { kind: "uups" },
  );
  await stealth.waitForDeployment();
  const stealthAddr = await stealth.getAddress();

  // sender shields 2000 cUSDC.
  await (await usdc.mint(sender.address, 2000)).wait();
  await (await usdc.connect(sender).approve(cusdcAddr, 2000)).wait();
  await (await cusdc.connect(sender).shield(2000)).wait();

  return { usdc, cusdc, cusdcAddr, stealth, stealthAddr, deployer, sender, recipient, wrongUser };
}

/** Send a stealth transfer of `amount` to `recipient`; returns id. */
async function stealthSend(ctx: any, amount: number) {
  const { cusdc, cusdcAddr, stealth, stealthAddr, sender, recipient } = ctx;

  const ap = await enc64(cusdcAddr, sender, amount);
  await (await cusdc.connect(sender).approve(stealthAddr, ap.handle, ap.proof)).wait();

  const input = fhevm.createEncryptedInput(stealthAddr, sender.address);
  input.add64(amount);
  input.addAddress(recipient.address);
  const enc = await input.encrypt();

  await (await stealth.connect(sender).send(enc.handles[0], enc.handles[1], enc.inputProof)).wait();
  return stealth.transferCount();
}

describe("StealthSend", function () {
  it("correct recipient can claim the encrypted amount", async function () {
    const ctx = await deployFixture();
    const { cusdc, cusdcAddr, stealth, recipient } = ctx;
    const id = await stealthSend(ctx, 500);

    await (await stealth.connect(recipient).claim(id)).wait();
    expect(await bal(cusdc, cusdcAddr, recipient)).to.eq(500n);
  });

  it("a non-recipient claim moves nothing; the real recipient still can", async function () {
    const ctx = await deployFixture();
    const { cusdc, cusdcAddr, stealth, recipient, wrongUser } = ctx;
    const id = await stealthSend(ctx, 500);

    // Wrong user attempts to claim — silently gets 0, no revert.
    await (await stealth.connect(wrongUser).claim(id)).wait();
    expect(await bal(cusdc, cusdcAddr, wrongUser)).to.eq(0n);

    // The real recipient can still claim the full amount.
    await (await stealth.connect(recipient).claim(id)).wait();
    expect(await bal(cusdc, cusdcAddr, recipient)).to.eq(500n);
  });

  it("the recipient address is hidden on-chain (eaddress)", async function () {
    const ctx = await deployFixture();
    const { stealth, stealthAddr, sender, recipient, wrongUser } = ctx;
    const id = await stealthSend(ctx, 500);

    const recHandle = await stealth.stealthRecipient(id);

    // The sender can decrypt the recipient they chose.
    expect((await fhevm.userDecryptEaddress(recHandle, stealthAddr, sender)).toLowerCase()).to.eq(
      recipient.address.toLowerCase(),
    );

    // An outsider cannot.
    await expect(fhevm.userDecryptEaddress(recHandle, stealthAddr, wrongUser)).to.be.rejected;
  });

  it("double claim by the recipient pays only once", async function () {
    const ctx = await deployFixture();
    const { cusdc, cusdcAddr, stealth, recipient } = ctx;
    const id = await stealthSend(ctx, 500);

    await (await stealth.connect(recipient).claim(id)).wait();
    await (await stealth.connect(recipient).claim(id)).wait(); // second claim moves 0
    expect(await bal(cusdc, cusdcAddr, recipient)).to.eq(500n);
  });
});
