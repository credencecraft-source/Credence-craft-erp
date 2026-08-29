"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Session = {
  email: string;
  name: string;
};

const SESSION_KEY = "credence-craft-session";

const stats = [
  { label: "Active projects", value: "12" },
  { label: "Tasks due", value: "08" },
  { label: "Team members", value: "16" },
  { label: "Completion", value: "84%" },
];

const quickActions = [
  "New project",
  "Invite member",
  "Generate report",
  "Review timeline",
];

const activity = [
  { title: "Brand launch strategy", details: "Updated 2 hours ago • Marketing team" },
  { title: "Client onboarding", details: "Needs review • Operations" },
  { title: "Production schedule", details: "Published this morning • Supply chain" },
];

export default function WorkspacePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) {
      router.replace("/");
      return;
    }

    setSession(JSON.parse(stored));
  }, [router]);

  const greeting = useMemo(() => {
    if (!session?.name) return "Welcome";
    const firstName = session.name.split(" ")[0];
    return `Welcome, ${firstName}`;
  }, [session]);

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    router.replace("/");
  }

  if (!session) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f4f7f1] p-5 text-slate-900 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 rounded-[28px] border border-emerald-100 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Workspace dashboard</p>
            <h1 className="mt-2 text-3xl font-bold">{greeting}</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
              <div className="text-slate-500">Signed in as</div>
              <div className="font-semibold">{session.email}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
            >
              Logout
            </button>
          </div>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-[24px] border border-emerald-100 bg-white p-5 shadow-sm">
              <div className="text-sm text-slate-500">{stat.label}</div>
              <div className="mt-3 text-3xl font-bold text-slate-900">{stat.value}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
          <div className="rounded-[28px] border border-emerald-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">Quick actions</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                Today
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {quickActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left text-sm font-medium text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-emerald-100 bg-[#0f172a] p-6 text-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Overview</p>
            <h2 className="mt-3 text-2xl font-bold">Team momentum</h2>
            <div className="mt-6 space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
                  <span>Delivery velocity</span>
                  <span>86%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-700">
                  <div className="h-2 w-[86%] rounded-full bg-emerald-400" />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
                  <span>Client satisfaction</span>
                  <span>92%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-700">
                  <div className="h-2 w-[92%] rounded-full bg-cyan-400" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-emerald-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold">Recent activity</h2>
            <button type="button" className="text-sm font-medium text-emerald-700">
              View all
            </button>
          </div>

          <div className="space-y-4">
            {activity.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-semibold text-slate-900">{item.title}</div>
                <div className="mt-1 text-sm text-slate-500">{item.details}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
