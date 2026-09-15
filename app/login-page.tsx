"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Tabs from "@/components/ui/Tabs";
import {
  Factory,
  Handshake,
  Leaf,
  Recycle,
  Shirt,
  ShoppingBag,
  Store,
  Truck,
  Waves,
  Zap,
} from "lucide-react";

const AUTH_TABS = [
  { label: "Login", value: "login" },
  { label: "Register", value: "register" },
  { label: "Support Login", value: "support" },
] as const;

const FASHION_ROLES = [
  { label: "Brands", icon: Shirt },
  { label: "Factory", icon: Factory },
  { label: "Job work", icon: Handshake },
  { label: "Distributors", icon: Truck },
  { label: "Wholesalers", icon: ShoppingBag },
  { label: "Retailers", icon: Store },
  { label: "Buying house", icon: Recycle },
] as const;

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register" | "support">("login");
  const [fullName, setFullName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [fabricProduced, setFabricProduced] = useState(10000);
  const [fabricWaste, setFabricWaste] = useState(800);
  const [recycledWaste, setRecycledWaste] = useState(200);
  const [waterUsed, setWaterUsed] = useState(50000);
  const [electricityUsed, setElectricityUsed] = useState(5000);
  const [activeView, setActiveView] = useState<"login" | "solution" | "calculator">("login");

  const landfillWaste = Math.max(fabricWaste - recycledWaste, 0);
  const recoveryRate = fabricWaste > 0 ? Math.min((recycledWaste / fabricWaste) * 100, 100) : 0;
  const carbonImpact = Math.max(fabricWaste * 2.1 + electricityUsed * 0.42, 0);
  const waterImpact = Math.max(waterUsed * 0.35 + fabricWaste * 4, 0);
  const wasteTotal = Math.max(fabricWaste, 1);

  function updateNumber(setter: (value: number) => void, value: string) {
    setter(Math.max(Number(value) || 0, 0));
  }

  function switchMode(nextMode: "login" | "register" | "support") {
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
          email: trimmedEmail,
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
      setMessage("OTP sent to your email. It expires in 10 minutes.");
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
          email: trimmedEmail,
          otp,
        }),
      });

      const payload = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(payload.error || "Authentication failed.");
      }

      if (typeof window !== "undefined") {
        window.location.assign(payload.redirectTo || "/dashboard");
      }
    } catch (error) {
      const err = error as Error;
      setMessage(err.message || "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page className="min-h-screen max-w-none px-4 py-5 sm:px-8 sm:py-7 lg:px-12">
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col gap-6">
        <header className="grid items-center gap-4 border-b border-slate-200 pb-5 lg:grid-cols-[1fr_auto]">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/10"><Leaf size={22} /></div>
            <div className="shrink-0"><p className="text-sm font-black tracking-tight text-slate-950">Credence Craft</p><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-700">Apparel intelligence</p></div>
            <h1 className="hidden truncate border-l border-slate-200 pl-5 text-2xl font-black tracking-tight text-slate-950 lg:block xl:text-3xl">Build better apparel. <span className="text-emerald-700">Leave less behind.</span></h1>
          </div>
          <div className="flex rounded-full border border-slate-200 bg-white p-1.5 shadow-sm">
            <button type="button" onClick={() => setActiveView("login")} className={`rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${activeView === "login" ? "bg-slate-950 text-white" : "text-slate-500 hover:text-slate-900"}`}>Sign in</button>
            <button type="button" onClick={() => setActiveView("solution")} className={`rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${activeView === "solution" ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-900"}`}>Solution</button>
            <button type="button" onClick={() => setActiveView("calculator")} className={`rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${activeView === "calculator" ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-900"}`}>Impact calculator</button>
          </div>
        </header>

        {activeView === "login" ? (
          <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center">
            <Card className="w-full max-w-xl rounded-3xl border-slate-200 p-8 shadow-xl sm:p-10 lg:p-12">
              <Tabs tabs={AUTH_TABS} value={mode} onChange={(nextMode) => switchMode(nextMode as "login" | "register" | "support")} />

              <div className="mt-6 space-y-4">
                {mode === "support" ? (
                  <>
                    <Input
                      label="Support email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="Enter your support email"
                    />
                    {!otpSent ? (
                      <Button onClick={requestOtp} disabled={loading} className="mt-2 w-full">
                        {loading ? "Sending..." : "Send OTP"}
                      </Button>
                    ) : (
                      <>
                        <Input label="OTP" type="text" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="6-digit code" />
                        <Button onClick={verifyOtp} disabled={loading} className="mt-2 w-full">
                          {loading ? "Verifying..." : "Verify and continue"}
                        </Button>
                      </>
                    )}

                    {message && (
                      <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" role="status">
                        {message}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {mode === "register" && (
                      <>
                        <Input
                          label="Full name"
                          type="text"
                          value={fullName}
                          onChange={(event) => setFullName(event.target.value)}
                          placeholder="John Smith"
                        />

                        <div className="space-y-1">
                          <Input
                            label="Profile name"
                            type="text"
                            value={profileName}
                            onChange={(event) => setProfileName(event.target.value)}
                            placeholder="johnsmith"
                          />
                          {profileName.trim() && (
                            <span className={`mt-1 block text-xs ${profileName.trim().length >= 2 ? "text-emerald-700" : "text-amber-700"}`}>
                              {getProfileNameHint(profileName)}
                            </span>
                          )}
                        </div>
                      </>
                    )}

                    <Input
                      label="Email address"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@company.com"
                    />

                    {!otpSent ? (
                      <Button onClick={requestOtp} disabled={loading} className="mt-2 w-full">
                        {loading ? "Sending..." : "Send OTP"}
                      </Button>
                    ) : (
                      <>
                        <Input
                          label="OTP"
                          type="text"
                          value={otp}
                          onChange={(event) => setOtp(event.target.value)}
                          placeholder="6-digit code"
                        />

                        <Button onClick={verifyOtp} disabled={loading} className="mt-2 w-full">
                          {loading ? "Verifying..." : "Verify and continue"}
                        </Button>
                      </>
                    )}

                    {message && (
                      <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" role="status">
                        {message}
                      </p>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>
        ) : activeView === "solution" ? (
          <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center">
            <div className="w-full max-w-5xl rounded-3xl border border-slate-200 bg-white p-8 shadow-xl sm:p-10 lg:p-12">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Solution overview</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">A connected platform for every step of the fashion supply chain.</h2>
              <p className="mt-4 max-w-4xl text-base leading-7 text-slate-600">From sourcing and production to distribution and retail, Credence Craft helps teams coordinate decisions, reduce waste, and act responsibly across the full value chain.</p>

              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {FASHION_ROLES.map(({ label, icon: Icon }) => (
                  <div key={label} className="group flex min-h-24 flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/50">
                    <Icon size={22} className="text-emerald-700 transition-transform group-hover:scale-110" />
                    <span className="text-sm font-bold text-slate-700">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
        <section className="min-h-[calc(100vh-7rem)] rounded-3xl bg-slate-950 p-4 text-white shadow-2xl shadow-slate-900/10 sm:p-6 lg:p-7">
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">Waste → Planet Impact</p><h1 className="mt-1 text-2xl font-black tracking-tight sm:text-4xl">Every material choice leaves a trace.</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">Use a quick production snapshot to see where waste goes and where recovery can change the outcome.</p></div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><Waves size={15} className="text-sky-300" /> Illustrative estimate</div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl bg-white p-4 text-slate-900 sm:p-5"><div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Production snapshot</p><p className="mt-1 text-xs text-slate-500">Adjust the numbers to explore the impact.</p></div><div className="grid gap-3 sm:grid-cols-2 [&_input]:py-1.5 [&_label]:text-[10px]"><Input label="Fabric produced (kg)" type="number" min="0" value={fabricProduced} onChange={(event) => updateNumber(setFabricProduced, event.target.value)} /><Input label="Fabric waste (kg)" type="number" min="0" value={fabricWaste} onChange={(event) => updateNumber(setFabricWaste, event.target.value)} /><Input label="Recycled waste (kg)" type="number" min="0" value={recycledWaste} onChange={(event) => updateNumber(setRecycledWaste, event.target.value)} /><Input label="Water used (litres)" type="number" min="0" value={waterUsed} onChange={(event) => updateNumber(setWaterUsed, event.target.value)} /><Input label="Electricity (kWh)" type="number" min="0" value={electricityUsed} onChange={(event) => updateNumber(setElectricityUsed, event.target.value)} /></div><p className="mt-3 text-[10px] leading-4 text-slate-500">Carbon: 2.1 kg CO₂e per kg waste + 0.42 kg CO₂e per kWh. Water: 35% reported water + 4 L per kg waste.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5"><div className="grid grid-cols-2 gap-2"><div className="rounded-xl bg-white/10 p-3"><Recycle size={15} className="text-emerald-300" /><p className="mt-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">Waste generated</p><p className="mt-1 text-xl font-black">{fabricWaste.toLocaleString()} kg</p></div><div className="rounded-xl bg-white/10 p-3"><Leaf size={15} className="text-emerald-300" /><p className="mt-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">Waste recovered</p><p className="mt-1 text-xl font-black">{recoveryRate.toFixed(0)}%</p></div><div className="rounded-xl bg-white/10 p-3"><Zap size={15} className="text-amber-300" /><p className="mt-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">Carbon impact</p><p className="mt-1 text-xl font-black">{Math.round(carbonImpact).toLocaleString()} <span className="text-[10px] font-semibold text-slate-400">kg CO₂e</span></p></div><div className="rounded-xl bg-white/10 p-3"><Waves size={15} className="text-sky-300" /><p className="mt-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">Water impact</p><p className="mt-1 text-xl font-black">{Math.round(waterImpact).toLocaleString()} <span className="text-[10px] font-semibold text-slate-400">L</span></p></div></div><div className="mt-5"><div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400"><span>Waste flow</span><span>{fabricProduced > 0 ? ((fabricWaste / fabricProduced) * 100).toFixed(1) : "0.0"}% of fabric</span></div><div className="flex h-4 overflow-hidden rounded-full bg-white/10"><div className="bg-emerald-400 transition-all" style={{ width: `${Math.min((recycledWaste / wasteTotal) * 100, 100)}%` }} /><div className="bg-amber-300 transition-all" style={{ width: `${Math.min((landfillWaste / wasteTotal) * 100, 100)}%` }} /></div><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />Recycled {recycledWaste.toLocaleString()} kg</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-300" />Landfill {landfillWaste.toLocaleString()} kg</span></div></div><div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Planet perspective</p><p className="mt-1 text-xs leading-5 text-slate-300">Recovering more material keeps it in circulation and reduces pressure on water, energy, and landfill.</p></div></div>
          </div>
        </section>
        )}

        {false && (
        <section id="impact-calculator" className="border-t border-slate-200 pt-8">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div><p className="erp-eyebrow">Waste → Planet Impact</p><h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">See the footprint of one production cycle</h2><p className="mt-1 text-sm text-slate-600">A simple estimate to make waste, recovery, and resource choices visible.</p></div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Waves size={15} className="text-sky-600" /> Water + energy estimate</div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Fabric produced (kg)" type="number" min="0" value={fabricProduced} onChange={(event) => updateNumber(setFabricProduced, event.target.value)} />
                <Input label="Fabric waste (kg)" type="number" min="0" value={fabricWaste} onChange={(event) => updateNumber(setFabricWaste, event.target.value)} />
                <Input label="Recycled waste (kg)" type="number" min="0" value={recycledWaste} onChange={(event) => updateNumber(setRecycledWaste, event.target.value)} />
                <Input label="Water used (litres)" type="number" min="0" value={waterUsed} onChange={(event) => updateNumber(setWaterUsed, event.target.value)} />
                <Input label="Electricity (kWh)" type="number" min="0" value={electricityUsed} onChange={(event) => updateNumber(setElectricityUsed, event.target.value)} />
              </div>
              <p className="mt-4 text-[11px] leading-5 text-slate-500">Illustrative estimate: carbon uses 2.1 kg CO₂e per kg waste plus 0.42 kg CO₂e per kWh. Water impact uses 35% of reported water plus 4 litres per kg waste.</p>
            </Card>

            <Card className="bg-slate-950 p-5 text-white sm:p-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/10 p-3"><Recycle size={17} className="text-emerald-300" /><p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Waste generated</p><p className="mt-1 text-xl font-black">{fabricWaste.toLocaleString()} kg</p></div>
                <div className="rounded-xl bg-white/10 p-3"><Leaf size={17} className="text-emerald-300" /><p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Waste recovered</p><p className="mt-1 text-xl font-black">{recoveryRate.toFixed(0)}%</p></div>
                <div className="rounded-xl bg-white/10 p-3"><Zap size={17} className="text-amber-300" /><p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Carbon impact</p><p className="mt-1 text-xl font-black">{Math.round(carbonImpact).toLocaleString()} kg CO₂e</p></div>
                <div className="rounded-xl bg-white/10 p-3"><Waves size={17} className="text-sky-300" /><p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Water impact</p><p className="mt-1 text-xl font-black">{Math.round(waterImpact).toLocaleString()} L</p></div>
              </div>
              <div className="mt-6"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Waste flow</p><p className="text-xs text-slate-400">{fabricProduced > 0 ? ((fabricWaste / fabricProduced) * 100).toFixed(1) : "0.0"}% of fabric</p></div><div className="flex h-4 overflow-hidden rounded-full bg-white/10"><div className="bg-emerald-400" style={{ width: `${(recycledWaste / wasteTotal) * 100}%` }} /><div className="bg-amber-300" style={{ width: `${(landfillWaste / wasteTotal) * 100}%` }} /></div><div className="mt-3 flex justify-between text-[11px] text-slate-400"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />Recycled {recycledWaste.toLocaleString()} kg</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-300" />Landfill {landfillWaste.toLocaleString()} kg</span></div></div>
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Planet perspective</p><p className="mt-1 text-sm leading-6 text-slate-300">Recovering more of this waste keeps material in circulation and reduces pressure on water, energy, and landfill.</p></div>
            </Card>
          </div>
        </section>
        )}
      </div>
    </Page>
  );
}
