"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useTrackedWrite } from "@/hooks/useTrackedWrite";
import { isAddress } from "viem";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Users, X, Briefcase } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import { EncryptedBadge } from "@/components/ui/EncryptedBadge";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { PayrollVaultABI } from "@/lib/abis/PayrollVault";
import { ConfidentialUSDCABI } from "@/lib/abis/ConfidentialUSDC";
import { getAddress } from "@/lib/addresses";
import { useFhevm } from "@/lib/fhevm";
import { encrypt64 } from "@/lib/shade";
import toast from "react-hot-toast";

type Tab = "employer" | "employee";

export default function PayrollPage() {
  const { address, chainId } = useAccount();
  const { instance } = useFhevm();
  const { writeContractAsync } = useTrackedWrite();
  const [tab, setTab] = useState<Tab>("employer");
  const [showCreate, setShowCreate] = useState(false);
  const [employeeAddrs, setEmployeeAddrs] = useState([""]);
  const [salaries, setSalaries] = useState([""]);
  const [currentSalaryIdx, setCurrentSalaryIdx] = useState(0);
  const [isCreating, setIsCreating] = useState(false);

  const cid = chainId ?? 31337;
  const vaultAddr = getAddress(cid, "PayrollVault");
  const cusdcAddr = getAddress(cid, "ConfidentialUSDC");

  const { data: templateCount } = useReadContract({
    address: vaultAddr,
    abi: PayrollVaultABI,
    functionName: "templateCount",
    query: { refetchInterval: 10_000 },
  });

  const { data: pendingClaimHandle } = useReadContract({
    address: vaultAddr,
    abi: PayrollVaultABI,
    functionName: "pendingClaim",
    args: [address!],
    query: { enabled: !!address },
  });

  const hasClaim = pendingClaimHandle && pendingClaimHandle !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  async function createPayrollRun() {
    if (!address || !instance) return;
    const validEmployees = employeeAddrs.filter((a): a is `0x${string}` => isAddress(a));
    if (validEmployees.length === 0 || salaries.some((s) => !s)) {
      toast.error("Fill all employee addresses and salaries");
      return;
    }
    setIsCreating(true);
    try {
      const templateId = await writeContractAsync({
        address: vaultAddr,
        abi: PayrollVaultABI,
        functionName: "createTemplate",
        args: [validEmployees as `0x${string}`[]],
      }, "Create Payroll Template");

      const newTemplateId = BigInt((templateCount ?? 0n) as bigint) + 1n;
      const encryptedSalaries: `0x${string}`[] = [];
      const proofs: `0x${string}`[] = [];

      for (const [i, sal] of salaries.entries()) {
        const amount = BigInt(Math.round(parseFloat(sal) * 1e6));
        const { handle, proof } = await encrypt64(instance, vaultAddr, address, amount);
        encryptedSalaries.push(handle);
        proofs.push(proof);
      }

      await writeContractAsync({
        address: vaultAddr,
        abi: PayrollVaultABI,
        functionName: "createRun",
        args: [newTemplateId, encryptedSalaries, proofs],
      }, "Create Payroll Run");

      const runId = BigInt((await readRunCount()) ?? 1n);
      await writeContractAsync({
        address: vaultAddr,
        abi: PayrollVaultABI,
        functionName: "fundRun",
        args: [runId],
      }, "Fund Payroll Run");
      await writeContractAsync({
        address: vaultAddr,
        abi: PayrollVaultABI,
        functionName: "executeRun",
        args: [runId],
      }, "Execute Payroll Run");

      toast.success("Payroll run complete");
      setShowCreate(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
    } finally {
      setIsCreating(false);
    }
  }

  async function readRunCount(): Promise<bigint> {
    return 1n;
  }

  async function claimPayroll() {
    if (!address) return;
    try {
      await writeContractAsync({
        address: vaultAddr,
        abi: PayrollVaultABI,
        functionName: "claim",
        args: [],
      }, "Claim Payroll");
      toast.success("Payroll claimed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Payroll"
        showBack={false}
        right={
          tab === "employer" ? (
            <Button size="sm" variant="secondary" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" /> New Run
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-5 px-4">
        {/* Tab pills */}
        <div className="flex gap-2 p-1 glass-card rounded-2xl">
          {(["employer", "employee"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-all ${
                tab === t ? "bg-amber-500 text-black" : "text-white/40 hover:text-white/70"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "employer" ? (
          <div className="flex flex-col gap-4">
            {Number(templateCount ?? 0n) === 0 ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <div className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center">
                  <Briefcase className="h-6 w-6 text-white/20" />
                </div>
                <p className="text-sm text-white/40">No payroll runs yet</p>
                <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create Run</Button>
              </div>
            ) : (
              <GlassCard padding="md">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-amber-400" />
                  <span className="text-sm text-[#FAFAFA]">{Number(templateCount ?? 0n)} template(s)</span>
                </div>
              </GlassCard>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {hasClaim ? (
              <GlassCard padding="md">
                <div className="flex flex-col gap-4">
                  <SectionLabel>Pending Payroll</SectionLabel>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-white/40">Amount</span>
                    <EncryptedBadge size="sm" />
                  </div>
                  <Button fullWidth onClick={claimPayroll}>Claim Payroll</Button>
                </div>
              </GlassCard>
            ) : (
              <div className="flex flex-col items-center gap-3 py-12">
                <div className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center">
                  <Briefcase className="h-6 w-6 text-white/20" />
                </div>
                <p className="text-sm text-white/40">No pending payroll</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create bottom sheet */}
      <AnimatePresence>
        {showCreate && (
          <>
            <motion.div className="fixed inset-0 bg-black/60 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCreate(false)} />
            <motion.div
              className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <div className="glass-card rounded-t-3xl p-5 flex flex-col gap-4 max-h-[80dvh] overflow-y-auto no-scrollbar">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[#FAFAFA]">New Payroll Run</h3>
                  <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-white/[0.06]">
                    <X className="h-4 w-4 text-white/40" />
                  </button>
                </div>

                {employeeAddrs.map((addr, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <span className="text-xs text-white/40 uppercase tracking-wider">Employee {i + 1}</span>
                    <Input
                      placeholder="0x..."
                      value={addr}
                      onChange={(e) => {
                        const next = [...employeeAddrs];
                        next[i] = e.target.value;
                        setEmployeeAddrs(next);
                      }}
                    />
                    <div className="text-xs text-white/30">
                      Salary: <span className="font-mono text-amber-400">{salaries[i] || "—"} cUSDC</span>
                    </div>
                  </div>
                ))}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEmployeeAddrs([...employeeAddrs, ""]);
                    setSalaries([...salaries, ""]);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Employee
                </Button>

                <SectionLabel>Set Salary — Employee {currentSalaryIdx + 1}</SectionLabel>

                <div className="flex gap-2 flex-wrap">
                  {employeeAddrs.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentSalaryIdx(i)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${i === currentSalaryIdx ? "bg-amber-500 text-black" : "bg-white/[0.06] text-white/40"}`}
                    >
                      #{i + 1}
                    </button>
                  ))}
                </div>

                <GlassCard padding="sm">
                  <NumericKeypad
                    value={salaries[currentSalaryIdx] ?? ""}
                    onChange={(v) => {
                      const next = [...salaries];
                      next[currentSalaryIdx] = v;
                      setSalaries(next);
                    }}
                  />
                </GlassCard>

                <Button fullWidth size="lg" isLoading={isCreating} onClick={createPayrollRun}>
                  Send Payroll
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
