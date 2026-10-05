"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Leaf, MailCheck, Recycle, Scissors, Waves, Zap } from "lucide-react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import PublicHeader from "@/components/public/public-header";
import Msg91MobileOtpWidget from "@/components/auth/msg91-mobile-otp-widget";

type View = "login" | "impact";
type Mode = "login" | "register" | "support";
type AuthMethod = "email" | "mobile";

function subscribeToLocationHash(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function getViewFromLocationHash(): View {
  return window.location.hash === "#impact" ? "impact" : "login";
}

function getServerView(): View {
  return "login";
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("mobile");
  const view = useSyncExternalStore(subscribeToLocationHash, getViewFromLocationHash, getServerView);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [mobileEmailOtp, setMobileEmailOtp] = useState("");
  const [mobileEmailHint, setMobileEmailHint] = useState("");
  const [mobileEmailNumber, setMobileEmailNumber] = useState("");
  const [mobileEmailBusy, setMobileEmailBusy] = useState(false);
  const [mobileEmailMessage, setMobileEmailMessage] = useState("");
  const [showMobileEmailNotice, setShowMobileEmailNotice] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [fabricWaste, setFabricWaste] = useState(800);
  const [recycledWaste, setRecycledWaste] = useState(200);
  const [waterUsed, setWaterUsed] = useState(50000);
  const recoveryRate = fabricWaste > 0 ? Math.min((recycledWaste / fabricWaste) * 100, 100) : 0;
  const carbonImpact = Math.max(fabricWaste * 2.1, 0);

  function setView(nextView: View) {
    const nextHash = nextView === "impact" ? "#impact" : "#sign-in";
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  }

  function updateNumber(setter: (value: number) => void, value: string) { setter(Math.max(Number(value) || 0, 0)); }
  function switchMode(nextMode: Mode) { setMode(nextMode); setOtp(""); setOtpSent(false); setMessage(""); }
  function switchAuthMethod(nextMethod: AuthMethod) {
    setAuthMethod(nextMethod);
    setOtp("");
    setOtpSent(false);
    setMessage("");
    setMobileEmailOtp("");
    setMobileEmailHint("");
    setMobileEmailNumber("");
    setMobileEmailMessage("");
    setShowMobileEmailNotice(false);
  }
  async function parseJsonResponse(response: Response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { throw new Error("Unexpected server response. Please refresh and try again."); }
  }
  async function requestOtp() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setMessage("Please enter a valid email address."); return; }
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/auth/send-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, email: trimmedEmail }) });
      let payload = await parseJsonResponse(response);
      if (!response.ok && payload.needsRegistration) {
        const registrationResponse = await fetch("/api/auth/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "register", email: trimmedEmail }),
        });
        payload = await parseJsonResponse(registrationResponse);
        if (!registrationResponse.ok) throw new Error(payload.error || "Unable to send OTP.");
        setMode("register");
      } else if (!response.ok) {
        throw new Error(payload.error || "Unable to send OTP.");
      }
      setOtpSent(true); setMessage("OTP sent to your email. It expires in 10 minutes.");
    } catch (error) { setMessage(!navigator.onLine ? "No internet connection. Check your connection and try again." : error instanceof Error ? error.message : "Something went wrong."); } finally { setLoading(false); }
  }
  async function verifyOtp() {
    if (!email.trim() || !otp.trim()) { setMessage("Please enter your email address and OTP."); return; }
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/auth/verify-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, email: email.trim(), otp: otp.trim() }) });
      const payload = await parseJsonResponse(response);
      if (!response.ok) throw new Error(payload.error || "Authentication failed.");
      window.location.assign(payload.redirectTo || "/dashboard");
    } catch (error) { setMessage(!navigator.onLine ? "No internet connection. Check your connection and try again." : error instanceof Error ? error.message : "OTP verification failed."); } finally { setLoading(false); }
  }
  async function verifyMobileOtp(accessToken: string) {
    const response = await fetch("/api/auth/mobile-otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload.error || "Mobile authentication failed.");
    }
    window.location.assign(payload.redirectTo || "/dashboard");
  }
  async function verifyMobileEmailOtp() {
    setMobileEmailBusy(true);
    setMobileEmailMessage("");
    try {
      const response = await fetch("/api/auth/mobile-otp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          mobileNumber: mobileEmailNumber,
          otp: mobileEmailOtp.trim(),
        }),
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) throw new Error(payload.error || "Email OTP verification failed.");
      window.location.assign(payload.redirectTo || "/dashboard");
    } catch (error) {
      setMobileEmailMessage(
        !navigator.onLine
          ? "No internet connection. Check your connection and try again."
          : error instanceof Error
            ? error.message
            : "Email OTP verification failed.",
      );
    } finally {
      setMobileEmailBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[var(--erp-bg)] text-[var(--erp-text)]">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6 lg:px-8">
        <PublicHeader active={view === "impact" ? "impact" : undefined} onImpactClick={() => setView("impact")} />
        <section className="grid flex-1 content-center items-center gap-6 py-4 sm:gap-10 sm:py-8 lg:min-h-[calc(100dvh-73px)] lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:py-12">
          <div className="hidden max-w-xl text-center lg:block lg:text-left">
            <div className="flex items-center justify-center gap-2 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-[var(--erp-brand)] lg:justify-start">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--erp-brand)]" /> Apparel, with intention
            </div>
            <h1 className="mt-4 text-[1.5rem] font-bold leading-[0.96] tracking-[-0.04em] sm:text-[2.5rem] lg:mt-5 lg:text-[3.5rem]">
              Make better clothes. <span className="text-[var(--erp-brand)]">Leave less behind.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[var(--erp-muted)] lg:mx-0 lg:mt-6 lg:text-[0.875rem] lg:leading-7">
              One thoughtful workspace for the people, materials and decisions that move fashion forward.
            </p>
            <div className="mt-7 grid max-w-md grid-cols-3 gap-3 border-t border-[var(--erp-border)] pt-5 text-left lg:mt-10">
              {[{ icon: Leaf, label: "Trace materials" }, { icon: Scissors, label: "Respect craft" }, { icon: Recycle, label: "Reduce waste" }].map(({ icon: Icon, label }) => (
                <div key={label} className="space-y-2">
                  <Icon size={16} className="text-[var(--erp-brand)]" />
                  <p className="text-[0.6875rem] leading-4 text-[var(--erp-muted)]">{label}</p>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView(view === "impact" ? "login" : "impact")}
              className="mt-7 min-h-0 rounded-none border-0 px-0 py-0 text-[0.75rem] font-semibold text-[var(--erp-text)] underline decoration-[var(--erp-brand)] decoration-2 underline-offset-4 hover:bg-transparent lg:mt-10"
            >
              {view === "impact" ? "Return to sign in" : "See the impact of one production cycle"}
              <ArrowRight size={14} />
            </Button>
          </div>

          {view === "login" ? <section id="sign-in" className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-lg flex-col justify-center rounded-[1.5rem] border border-[var(--erp-border)] bg-[var(--erp-surface)] p-5 shadow-[var(--erp-shadow)] sm:min-h-0 sm:p-6 lg:rounded-[1.75rem] lg:p-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.625rem] font-bold uppercase tracking-[0.16em] text-[var(--erp-brand)] sm:text-[0.625rem]">Your workspace</p>
                <h2 className="mt-2 text-[1.5rem] font-semibold tracking-[-0.04em] sm:text-[1.625rem]">Welcome back.</h2>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--erp-brand-soft)] text-[var(--erp-brand)] sm:h-9 sm:w-9">
                <Leaf size={17} />
              </span>
            </div>
            <div className="mt-5 flex gap-3 border-b border-[var(--erp-border)] text-[0.75rem] font-semibold sm:mt-7">
              <Button variant="ghost" size="sm" aria-pressed={authMethod === "email" && mode !== "support"} onClick={() => { switchAuthMethod("email"); switchMode("login"); }} className={`hidden min-h-0 rounded-none border-0 border-b-2 px-0 py-0 text-[0.75rem] hover:bg-transparent ${authMethod === "email" && mode !== "support" ? "border-[var(--erp-text)] text-[var(--erp-text)]" : "border-transparent text-[var(--erp-muted)]"}`}>Email</Button>
              <Button variant="ghost" size="sm" aria-pressed={authMethod === "mobile"} onClick={() => switchAuthMethod("mobile")} className={`min-h-0 rounded-none border-0 border-b-2 px-0 py-0 text-[0.75rem] hover:bg-transparent ${authMethod === "mobile" ? "border-[var(--erp-text)] text-[var(--erp-text)]" : "border-transparent text-[var(--erp-muted)]"}`}>Mobile</Button>
              <Button variant="ghost" size="sm" aria-pressed={mode === "support"} onClick={() => { switchAuthMethod("email"); switchMode("support"); }} className={`min-h-0 rounded-none border-0 border-b-2 px-0 py-0 text-[0.75rem] hover:bg-transparent ${mode === "support" && authMethod === "email" ? "border-[var(--erp-text)] text-[var(--erp-text)]" : "border-transparent text-[var(--erp-muted)]"}`}>Support</Button>
            </div>
            {authMethod === "mobile" ? (
              <div className="mt-5 sm:mt-6">
                {mobileEmailNumber ? (
                  <div className="space-y-3">
                    <p className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-brand-soft)] px-4 py-3 text-center text-lg font-extrabold tracking-tight text-[var(--erp-brand)]" role="status">
                      {mobileEmailHint}
                    </p>
                    <Input
                      label="Email OTP"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={mobileEmailOtp}
                      onChange={(event) => setMobileEmailOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit code"
                      disabled={mobileEmailBusy}
                      className="min-h-11 text-sm"
                    />
                    <Button
                      onClick={verifyMobileEmailOtp}
                      disabled={mobileEmailBusy || mobileEmailOtp.length !== 6}
                      className="w-full py-2.5 text-sm font-semibold"
                    >
                      {mobileEmailBusy ? "Verifying..." : "Verify and continue"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setMobileEmailOtp("");
                        setMobileEmailHint("");
                        setMobileEmailNumber("");
                        setMobileEmailMessage("");
                      }}
                      disabled={mobileEmailBusy}
                      className="h-auto min-h-0 px-0 py-0 text-xs font-semibold text-[var(--erp-muted)] underline underline-offset-2 hover:bg-transparent"
                    >
                      Change mobile number
                    </Button>
                    {mobileEmailMessage && <p className="rounded-xl bg-[var(--erp-bg)] p-3 text-[0.75rem] leading-5 text-[var(--erp-muted)]" role="alert">{mobileEmailMessage}</p>}
                  </div>
                ) : (
                  <Msg91MobileOtpWidget
                    onVerified={verifyMobileOtp}
                    checkAccountBeforeSend
                    onEmailOtpRequired={(mobileNumber, emailHint) => {
                      setMobileEmailNumber(mobileNumber);
                      setMobileEmailHint(emailHint);
                      setMobileEmailOtp("");
                      setMobileEmailMessage("");
                      setShowMobileEmailNotice(true);
                    }}
                    submitLabel="Verify and continue"
                  />
                )}
              </div>
            ) : (
              <div className="mt-5 space-y-4 sm:mt-6"><Input label={mode === "support" ? "Support email" : "Email"} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" className="min-h-[52px] text-base" />{otpSent && <Input label="One-time code" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="6-digit code" className="min-h-[52px] text-base" />}{!otpSent ? <Button onClick={requestOtp} disabled={loading} className="mt-1 w-full bg-[var(--erp-brand)] py-3 text-base font-semibold hover:bg-[var(--erp-brand-hover)]">{loading ? "Sending..." : "Continue with email"}</Button> : <Button onClick={verifyOtp} disabled={loading} className="mt-1 w-full bg-[var(--erp-brand)] py-3 text-base font-semibold hover:bg-[var(--erp-brand-hover)]">{loading ? "Verifying..." : "Verify and continue"}</Button>}{message && <p className="rounded-xl bg-[var(--erp-bg)] p-3 text-[0.75rem] leading-5 text-[var(--erp-muted)]" role="status">{message}</p>}</div>
            )}
            <p className="mt-5 text-[0.625rem] leading-4 text-[var(--erp-muted)] sm:mt-6">By continuing, you agree to our <Link href="/terms" className="text-[var(--erp-text)] underline underline-offset-2">terms</Link>.</p>
          </section> : <section id="impact" className="mx-auto w-full max-w-lg rounded-[1.5rem] bg-[var(--erp-brand)] p-4 text-white shadow-[0_22px_70px_rgba(24,59,44,0.12)] sm:p-6 lg:rounded-[1.75rem] lg:p-8"><div className="flex items-start justify-between gap-3"><div><p className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-[var(--erp-brand-soft)] sm:text-[0.625rem]">A clearer footprint</p><h2 className="mt-2 text-[1.5rem] font-semibold tracking-[-0.04em] sm:text-[1.625rem]">Impact snapshot</h2></div><Waves size={18} className="text-[var(--erp-brand-soft)]" /></div><div className="mt-7 grid gap-4 sm:mt-8 sm:grid-cols-2"><Input label="Fabric waste (kg)" type="number" min="0" value={fabricWaste} onChange={(event) => updateNumber(setFabricWaste, event.target.value)} className="border-white/20 bg-white/10 text-white" /><Input label="Recovered waste (kg)" type="number" min="0" value={recycledWaste} onChange={(event) => updateNumber(setRecycledWaste, event.target.value)} className="border-white/20 bg-white/10 text-white" /><Input label="Water used (litres)" type="number" min="0" value={waterUsed} onChange={(event) => updateNumber(setWaterUsed, event.target.value)} className="border-white/20 bg-white/10 text-white" /></div><div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/10 p-4"><Recycle size={15} className="text-[var(--erp-brand-soft)]" /><p className="mt-4 text-[0.625rem] uppercase tracking-wider text-white/50">Waste recovered</p><p className="mt-1 text-[1.5rem] font-semibold">{recoveryRate.toFixed(0)}%</p></div><div className="rounded-xl bg-white/10 p-4"><Zap size={15} className="text-[var(--erp-brand-soft)]" /><p className="mt-4 text-[0.625rem] uppercase tracking-wider text-white/50">Carbon estimate</p><p className="mt-1 text-[1.5rem] font-semibold">{Math.round(carbonImpact).toLocaleString()} <span className="text-[0.625rem] text-white/50">kg CO₂e</span></p></div></div><p className="mt-6 text-[0.6875rem] leading-5 text-white/60">A directional estimate to help teams ask better questions about recovery, water and material flow.</p></section>}
        </section>
        <Modal
          open={showMobileEmailNotice}
          onClose={() => setShowMobileEmailNotice(false)}
          ariaLabelledBy="mobile-email-otp-title"
          ariaDescribedBy="mobile-email-otp-description"
          variant="success"
          size="sm"
          className="p-6 text-center"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
            <MailCheck size={26} aria-hidden="true" />
          </div>
          <h2 id="mobile-email-otp-title" className="mt-4 text-xl font-semibold tracking-tight text-[var(--erp-text)]">
            Check your email
          </h2>
          <p id="mobile-email-otp-description" className="mt-3 break-all text-[1.5rem] font-extrabold tracking-tight text-[var(--erp-brand)]">
            {mobileEmailHint}
          </p>
          <Button
            onClick={() => setShowMobileEmailNotice(false)}
            className="mt-5 w-full bg-[var(--erp-brand)] py-2.5 text-sm font-semibold hover:bg-[var(--erp-brand-hover)]"
          >
            Got it, enter my code
          </Button>
        </Modal>
      </div>
    </main>
  );
}