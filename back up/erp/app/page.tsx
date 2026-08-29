"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 220) || "Server returned an unexpected response.");
  }
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "user";
}

export default function LandingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [otpSent, setOtpSent] = useState(false);
  const [name, setName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleOtpRequest = async () => {
    if (!email.trim()) {
      setMessage("Please enter your email address.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || "Workspace User",
          profileName: mode === "register" ? profileName : undefined,
          email,
        }),
      });

      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        if (response.status === 409 && (payload?.alreadyRegistered || payload?.code === "USER_ALREADY_EXISTS" || String(payload?.error || "").toLowerCase().includes("already exists"))) {
          setMode("login");
          setOtpSent(false);
          setMessage("An account with this email already exists. Please log in.");
          return;
        }
        if (response.status === 404 && (payload?.needsRegistration || payload?.code === "USER_NOT_FOUND" || String(payload?.error || "").toLowerCase().includes("user not found"))) {
          setMode("register");
          setOtpSent(false);
          setMessage("User not found. Please register first.");
          return;
        }
        throw new Error(payload.error || "OTP could not be sent.");
      }

      setOtpSent(true);
      setMessage(payload.devOtp ? `Development OTP: ${payload.devOtp}` : "OTP sent to your email.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!email.trim() || !otp.trim()) {
      setMessage("Please enter the email and OTP.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          profileName: mode === "register" ? profileName : undefined,
          otpCode: otp,
        }),
      });

      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        if (response.status === 409 && (payload?.alreadyRegistered || payload?.code === "USER_ALREADY_EXISTS" || String(payload?.error || "").toLowerCase().includes("already exists"))) {
          setMode("login");
          setOtpSent(false);
          setMessage("An account with this email already exists. Please log in.");
          return;
        }
        if (response.status === 404 && (payload?.needsRegistration || payload?.code === "USER_NOT_FOUND" || String(payload?.error || "").toLowerCase().includes("user not found"))) {
          setMode("register");
          setOtpSent(false);
          setMessage("User not found. Please register first.");
          return;
        }
        throw new Error(payload.error || "OTP verification failed.");
      }

      const resolvedProfile = (payload.profileName || payload.user?.profileName || profileName || name || email || "workspace").trim();
      const workspaceSlug = slugify(resolvedProfile);
      setMessage("Verified successfully. Redirecting to workspace...");
      router.push(`/workspace/${workspaceSlug}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f4] text-zinc-950">
      <header className="border-b border-[#dfe8df] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#17372a] text-sm font-black text-white">CC</div>
            <div>
              <p className="text-lg font-semibold tracking-tight text-[#17372a]">Credence Craft</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Workspace Platform</p>
            </div>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-zinc-600 md:flex">
            <Link href="#features" className="hover:text-emerald-800">Features</Link>
            <Link href="#plans" className="hover:text-emerald-800">Plans</Link>
            <Link href="#security" className="hover:text-emerald-800">Backup</Link>
            <Link href="/backend/login" className="font-semibold text-emerald-800 hover:text-emerald-900">Backend login</Link>
          </nav>
          <Link href="/workspace" className="rounded-lg bg-[#17372a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#214d3a]">Open workspace</Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-14">
        <section className="space-y-8">
          <div className="rounded-3xl bg-gradient-to-br from-[#17372a] via-[#1d4b3b] to-[#0d211b] p-8 text-white shadow-[0_20px_60px_rgba(23,55,42,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">Administration layer</p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">One platform for every organization, user, subscription, and backup.</h1>
            <p className="mt-4 max-w-xl text-base text-emerald-50/75">Create multiple independent organizations under one workspace, assign super admins and admins, manage subscriptions by module, and protect each tenant with organization-wise backup and restore.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/workspace/organization/new" className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#17372a] transition hover:bg-emerald-50">Create organisation</Link>
              <Link href="/workspace" className="rounded-xl border border-white/25 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/5">View workspace</Link>
            </div>
          </div>

          <div id="features" className="grid gap-4 md:grid-cols-3">
            <FeatureCard title="Multi-org model" text="Each organization is isolated. Data is not shared across tenants." />
            <FeatureCard title="Role-based access" text="Super admin can manage admins; admins cannot remove the super admin." />
            <FeatureCard title="Module billing" text="Pay per module, per year, with an included user bucket and overage pricing." />
          </div>
        </section>

        <section className="rounded-3xl border border-[#dfe8df] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
          <div className="flex rounded-2xl border border-[#dfe8df] bg-[#f4faf5] p-1">
            <button type="button" onClick={() => setMode("login")} className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === "login" ? "bg-[#17372a] text-white" : "text-zinc-600"}`}>
              Login
            </button>
            <button type="button" onClick={() => setMode("register")} className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === "register" ? "bg-[#17372a] text-white" : "text-zinc-600"}`}>
              Register
            </button>
          </div>

          <div className="mt-6">
            {mode === "login" ? (
              <div className="space-y-4">
                <Field label="Email address" type="email" placeholder="name@company.com" value={email} onChange={setEmail} />
                <div className="rounded-xl border border-dashed border-[#dfe8df] bg-[#f9fbf9] p-3 text-xs text-zinc-600">
                  <p className="font-semibold uppercase tracking-[0.12em] text-zinc-500">OTP login</p>
                  <p className="mt-2">Use the demo code 1234 for now while the live email OTP is being connected.</p>
                </div>
                {!otpSent ? (
                  <button type="button" onClick={handleOtpRequest} disabled={loading} className="w-full rounded-xl bg-[#17372a] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70">{loading ? "Sending..." : "Send OTP"}</button>
                ) : (
                  <>
                    <Field label="OTP" type="text" placeholder="Enter 6-digit OTP" value={otp} onChange={setOtp} />
                    <button type="button" onClick={handleVerifyOtp} disabled={loading} className="w-full rounded-xl bg-[#17372a] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70">{loading ? "Processing..." : "Login to workspace"}</button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <Field label="Full name" type="text" placeholder="Your name" value={name} onChange={setName} />
                <Field label="Profile name" type="text" placeholder="your-profile-name" value={profileName} onChange={setProfileName} />
                <Field label="Email address" type="email" placeholder="name@company.com" value={email} onChange={setEmail} />
                <div className="rounded-xl border border-dashed border-[#dfe8df] bg-[#f9fbf9] p-3 text-xs text-zinc-600">
                  <p className="font-semibold uppercase tracking-[0.12em] text-zinc-500">Registration flow</p>
                  <p className="mt-2">User registers with full name, profile name, and email. A workspace is created automatically for the profile URL.</p>
                </div>
                {!otpSent ? (
                  <button type="button" onClick={handleOtpRequest} disabled={loading} className="w-full rounded-xl bg-[#17372a] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70">{loading ? "Sending..." : "Send OTP"}</button>
                ) : (
                  <>
                    <Field label="OTP" type="text" placeholder="Enter 6-digit OTP" value={otp} onChange={setOtp} />
                    <button type="button" onClick={handleVerifyOtp} disabled={loading} className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70">{loading ? "Verifying..." : "Verify and continue"}</button>
                  </>
                )}
              </div>
            )}

            {message && (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</p>
            )}
          </div>
        </section>
      </main>

      <section id="plans" className="border-t border-[#dfe8df] bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Subscription plans</p>
            <h2 className="mt-2 text-3xl font-semibold text-[#17372a]">Module-wise pricing</h2>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <PlanCard title="Order Management" price="₹6,000 / year" description="Order workflows, approvals, BOM and merchandising workflows." />
            <PlanCard title="Factory Management" price="₹10,000 / year" description="Factory planning, capacity, production tracking, and dispatch control." />
            <PlanCard title="User Access" price="₹1,000 / user" description="5 users are free across all plans; extra users are charged per user." />
          </div>
        </div>
      </section>

      <section id="security" className="bg-[#edf5ee]">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-12 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="rounded-3xl border border-[#dfe8df] bg-white p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Backup & restore</p>
            <h3 className="mt-3 text-2xl font-semibold text-[#17372a]">Organization-wise backup control</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-600">Every organization can take backups on demand, restore to a prior snapshot, and keep data isolated from other organizations in the same workspace.</p>
          </div>
          <div className="rounded-3xl border border-[#dfe8df] bg-[#17372a] p-6 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/80">Admin controls</p>
            <ul className="mt-4 space-y-3 text-sm text-emerald-50/80">
              <li>• Super admin owns the workspace-level control.</li>
              <li>• Admins can manage organization operations with the same access model.</li>
              <li>• Super admin can remove admins; admins cannot remove the super admin.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, type, placeholder, value, onChange }: { label: string; type: string; placeholder: string; value?: string; onChange?: (value: string) => void }) {
  return (
    <label className="block text-sm font-medium text-zinc-700">
      <span className="mb-2 block">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#dfe8df] bg-[#fbfdfb] px-3 py-3 text-sm text-zinc-800 outline-none transition focus:border-emerald-700"
      />
    </label>
  );
}

function FeatureCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[#dfe8df] bg-white p-5 shadow-sm">
      <div className="mb-4 grid size-10 place-items-center rounded-xl bg-[#edf5ee] text-lg text-[#17372a]">✓</div>
      <h3 className="text-lg font-semibold text-[#17372a]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p>
    </div>
  );
}

function PlanCard({ title, price, description }: { title: string; price: string; description: string }) {
  return (
    <div className="rounded-3xl border border-[#dfe8df] bg-[#f9fbf9] p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Plan</p>
      <h3 className="mt-3 text-xl font-semibold text-[#17372a]">{title}</h3>
      <p className="mt-3 text-2xl font-semibold text-[#17372a]">{price}</p>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}
