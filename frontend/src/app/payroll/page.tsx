"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useReadContract, usePublicClient } from "wagmi";
import { useTrackedWrite } from "@/hooks/useTrackedWrite";
import { isAddress, createPublicClient, http } from "viem";
import { sepolia, hardhat } from "viem/chains";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Users, X, Briefcase, ChevronRight, CheckCircle, Clock, XCircle, Play } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import { TxStatus, TxStep } from "@/components/ui/TxStatus";
import { EncryptedBadge } from "@/components/ui/EncryptedBadge";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { PayrollVaultABI } from "@/lib/abis/PayrollVault";
import { ConfidentialUSDCABI } from "@/lib/abis/ConfidentialUSDC";
import { getAddress } from "@/lib/addresses";
import { useFhevm } from "@/lib/fhevm";
import { encrypt64 } from "@/lib/shade";
import { timeAgo } from "@/lib/format";
import toast from "react-hot-toast";

// Persist salaries so Fund can be done in a later session
const SALARY_KEY = (cid: number, runId: bigint) => `shade:payroll:salaries:${cid}:${runId}`;
function cacheSalaries(cid: number, runId: bigint, salaries: string[]) {
  try { localStorage.setItem(SALARY_KEY(cid, runId), JSON.stringify(salaries)); } catch {}
}
function loadCachedSalaries(cid: number, runId: bigint): string[] | null {
  try { const r = localStorage.getItem(SALARY_KEY(cid, runId)); return r ? JSON.parse(r) : null; } catch { return null; }
}

type UserTemplate = { id: bigint; employeeCount: number; createdAt: number; index: number };
type RunInfo    = { id: bigint; templateId: bigint; funded: boolean; executed: boolean; cancelled: boolean; executedAt: number };

function makeClient(chainId: number) {
  const rpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
  if (chainId === 11155111) return createPublicClient({ chain: sepolia, transport: http(rpc || "https://sepolia.drpc.org") });
  if (chainId === 31337)   return createPublicClient({ chain: hardhat, transport: http("http://127.0.0.1:8545") });
  return null;
}

type Tab  = "employer" | "employee";
type View = "list" | "template" | "new-template";

// Which sheet is open on the template detail view
type Sheet = "new-run" | "fund" | null;

export default function PayrollPage() {
  const { address, chainId } = useAccount();
  const { instance } = useFhevm();
  const { writeContractAsync } = useTrackedWrite();
  const client = usePublicClient();

  const [tab,  setTab]  = useState<Tab>("employer");
  const [view, setView] = useState<View>("list");

  // Template detail state
  const [selectedTemplate,   setSelectedTemplate]   = useState<UserTemplate | null>(null);
  const [templateEmployees,  setTemplateEmployees]  = useState<string[]>([]);
  const [templateRuns,       setTemplateRuns]       = useState<RunInfo[]>([]);
  const [userTemplates,      setUserTemplates]      = useState<UserTemplate[]>([]);
  const [loadingTemplates,   setLoadingTemplates]   = useState(false);
  const [loadingDetail,      setLoadingDetail]      = useState(false);

  // Sheet state
  const [sheet,          setSheet]          = useState<Sheet>(null);
  const [fundTargetRun,  setFundTargetRun]  = useState<RunInfo | null>(null);
  const [fundSalaries,   setFundSalaries]   = useState<string[]>([]); // pre-filled from cache or manual
  const [manualTotal,    setManualTotal]    = useState("");            // fallback if no cache

  // New-run sheet
  const [salaries,          setSalaries]          = useState<string[]>([]);
  const [currentSalaryIdx,  setCurrentSalaryIdx]  = useState(0);
  const [sheetSteps,        setSheetSteps]         = useState<TxStep[]>([]);
  const [isSheetBusy,       setIsSheetBusy]        = useState(false);

  // New-template view
  const [employeeAddrs,        setEmployeeAddrs]        = useState([""]);
  const [newTplSalaries,       setNewTplSalaries]       = useState([""]);
  const [newTplSalaryIdx,      setNewTplSalaryIdx]      = useState(0);
  const [newTplSteps,          setNewTplSteps]          = useState<TxStep[]>([]);
  const [isCreatingTemplate,   setIsCreatingTemplate]   = useState(false);

  // Employee claim state
  const [claimed, setClaimed] = useState(false);

  const cid = chainId ?? 31337;
  const vaultAddr  = getAddress(cid, "PayrollVault");
  const cusdcAddr  = getAddress(cid, "ConfidentialUSDC");

  const { data: templateCount, refetch: refetchTemplateCount } = useReadContract({
    address: vaultAddr, abi: PayrollVaultABI, functionName: "templateCount",
    query: { refetchInterval: 15_000 },
  });
  const { data: runCount } = useReadContract({
    address: vaultAddr, abi: PayrollVaultABI, functionName: "runCount",
    query: { refetchInterval: 15_000 },
  });
  const { data: pendingClaimHandle, refetch: refetchClaim } = useReadContract({
    address: vaultAddr, abi: PayrollVaultABI, functionName: "pendingClaim",
    args: [address!], query: { enabled: !!address },
  });

  const hasClaim = !claimed && pendingClaimHandle &&
    pendingClaimHandle !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  // ── Fetch employer's templates ─────────────────────────────────────────
  const fetchUserTemplates = useCallback(async () => {
    if (!address || !chainId) return;
    const c = makeClient(chainId);
    if (!c) return;
    const count = Number(templateCount ?? 0n);
    if (count === 0) { setUserTemplates([]); return; }
    setLoadingTemplates(true);
    try {
      const results: UserTemplate[] = [];
      for (let i = 1; i <= count; i++) {
        const data = await c.readContract({ address: vaultAddr, abi: PayrollVaultABI, functionName: "getTemplate", args: [BigInt(i)] }) as [string, boolean, bigint, bigint];
        if (data[0].toLowerCase() === address.toLowerCase())
          results.push({ id: BigInt(i), employeeCount: Number(data[3]), createdAt: Number(data[2]), index: results.length + 1 });
      }
      setUserTemplates(results);
    } finally { setLoadingTemplates(false); }
  }, [address, chainId, templateCount, vaultAddr]);

  useEffect(() => { fetchUserTemplates(); }, [fetchUserTemplates]);

  async function openTemplate(tpl: UserTemplate) {
    if (!chainId) return;
    const c = makeClient(chainId);
    if (!c) return;
    setSelectedTemplate(tpl);
    setView("template");
    setLoadingDetail(true);
    try {
      const emps = await c.readContract({ address: vaultAddr, abi: PayrollVaultABI, functionName: "getEmployees", args: [tpl.id] }) as string[];
      setTemplateEmployees(emps);
      const rCount = Number(runCount ?? 0n);
      const runs: RunInfo[] = [];
      for (let i = 1; i <= rCount; i++) {
        const s = await c.readContract({ address: vaultAddr, abi: PayrollVaultABI, functionName: "getRunStatus", args: [BigInt(i)] }) as [bigint, boolean, boolean, boolean, bigint];
        if (s[0] === tpl.id) runs.push({ id: BigInt(i), templateId: s[0], funded: s[1], executed: s[2], cancelled: s[3], executedAt: Number(s[4]) });
      }
      setTemplateRuns(runs.reverse());
    } finally { setLoadingDetail(false); }
  }

  async function refreshRuns() {
    if (!selectedTemplate || !chainId) return;
    const c = makeClient(chainId);
    if (!c) return;
    const rCount = Number(runCount ?? 0n);
    const runs: RunInfo[] = [];
    for (let i = 1; i <= rCount; i++) {
      const s = await c.readContract({ address: vaultAddr, abi: PayrollVaultABI, functionName: "getRunStatus", args: [BigInt(i)] }) as [bigint, boolean, boolean, boolean, bigint];
      if (s[0] === selectedTemplate.id) runs.push({ id: BigInt(i), templateId: s[0], funded: s[1], executed: s[2], cancelled: s[3], executedAt: Number(s[4]) });
    }
    setTemplateRuns(runs.reverse());
  }

  function openFundSheet(run: RunInfo) {
    const cached = loadCachedSalaries(cid, run.id);
    setFundTargetRun(run);
    setFundSalaries(cached ?? []);
    setManualTotal("");
    setSheetSteps([]);
    setSheet("fund");
  }

  // ── Employer actions ───────────────────────────────────────────────────

  async function createRun() {
    if (!address || !instance || !client || !selectedTemplate) return;
    if (salaries.some((s) => !s)) { toast.error("Set all salaries"); return; }
    setIsSheetBusy(true);
    setSheetSteps([{ id: "run", label: "Create run on-chain", status: "active" }]);
    try {
      const encSals: `0x${string}`[] = [];
      const proofs:  `0x${string}`[] = [];
      for (const sal of salaries) {
        const { handle, proof } = await encrypt64(instance, vaultAddr, address, BigInt(Math.round(parseFloat(sal) * 1e6)));
        encSals.push(handle); proofs.push(proof);
      }
      const rHash = await writeContractAsync({ address: vaultAddr, abi: PayrollVaultABI, functionName: "createRun", args: [selectedTemplate.id, encSals, proofs] }, "Create Payroll Run");
      await client.waitForTransactionReceipt({ hash: rHash });
      const newRunId = BigInt((runCount ?? 0n) as bigint) + 1n;
      cacheSalaries(cid, newRunId, salaries);
      setSheetSteps((s) => s.map((x) => x.id === "run" ? { ...x, status: "done" } : x));
      toast.success("Run created — fund it when ready");
      setTimeout(() => { setSheet(null); setSheetSteps([]); refreshRuns(); }, 1200);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
      setSheetSteps((s) => s.map((x) => x.status === "active" ? { ...x, status: "error" } : x));
    } finally { setIsSheetBusy(false); }
  }

  async function fundRun() {
    if (!address || !instance || !client || !fundTargetRun) return;
    const totalStr = fundSalaries.length
      ? String(fundSalaries.reduce((acc, s) => acc + parseFloat(s || "0"), 0))
      : manualTotal;
    if (!totalStr || parseFloat(totalStr) === 0) { toast.error("Enter the total amount"); return; }
    const totalAmount = BigInt(Math.round(parseFloat(totalStr) * 1e6));
    setIsSheetBusy(true);
    setSheetSteps([
      { id: "approve", label: "Approve vault to pull funds", status: "active" },
      { id: "fund",    label: "Fund run",                    status: "pending" },
    ]);
    try {
      const { handle: ah, proof: ap } = await encrypt64(instance, cusdcAddr, address, totalAmount);
      const aHash = await writeContractAsync({ address: cusdcAddr, abi: ConfidentialUSDCABI, functionName: "approve", args: [vaultAddr, ah, ap] }, "Approve Vault for Payroll");
      await client.waitForTransactionReceipt({ hash: aHash });
      setSheetSteps((s) => s.map((x) => x.id === "approve" ? { ...x, status: "done" } : x.id === "fund" ? { ...x, status: "active" } : x));

      const fHash = await writeContractAsync({ address: vaultAddr, abi: PayrollVaultABI, functionName: "fundRun", args: [fundTargetRun.id] }, "Fund Payroll Run");
      await client.waitForTransactionReceipt({ hash: fHash });
      setSheetSteps((s) => s.map((x) => x.id === "fund" ? { ...x, status: "done" } : x));
      toast.success("Run funded — execute when ready");
      setTimeout(() => { setSheet(null); setSheetSteps([]); refreshRuns(); }, 1200);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
      setSheetSteps((s) => s.map((x) => x.status === "active" ? { ...x, status: "error" } : x));
    } finally { setIsSheetBusy(false); }
  }

  async function executeRun(run: RunInfo) {
    if (!client) return;
    try {
      const eHash = await writeContractAsync({ address: vaultAddr, abi: PayrollVaultABI, functionName: "executeRun", args: [run.id] }, "Execute Payroll Run");
      await client.waitForTransactionReceipt({ hash: eHash });
      toast.success("Run executed — employees can now claim");
      refreshRuns();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
    }
  }

  // ── Employee claim ─────────────────────────────────────────────────────

  async function claimPayroll() {
    if (!address || !client) return;
    try {
      const hash = await writeContractAsync({ address: vaultAddr, abi: PayrollVaultABI, functionName: "claim", args: [] }, "Claim Payroll");
      await client.waitForTransactionReceipt({ hash });
      setClaimed(true);
      await refetchClaim();
      toast.success("Payroll claimed successfully");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
    }
  }

  // ── Run status helpers ─────────────────────────────────────────────────

  function runState(run: RunInfo): "unfunded" | "funded" | "executed" | "cancelled" {
    if (run.cancelled) return "cancelled";
    if (run.executed)  return "executed";
    if (run.funded)    return "funded";
    return "unfunded";
  }

  const STATE_BADGE: Record<string, React.ReactNode> = {
    unfunded:  <span className="flex items-center gap-1 text-xs text-orange-400"><Clock className="h-3 w-3" />Awaiting funding</span>,
    funded:    <span className="flex items-center gap-1 text-xs text-amber-400"><Clock className="h-3 w-3" />Funded — ready to execute</span>,
    executed:  <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle className="h-3 w-3" />Executed</span>,
    cancelled: <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="h-3 w-3" />Cancelled</span>,
  };

  // ── Template detail view ───────────────────────────────────────────────
  if (view === "template" && selectedTemplate) {
    return (
      <AppShell>
        <PageHeader
          title={`Template #${selectedTemplate.index}`}
          onBack={() => setView("list")}
          right={
            <Button size="sm" onClick={() => {
              setSalaries(Array(selectedTemplate.employeeCount).fill(""));
              setCurrentSalaryIdx(0);
              setSheetSteps([]);
              setSheet("new-run");
            }}>
              <Plus className="h-3.5 w-3.5" /> New Run
            </Button>
          }
        />

        <div className="flex flex-col gap-5 px-4">
          {/* Employees */}
          <GlassCard padding="md">
            <div className="flex flex-col gap-3">
              <SectionLabel>Employees ({templateEmployees.length})</SectionLabel>
              {loadingDetail ? <p className="text-xs text-white/30">Loading…</p> : templateEmployees.map((emp, i) => (
                <div key={emp} className="flex items-center justify-between">
                  <span className="text-xs text-white/40">#{i + 1}</span>
                  <AddressDisplay address={emp} chars={8} />
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Runs */}
          <SectionLabel>Runs</SectionLabel>
          {templateRuns.length === 0 && !loadingDetail ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-white/30">No runs yet</p>
            </div>
          ) : (
            templateRuns.map((run) => {
              const state = runState(run);
              return (
                <GlassCard key={String(run.id)} padding="md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-[#FAFAFA]">Run #{String(run.id)}</span>
                      {STATE_BADGE[state]}
                      {state === "executed" && run.executedAt > 0 && (
                        <span className="text-xs text-white/25">{timeAgo(run.executedAt)}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 items-end shrink-0">
                      {state === "unfunded" && (
                        <Button size="sm" onClick={() => openFundSheet(run)}>Fund</Button>
                      )}
                      {state === "funded" && (
                        <Button size="sm" onClick={() => executeRun(run)}>
                          <Play className="h-3 w-3" /> Execute
                        </Button>
                      )}
                    </div>
                  </div>
                </GlassCard>
              );
            })
          )}
        </div>

        {/* New-run sheet */}
        <AnimatePresence>
          {sheet === "new-run" && (
            <>
              <motion.div className="fixed inset-0 bg-black/60 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !isSheetBusy && setSheet(null)} />
              <motion.div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
                <div className="glass-card rounded-t-3xl p-5 flex flex-col gap-4 max-h-[85dvh] overflow-y-auto no-scrollbar">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-[#FAFAFA]">Set Salaries — New Run</h3>
                    <button onClick={() => !isSheetBusy && setSheet(null)} className="p-1.5 rounded-lg hover:bg-white/[0.06]"><X className="h-4 w-4 text-white/40" /></button>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {templateEmployees.map((emp, i) => (
                      <button key={emp} onClick={() => setCurrentSalaryIdx(i)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${i === currentSalaryIdx ? "bg-amber-500 text-black" : "bg-white/[0.06] text-white/40"}`}>
                        #{i + 1}{salaries[i] ? ` · ${salaries[i]}` : ""}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-white/30"><AddressDisplay address={templateEmployees[currentSalaryIdx] ?? ""} chars={10} /></div>

                  <GlassCard padding="sm">
                    <NumericKeypad value={salaries[currentSalaryIdx] ?? ""} onChange={(v) => { const n = [...salaries]; n[currentSalaryIdx] = v; setSalaries(n); }} unit="cUSDC" />
                  </GlassCard>

                  {sheetSteps.length > 0 && <GlassCard padding="sm"><TxStatus steps={sheetSteps} /></GlassCard>}

                  <p className="text-xs text-white/30 text-center">Run will be created on-chain. You can fund and execute separately.</p>

                  <Button fullWidth size="lg" isLoading={isSheetBusy} disabled={salaries.some((s) => !s)} onClick={createRun}>
                    Create Run
                  </Button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Fund sheet */}
        <AnimatePresence>
          {sheet === "fund" && fundTargetRun && (
            <>
              <motion.div className="fixed inset-0 bg-black/60 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !isSheetBusy && setSheet(null)} />
              <motion.div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
                <div className="glass-card rounded-t-3xl p-5 flex flex-col gap-4 max-h-[85dvh] overflow-y-auto no-scrollbar">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-[#FAFAFA]">Fund Run #{String(fundTargetRun.id)}</h3>
                    <button onClick={() => !isSheetBusy && setSheet(null)} className="p-1.5 rounded-lg hover:bg-white/[0.06]"><X className="h-4 w-4 text-white/40" /></button>
                  </div>

                  {fundSalaries.length > 0 ? (
                    <>
                      <p className="text-xs text-white/40">Salary breakdown from your last session:</p>
                      {templateEmployees.map((emp, i) => (
                        <div key={emp} className="flex items-center justify-between">
                          <AddressDisplay address={emp} chars={8} />
                          <span className="font-mono text-sm text-amber-400">{fundSalaries[i] ?? "—"} cUSDC</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
                        <span className="text-xs text-white/40">Total</span>
                        <span className="font-mono text-sm font-semibold text-[#FAFAFA]">
                          {fundSalaries.reduce((a, s) => a + parseFloat(s || "0"), 0).toFixed(2)} cUSDC
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-orange-400/80">No cached salaries found. Enter the total payroll amount to approve the vault.</p>
                      <GlassCard padding="sm">
                        <NumericKeypad value={manualTotal} onChange={setManualTotal} unit="cUSDC" />
                      </GlassCard>
                    </>
                  )}

                  {sheetSteps.length > 0 && <GlassCard padding="sm"><TxStatus steps={sheetSteps} /></GlassCard>}

                  <Button fullWidth size="lg" isLoading={isSheetBusy} onClick={fundRun}>
                    Approve & Fund
                  </Button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </AppShell>
    );
  }

  // ── New template view ──────────────────────────────────────────────────
  if (view === "new-template") {
    return (
      <AppShell>
        <PageHeader title="New Template" onBack={() => !isCreatingTemplate && setView("list")} />
        <div className="flex flex-col gap-5 px-4">
          <SectionLabel>Employees</SectionLabel>
          {employeeAddrs.map((addr, i) => (
            <div key={i} className="flex flex-col gap-2">
              <span className="text-xs text-white/40 uppercase tracking-wider">Employee {i + 1}</span>
              <Input placeholder="0x..." value={addr} onChange={(e) => { const n = [...employeeAddrs]; n[i] = e.target.value; setEmployeeAddrs(n); }} />
              <div className="text-xs text-white/30">Salary: <span className="font-mono text-amber-400">{newTplSalaries[i] || "—"} cUSDC</span></div>
            </div>
          ))}
          <Button variant="ghost" size="sm" disabled={isCreatingTemplate} onClick={() => { setEmployeeAddrs([...employeeAddrs, ""]); setNewTplSalaries([...newTplSalaries, ""]); }}>
            <Plus className="h-3.5 w-3.5" /> Add Employee
          </Button>

          <SectionLabel>Set Salary — Employee {newTplSalaryIdx + 1}</SectionLabel>
          <div className="flex gap-2 flex-wrap">
            {employeeAddrs.map((_, i) => (
              <button key={i} onClick={() => setNewTplSalaryIdx(i)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${i === newTplSalaryIdx ? "bg-amber-500 text-black" : "bg-white/[0.06] text-white/40"}`}>
                #{i + 1}{newTplSalaries[i] ? ` · ${newTplSalaries[i]}` : ""}
              </button>
            ))}
          </div>

          <GlassCard padding="sm">
            <NumericKeypad value={newTplSalaries[newTplSalaryIdx] ?? ""} onChange={(v) => { const n = [...newTplSalaries]; n[newTplSalaryIdx] = v; setNewTplSalaries(n); }} unit="cUSDC" />
          </GlassCard>

          {newTplSteps.length > 0 && <GlassCard padding="sm"><TxStatus steps={newTplSteps} /></GlassCard>}

          <p className="text-xs text-white/30 text-center leading-relaxed">
            Creates the template and the first run. You can fund and execute separately from the template detail.
          </p>

          <Button fullWidth size="lg" isLoading={isCreatingTemplate} onClick={createTemplateAndFirstRun}>
            Create Template & First Run
          </Button>
        </div>
      </AppShell>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────
  return (
    <AppShell>
      <PageHeader title="Payroll" showBack={false}
        right={tab === "employer" ? (
          <Button size="sm" variant="secondary" onClick={() => { setEmployeeAddrs([""]); setNewTplSalaries([""]); setNewTplSalaryIdx(0); setNewTplSteps([]); setView("new-template"); }}>
            <Plus className="h-3.5 w-3.5" /> New Template
          </Button>
        ) : null}
      />

      <div className="flex flex-col gap-5 px-4">
        <div className="flex gap-2 p-1 glass-card rounded-2xl">
          {(["employer", "employee"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-all ${tab === t ? "bg-amber-500 text-black" : "text-white/40 hover:text-white/70"}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === "employer" ? (
          <div className="flex flex-col gap-3">
            {loadingTemplates ? (
              <div className="flex flex-col items-center py-12"><p className="text-sm text-white/30">Loading…</p></div>
            ) : userTemplates.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <div className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center"><Briefcase className="h-6 w-6 text-white/20" /></div>
                <p className="text-sm text-white/40">No templates yet</p>
                <Button onClick={() => setView("new-template")}><Plus className="h-4 w-4" /> Create Template</Button>
              </div>
            ) : (
              <>
                <SectionLabel>Your Templates</SectionLabel>
                {userTemplates.map((tpl) => (
                  <button key={String(tpl.id)} onClick={() => openTemplate(tpl)} className="w-full text-left">
                    <GlassCard padding="md">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                          <Users className="h-4 w-4 text-amber-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[#FAFAFA]">Template #{tpl.index}</p>
                          <p className="text-xs text-white/30 mt-0.5">{tpl.employeeCount} employee{tpl.employeeCount !== 1 ? "s" : ""} · {timeAgo(tpl.createdAt)}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-white/20" />
                      </div>
                    </GlassCard>
                  </button>
                ))}
              </>
            )}
          </div>
        ) : (
          /* Employee tab */
          <div className="flex flex-col gap-4">
            {claimed ? (
              <GlassCard padding="md" glow>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#FAFAFA]">Payroll Claimed</p>
                    <p className="text-xs text-white/40 mt-0.5">Transferred to your cUSDC balance</p>
                  </div>
                </div>
              </GlassCard>
            ) : hasClaim ? (
              <GlassCard padding="md">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#FAFAFA]">Payroll Pending</p>
                      <p className="text-xs text-white/40 mt-0.5">Ready to claim</p>
                    </div>
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
    </AppShell>
  );

  // ── Extracted: create template + first run (called from new-template view) ──
  async function createTemplateAndFirstRun() {
    if (!address || !instance || !client) return;
    const validEmployees = employeeAddrs.filter((a): a is `0x${string}` => isAddress(a));
    if (validEmployees.length === 0 || newTplSalaries.some((s) => !s)) { toast.error("Fill all employee addresses and salaries"); return; }
    setIsCreatingTemplate(true);
    setNewTplSteps([
      { id: "template", label: "Create payroll template",  status: "active" },
      { id: "run",      label: "Create first run",         status: "pending" },
    ]);
    const ntStep = (done: string, next: string) =>
      setNewTplSteps((s) => s.map((x) => x.id === done ? { ...x, status: "done" } : x.id === next ? { ...x, status: "active" } : x));
    try {
      const tHash = await writeContractAsync({ address: vaultAddr, abi: PayrollVaultABI, functionName: "createTemplate", args: [validEmployees] }, "Create Payroll Template");
      await client.waitForTransactionReceipt({ hash: tHash });
      const newTemplateId = BigInt((templateCount ?? 0n) as bigint) + 1n;
      ntStep("template", "run");

      const encSals: `0x${string}`[] = [];
      const proofs:  `0x${string}`[] = [];
      for (const sal of newTplSalaries) {
        const { handle, proof } = await encrypt64(instance, vaultAddr, address, BigInt(Math.round(parseFloat(sal) * 1e6)));
        encSals.push(handle); proofs.push(proof);
      }
      const rHash = await writeContractAsync({ address: vaultAddr, abi: PayrollVaultABI, functionName: "createRun", args: [newTemplateId, encSals, proofs] }, "Create First Run");
      await client.waitForTransactionReceipt({ hash: rHash });
      const newRunId = BigInt((runCount ?? 0n) as bigint) + 1n;
      cacheSalaries(cid, newRunId, newTplSalaries);
      setNewTplSteps((s) => s.map((x) => x.id === "run" ? { ...x, status: "done" } : x));

      toast.success("Template created — open it to fund and execute");
      refetchTemplateCount();
      setTimeout(() => { setView("list"); setNewTplSteps([]); setEmployeeAddrs([""]); setNewTplSalaries([""]); }, 1500);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
      setNewTplSteps((s) => s.map((x) => x.status === "active" ? { ...x, status: "error" } : x));
    } finally { setIsCreatingTemplate(false); }
  }
}
