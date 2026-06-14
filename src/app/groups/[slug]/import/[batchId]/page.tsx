"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Anomaly {
  id: string;
  row_id: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  description: string;
}

interface StagedRow {
  id: string;
  batch_id: string;
  row_index: number;
  raw_data: {
    raw: Record<string, string>;
    parsed: {
      rowIndex: number;
      date: string;
      description: string;
      paidBy: string;
      amount: number;
      currency: string;
      exchangeRate: number;
      amountINR: number;
      splitType: "EQUAL" | "PERCENTAGE" | "SHARE" | "EXACT";
      participants: string[];
      splitDetails: {
        person: string;
        allocationType: string;
        allocationValue: number;
        calculatedAmount: number;
      }[];
      notes?: string;
      isSettlement: boolean;
    };
    isSettlement: boolean;
  };
  status: "PENDING" | "APPROVED" | "REJECTED";
  anomalies: Anomaly[];
}

export default function ImportReportPage({
  params: paramsPromise,
}: {
  params: Promise<{ slug: string; batchId: string }> | { slug: string; batchId: string };
}) {
  const params = React.use(paramsPromise as Promise<{ slug: string; batchId: string }>);
  const { slug, batchId } = params;
  const { status } = useSession();
  const router = useRouter();

  const [group, setGroup] = useState<any>(null);
  const [batch, setBatch] = useState<any>(null);
  const [rows, setRows] = useState<StagedRow[]>([]);
  const [persons, setPersons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");

  // Store user modifications and approvals: rowId -> { status, parsed }
  const [resolutions, setResolutions] = useState<Record<string, { status: "APPROVED" | "REJECTED" | "SKIPPED"; parsed: any }>>({});
  // Track which row index is expanded for inline editing
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Edit form state for the expanded row
  const [editDesc, setEditDesc] = useState("");
  const [editAmt, setEditAmt] = useState("");
  const [editCurrency, setEditCurrency] = useState("INR");
  const [editRate, setEditRate] = useState("1");
  const [editPayer, setEditPayer] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSplitType, setEditSplitType] = useState<"EQUAL" | "PERCENTAGE" | "SHARE" | "EXACT">("EQUAL");
  const [editParticipants, setEditParticipants] = useState<string[]>([]);
  const [editSplitValues, setEditSplitValues] = useState<Record<string, string>>({}); // person name -> value

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  const loadStagingData = async () => {
    try {
      setLoading(true);
      // Fetch staged rows and anomalies
      const res = await fetch(`/api/import/${batchId}/anomalies`);
      if (!res.ok) {
        throw new Error("Failed to load staging data");
      }
      const data = await res.json();
      setBatch(data.batch);
      setRows(data.rows || []);

      // Fetch group members for mapping dropdowns
      const groupRes = await fetch(`/api/groups/${slug}/balances`);
      const gData = await groupRes.json();
      setGroup(gData.group);
      setPersons(gData.persons || []);

      // Initialize default resolutions (APPROVED for rows with no critical anomalies, REJECTED/SKIPPED if critical)
      const initialResolutions: Record<string, { status: "APPROVED" | "REJECTED" | "SKIPPED"; parsed: any }> = {};
      data.rows.forEach((row: StagedRow) => {
        const hasCritical = row.anomalies.some((a) => a.severity === "CRITICAL");
        initialResolutions[row.id] = {
          status: hasCritical ? "SKIPPED" : "APPROVED",
          parsed: row.raw_data.parsed,
        };
      });
      setResolutions(initialResolutions);
    } catch (err: any) {
      setError(err.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      loadStagingData();
    }
  }, [status, batchId]);

  // Set resolution status for a row
  const setRowStatus = (rowId: string, status: "APPROVED" | "REJECTED" | "SKIPPED") => {
    setResolutions((prev) => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        status,
      },
    }));
  };

  // Expand row for editing and prefill form state
  const handleStartEdit = (row: StagedRow) => {
    const parsed = resolutions[row.id]?.parsed || row.raw_data.parsed;
    setExpandedRowId(row.id);

    setEditDesc(parsed.description || "");
    setEditAmt(String(parsed.amount || ""));
    setEditCurrency(parsed.currency || "INR");
    setEditRate(String(parsed.exchangeRate || "1"));
    setEditPayer(parsed.paidBy || "");
    setEditDate(new Date(parsed.date).toISOString().slice(0, 10));
    setEditNotes(parsed.notes || "");
    setEditSplitType(parsed.splitType || "EQUAL");

    const parts = parsed.participants || [];
    setEditParticipants(parts);

    const vals: Record<string, string> = {};
    parsed.splitDetails?.forEach((d: any) => {
      vals[d.person] = String(d.allocationValue || "");
    });
    setEditSplitValues(vals);
  };

  const toggleEditParticipant = (name: string) => {
    if (editParticipants.includes(name)) {
      setEditParticipants(editParticipants.filter((n) => n !== name));
    } else {
      setEditParticipants([...editParticipants, name]);
    }
  };

  // Calculate live splits inside editor
  const getEditorSplits = () => {
    const total = parseFloat(editAmt) || 0;
    const rate = parseFloat(editRate) || 1;
    const totalINR = total * rate;

    if (editParticipants.length === 0) return [];

    if (editSplitType === "EQUAL") {
      const share = Math.round((totalINR / editParticipants.length) * 100) / 100;
      return editParticipants.map((name) => ({
        person: name,
        allocationType: "EQUAL",
        allocationValue: 1,
        calculatedAmount: share,
      }));
    }

    if (editSplitType === "PERCENTAGE") {
      return editParticipants.map((name) => {
        const val = parseFloat(editSplitValues[name]) || 0;
        const calculatedAmount = Math.round((totalINR * (val / 100)) * 100) / 100;
        return {
          person: name,
          allocationType: "PERCENTAGE",
          allocationValue: val,
          calculatedAmount,
        };
      });
    }

    if (editSplitType === "SHARE") {
      const totalShares = editParticipants.reduce((sum, name) => {
        return sum + (parseFloat(editSplitValues[name]) || 0);
      }, 0);

      return editParticipants.map((name) => {
        const val = parseFloat(editSplitValues[name]) || 0;
        const calculatedAmount =
          totalShares > 0 ? Math.round((totalINR * (val / totalShares)) * 100) / 100 : 0;
        return {
          person: name,
          allocationType: "SHARE",
          allocationValue: val,
          calculatedAmount,
        };
      });
    }

    if (editSplitType === "EXACT") {
      return editParticipants.map((name) => {
        const val = parseFloat(editSplitValues[name]) || 0;
        return {
          person: name,
          allocationType: "EXACT",
          allocationValue: val,
          calculatedAmount: val,
        };
      });
    }

    return [];
  };

  const editorSplits = getEditorSplits();
  const editorSplitsTotal = editorSplits.reduce((s, c) => s + c.calculatedAmount, 0);
  const editorTotalINR = (parseFloat(editAmt) || 0) * (parseFloat(editRate) || 1);
  const editorDiff = Math.abs(editorSplitsTotal - editorTotalINR);

  // Save inline edits to resolutions state
  const handleSaveEdit = (rowId: string) => {
    // Basic splits validations
    if (editSplitType === "PERCENTAGE") {
      const totalPct = editParticipants.reduce((s, n) => s + (parseFloat(editSplitValues[n]) || 0), 0);
      if (Math.abs(totalPct - 100) > 0.01) {
        alert(`Total percentages must sum to 100% (currently ${totalPct}%)`);
        return;
      }
    }
    if (editSplitType === "EXACT" && editorDiff > 0.05) {
      alert(`Sum of exact splits (₹${editorSplitsTotal.toFixed(2)}) must equal total amount (₹${editorTotalINR.toFixed(2)})`);
      return;
    }

    const updatedParsed = {
      rowIndex: resolutions[rowId]?.parsed.rowIndex,
      date: new Date(editDate).toISOString(),
      description: editDesc.trim(),
      paidBy: editPayer,
      amount: parseFloat(editAmt) || 0,
      currency: editCurrency,
      exchangeRate: parseFloat(editRate) || 1,
      amountINR: editorTotalINR,
      splitType: editSplitType,
      participants: editParticipants,
      splitDetails: editorSplits,
      notes: editNotes,
      isSettlement: resolutions[rowId]?.parsed.isSettlement,
    };

    setResolutions((prev) => ({
      ...prev,
      [rowId]: {
        status: "APPROVED", // Auto-approve row upon manually editing/saving
        parsed: updatedParsed,
      },
    }));

    setExpandedRowId(null);
  };

  // Finalize batch
  const handleFinalizeBatch = async () => {
    setSubmitLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/import/${batchId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutions }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to commit import");
      }

      // Redirect to group details
      router.push(`/groups/${slug}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to finalize import batch");
    } finally {
      setSubmitLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FDFBF7]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-stone-500 font-medium text-sm">Reviewing file scan and anomalies...</p>
        </div>
      </div>
    );
  }

  // Count anomalies
  const totalAnomalies = rows.reduce((s, r) => s + r.anomalies.length, 0);
  const criticalCount = rows.reduce(
    (s, r) => s + r.anomalies.filter((a) => a.severity === "CRITICAL").length,
    0
  );
  const warningCount = rows.reduce(
    (s, r) => s + r.anomalies.filter((a) => a.severity === "WARNING").length,
    0
  );

  return (
    <div className="flex-1 flex flex-col bg-[#FDFBF7]">
      {/* Header */}
      <header className="bg-white border-b-2 border-stone-100 px-4 py-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/groups/${slug}/import`}
              className="text-stone-400 hover:text-stone-800 transition-colors font-bold text-xs"
            >
              ⇠ Back
            </Link>
          </div>
          <span className="text-sm font-black text-stone-850 tracking-tight">Anomalies Scanning Report</span>
        </div>
      </header>

      {/* Report Dashboard */}
      <main className="max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex-1 space-y-6">
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold">
            ⚠️ {error}
          </div>
        )}

        {/* Scan Summary Banner */}
        <div className="bg-white rounded-3xl border-2 border-stone-100 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
          <div>
            <h2 className="text-lg font-black text-stone-850 flex items-center gap-1.5">
              <span>📋</span> File Scan Report: <code>{batch?.source_file}</code>
            </h2>
            <p className="text-xs text-stone-400 font-medium mt-0.5">
              Staged {rows.length} rows successfully. Please resolve details below to finish importing.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <span className="py-1 px-3 bg-stone-50 border border-stone-150 rounded-xl text-[10px] font-black text-stone-500 uppercase">
              Rows: {rows.length}
            </span>
            {criticalCount > 0 && (
              <span className="py-1 px-3 bg-rose-50 border border-rose-100 rounded-xl text-[10px] font-black text-rose-600 uppercase">
                {criticalCount} Critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="py-1 px-3 bg-amber-50 border border-amber-100 rounded-xl text-[10px] font-black text-amber-600 uppercase">
                {warningCount} Warnings
              </span>
            )}
          </div>
        </div>

        {/* Rows Review List */}
        <div className="space-y-4">
          <h3 className="text-sm font-black text-stone-850 uppercase tracking-wider pl-1">Verify Row Ledger</h3>

          {rows.map((row) => {
            const resolution = resolutions[row.id] || { status: "APPROVED" };
            const isApproved = resolution.status === "APPROVED";
            const isRejected = resolution.status === "REJECTED";
            const isSkipped = resolution.status === "SKIPPED";
            const parsed = resolution.parsed;

            const isExpanded = expandedRowId === row.id;

            return (
              <div
                key={row.id}
                className={`bg-white rounded-3xl border-2 transition-all p-5 ${
                  isApproved
                    ? "border-stone-100"
                    : isRejected
                    ? "border-rose-100 bg-rose-50/5"
                    : "border-stone-200 bg-stone-50/10 opacity-70"
                }`}
              >
                {/* Row Header Info */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-3 border-b border-stone-50 pb-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-150 py-0.5 px-2 rounded-lg uppercase">
                        Row {row.row_index}
                      </span>
                      {row.raw_data.isSettlement && (
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-150 py-0.5 px-2 rounded-lg uppercase">
                          Settlement Record
                        </span>
                      )}
                    </div>

                    <h4 className="font-extrabold text-stone-850 text-sm mt-1.5">
                      {parsed.description}
                    </h4>

                    {/* Raw String */}
                    <div className="text-[10px] font-mono text-stone-400 mt-1 max-w-[500px] truncate">
                      Raw CSV: <code>{JSON.stringify(row.raw_data.raw)}</code>
                    </div>
                  </div>

                  {/* Approve / Reject / Skip Actions */}
                  <div className="flex items-center gap-2 self-stretch md:self-auto justify-between border-t md:border-t-0 pt-3.5 md:pt-0 border-stone-100">
                    <button
                      onClick={() => setRowStatus(row.id, "APPROVED")}
                      className={`py-1.5 px-3 rounded-xl text-[10px] font-black cursor-pointer border ${
                        isApproved
                          ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                          : "bg-stone-50 text-stone-400 border-stone-150"
                      }`}
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => setRowStatus(row.id, "REJECTED")}
                      className={`py-1.5 px-3 rounded-xl text-[10px] font-black cursor-pointer border ${
                        isRejected
                          ? "bg-rose-50 text-rose-600 border-rose-200"
                          : "bg-stone-50 text-stone-400 border-stone-150"
                      }`}
                    >
                      ✕ Reject
                    </button>
                    <button
                      onClick={() => setRowStatus(row.id, "SKIPPED")}
                      className={`py-1.5 px-3 rounded-xl text-[10px] font-black cursor-pointer border ${
                        isSkipped
                          ? "bg-stone-200 text-stone-700 border-stone-300"
                          : "bg-stone-50 text-stone-400 border-stone-150"
                      }`}
                    >
                      ⊙ Skip Row
                    </button>
                    <button
                      onClick={() => handleStartEdit(row)}
                      className="py-1.5 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-[10px] font-black text-amber-600 cursor-pointer"
                    >
                      ✍ Edit Inline
                    </button>
                  </div>
                </div>

                {/* Staged Data Summary (only if not editing) */}
                {!isExpanded && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold text-stone-500">
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase">Paid By</p>
                      <p className="font-extrabold text-stone-850 mt-0.5">{parsed.paidBy || <span className="text-rose-500 font-extrabold">Missing</span>}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase">Amount</p>
                      <p className="font-extrabold text-stone-850 mt-0.5">
                        ₹{(parsed.amount * parsed.exchangeRate).toFixed(2)}{" "}
                        {parsed.currency === "USD" && <span className="text-[10px] text-amber-500 font-semibold">(${parsed.amount} USD)</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase">Date</p>
                      <p className="font-extrabold text-stone-850 mt-0.5">{parsed.date ? new Date(parsed.date).toISOString().slice(0, 10) : <span className="text-rose-500 font-extrabold">Missing</span>}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase">Split Method</p>
                      <p className="font-extrabold text-stone-850 mt-0.5">{parsed.splitType}</p>
                    </div>
                  </div>
                )}

                {/* Inline Editing Form */}
                {isExpanded && (
                  <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200 animate-in slide-in-from-top-2 duration-150 space-y-4">
                    <h5 className="font-extrabold text-stone-800 text-xs">✍ Edit Parsed Fields</h5>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 uppercase mb-0.5">Description</label>
                        <input
                          type="text"
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          className="w-full px-3 py-1.5 border border-stone-200 rounded-xl bg-white text-xs text-stone-800 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 uppercase mb-0.5">Amount</label>
                        <input
                          type="number"
                          step="any"
                          value={editAmt}
                          onChange={(e) => setEditAmt(e.target.value)}
                          className="w-full px-3 py-1.5 border border-stone-200 rounded-xl bg-white text-xs text-stone-800 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 uppercase mb-0.5">Currency</label>
                        <select
                          value={editCurrency}
                          onChange={(e) => {
                            setEditCurrency(e.target.value);
                            setEditRate(e.target.value === "USD" ? "83" : "1");
                          }}
                          className="w-full px-3 py-1.5 border border-stone-200 rounded-xl bg-white text-xs text-stone-800 focus:outline-none"
                        >
                          <option value="INR">INR</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                      {editCurrency === "USD" && (
                        <div>
                          <label className="block text-[10px] font-bold text-stone-600 uppercase mb-0.5">USD rate</label>
                          <input
                            type="number"
                            step="any"
                            value={editRate}
                            onChange={(e) => setEditRate(e.target.value)}
                            className="w-full px-3 py-1.5 border border-stone-200 rounded-xl bg-white text-xs text-stone-800 focus:outline-none"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 uppercase mb-0.5">Paid By (Payer Name)</label>
                        <input
                          type="text"
                          value={editPayer}
                          onChange={(e) => setEditPayer(e.target.value)}
                          placeholder="Payer Name"
                          className="w-full px-3 py-1.5 border border-stone-200 rounded-xl bg-white text-xs text-stone-800 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 uppercase mb-0.5">Date</label>
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="w-full px-3 py-1.5 border border-stone-200 rounded-xl bg-white text-xs text-stone-800 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Editor Split Configurations */}
                    <div className="border-t border-stone-200 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-[10px] font-bold text-stone-600 uppercase">Participants & splits</label>
                        <select
                          value={editSplitType}
                          onChange={(e) => {
                            setEditSplitType(e.target.value as any);
                            setEditSplitValues({});
                          }}
                          className="py-0.5 px-2.5 border border-stone-200 rounded-lg text-[10px] bg-white text-stone-800 focus:outline-none"
                        >
                          <option value="EQUAL">Equal Split</option>
                          <option value="PERCENTAGE">Split by %</option>
                          <option value="SHARE">Split by Shares</option>
                          <option value="EXACT">Split by Exact INR</option>
                        </select>
                      </div>

                      <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                        {persons.map((p) => {
                          const isChecked = editParticipants.includes(p.name);
                          const val = editSplitValues[p.name] || "";
                          const calculatedShare = editorSplits.find((c) => c.person === p.name)?.calculatedAmount || 0;

                          return (
                            <div key={p.id} className="flex items-center justify-between text-xs py-0.5">
                              <label className="flex items-center gap-2 font-extrabold text-stone-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleEditParticipant(p.name)}
                                  className="rounded text-amber-500 focus:ring-0 w-3.5 h-3.5"
                                />
                                <span>{p.name}</span>
                              </label>

                              {isChecked && (
                                <div className="flex items-center gap-2">
                                  {editSplitType !== "EQUAL" && (
                                    <input
                                      type="number"
                                      step="any"
                                      value={val}
                                      onChange={(e) => setEditSplitValues({
                                        ...editSplitValues,
                                        [p.name]: e.target.value,
                                      })}
                                      placeholder={
                                        editSplitType === "PERCENTAGE" ? "%" : editSplitType === "SHARE" ? "shares" : "INR"
                                      }
                                      className="w-16 px-2 py-0.5 border border-stone-200 rounded-lg text-center text-[10px] font-bold"
                                    />
                                  )}
                                  <span className="text-stone-400 font-semibold text-[10px] w-12 text-right">
                                    ₹{calculatedShare.toFixed(2)}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-2 text-[10px] font-bold text-stone-400 flex items-center justify-between">
                        <span>SUM: ₹{editorSplitsTotal.toFixed(2)}</span>
                        <span>TARGET: ₹{editorTotalINR.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Save Cancel Buttons */}
                    <div className="flex gap-2 justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => setExpandedRowId(null)}
                        className="py-1 px-3 bg-stone-200 text-stone-700 text-[10px] font-bold rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(row.id)}
                        className="py-1 px-3 bg-amber-500 hover:bg-amber-400 text-white text-[10px] font-bold rounded-lg"
                      >
                        Save Resolution
                      </button>
                    </div>
                  </div>
                )}

                {/* Anomalies Box */}
                {row.anomalies.length > 0 && (
                  <div className="mt-4 p-3.5 rounded-2xl bg-amber-50/50 border border-amber-100 space-y-1.5">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider">
                      ⚠️ Scan Findings ({row.anomalies.length})
                    </p>
                    {row.anomalies.map((anom) => (
                      <div key={anom.id} className="text-xs flex items-start gap-1.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase mt-0.5 ${
                          anom.severity === "CRITICAL"
                            ? "bg-rose-100 text-rose-700 border border-rose-200"
                            : anom.severity === "WARNING"
                            ? "bg-amber-100 text-amber-700 border border-amber-200"
                            : "bg-blue-100 text-blue-700 border border-blue-200"
                        }`}>
                          {anom.severity}
                        </span>
                        <span className="text-stone-600 font-semibold">{anom.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Finalize Button Action */}
        <div className="pt-6 border-t border-stone-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-stone-400 font-semibold">
            Once you have resolved all row issues, hit commit to write the batch ledger to live sheets.
          </p>

          <button
            onClick={handleFinalizeBatch}
            disabled={submitLoading}
            className="w-full sm:w-auto py-3.5 px-8 bg-amber-500 hover:bg-amber-400 border-b-4 border-amber-600 active:border-b-0 active:translate-y-[4px] text-white text-sm font-bold rounded-2xl transition-all cursor-pointer disabled:opacity-50"
          >
            {submitLoading ? "Committing Ledger..." : "Commit Resolved Ledger 🚀"}
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-stone-400 border-t border-stone-100 mt-12 bg-white">
        <p>© 2026 FairShare. Built for transparent split logs.</p>
      </footer>
    </div>
  );
}
