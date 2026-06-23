import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import * as hre from "hardhat";
import { ethers } from "hardhat";

const { fhevm, upgrades } = hre as any;

async function deployFixture() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();

  const ConfidentialUSDC = await ethers.getContractFactory("ConfidentialUSDC");
  const cusdc = await upgrades.deployProxy(
    ConfidentialUSDC,
    [await usdc.getAddress(), deployer.address],
    { kind: "uups", initializer: "initialize" },
  );
  await cusdc.waitForDeployment();

  const cusdcAddr = await cusdc.getAddress();
  await fhevm.assertCoprocessorInitialized(cusdc, "ConfidentialUSDC");

  // Fund alice and bob with public USDC and approve cUSDC to pull it.
  for (const who of [alice, bob]) {
    await (await usdc.mint(who.address, 1_000_000)).wait();
    await (await usdc.connect(who).approve(cusdcAddr, 1_000_000)).wait();
  }

  return { usdc, cusdc, cusdcAddr, deployer, alice, bob, carol };
}

/** Encrypt a euint64 input bound to (contract, user). */
async function enc64(cusdcAddr: string, user: HardhatEthersSigner, value: bigint | number) {
  const input = fhevm.createEncryptedInput(cusdcAddr, user.address);
  input.add64(value);
  const enc = await input.encrypt();
  return { handle: enc.handles[0], proof: enc.inputProof };
}

/** Decrypt the caller-readable balance handle. */
async function balOf(cusdc: any, cusdcAddr: string, account: HardhatEthersSigner) {
  const handle = await cusdc.balanceOf(account.address);
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, cusdcAddr, account);
}

describe("ConfidentialUSDC", function () {
  it("shield: deposits public USDC and mints encrypted cUSDC", async function () {
    const { usdc, cusdc, cusdcAddr, alice } = await deployFixture();

    await (await cusdc.connect(alice).shield(1000)).wait();

    expect(await balOf(cusdc, cusdcAddr, alice)).to.eq(1000n);
    expect(await usdc.balanceOf(cusdcAddr)).to.eq(1000n); // USDC moved into the vault
    expect(await usdc.balanceOf(alice.address)).to.eq(999_000n);
  });

  it("transfer happy path: amounts update on both sides", async function () {
    const { cusdc, cusdcAddr, alice, bob } = await deployFixture();
    await (await cusdc.connect(alice).shield(1000)).wait();

    const { handle, proof } = await enc64(cusdcAddr, alice, 300);
    await (await cusdc.connect(alice)["transfer(address,bytes32,bytes)"](bob.address, handle, proof)).wait();

    expect(await balOf(cusdc, cusdcAddr, alice)).to.eq(700n);
    expect(await balOf(cusdc, cusdcAddr, bob)).to.eq(300n);
  });

  it("transfer silent failure: overspend leaves balances unchanged, no revert", async function () {
    const { cusdc, cusdcAddr, alice, bob } = await deployFixture();
    await (await cusdc.connect(alice).shield(1000)).wait();

    const { handle, proof } = await enc64(cusdcAddr, alice, 5000); // more than balance
    await (await cusdc.connect(alice)["transfer(address,bytes32,bytes)"](bob.address, handle, proof)).wait();

    expect(await balOf(cusdc, cusdcAddr, alice)).to.eq(1000n);
    expect(await balOf(cusdc, cusdcAddr, bob)).to.eq(0n);
  });

  it("approve + transferFrom: spender pulls within allowance", async function () {
    const { cusdc, cusdcAddr, alice, bob, carol } = await deployFixture();
    await (await cusdc.connect(alice).shield(1000)).wait();

    const ap = await enc64(cusdcAddr, alice, 400);
    await (await cusdc.connect(alice).approve(bob.address, ap.handle, ap.proof)).wait();

    const sp = await enc64(cusdcAddr, bob, 250);
    await (await cusdc.connect(bob)["transferFrom(address,address,bytes32,bytes)"](alice.address, carol.address, sp.handle, sp.proof)).wait();

    expect(await balOf(cusdc, cusdcAddr, alice)).to.eq(750n);
    expect(await balOf(cusdc, cusdcAddr, carol)).to.eq(250n);
  });

  it("transferFrom silent failure: over-allowance pulls nothing", async function () {
    const { cusdc, cusdcAddr, alice, bob, carol } = await deployFixture();
    await (await cusdc.connect(alice).shield(1000)).wait();

    const ap = await enc64(cusdcAddr, alice, 100);
    await (await cusdc.connect(alice).approve(bob.address, ap.handle, ap.proof)).wait();

    const sp = await enc64(cusdcAddr, bob, 500); // exceeds the 100 allowance
    await (await cusdc.connect(bob)["transferFrom(address,address,bytes32,bytes)"](alice.address, carol.address, sp.handle, sp.proof)).wait();

    expect(await balOf(cusdc, cusdcAddr, alice)).to.eq(1000n);
    expect(await balOf(cusdc, cusdcAddr, carol)).to.eq(0n);
  });

  it("ACL: a third party cannot decrypt someone else's balance handle", async function () {
    const { cusdc, cusdcAddr, alice, bob } = await deployFixture();
    await (await cusdc.connect(alice).shield(1000)).wait();

    const aliceHandle = await cusdc.balanceOf(alice.address);
    // bob has no ACL grant on alice's balance handle → decryption must fail.
    await expect(
      fhevm.userDecryptEuint(FhevmType.euint64, aliceHandle, cusdcAddr, bob),
    ).to.be.rejected;
  });

  it("requestUnshield: burns encrypted balance and emits a request (finalize needs the relayer)", async function () {
    const { cusdc, cusdcAddr, alice } = await deployFixture();
    await (await cusdc.connect(alice).shield(1000)).wait();

    const { handle, proof } = await enc64(cusdcAddr, alice, 400);
    await expect(cusdc.connect(alice).requestUnshield(handle, proof))
      .to.emit(cusdc, "UnshieldRequested")
      .withArgs(alice.address, 1n);

    // The burned amount is removed from the encrypted balance immediately.
    expect(await balOf(cusdc, cusdcAddr, alice)).to.eq(600n);

    const pending = await cusdc.pendingUnshields(1);
    expect(pending.user).to.eq(alice.address);
    expect(pending.finalized).to.eq(false);
  });

  it("full round trip: USDC -> shield -> transfer -> unshield -> USDC", async function () {
    const { usdc, cusdc, cusdcAddr, alice, bob } = await deployFixture();

    // alice shields 1000 and sends 400 to bob.
    await (await cusdc.connect(alice).shield(1000)).wait();
    const t = await enc64(cusdcAddr, alice, 400);
    await (await cusdc.connect(alice)["transfer(address,bytes32,bytes)"](bob.address, t.handle, t.proof)).wait();
    expect(await balOf(cusdc, cusdcAddr, bob)).to.eq(400n);

    // bob unshields 400 back to public USDC (two-step async public decryption).
    const u = await enc64(cusdcAddr, bob, 400);
    await (await cusdc.connect(bob).requestUnshield(u.handle, u.proof)).wait();
    const requestId = await cusdc.unshieldNonce();
    const pending = await cusdc.pendingUnshields(requestId);

    const res = await fhevm.publicDecrypt([pending.amountHandle]);
    const bobUsdcBefore = await usdc.balanceOf(bob.address);
    await (
      await cusdc.connect(bob).finalizeUnshield(requestId, res.abiEncodedClearValues, res.decryptionProof)
    ).wait();

    expect(await usdc.balanceOf(bob.address)).to.eq(bobUsdcBefore + 400n);
    expect(await balOf(cusdc, cusdcAddr, bob)).to.eq(0n);
  });
});
