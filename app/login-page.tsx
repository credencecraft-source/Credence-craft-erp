"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Leaf, Recycle, Scissors, Waves, Zap } from "lucide-react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import PublicHeader from "@/components/public/public-header";

type View = "login" | "impact";
type Mode = "login" | "register" | "support";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [view, setView] = useState<View>("login");
  const [fullName, setFullName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [fabricWaste, setFabricWaste] = useState(800);
  const [recycledWaste, setRecycledWaste] = useState(200);
  const [waterUsed, setWaterUsed] = useState(50000);
  const recoveryRate = fabricWaste > 0 ? Math.min((recycledWaste / fabricWaste) * 100, 100) : 0;
  const carbonImpact = Math.max(fabricWaste * 2.1, 0);

  useEffect(() => {
    if (window.location.hash === "#impact") setView("impact");
  }, []);

  function updateNumber(setter: (value: number) => void, value: string) { setter(Math.max(Number(value) || 0, 0)); }
  function switchMode(nextMode: Mode) { setMode(nextMode); setOtp(""); setOtpSent(false); setMessage(""); }
  async function parseJsonResponse(response: Response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { throw new Error("Unexpected server response. Please refresh and try again."); }
  }
  async function requestOtp() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setMessage("Please enter a valid email address."); return; }
    if (mode === "register" && (!fullName.trim() || fullName.trim().length < 2 || !profileName.trim() || profileName.trim().length < 2)) { setMessage("Please enter your full name and a profile name."); return; }
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/auth/send-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, fullName, profileName, email: trimmedEmail }) });
      const payload = await parseJsonResponse(response);
      if (!response.ok) { if (payload.needsRegistration) { setMode("register"); setMessage("No account found. Please register first."); return; } throw new Error(payload.error || "Unable to send OTP."); }
      setOtpSent(true); setMessage("OTP sent to your email. It expires in 10 minutes.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Something went wrong."); } finally { setLoading(false); }
  }
  async function verifyOtp() {
    if (!email.trim() || !otp.trim()) { setMessage("Please enter your email address and OTP."); return; }
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/auth/verify-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, fullName, profileName, email: email.trim(), otp: otp.trim() }) });
      const payload = await parseJsonResponse(response);
      if (!response.ok) throw new Error(payload.error || "Authentication failed.");
      window.location.assign(payload.redirectTo || "/dashboard");
    } catch (error) { setMessage(error instanceof Error ? error.message : "OTP verification failed."); } finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-[#f3f6f1] text-[#183b2c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <PublicHeader active={view === "impact" ? "impact" : undefined} onImpactClick={() => setView("impact")} />
        <section className="grid min-h-[calc(100vh-73px)] items-center gap-12 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6d8c46]"><span className="h-1.5 w-1.5 rounded-full bg-[#a7c65a]" /> Apparel, with intention</div>
            <h1 className="mt-5 text-5xl font-semibold leading-[0.98] tracking-[-0.065em] sm:text-7xl">Make better clothes. <span className="text-[#6d8c46]">Leave less behind.</span></h1>
            <p className="mt-6 max-w-md text-[14px] leading-7 text-[#587066]">One thoughtful workspace for the people, materials and decisions that move fashion forward.</p>
            <div className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-[#d9e3dc] pt-5">{[{ icon: Leaf, label: "Trace materials" }, { icon: Scissors, label: "Respect craft" }, { icon: Recycle, label: "Reduce waste" }].map(({ icon: Icon, label }) => <div key={label} className="space-y-2"><Icon size={16} className="text-[#6d8c46]" /><p className="text-[11px] leading-4 text-[#587066]">{label}</p></div>)}</div>
            <button type="button" onClick={() => setView(view === "impact" ? "login" : "impact")} className="mt-10 inline-flex items-center gap-2 text-[12px] font-semibold text-[#183b2c] underline decoration-[#a7c65a] decoration-2 underline-offset-4">{view === "impact" ? "Return to sign in" : "See the impact of one production cycle"}<ArrowRight size={14} /></button>
          </div>

          {view === "login" ? <section id="sign-in" className="rounded-[1.75rem] border border-[#d9e3dc] bg-white p-6 shadow-[0_22px_70px_rgba(24,59,44,0.08)] sm:p-8">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6d8c46]">Your workspace</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Welcome back.</h2></div><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#edf5e7] text-[#6d8c46]"><Leaf size={17} /></span></div>
            <div className="mt-7 flex gap-4 border-b border-[#e7eee8] text-[12px] font-semibold"><button type="button" onClick={() => switchMode("login")} className={`border-b-2 pb-3 ${mode === "login" ? "border-[#183b2c] text-[#183b2c]" : "border-transparent text-[#93a39a]"}`}>Sign in</button><button type="button" onClick={() => switchMode("register")} className={`border-b-2 pb-3 ${mode === "register" ? "border-[#183b2c] text-[#183b2c]" : "border-transparent text-[#93a39a]"}`}>Create account</button><button type="button" onClick={() => switchMode("support")} className={`border-b-2 pb-3 ${mode === "support" ? "border-[#183b2c] text-[#183b2c]" : "border-transparent text-[#93a39a]"}`}>Support</button></div>
            <div className="mt-6 space-y-4">{mode === "register" && <div className="grid gap-4 sm:grid-cols-2"><Input label="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" /><Input label="Profile name" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="yourstudio" /></div>}<Input label={mode === "support" ? "Support email" : "Email address"} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />{otpSent && <Input label="One-time code" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="6-digit code" />}{!otpSent ? <Button onClick={requestOtp} disabled={loading} className="mt-2 w-full bg-[#183b2c] hover:bg-[#245640]">{loading ? "Sending..." : "Continue with email"}</Button> : <Button onClick={verifyOtp} disabled={loading} className="mt-2 w-full bg-[#183b2c] hover:bg-[#245640]">{loading ? "Verifying..." : "Verify and continue"}</Button>}{message && <p className="rounded-lg bg-[#f3f6f1] p-3 text-[12px] leading-5 text-[#587066]" role="status">{message}</p>}</div>
            <p className="mt-6 text-[10px] leading-4 text-[#93a39a]">By continuing, you agree to our <Link href="/terms" className="text-[#587066] underline underline-offset-2">terms</Link>.</p>
          </section> : <section id="impact" className="rounded-[1.75rem] bg-[#183b2c] p-6 text-white shadow-[0_22px_70px_rgba(24,59,44,0.12)] sm:p-8"><div className="flex items-start justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d8ef72]">A clearer footprint</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Small inputs. Useful signals.</h2></div><Waves size={18} className="text-[#d8ef72]" /></div><div className="mt-8 grid gap-4 sm:grid-cols-2"><Input label="Fabric waste (kg)" type="number" min="0" value={fabricWaste} onChange={(event) => updateNumber(setFabricWaste, event.target.value)} className="border-white/20 bg-white/10 text-white" /><Input label="Recovered waste (kg)" type="number" min="0" value={recycledWaste} onChange={(event) => updateNumber(setRecycledWaste, event.target.value)} className="border-white/20 bg-white/10 text-white" /><Input label="Water used (litres)" type="number" min="0" value={waterUsed} onChange={(event) => updateNumber(setWaterUsed, event.target.value)} className="border-white/20 bg-white/10 text-white" /></div><div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/10 p-4"><Recycle size={15} className="text-[#d8ef72]" /><p className="mt-4 text-[10px] uppercase tracking-wider text-white/50">Waste recovered</p><p className="mt-1 text-2xl font-semibold">{recoveryRate.toFixed(0)}%</p></div><div className="rounded-xl bg-white/10 p-4"><Zap size={15} className="text-[#e8c875]" /><p className="mt-4 text-[10px] uppercase tracking-wider text-white/50">Carbon estimate</p><p className="mt-1 text-2xl font-semibold">{Math.round(carbonImpact).toLocaleString()} <span className="text-[10px] text-white/50">kg CO₂e</span></p></div></div><p className="mt-6 text-[11px] leading-5 text-white/60">A directional estimate to help teams ask better questions about recovery, water and material flow.</p></section>}
        </section>
      </div>
    </main>
  );
}