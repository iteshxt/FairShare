"use" + " client";

import React, { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Person {
  id: string;
  name: string;
}

interface PersonBalance {
  personId: string;
  personName: string;
  totalPaid: number;
  totalOwed: number;
  netBalance: number;
}

interface SimplifiedDebt {
  from: string;
  to: string;
  amount: number;
}

interface ExpenseContribution {
  expenseId: string;
  description: string;
  date: string;
  paidBy: string;
  totalAmount: number;
  youPaid: number;
  yourShare: number;
  netEffect: number;
  splitType: string;
  allocationType: string;
  allocationValue: number;
}

interface BalanceTrace {
  personName: string;
  expenses: ExpenseContribution[];
}

export default function GroupDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const params = React.use(paramsPromise as Promise<{ slug: string }>);
  const slug = params.slug;
  const { data: session, status } = useSession();
  const router = useRouter();

  // State
  const [group, setGroup] = useState<any>(null);
  const [balances, setBalances] = useState<PersonBalance[]>([]);
  const [simplifiedDebts, setSimplifiedDebts] = useState<SimplifiedDebt[]>([]);
  const [traces, setTraces] = useState<Record<string, BalanceTrace>>({});
  const [persons, setPersons] = useState<Person[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"balances" | "expenses" | "settlements">("balances");

  // Selected trace person for auditing
  const [selectedTracePerson, setSelectedTracePerson] = useState<string | null>(null);

  // Modal control
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");

  // Expense form state
  const [expenseId, setExpenseId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [paidById, setPaidById] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [splitType, setSplitType] = useState<"EQUAL" | "PERCENTAGE" | "SHARE" | "EXACT">("EQUAL");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [splitAllocations, setSplitAllocations] = useState<Record<string, string>>({}); // personId -> value string
  const [expenseError, setExpenseError] = useState("");
  const [expenseLoading, setExpenseLoading] = useState(false);

  // Settlement form state
  const [settlePayerId, setSettlePayerId] = useState("");
  const [settleReceiverId, setSettleReceiverId] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleDate, setSettleDate] = useState(new Date().toISOString().slice(0, 10));
  const [settleError, setSettleError] = useState("");
  const [settleLoading, setSettleLoading] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/groups/${slug}/balances`);
      if (!res.ok) {
        throw new Error("Failed to fetch group details");
      }
      const data = await res.json();
      setGroup(data.group);
      setBalances(data.balances || []);
      setSimplifiedDebts(data.simplifiedDebts || []);
      setTraces(data.traces || {});
      setPersons(data.persons || []);
      setExpenses(data.expenses || []);
      setSettlements(data.settlements || []);

      // Autofill default payer if empty
      if (data.persons?.length > 0 && !paidById) {
        setPaidById(data.persons[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      loadData();
    }
  }, [status, slug]);

  // Pre-fill participants when persons load
  useEffect(() => {
    if (persons.length > 0 && selectedParticipants.length === 0) {
      setSelectedParticipants(persons.map((p) => p.id));
    }
  }, [persons]);

  // Autofill exchange rate when currency changes
  useEffect(() => {
    if (currency === "USD") {
      setExchangeRate("83");
    } else {
      setExchangeRate("1");
    }
  }, [currency]);

  // Handle participant checkbox toggle
  const toggleParticipant = (pId: string) => {
    if (selectedParticipants.includes(pId)) {
      setSelectedParticipants(selectedParticipants.filter((id) => id !== pId));
    } else {
      setSelectedParticipants([...selectedParticipants, pId]);
    }
  };

  // Perform split calculations live in UI
  const getCalculatedSplits = () => {
    const total = parseFloat(amount) || 0;
    const rate = parseFloat(exchangeRate) || 1;
    const totalINR = total * rate;

    if (selectedParticipants.length === 0) return [];

    if (splitType === "EQUAL") {
      const share = Math.round((totalINR / selectedParticipants.length) * 100) / 100;
      return selectedParticipants.map((pId) => ({
        personId: pId,
        allocationType: "EQUAL" as const,
        allocationValue: 1,
        calculatedAmount: share,
      }));
    }

    if (splitType === "PERCENTAGE") {
      return selectedParticipants.map((pId) => {
        const pct = parseFloat(splitAllocations[pId]) || 0;
        const calculatedAmount = Math.round((totalINR * (pct / 100)) * 100) / 100;
        return {
          personId: pId,
          allocationType: "PERCENTAGE" as const,
          allocationValue: pct,
          calculatedAmount,
        };
      });
    }

    if (splitType === "SHARE") {
      const totalShares = selectedParticipants.reduce((sum, pId) => {
        return sum + (parseFloat(splitAllocations[pId]) || 0);
      }, 0);

      return selectedParticipants.map((pId) => {
        const sh = parseFloat(splitAllocations[pId]) || 0;
        const calculatedAmount =
          totalShares > 0 ? Math.round((totalINR * (sh / totalShares)) * 100) / 100 : 0;
        return {
          personId: pId,
          allocationType: "SHARE" as const,
          allocationValue: sh,
          calculatedAmount,
        };
      });
    }

    if (splitType === "EXACT") {
      return selectedParticipants.map((pId) => {
        const val = parseFloat(splitAllocations[pId]) || 0;
        return {
          personId: pId,
          allocationType: "EXACT" as const,
          allocationValue: val,
          calculatedAmount: val, // in INR directly
        };
      });
    }

    return [];
  };

  const calculatedSplits = getCalculatedSplits();
  const calculatedSplitsTotal = calculatedSplits.reduce((s, c) => s + c.calculatedAmount, 0);
  const totalAmountINR = (parseFloat(amount) || 0) * (parseFloat(exchangeRate) || 1);
  const splitsDiff = Math.abs(calculatedSplitsTotal - totalAmountINR);

  // Submit Expense Form
  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseError("");

    if (!description.trim()) {
      setExpenseError("Description is required");
      return;
    }
    const parsedAmt = parseFloat(amount);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      setExpenseError("Please enter a valid positive amount");
      return;
    }
    if (selectedParticipants.length === 0) {
      setExpenseError("Please select at least one participant");
      return;
    }

    // Validate splits match total for exact/percentage/share
    if (splitType === "PERCENTAGE") {
      const totalPct = selectedParticipants.reduce(
        (s, pId) => s + (parseFloat(splitAllocations[pId]) || 0),
        0
      );
      if (Math.abs(totalPct - 100) > 0.01) {
        setExpenseError(`Total percentage must equal 100% (currently ${totalPct}%)`);
        return;
      }
    }
    if (splitType === "EXACT" && splitsDiff > 0.05) {
      setExpenseError(`Sum of splits (₹${calculatedSplitsTotal.toFixed(2)}) must equal total amount (₹${totalAmountINR.toFixed(2)})`);
      return;
    }

    setExpenseLoading(true);

    try {
      const body = {
        id: expenseId, // used in edit mode
        groupId: group.id,
        description: description.trim(),
        amount: parsedAmt,
        currency,
        exchangeRate: parseFloat(exchangeRate) || 1,
        paidById,
        expenseDate,
        notes,
        participants: calculatedSplits,
      };

      const endpoint = "/api/expenses";
      const method = modalMode === "create" ? "POST" : "PUT";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to save expense");
      }

      // Refresh data
      setShowExpenseModal(false);
      resetExpenseForm();
      loadData();
    } catch (err: any) {
      setExpenseError(err.message || "An unexpected error occurred");
    } finally {
      setExpenseLoading(false);
    }
  };

  const resetExpenseForm = () => {
    setExpenseId("");
    setDescription("");
    setAmount("");
    setCurrency("INR");
    setExchangeRate("1");
    setPaidById(persons[0]?.id || "");
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setSplitType("EQUAL");
    setSelectedParticipants(persons.map((p) => p.id));
    setSplitAllocations({});
    setExpenseError("");
  };

  // Edit Expense
  const handleEditExpenseClick = (exp: any) => {
    setModalMode("edit");
    setExpenseId(exp.id);
    setDescription(exp.description);
    setAmount(String(exp.amount));
    setCurrency(exp.currency);
    setExchangeRate(String(exp.exchange_rate));
    setPaidById(exp.paid_by_id);
    setExpenseDate(new Date(exp.expense_date).toISOString().slice(0, 10));
    setNotes(exp.notes || "");

    // Load participants and splits
    const parts = exp.participants || [];
    const partIds = parts.map((p: any) => p.person_id);
    setSelectedParticipants(partIds);

    const allocs: Record<string, string> = {};
    parts.forEach((p: any) => {
      allocs[p.person_id] = String(p.allocation_value);
      setSplitType(p.allocation_type); // assuming uniform type
    });
    setSplitAllocations(allocs);

    setShowExpenseModal(true);
  };

  // Soft Delete Expense
  const handleDeleteExpenseClick = async (expId: string) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;

    try {
      const res = await fetch(`/api/expenses?id=${expId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete expense");
      }
      loadData();
    } catch (err) {
      alert("Error deleting expense");
    }
  };

  // Submit Settlement Form
  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettleError("");

    if (!settlePayerId || !settleReceiverId || !settleAmount) {
      setSettleError("All fields are required");
      return;
    }
    if (settlePayerId === settleReceiverId) {
      setSettleError("Payer and receiver must be different people");
      return;
    }
    const val = parseFloat(settleAmount);
    if (isNaN(val) || val <= 0) {
      setSettleError("Please enter a valid positive amount");
      return;
    }

    setSettleLoading(true);

    try {
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: group.id,
          payerId: settlePayerId,
          receiverId: settleReceiverId,
          amount: val,
          settlementDate: settleDate,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to record settlement");
      }

      setShowSettleModal(false);
      setSettleAmount("");
      loadData();
    } catch (err: any) {
      setSettleError(err.message || "An unexpected error occurred");
    } finally {
      setSettleLoading(false);
    }
  };

  // Click on simplified debt to auto-settle
  const handleSettleDebtClick = (debt: SimplifiedDebt) => {
    const p = persons.find((x) => x.name.toLowerCase() === debt.from.toLowerCase());
    const r = persons.find((x) => x.name.toLowerCase() === debt.to.toLowerCase());

    if (p && r) {
      setSettlePayerId(p.id);
      setSettleReceiverId(r.id);
      setSettleAmount(String(debt.amount));
      setShowSettleModal(true);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FDFBF7]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-stone-500 font-medium text-sm font-sans">Loading group transactions ledger...</p>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#FDFBF7] p-4 text-center">
        <span className="text-4xl block mb-4">🔍</span>
        <h3 className="text-lg font-bold text-stone-850">Group Not Found</h3>
        <p className="text-stone-500 text-sm mt-1 mb-6">This group does not exist or you don't have access.</p>
        <Link href="/" className="py-2.5 px-5 bg-amber-500 text-white rounded-2xl text-xs font-bold shadow-sm">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#FDFBF7]">
      {/* Header */}
      <header className="bg-white border-b-2 border-stone-100 px-4 py-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-stone-400 hover:text-stone-800 transition-colors font-bold text-lg">
              🏡
            </Link>
            <span className="text-stone-300">/</span>
            <h1 className="text-lg font-black text-stone-800 tracking-tight">{group.name}</h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/groups/${slug}/import`}
              className="py-2 px-3.5 bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-bold rounded-2xl transition-colors cursor-pointer border border-stone-200/50"
            >
              📥 Import CSV
            </Link>
            <button
              onClick={() => {
                setModalMode("create");
                resetExpenseForm();
                setShowExpenseModal(true);
              }}
              className="py-2 px-3.5 bg-amber-500 hover:bg-amber-400 border-b-2 border-amber-600 active:border-b-0 active:translate-y-[2px] text-white text-xs font-bold rounded-2xl transition-all cursor-pointer"
            >
              + Add Expense
            </button>
          </div>
        </div>
      </header>

      {/* Main Ledger Area */}
      <main className="max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex-1">
        {/* Navigation Tabs */}
        <div className="flex border-b-2 border-stone-100 mb-6 gap-2">
          {(["balances", "expenses", "settlements"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-4 -mb-[2px] transition-all cursor-pointer ${
                activeTab === tab
                  ? "border-amber-500 text-amber-600"
                  : "border-transparent text-stone-400 hover:text-stone-600"
              }`}
            >
              {tab === "balances" ? "📊 Balances & Traces" : tab === "expenses" ? "💸 Expense List" : "🤝 Settlement Log"}
            </button>
          ))}
        </div>

        {/* Tab 1: Balances & Traces */}
        {activeTab === "balances" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Net Balances List */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-3xl border-2 border-stone-100 p-6 shadow-sm">
                <h3 className="text-base font-black text-stone-800 mb-4 flex items-center gap-1.5">
                  <span>📊</span> Net Group Balances
                </h3>
                <div className="divide-y-2 divide-stone-50">
                  {balances.map((bal) => {
                    const isCreditor = bal.netBalance > 0.01;
                    const isDebtor = bal.netBalance < -0.01;
                    return (
                      <div key={bal.personId} className="py-3.5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-2xl font-bold flex items-center justify-center text-base border-2 ${
                            isCreditor
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                              : isDebtor
                              ? "bg-rose-50 text-rose-600 border-rose-100"
                              : "bg-stone-50 text-stone-400 border-stone-100"
                          }`}>
                            {bal.personName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-extrabold text-stone-850 text-sm">{bal.personName}</p>
                            <p className="text-[10px] text-stone-400 uppercase font-semibold">
                              Spent: ₹{bal.totalPaid.toFixed(2)} • Share: ₹{bal.totalOwed.toFixed(2)}
                            </p>
                          </div>
                        </div>

                        <div className="text-right flex items-center gap-3">
                          <div>
                            <p className={`font-black text-sm ${
                              isCreditor
                                ? "text-emerald-600"
                                : isDebtor
                                ? "text-rose-600"
                                : "text-stone-400"
                            }`}>
                              {isCreditor ? `+₹${bal.netBalance.toFixed(2)}` : isDebtor ? `-₹${Math.abs(bal.netBalance).toFixed(2)}` : "Settled"}
                            </p>
                            <p className="text-[10px] text-stone-400 font-medium">
                              {isCreditor ? "is owed" : isDebtor ? "owes overall" : "good to go"}
                            </p>
                          </div>
                          <button
                            onClick={() => setSelectedTracePerson(
                              selectedTracePerson === bal.personName ? null : bal.personName
                            )}
                            className="py-1.5 px-3 bg-stone-50 hover:bg-stone-100 text-[10px] font-bold text-stone-500 rounded-xl transition-colors cursor-pointer border border-stone-200/50"
                          >
                            {selectedTracePerson === bal.personName ? "Hide Trace ✕" : "Audit Trace 🔎"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Trace Explainability Audit log */}
              {selectedTracePerson && traces[selectedTracePerson] && (
                <div className="bg-white rounded-3xl border-2 border-amber-200 p-6 shadow-md shadow-amber-50/50 animate-in slide-in-from-top-4 duration-200">
                  <div className="flex items-center justify-between mb-4 border-b-2 border-stone-50 pb-3">
                    <div>
                      <h4 className="font-black text-stone-800 text-sm flex items-center gap-1.5">
                        <span>🔎</span> Explainable Audit Trace: {selectedTracePerson}
                      </h4>
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        Trace shows every expense & settlement this member was involved in.
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedTracePerson(null)}
                      className="text-stone-400 hover:text-stone-600 text-xs font-bold"
                    >
                      ✕ Close
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                    {traces[selectedTracePerson].expenses.length === 0 ? (
                      <p className="text-xs text-stone-400 italic text-center py-4">
                        No transactions recorded for this member.
                      </p>
                    ) : (
                      traces[selectedTracePerson].expenses.map((c, index) => {
                        const isPlus = c.netEffect > 0.01;
                        const isMinus = c.netEffect < -0.01;

                        return (
                          <div
                            key={index}
                            className="p-3 bg-stone-50 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center border border-stone-100 gap-2"
                          >
                            <div>
                              <p className="text-xs font-extrabold text-stone-800">{c.description}</p>
                              <div className="flex flex-wrap gap-x-2 text-[10px] text-stone-400 font-semibold mt-0.5">
                                <span>📅 {c.date}</span>
                                <span>•</span>
                                <span>Paid by: {c.paidBy}</span>
                                <span>•</span>
                                <span>Split: {c.splitType} ({c.allocationType === "PERCENTAGE" ? `${c.allocationValue}%` : c.allocationType === "SHARE" ? `${c.allocationValue} shares` : c.allocationType})</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 text-left sm:text-right self-end sm:self-auto border-t sm:border-t-0 pt-2 sm:pt-0 border-stone-200 w-full sm:w-auto justify-between sm:justify-end">
                              <div className="text-[10px] text-stone-400 font-medium">
                                Paid: ₹{c.youPaid.toFixed(2)} <br />
                                Share: ₹{c.yourShare.toFixed(2)}
                              </div>
                              <div>
                                <span className={`text-xs font-black ${
                                  isPlus
                                    ? "text-emerald-600"
                                    : isMinus
                                    ? "text-rose-600"
                                    : "text-stone-400"
                                }`}>
                                  {isPlus ? `+₹${c.netEffect.toFixed(2)}` : isMinus ? `-₹${Math.abs(c.netEffect).toFixed(2)}` : "₹0.00"}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t-2 border-stone-50 flex items-center justify-between text-xs font-bold text-stone-600">
                    <span>Final Calculated Balance:</span>
                    <span className={
                      (balances.find((b) => b.personName === selectedTracePerson)?.netBalance || 0) > 0.01
                        ? "text-emerald-600 font-black text-sm"
                        : (balances.find((b) => b.personName === selectedTracePerson)?.netBalance || 0) < -0.01
                        ? "text-rose-600 font-black text-sm"
                        : "text-stone-400 font-black text-sm"
                    }>
                      ₹{(balances.find((b) => b.personName === selectedTracePerson)?.netBalance || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Settle Recommendations Section */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl border-2 border-stone-100 p-6 shadow-sm">
                <h3 className="text-base font-black text-stone-800 mb-4 flex items-center gap-1.5">
                  <span>💡</span> Settle Debts (Minimised)
                </h3>
                {simplifiedDebts.length === 0 ? (
                  <div className="py-6 text-center">
                    <span className="text-3xl block mb-2">🎉</span>
                    <p className="text-xs text-stone-500 font-extrabold">All debts are fully settled!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {simplifiedDebts.map((debt, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSettleDebtClick(debt)}
                        className="p-3 bg-amber-50/50 hover:bg-amber-100/50 border-2 border-amber-100/30 rounded-2xl transition-all flex flex-col justify-between cursor-pointer group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-medium text-stone-700">
                            <span className="font-extrabold text-stone-850">{debt.from}</span> owes <span className="font-extrabold text-stone-850">{debt.to}</span>
                          </div>
                          <span className="text-xs font-black text-amber-600">₹{debt.amount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-end items-center gap-1 text-[10px] font-bold text-amber-500 opacity-80 group-hover:opacity-100 transition-opacity">
                          <span>Auto-record settlement</span>
                          <span>➔</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Record Settlement Card */}
              <div className="bg-[#FFFDF9] rounded-3xl border-2 border-amber-200/50 p-6 shadow-sm text-center">
                <span className="text-3xl block mb-2">💸</span>
                <h4 className="font-black text-stone-800 text-sm mb-1">Made a payment?</h4>
                <p className="text-[10px] text-stone-400 mb-4">
                  Log a payment to clear off debt and balance the sheets.
                </p>
                <button
                  onClick={() => {
                    setSettleAmount("");
                    setSettlePayerId(persons[0]?.id || "");
                    setSettleReceiverId(persons[1]?.id || "");
                    setShowSettleModal(true);
                  }}
                  className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 border-b-2 border-amber-600 active:border-b-0 active:translate-y-[2px] text-white text-xs font-bold rounded-2xl transition-all cursor-pointer"
                >
                  Record Payment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Expenses Ledger List */}
        {activeTab === "expenses" && (
          <div className="bg-white rounded-3xl border-2 border-stone-100 shadow-sm overflow-hidden">
            {expenses.length === 0 ? (
              <div className="p-12 text-center">
                <span className="text-4xl block mb-4">📋</span>
                <h4 className="text-lg font-bold text-stone-800">No Expenses Logged</h4>
                <p className="text-stone-500 text-xs mt-1 mb-6">
                  Add an expense or upload the spreadsheet to start tracking.
                </p>
                <button
                  onClick={() => {
                    setModalMode("create");
                    resetExpenseForm();
                    setShowExpenseModal(true);
                  }}
                  className="py-2.5 px-5 bg-amber-500 text-white rounded-2xl text-xs font-bold shadow-sm"
                >
                  + Add Your First Expense
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y-2 divide-stone-100 text-left text-xs text-stone-600">
                  <thead className="bg-stone-50 text-[10px] font-extrabold uppercase text-stone-400 tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Description</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Paid By</th>
                      <th className="px-6 py-4">Participants Split</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-stone-50 font-medium">
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-stone-500 font-semibold">{exp.expense_date}</td>
                        <td className="px-6 py-4">
                          <p className="font-extrabold text-stone-850">{exp.description}</p>
                          {exp.notes && <p className="text-[10px] text-stone-400 truncate max-w-[200px] mt-0.5">{exp.notes}</p>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="font-black text-stone-800">₹{(exp.amount * exp.exchange_rate).toFixed(2)}</p>
                          {exp.currency === "USD" && (
                            <p className="text-[10px] text-amber-500 font-semibold">
                              ${exp.amount.toFixed(2)} USD @ {exp.exchange_rate}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-bold text-stone-700">{exp.paid_by?.name || "Unknown"}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5 max-w-[250px]">
                            {exp.participants?.map((p: any) => (
                              <span
                                key={p.id}
                                className="inline-block px-2 py-1 bg-stone-100 border border-stone-200 text-stone-500 text-[10px] rounded-lg font-bold"
                              >
                                {p.person?.name || "Unknown"}: ₹{p.calculated_amount}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                          <button
                            onClick={() => handleEditExpenseClick(exp)}
                            className="py-1 px-2.5 bg-stone-50 hover:bg-amber-50 text-stone-500 hover:text-amber-600 rounded-xl transition-colors cursor-pointer border border-stone-200/50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteExpenseClick(exp.id)}
                            className="py-1 px-2.5 bg-stone-50 hover:bg-rose-50 text-stone-400 hover:text-rose-600 rounded-xl transition-colors cursor-pointer border border-stone-200/50"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Settlements History Log */}
        {activeTab === "settlements" && (
          <div className="bg-white rounded-3xl border-2 border-stone-100 shadow-sm overflow-hidden">
            {settlements.length === 0 ? (
              <div className="p-12 text-center">
                <span className="text-4xl block mb-4">🤝</span>
                <h4 className="text-lg font-bold text-stone-800">No Payments Logged</h4>
                <p className="text-stone-500 text-xs mt-1">
                  Log peer-to-peer payments when members settle their recommended balances.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y-2 divide-stone-100 text-left text-xs text-stone-600">
                  <thead className="bg-stone-50 text-[10px] font-extrabold uppercase text-stone-400 tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Payer</th>
                      <th className="px-6 py-4">Receiver</th>
                      <th className="px-6 py-4">Amount Settle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-stone-50 font-medium">
                    {settlements.map((set) => (
                      <tr key={set.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-stone-500 font-semibold">{set.settlement_date}</td>
                        <td className="px-6 py-4 whitespace-nowrap font-bold text-stone-850">{set.payer?.name || "Unknown"}</td>
                        <td className="px-6 py-4 whitespace-nowrap font-bold text-stone-850">{set.receiver?.name || "Unknown"}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-1 bg-emerald-50 border border-emerald-100 text-emerald-600 font-black rounded-lg">
                            ₹{set.amount.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-stone-400 border-t border-stone-100 mt-12 bg-white">
        <p>© 2026 FairShare. Built for transparent split logs.</p>
      </footer>

      {/* Expense Modal (Add / Edit) */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border-2 border-stone-100 shadow-2xl max-w-xl w-full p-6 relative animate-in fade-in zoom-in-95 duration-150 my-8">
            <h3 className="text-lg font-black text-stone-850 tracking-tight mb-2">
              {modalMode === "create" ? "Add New Expense" : "Edit Expense"}
            </h3>

            {expenseError && (
              <div className="p-3 mb-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold">
                ⚠️ {expenseError}
              </div>
            )}

            <form onSubmit={handleExpenseSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Description */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-stone-700 uppercase mb-1">Description</label>
                  <input
                    type="text"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Groceries or Taxi split"
                    className="appearance-none block w-full px-4 py-2.5 border-2 border-stone-100 rounded-2xl placeholder-stone-400 text-stone-850 focus:outline-none focus:border-amber-400 transition-colors text-sm"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="appearance-none block w-full px-4 py-2.5 border-2 border-stone-100 rounded-2xl placeholder-stone-400 text-stone-850 focus:outline-none focus:border-amber-400 transition-colors text-sm"
                  />
                </div>

                {/* Currency */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase mb-1">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="block w-full px-4 py-2.5 border-2 border-stone-100 rounded-2xl text-stone-850 bg-white focus:outline-none focus:border-amber-400 transition-colors text-sm"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>

                {/* Exchange Rate (only show if USD) */}
                {currency === "USD" && (
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase mb-1">USD to INR Rate</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      placeholder="83"
                      className="appearance-none block w-full px-4 py-2.5 border-2 border-stone-100 rounded-2xl placeholder-stone-400 text-stone-850 focus:outline-none focus:border-amber-400 transition-colors text-sm"
                    />
                  </div>
                )}

                {/* Date */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="block w-full px-4 py-2.5 border-2 border-stone-100 rounded-2xl text-stone-850 focus:outline-none focus:border-amber-400 transition-colors text-sm"
                  />
                </div>

                {/* Paid By */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase mb-1">Paid By</label>
                  <select
                    value={paidById}
                    onChange={(e) => setPaidById(e.target.value)}
                    className="block w-full px-4 py-2.5 border-2 border-stone-100 rounded-2xl text-stone-850 bg-white focus:outline-none focus:border-amber-400 transition-colors text-sm"
                  >
                    {persons.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase mb-1">Notes (Optional)</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. bills linked"
                    className="appearance-none block w-full px-4 py-2.5 border-2 border-stone-100 rounded-2xl placeholder-stone-400 text-stone-850 focus:outline-none focus:border-amber-400 transition-colors text-sm"
                  />
                </div>
              </div>

              {/* Split Configuration */}
              <div className="border-t-2 border-stone-50 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-stone-700 uppercase">Participants & Split Type</label>
                  <select
                    value={splitType}
                    onChange={(e) => {
                      setSplitType(e.target.value as any);
                      setSplitAllocations({}); // Reset allocs on type change
                    }}
                    className="py-1 px-3 border-2 border-stone-100 rounded-xl text-xs bg-white text-stone-800"
                  >
                    <option value="EQUAL">Split Equally</option>
                    <option value="PERCENTAGE">Split by %</option>
                    <option value="SHARE">Split by Shares</option>
                    <option value="EXACT">Split by Exact INR</option>
                  </select>
                </div>

                {/* Participant splits input */}
                <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
                  {persons.map((p) => {
                    const isChecked = selectedParticipants.includes(p.id);
                    const splitVal = splitAllocations[p.id] || "";
                    const calculatedShare = calculatedSplits.find((c) => c.personId === p.id)?.calculatedAmount || 0;

                    return (
                      <div key={p.id} className="flex items-center justify-between text-xs py-1">
                        <label className="flex items-center gap-2 font-bold text-stone-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleParticipant(p.id)}
                            className="rounded text-amber-500 focus:ring-0 w-4 h-4"
                          />
                          <span>{p.name}</span>
                        </label>

                        {isChecked && (
                          <div className="flex items-center gap-3">
                            {splitType !== "EQUAL" && (
                              <input
                                type="number"
                                step="any"
                                required
                                value={splitVal}
                                onChange={(e) => setSplitAllocations({
                                  ...splitAllocations,
                                  [p.id]: e.target.value,
                                })}
                                placeholder={
                                  splitType === "PERCENTAGE" ? "%" : splitType === "SHARE" ? "shares" : "INR"
                                }
                                className="w-20 px-2.5 py-1 border-2 border-stone-100 rounded-xl text-center focus:outline-none focus:border-amber-400 text-xs font-bold"
                              />
                            )}
                            <span className="text-stone-400 font-semibold text-[10px] w-16 text-right">
                              ₹{calculatedShare.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Split Total Indicator */}
                <div className="mt-3.5 pt-3.5 border-t border-stone-50 flex items-center justify-between text-[10px] font-bold">
                  <span className="text-stone-400 uppercase">
                    Split sums to: <span className={splitsDiff > 0.05 ? "text-rose-500 font-extrabold" : "text-stone-600 font-extrabold"}>
                      ₹{calculatedSplitsTotal.toFixed(2)}
                    </span>
                  </span>
                  <span className="text-stone-400 uppercase">
                    Total: ₹{totalAmountINR.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t-2 border-stone-50">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-bold rounded-2xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={expenseLoading}
                  className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 border-b-4 border-amber-600 active:border-b-0 active:translate-y-[4px] text-white text-xs font-bold rounded-2xl transition-all cursor-pointer disabled:opacity-50"
                >
                  {expenseLoading ? "Saving..." : modalMode === "create" ? "Add Expense 🚀" : "Update Expense 🚀"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settlement Modal */}
      {showSettleModal && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-stone-100 shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-black text-stone-850 tracking-tight mb-2">Record Settlement Payment</h3>

            {settleError && (
              <div className="p-3 mb-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold">
                ⚠️ {settleError}
              </div>
            )}

            <form onSubmit={handleSettleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase mb-1">Who Paid?</label>
                <select
                  value={settlePayerId}
                  onChange={(e) => setSettlePayerId(e.target.value)}
                  className="block w-full px-4 py-2.5 border-2 border-stone-100 rounded-2xl text-stone-850 bg-white focus:outline-none focus:border-amber-400 transition-colors text-sm"
                >
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase mb-1">Who Received?</label>
                <select
                  value={settleReceiverId}
                  onChange={(e) => setSettleReceiverId(e.target.value)}
                  className="block w-full px-4 py-2.5 border-2 border-stone-100 rounded-2xl text-stone-850 bg-white focus:outline-none focus:border-amber-400 transition-colors text-sm"
                >
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase mb-1">Amount Paid (INR)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  placeholder="₹0.00"
                  className="appearance-none block w-full px-4 py-2.5 border-2 border-stone-100 rounded-2xl placeholder-stone-400 text-stone-850 focus:outline-none focus:border-amber-400 transition-colors text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={settleDate}
                  onChange={(e) => setSettleDate(e.target.value)}
                  className="block w-full px-4 py-2.5 border-2 border-stone-100 rounded-2xl text-stone-850 focus:outline-none focus:border-amber-400 transition-colors text-sm"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-bold rounded-2xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settleLoading}
                  className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 border-b-4 border-amber-600 active:border-b-0 active:translate-y-[4px] text-white text-xs font-bold rounded-2xl transition-all cursor-pointer disabled:opacity-50"
                >
                  {settleLoading ? "Recording..." : "Record Payment 🚀"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
