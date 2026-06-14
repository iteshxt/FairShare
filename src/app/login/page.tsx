"use" + " client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        // Sign In
        const result = await signIn("credentials", {
          redirect: false,
          email,
          password,
        });

        if (result?.error) {
          setError("Invalid email or password");
        } else {
          router.push("/");
          router.refresh();
        }
      } else {
        // Register
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to register");
        } else {
          // Auto sign-in after registration
          const result = await signIn("credentials", {
            redirect: false,
            email,
            password,
          });

          if (result?.error) {
            setError("Registration succeeded but sign-in failed. Please log in.");
            setIsLogin(true);
          } else {
            router.push("/");
            router.refresh();
          }
        }
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-[#FDFBF7]">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-amber-100 text-amber-600 font-bold text-3xl mb-4 shadow-sm border-2 border-amber-200">
          🤝
        </div>
        <h2 className="text-3xl font-extrabold text-stone-800 tracking-tight">
          {isLogin ? "Welcome back to FairShare!" : "Join FairShare today!"}
        </h2>
        <p className="mt-2 text-sm text-stone-500">
          Playful, transparent, and membership-aware expense tracking.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl shadow-stone-200/50 rounded-3xl border-2 border-stone-100 sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-medium">
                ⚠️ {error}
              </div>
            )}

            {!isLogin && (
              <div>
                <label className="block text-sm font-semibold text-stone-700">
                  Your Name (Matches CSV names)
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Aisha"
                    className="appearance-none block w-full px-4 py-3 border-2 border-stone-100 rounded-2xl placeholder-stone-400 text-stone-800 focus:outline-none focus:border-amber-400 transition-colors text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-stone-700">
                Email Address
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="aisha@example.com"
                  className="appearance-none block w-full px-4 py-3 border-2 border-stone-100 rounded-2xl placeholder-stone-400 text-stone-800 focus:outline-none focus:border-amber-400 transition-colors text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-stone-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="appearance-none block w-full px-4 py-3 border-2 border-stone-100 rounded-2xl placeholder-stone-400 text-stone-800 focus:outline-none focus:border-amber-400 transition-colors text-sm"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3.5 px-4 border-b-4 border-amber-600 rounded-2xl shadow-sm text-sm font-bold text-white bg-amber-500 hover:bg-amber-400 active:border-b-0 active:translate-y-[4px] focus:outline-none focus:ring-0 disabled:opacity-50 transition-all cursor-pointer"
              >
                {loading ? "Please wait..." : isLogin ? "Let's Go! 🚀" : "Register & Start 🤝"}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
              }}
              className="text-sm font-semibold text-amber-600 hover:text-amber-500 transition-colors cursor-pointer"
            >
              {isLogin
                ? "Don't have an account? Sign up instead"
                : "Already have an account? Sign in instead"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
