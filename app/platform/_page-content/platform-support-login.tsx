"use client";

import { useState } from "react";
import { Headset } from "lucide-react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Unexpected server response. Please refresh and try again.");
  }
}

export default function PlatformSupportLogin() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function submit(mode: "send" | "verify") {
    setBusy(true);
    setMessage("");
    setIsError(false);

    try {
      const response = await fetch(
        mode === "send" ? "/api/auth/send-otp" : "/api/auth/verify-otp",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "support",
            email: email.trim(),
            ...(mode === "verify" ? { otp: otp.trim() } : {}),
          }),
        },
      );
      const payload = await readResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || "Unable to complete platform sign-in.");
      }

      if (mode === "send") {
        setOtpSent(true);
        setOtp("");
        setMessage("A one-time code was sent to your platform email address.");
        return;
      }

      window.location.assign(payload.redirectTo || "/platform/organisations");
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete platform sign-in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--erp-bg)] p-4 text-[var(--erp-text)] sm:p-8">
      <Card className="w-full max-w-md space-y-6 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
            <Headset size={21} aria-hidden="true" />
          </span>
          <div>
            <p className="erp-eyebrow">Credence Craft</p>
            <h1 className="erp-page-heading mt-1">Platform team sign in</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--erp-muted)]">
              Sign in with your active platform team email. We’ll send you a one-time code.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Input
            label="Platform email"
            type="email"
            autoComplete="email"
            required
            maxLength={255}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy || otpSent}
            placeholder="name@company.com"
          />
          {otpSent && (
            <Input
              label="One-time code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              value={otp}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              disabled={busy}
              placeholder="6-digit code"
            />
          )}
          <Button
            className="w-full"
            disabled={
              busy ||
              !email.trim() ||
              (otpSent && otp.length !== 6)
            }
            onClick={() => void submit(otpSent ? "verify" : "send")}
          >
            {busy
              ? otpSent
                ? "Verifying..."
                : "Sending..."
              : otpSent
                ? "Verify and continue"
                : "Send sign-in code"}
          </Button>
          {otpSent && (
            <Button
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setOtpSent(false);
                setOtp("");
                setMessage("");
              }}
            >
              Use a different email
            </Button>
          )}
          {message && (
            <p
              className={`rounded-xl p-3 text-sm leading-5 ${
                isError
                  ? "border border-[var(--erp-danger)] bg-[var(--erp-surface)] text-[var(--erp-danger)]"
                  : "border border-[var(--erp-border)] bg-[var(--erp-brand-soft)] text-[var(--erp-text)]"
              }`}
              role={isError ? "alert" : "status"}
            >
              {message}
            </p>
          )}
        </div>
      </Card>
    </main>
  );
}
