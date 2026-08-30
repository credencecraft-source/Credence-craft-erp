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
    <main >
      <div >
        <div >
          <section >
            <div  />
            <div  />
            <div >
              <p >Enterprise ERP</p>
              <h1 >
                Welcome to your workspace foundation.
              </h1>
              <p >
                Secure login and onboarding for a scalable ERP platform. This public page starts the user authentication flow and leads to the workspace dashboard.
              </p>

              <div >
                {[
                  { label: "Modules", value: "12+" },
                  { label: "Teams", value: "24/7" },
                  { label: "Coverage", value: "Global" },
                ].map((item) => (
                  <div key={item.label} >
                    <p >{item.label}</p>
                    <p >{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section >
            <div >
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

            <div >
              {mode === "register" && (
                <>
                  <label >
                    <span >Full name</span>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      
                      placeholder="John Smith"
                    />
                  </label>

                  <label >
                    <span >Profile name</span>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      
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

              <label >
                <span >Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  
                  placeholder="name@company.com"
                />
              </label>

              {!otpSent ? (
                <button
                  type="button"
                  onClick={requestOtp}
                  disabled={loading}
                  
                >
                  {loading ? "Sending..." : "Send OTP"}
                </button>
              ) : (
                <>
                  <label >
                    <span >OTP</span>
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      
                      placeholder="1234"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={verifyOtp}
                    disabled={loading}
                    
                  >
                    {loading ? "Verifying..." : "Verify and continue"}
                  </button>
                </>
              )}

              {message && (
                <p >{message}</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}


