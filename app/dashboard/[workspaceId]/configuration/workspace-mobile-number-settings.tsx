"use client";

import { useEffect, useState } from "react";

import Msg91MobileOtpWidget from "@/components/auth/msg91-mobile-otp-widget";

type MobileProfile = {
  verified: boolean;
};

export default function WorkspaceMobileNumberSettings() {
  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/mobile-otp/profile", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load mobile settings.");
        }
        if (active) {
          setProfile(payload);
          setEditing(!payload.verified);
        }
      })
      .catch((fetchError: unknown) => {
        if (active) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Unable to load mobile settings.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveVerifiedMobile(accessToken: string) {
    const response = await fetch("/api/auth/mobile-otp/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Unable to save the verified number.");
    }
    setProfile({ verified: true });
    setEditing(false);
    setError("");
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Mobile sign-in
        </p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">
          Verified mobile number
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
          Verify a number with MSG91 to use it for mobile OTP sign-in. Only one
          workspace account can use a verified number.
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {!profile && !error && (
        <p className="mt-4 text-sm text-slate-500" role="status">
          Loading mobile settings...
        </p>
      )}

      {profile?.verified && !editing && (
        <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-800">
            Mobile number verified. The number is hidden and cannot be changed here.
          </p>
        </div>
      )}

      {editing && (
        <div className="mt-5 max-w-xl">
          <Msg91MobileOtpWidget
            onVerified={saveVerifiedMobile}
            submitLabel="Verify and save number"
          />
        </div>
      )}
    </section>
  );
}
