"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 220) || "Unexpected response.");
  }
}

export default function BackendLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@credencecraft.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/backend-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || "Backend login failed.");
      }

      router.push("/backend");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backend login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f7f4] px-5 py-10 text-zinc-950">
      <div className="mx-auto max-w-md rounded-3xl border border-[#dce4dc] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Backend access</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#17372a]">Admin login</h1>
          <p className="mt-2 text-sm text-zinc-600">Use a separate backend login that does not mix with the normal workspace login.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-zinc-700">
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#dce4dc] bg-[#f9fbf9] px-3 py-3 text-sm outline-none transition focus:border-emerald-700"
              placeholder="admin@company.com"
              required
            />
          </label>

          <label className="block text-sm font-medium text-zinc-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#dce4dc] bg-[#f9fbf9] px-3 py-3 text-sm outline-none transition focus:border-emerald-700"
              placeholder="Enter password"
              required
            />
          </label>

          <div className="rounded-xl border border-dashed border-[#dfe8df] bg-[#f9fbf9] p-3 text-xs text-zinc-600">
            <p className="font-semibold uppercase tracking-[0.12em] text-zinc-500">Demo credentials</p>
            <p className="mt-2">Email: admin@credencecraft.com</p>
            <p>Password: admin123</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#17372a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#214d3a] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Signing in..." : "Login to backend"}
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{message}</p>
        )}

        <div className="mt-5 text-center text-sm text-zinc-600">
          <Link href="/" className="font-medium text-emerald-800 hover:underline">Back to public login</Link>
        </div>
      </div>
    </div>
  );
}
