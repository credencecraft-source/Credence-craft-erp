"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Tabs from "@/components/ui/Tabs";

const AUTH_TABS = [
  { label: "Login", value: "login" },
  { label: "Register", value: "register" },
] as const;

const PLATFORM_HIGHLIGHTS = [
  { label: "Modules", value: "12+" },
  { label: "Teams", value: "24/7" },
  { label: "Coverage", value: "Global" },
] as const;

export default function LoginPage() {
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
    <Page className="max-w-6xl py-10 sm:py-16">
      <div>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
          <section className="space-y-6 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-600"></span>
              Enterprise ERP Platform
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Welcome to your workspace foundation.
            </h1>
            <p className="text-base text-slate-600 sm:text-lg">
              Secure login and onboarding for a scalable ERP platform. This public page starts the user authentication flow and leads to the workspace dashboard.
            </p>

            <div className="grid grid-cols-3 gap-3 border-t border-slate-200 pt-4 sm:gap-4">
              {PLATFORM_HIGHLIGHTS.map((item) => (
                <Card key={item.label} className="bg-slate-50 p-3 shadow-none sm:p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{item.value}</p>
                </Card>
              ))}
            </div>
          </section>

          <section className="lg:col-span-5">
            <Card className="p-6 shadow-lg sm:p-8">
              <Tabs tabs={AUTH_TABS} value={mode} onChange={(nextMode) => switchMode(nextMode as "login" | "register")} />

              <div className="mt-6 space-y-4">
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
                      placeholder="1234"
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
              </div>
            </Card>
          </section>
        </div>
      </div>
    </Page>
  );
}
