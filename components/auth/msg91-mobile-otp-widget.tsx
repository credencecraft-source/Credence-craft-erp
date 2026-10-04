"use client";

import { useEffect, useId, useRef, useState } from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { MOBILE_COUNTRY_CODE_OPTIONS } from "@/lib/phone/mobile-country-code-options";

type WidgetCallback = (data: unknown) => void;
type WidgetFailure = (error: unknown) => void;

declare global {
  interface Window {
    initSendOTP?: (configuration: {
      widgetId: string;
      tokenAuth: string;
      identifier: string;
      exposeMethods: boolean;
      captchaRenderId: string;
      success: WidgetCallback;
      failure: WidgetFailure;
    }) => void;
    sendOtp?: (
      identifier: string,
      success?: WidgetCallback,
      failure?: WidgetFailure,
    ) => void;
    retryOtp?: (
      channel: string | null,
      success?: WidgetCallback,
      failure?: WidgetFailure,
      requestId?: string,
    ) => void;
    verifyOtp?: (
      otp: string,
      success?: WidgetCallback,
      failure?: WidgetFailure,
      requestId?: string,
    ) => void;
  }
}

function getAccessToken(response: unknown) {
  if (!response || typeof response !== "object") return null;

  const data = response as Record<string, unknown>;
  const nestedData =
    data.data && typeof data.data === "object"
      ? (data.data as Record<string, unknown>)
      : null;
  const candidates = [
    data.message,
    data.accessToken,
    data["access-token"],
    nestedData?.message,
    nestedData?.accessToken,
    nestedData?.["access-token"],
  ];

  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(candidate),
  );
}

function normalizeMobileNumber(value: string) {
  return value.replace(/\D/g, "");
}

let msg91ScriptPromise: Promise<void> | null = null;

function loadMsg91WidgetScript() {
  if (window.initSendOTP) return Promise.resolve();
  if (msg91ScriptPromise) return msg91ScriptPromise;

  msg91ScriptPromise = new Promise<void>((resolve, reject) => {
    const urls = [
      "https://verify.msg91.com/otp-provider.js",
      "https://verify.phone91.com/otp-provider.js",
    ];
    let index = 0;

    const loadNext = () => {
      const script = document.createElement("script");
      script.src = urls[index];
      script.async = true;
      script.onload = () => {
        if (window.initSendOTP) {
          resolve();
        } else {
          reject(new Error("The MSG91 OTP widget could not be initialized."));
        }
      };
      script.onerror = () => {
        script.remove();
        index += 1;
        if (index < urls.length) {
          loadNext();
        } else {
          reject(new Error("Unable to load the MSG91 OTP widget."));
        }
      };
      document.head.appendChild(script);
    };

    loadNext();
  }).catch((error: unknown) => {
    msg91ScriptPromise = null;
    throw error;
  });

  return msg91ScriptPromise;
}

export default function Msg91MobileOtpWidget({
  onVerified,
  onEmailOtpRequired,
  checkAccountBeforeSend = false,
  submitLabel,
}: {
  onVerified: (accessToken: string) => Promise<void>;
  onEmailOtpRequired?: (mobileNumber: string, emailHint: string) => void;
  checkAccountBeforeSend?: boolean;
  submitLabel: string;
}) {
  const [countryCode, setCountryCode] = useState("+91");
  const [mobileNumber, setMobileNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const captchaRenderId = `msg91-captcha-${useId().replace(/:/g, "")}`;
  const countryCodeListId = `mobile-country-codes-${useId().replace(/:/g, "")}`;
  const onVerifiedRef = useRef(onVerified);

  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  useEffect(() => {
    let active = true;

    async function initializeWidget() {
      try {
        const response = await fetch("/api/auth/mobile-otp/widget-config", {
          cache: "no-store",
        });
        const configuration = await response.json();
        if (!response.ok) {
          throw new Error(
            configuration.error || "Mobile OTP is not available.",
          );
        }

        await loadMsg91WidgetScript();
        if (!active) return;
        try {
          window.initSendOTP?.({
            widgetId: configuration.widgetId,
            tokenAuth: configuration.tokenAuth,
            identifier: "",
            exposeMethods: true,
            captchaRenderId,
            success: () => {},
            failure: () => {
              if (active) setMessage("MSG91 could not verify the OTP.");
            },
          });
          setWidgetReady(true);
        } catch {
          setMessage("The MSG91 OTP widget could not be initialized.");
        }
      } catch (error) {
        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to load mobile OTP settings.",
          );
        }
      }
    }

    void initializeWidget();
    return () => {
      active = false;
    };
  }, [captchaRenderId]);

  async function sendOtp() {
    const dialCode = normalizeMobileNumber(countryCode);
    const nationalNumber = normalizeMobileNumber(mobileNumber);
    if (!/^\d{1,4}$/.test(dialCode) || !/^\d{10}$/.test(nationalNumber)) {
      setMessage("Enter a valid country code and 10-digit mobile number.");
      return;
    }

    const identifier = `${dialCode}${nationalNumber}`;
    if (!/^\d{7,15}$/.test(identifier)) {
      setMessage("The country code and mobile number must contain 7 to 15 digits.");
      return;
    }
    setBusy(true);
    setMessage("");
    if (checkAccountBeforeSend) {
      try {
        const lookupResponse = await fetch("/api/auth/mobile-otp/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send", mobileNumber: identifier }),
        });
        const lookupPayload = await lookupResponse.json();
        if (!lookupResponse.ok) {
          throw new Error(lookupPayload.error || "Unable to check this account.");
        }
        if (lookupPayload.emailOtpSent && typeof lookupPayload.emailHint === "string") {
          if (!onEmailOtpRequired) {
            throw new Error("Email OTP sign-in is not available.");
          }
          onEmailOtpRequired(identifier, lookupPayload.emailHint);
          setBusy(false);
          return;
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to check this account. Please try again.",
        );
        setBusy(false);
        return;
      }
    }

    if (!window.sendOtp) {
      setMessage("The MSG91 OTP widget is not ready. Please try again.");
      setBusy(false);
      return;
    }

    window.sendOtp(
      identifier,
      () => {
        setOtpSent(true);
        setMessage("OTP sent. Enter the code you received.");
        setBusy(false);
      },
      () => {
        setMessage("MSG91 could not send the OTP. Check the number and retry.");
        setBusy(false);
      },
    );
  }

  function resendOtp() {
    if (!window.retryOtp) {
      setMessage("The MSG91 resend method is not available.");
      return;
    }

    setBusy(true);
    setMessage("");
    window.retryOtp(
      null,
      () => {
        setMessage("A new OTP has been sent.");
        setBusy(false);
      },
      () => {
        setMessage("MSG91 could not resend the OTP. Please try again.");
        setBusy(false);
      },
    );
  }

  function verifyOtp() {
    if (!/^\d{4,8}$/.test(otp.trim())) {
      setMessage("Enter the OTP you received.");
      return;
    }
    if (!window.verifyOtp) {
      setMessage("The MSG91 verification method is not available.");
      return;
    }

    setBusy(true);
    setMessage("");
    window.verifyOtp(
      otp.trim(),
      async (data) => {
        const accessToken = getAccessToken(data);
        if (!accessToken) {
          setMessage("MSG91 did not return a verification token.");
          setBusy(false);
          return;
        }

        try {
          await onVerifiedRef.current(accessToken);
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to complete mobile verification.",
          );
        } finally {
          setBusy(false);
        }
      },
      () => {
        setMessage("The OTP is invalid or expired. Check the code and retry.");
        setBusy(false);
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid w-full max-w-full grid-cols-[4.5rem_minmax(0,1fr)] gap-2 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-2">
        <Input
          label="Dial code"
          type="tel"
          inputMode="tel"
          autoComplete="tel-country-code"
          list={countryCodeListId}
          value={countryCode}
          onChange={(event) => setCountryCode(event.target.value)}
          placeholder="+91"
          maxLength={5}
          disabled={otpSent || busy}
          className="min-h-9 bg-white px-2 py-1.5 text-sm font-semibold"
        />
        <Input
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={mobileNumber}
          onChange={(event) =>
            setMobileNumber(event.target.value.replace(/\D/g, "").slice(0, 10))
          }
          placeholder="98765 43210"
          maxLength={10}
          disabled={otpSent || busy}
          className="min-h-9 bg-white px-2.5 py-2 text-sm"
        />
      </div>
      <datalist id={countryCodeListId}>
        {MOBILE_COUNTRY_CODE_OPTIONS.map(({ code, country }) => (
          <option key={code} value={code} label={country} />
        ))}
      </datalist>
      {otpSent && (
        <>
          <Input
            label="One-time code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(event) =>
              setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))
            }
            placeholder="Enter the OTP"
            disabled={busy}
            className="min-h-11 text-sm"
          />
          <Button
            variant="ghost"
            onClick={() => {
              setOtpSent(false);
              setOtp("");
              setMessage("");
            }}
            disabled={busy}
            className="h-auto min-h-0 px-0 py-0 text-xs font-semibold text-[#587066] underline underline-offset-2 hover:bg-transparent disabled:opacity-50"
          >
            Change mobile number
          </Button>
        </>
      )}
      {!otpSent ? (
        <Button
          onClick={sendOtp}
          disabled={busy || (!checkAccountBeforeSend && !widgetReady)}
          className="mt-1 w-full py-2.5 text-sm font-semibold"
        >
          {busy
            ? checkAccountBeforeSend
              ? "Checking..."
              : "Sending..."
            : checkAccountBeforeSend
              ? "Check OTP"
              : "Send mobile OTP"}
        </Button>
      ) : (
        <div className="space-y-2.5">
          <Button
            onClick={verifyOtp}
            disabled={busy}
            className="mt-1 w-full py-2.5 text-sm font-semibold"
          >
            {busy ? "Verifying..." : submitLabel}
          </Button>
          <Button
            variant="secondary"
            onClick={resendOtp}
            disabled={busy}
            className="w-full"
          >
            Resend OTP
          </Button>
        </div>
      )}
      <div id={captchaRenderId} />
      {message && (
        <p
          className="rounded-xl bg-[#f3f6f1] p-3 text-[12px] leading-5 text-[#587066]"
          role="status"
        >
          {message}
        </p>
      )}
    </div>
  );
}
