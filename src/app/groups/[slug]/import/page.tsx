"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ImportPortalPage({
  params: paramsPromise,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const params = React.use(paramsPromise as Promise<{ slug: string }>);
  const slug = params.slug;
  const { data: session, status } = useSession();
  const router = useRouter();

  const [group, setGroup] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pageLoading, setPageLoading] = useState(true);

  // Redirect if not logged in
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    const fetchGroup = async () => {
      try {
        const res = await fetch(`/api/groups/${slug}/balances`);
        if (res.ok) {
          const data = await res.json();
          setGroup(data.group);
        }
      } catch (err) {
        console.error("Failed to load group:", err);
      } finally {
        setPageLoading(false);
      }
    };

    if (status === "authenticated") {
      fetchGroup();
    }
  }, [status, slug]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a CSV file first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("groupId", group.id);

      const res = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to parse CSV file");
      } else {
        // Redirect to review dashboard
        router.push(`/groups/${slug}/import/${data.batchId}`);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || pageLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FDFBF7]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-stone-500 font-medium text-sm">Loading importer...</p>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#FDFBF7] p-4 text-center">
        <span className="text-4xl block mb-4">🔍</span>
        <h3 className="text-lg font-bold text-stone-850">Group Not Found</h3>
        <p className="text-stone-500 text-sm mt-1 mb-6 font-semibold">This group does not exist.</p>
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
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/groups/${slug}`} className="text-stone-400 hover:text-stone-800 transition-colors font-bold text-lg">
              ⇠ Back to Group
            </Link>
          </div>
          <span className="text-sm font-black text-stone-800 tracking-tight">CSV Importer Portal</span>
        </div>
      </header>

      {/* Upload Container */}
      <main className="max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex-1 flex flex-col justify-center">
        <div className="bg-white rounded-3xl border-2 border-stone-100 p-8 shadow-xl shadow-stone-200/50 max-w-lg w-full mx-auto">
          <div className="text-center mb-6">
            <span className="text-4xl block mb-3">📥</span>
            <h2 className="text-2xl font-black text-stone-800 tracking-tight">Upload Spreadsheet</h2>
            <p className="text-stone-400 text-xs mt-1">
              Select your historical CSV expense log. We'll automatically identify duplicate payments, inconsistent names, currency updates, and membership timeline overlaps.
            </p>
          </div>

          {error && (
            <div className="p-3.5 mb-6 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* File Drop Box */}
            <div className="border-4 border-dashed border-stone-200 hover:border-amber-400 bg-stone-50/50 hover:bg-amber-50/20 rounded-3xl p-8 text-center transition-all cursor-pointer relative group">
              <input
                type="file"
                accept=".csv"
                required
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <span className="text-3xl block mb-2 group-hover:scale-110 transition-transform">📄</span>
              <p className="text-xs font-extrabold text-stone-700">
                {file ? file.name : "Click to browse or drag & drop CSV file"}
              </p>
              <p className="text-[10px] text-stone-450 mt-1 font-semibold">
                {file ? `Size: ${(file.size / 1024).toFixed(1)} KB` : "Supports standard comma-separated text files (.csv)"}
              </p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !file}
              className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-400 border-b-4 border-amber-600 active:border-b-0 active:translate-y-[4px] text-white text-sm font-bold rounded-2xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Parsing & Validating..." : "Stage & Scan Anomalies 🔍"}
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-stone-400 border-t border-stone-100 mt-12 bg-white">
        <p>© 2026 FairShare. Built for transparent split logs.</p>
      </footer>
    </div>
  );
}
