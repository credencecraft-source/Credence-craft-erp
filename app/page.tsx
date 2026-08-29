"use client";

import { useState } from "react";

export default function PublicHomePage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setOtp("");
    setOtpSent(false);
    setMessage("");
  }

  function getProfileNameHint(value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
      return "Choose a unique profile name.";
    }

    if (trimmed.length < 2) {
      return "Profile name must be at least 2 characters.";
    }

    return "Looks good.";
  }

  async function parseJsonResponse(response: Response) {
    const text = await response.text();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      const preview = text.replace(/\s+/g, " ").trim();
      throw new Error(
        preview.startsWith("<")
          ? "The server returned an HTML error page. Please refresh and try again."
          : preview.slice(0, 160) || "Unexpected server response."
      );
    }
  }

  async function requestOtp() {
    const trimmedEmail = email.trim();
    const trimmedFullName = fullName.trim();
    const trimmedProfileName = profileName.trim();

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setMessage("Please enter a valid email address.");
      return;
    }

    if (mode === "register") {
      if (!trimmedFullName || trimmedFullName.length < 2) {
        setMessage("Full name must be at least 2 characters.");
        return;
      }

      if (!trimmedProfileName || trimmedProfileName.length < 2) {
        setMessage("Profile name must be at least 2 characters.");
        return;
      }
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          fullName,
          profileName,
          email,
        }),
      });

      const payload = await parseJsonResponse(response);

      if (!response.ok) {
        if (payload.needsRegistration) {
          setOtp("");
          setOtpSent(false);
          setMode("register");
          setMessage("No account found. Please register first.");
          return;
        }
        throw new Error(payload.error || "Unable to send OTP.");
      }

      setOtpSent(true);
      setMessage(payload.devOtp ? `Development OTP: ${payload.devOtp}` : "OTP sent.");
    } catch (error) {
      const err = error as Error;
      setMessage(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    const trimmedEmail = email.trim();
    const trimmedOtp = otp.trim();

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) || !trimmedOtp) {
      setMessage("Please enter a valid email address and OTP.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          fullName,
          profileName,
          email,
          otp,
        }),
      });

      const payload = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(payload.error || "Authentication failed.");
      }

      if (typeof window !== "undefined") {
        window.location.assign(payload.redirectTo || "/workspace");
      }
    } catch (error) {
      const err = error as Error;
      setMessage(err.message || "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-[28px] border border-emerald-100 bg-white/90 shadow-[0_30px_100px_rgba(20,83,45,0.12)] backdrop-blur-xl">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative overflow-hidden bg-[linear-gradient(135deg,#142f26_0%,#1d5441_45%,#12392d_100%)] p-8 text-white lg:p-12">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-300/20 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-sky-400/10 blur-3xl" />
            <div className="relative">
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-emerald-200">Enterprise ERP</p>
              <h1 className="mt-6 max-w-md text-4xl font-semibold leading-tight tracking-[-0.04em] text-white lg:text-5xl">
                Welcome to your workspace foundation.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-7 text-emerald-50/80 lg:text-base">
                Secure login and onboarding for a scalable ERP platform. This public page starts the user authentication flow and leads to the workspace dashboard.
              </p>

              <div className="mt-8 grid max-w-md gap-3 sm:grid-cols-3">
                {[
                  { label: "Modules", value: "12+" },
                  { label: "Teams", value: "24/7" },
                  { label: "Coverage", value: "Global" },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200">{item.label}</p>
                    <p className="mt-2 text-lg font-semibold text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="p-8 lg:p-12">
            <div className="flex rounded-2xl border border-emerald-100 bg-emerald-50/60 p-1.5">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${mode === "login" ? "bg-emerald-700 text-white shadow-sm" : "text-slate-600 hover:text-emerald-700"}`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => switchMode("register")}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${mode === "register" ? "bg-emerald-700 text-white shadow-sm" : "text-slate-600 hover:text-emerald-700"}`}
              >
                Register
              </button>
            </div>

            <div className="mt-8 space-y-4">
              {mode === "register" && (
                <>
                  <label className="block text-sm font-medium text-slate-700">
                    <span className="mb-2 block">Full name</span>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                      placeholder="John Smith"
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    <span className="mb-2 block">Profile name</span>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                      placeholder="johnsmith"
                    />
                    {profileName.trim() && (
                      <span className={`mt-2 block text-xs ${profileName.trim().length >= 2 ? "text-emerald-700" : "text-amber-700"}`}>
                        {getProfileNameHint(profileName)}
                      </span>
                    )}
                  </label>
                </>
              )}

              <label className="block text-sm font-medium text-slate-700">
                <span className="mb-2 block">Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                  placeholder="name@company.com"
                />
              </label>

              {!otpSent ? (
                <button
                  type="button"
                  onClick={requestOtp}
                  disabled={loading}
                  className="w-full rounded-2xl bg-emerald-700 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(20,83,45,0.22)] transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Sending..." : "Send OTP"}
                </button>
              ) : (
                <>
                  <label className="block text-sm font-medium text-zinc-700">
                    <span className="mb-2 block">OTP</span>
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      className="w-full rounded-xl border border-[#dfe6df] bg-white px-3 py-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                      placeholder="1234"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={verifyOtp}
                    disabled={loading}
                    className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Verifying..." : "Verify and continue"}
                  </button>
                </>
              )}

              {message && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}


