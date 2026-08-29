"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Account = {
  email: string;
  name: string;
  createdAt: string;
};

const ACCOUNTS_KEY = "credence-craft-accounts";
const SESSION_KEY = "credence-craft-session";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "create">("login");
  const [form, setForm] = useState({ email: "", name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedSession = localStorage.getItem(SESSION_KEY);
    if (storedSession) {
      router.replace("/workspace");
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const email = form.email.trim();
    const name = form.name.trim();

    if (!email || !name) {
      setError("Please enter both your email and your name.");
      return;
    }

    setLoading(true);

    const stored = localStorage.getItem(ACCOUNTS_KEY);
    const accounts: Account[] = stored ? JSON.parse(stored) : [];

    let account = accounts.find((item) => item.email.toLowerCase() === email.toLowerCase());

    if (mode === "create" && !account) {
      account = {
        email,
        name,
        createdAt: new Date().toISOString(),
      };
      accounts.push(account);
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    }

    if (mode === "login" && !account) {
      setError("No account found for this email. Create one first and then sign in.");
      setLoading(false);
      return;
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: account!.email, name: account!.name }));
    setLoading(false);
    router.push("/workspace");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#f7f7f1,_#edf2eb_35%,_#dfe9de_100%)] px-4 py-10 text-zinc-900">
      <div className="mx-auto flex max-w-6xl items-center justify-center min-h-[calc(100vh-5rem)]">
        <div className="grid w-full overflow-hidden rounded-[32px] border border-emerald-100 bg-white/80 shadow-[0_24px_80px_rgba(16,24,40,0.08)] backdrop-blur md:grid-cols-2">
          <div className="flex flex-col justify-between bg-[#0f172a] p-8 text-white md:p-10">
            <div>
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
                Credence Craft
              </div>
              <h1 className="max-w-sm text-4xl font-bold leading-tight">
                Work smarter with your business workspace.
              </h1>
            </div>

            <div className="mt-10 space-y-4 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Fast onboarding</p>
                <p className="mt-1">Create your account in seconds and land directly in your workspace.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">One place for work</p>
                <p className="mt-1">Track tasks, projects, and daily operations from a single dashboard.</p>
              </div>
            </div>
          </div>

          <div className="p-8 md:p-10">
            <div className="mb-8 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Access</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">
                  {mode === "login" ? "Welcome back" : "Create account"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setMode((prev) => (prev === "login" ? "create" : "login"))}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
              >
                {mode === "login" ? "Need an account?" : "Have an account?"}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Email address</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="name@example.com"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Full name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Your name"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  required
                />
              </label>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Please wait..." : mode === "login" ? "Login to workspace" : "Create account & login"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
