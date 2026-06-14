"use" + " client";

import React, { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Group {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [error, setError] = useState("");

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Fetch groups
  useEffect(() => {
    if (status === "authenticated") {
      fetchGroups();
    }
  }, [status]);

  const fetchGroups = async () => {
    try {
      const res = await fetch("/api/groups");
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
      }
    } catch (err) {
      console.error("Failed to load groups:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setError("");
    setCreateLoading(true);

    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create group");
      } else {
        setNewGroupName("");
        setShowModal(false);
        fetchGroups();
        // Redirect to new group
        router.push(`/groups/${data.group.slug}`);
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setCreateLoading(false);
    }
  };

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FDFBF7]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-stone-500 font-medium text-sm">Getting your dashboard ready...</p>
        </div>
      </div>
    );
  }

  if (status !== "authenticated") {
    return null; // Redirecting
  }

  return (
    <div className="flex-1 flex flex-col bg-[#FDFBF7]">
      {/* Header */}
      <header className="bg-white border-b-2 border-stone-100 px-4 py-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🤝</span>
            <span className="text-xl font-black text-stone-800 tracking-tight">FairShare</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-xs text-stone-400 font-semibold uppercase">Logged in as</p>
              <p className="text-sm font-bold text-stone-700">{session?.user?.name}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="py-2 px-4 text-xs font-bold text-stone-500 hover:text-stone-800 bg-stone-50 hover:bg-stone-100 rounded-2xl transition-colors cursor-pointer border border-stone-200/50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex-1">
        {/* Welcome Block */}
        <div className="bg-gradient-to-r from-amber-400 to-orange-400 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-amber-100/50 border-b-4 border-amber-600 mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight">Hello, {session?.user?.name}! 👋</h1>
          <p className="mt-2 text-amber-50 max-w-xl text-sm sm:text-base">
            Track expenses together, handle changing memberships seamlessly, and settle debts easily. Let's see how the shares stack up!
          </p>
        </div>

        {/* Groups Section */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-stone-800 tracking-tight">Your Expense Groups</h2>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 border-b-4 border-amber-600 active:border-b-0 active:translate-y-[4px] text-white text-xs font-bold rounded-2xl transition-all cursor-pointer"
          >
            <span>+</span> Create Group
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="bg-white rounded-3xl border-2 border-stone-100 p-12 text-center shadow-sm max-w-lg mx-auto mt-6">
            <span className="text-4xl block mb-4">⛺</span>
            <h3 className="text-lg font-bold text-stone-800">No Groups Found</h3>
            <p className="text-stone-500 text-sm mt-1 mb-6">
              You aren't in any expense sharing groups yet. Create a new one to get started!
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="py-3 px-6 bg-amber-500 hover:bg-amber-400 border-b-4 border-amber-600 active:border-b-0 active:translate-y-[4px] text-white text-sm font-bold rounded-2xl transition-all cursor-pointer"
            >
              Create Your First Group 🚀
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group) => (
              <Link
                key={group.id}
                href={`/groups/${group.slug}`}
                className="group bg-white hover:bg-[#FFFDF9] rounded-3xl border-2 border-stone-100 hover:border-amber-200 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-3xl p-2.5 bg-amber-50 rounded-2xl group-hover:scale-110 transition-transform">🏡</span>
                    <span className="text-[10px] text-stone-400 font-extrabold tracking-wider uppercase bg-stone-50 py-1 px-2.5 rounded-full border border-stone-150">
                      Active
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-stone-800 group-hover:text-amber-600 transition-colors">
                    {group.name}
                  </h3>
                  <p className="text-xs text-stone-400 mt-1">
                    Slug: <code className="bg-stone-50 py-0.5 px-1.5 rounded">{group.slug}</code>
                  </p>
                </div>
                <div className="mt-6 flex items-center justify-between text-xs font-bold text-amber-600">
                  <span>View Ledger & Balances</span>
                  <span className="group-hover:translate-x-1 transition-transform">➔</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-stone-400 border-t border-stone-100 mt-12 bg-white">
        <p>© 2026 FairShare. Built for transparent split logs.</p>
      </footer>

      {/* Create Group Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-stone-100 shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-black text-stone-850 tracking-tight mb-2">Create New Group</h3>
            <p className="text-xs text-stone-500 mb-4">
              Enter a name for your group (e.g. "Flatmates"). We'll automatically generate a URL slug.
            </p>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              {error && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium">
                  ⚠️ {error}
                </div>
              )}
              <input
                type="text"
                required
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Flatmates"
                className="appearance-none block w-full px-4 py-3 border-2 border-stone-100 rounded-2xl placeholder-stone-400 text-stone-800 focus:outline-none focus:border-amber-400 transition-colors text-sm"
              />
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setError("");
                    setNewGroupName("");
                  }}
                  className="py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-bold rounded-2xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 border-b-4 border-amber-600 active:border-b-0 active:translate-y-[4px] text-white text-xs font-bold rounded-2xl transition-all cursor-pointer disabled:opacity-50"
                >
                  {createLoading ? "Creating..." : "Create Group 🚀"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
