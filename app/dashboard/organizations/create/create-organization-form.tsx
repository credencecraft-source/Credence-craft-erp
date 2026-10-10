"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type CreateOrganizationResult =
  | { ok: true }
  | { ok: false; error: string };

interface CreateOrgFormProps {
  workspaceId: string;
  userEmail: string;
  userMobileNumber: string;
  isOnboardingRequired: boolean;
  error?: string;
  message?: string;
  action: (formData: FormData) => Promise<CreateOrganizationResult>;
}

type LoadingStage = "verifying" | "creating" | null;

const loadingLabels: Record<Exclude<LoadingStage, null>, string> = {
  verifying: "Fetching and verifying GST registration details...",
  creating: "Creating your organization from verified GST details...",
};

export default function CreateOrganizationForm({
  workspaceId,
  userEmail,
  userMobileNumber,
  isOnboardingRequired,
  error,
  message,
  action,
}: CreateOrgFormProps) {
  const router = useRouter();
  const [ownerName, setOwnerName] = useState("");
  const [organizationEmail, setOrganizationEmail] = useState(
    userEmail.endsWith("@mobile.credencecraft.invalid") ? "" : userEmail,
  );
  const [mobile, setMobile] = useState(userMobileNumber);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailOtpBusy, setEmailOtpBusy] = useState(false);
  const [emailOtpMessage, setEmailOtpMessage] = useState("");
  const [emailOtpError, setEmailOtpError] = useState(false);
  const [gstNumber, setGstNumber] = useState("");
  const [loadingStage, setLoadingStage] = useState<LoadingStage>(null);
  const [gstError, setGstError] = useState(message || (error ? "Unable to complete verification. Please verify details." : ""));

  const isBusy = loadingStage !== null;

  async function handleEmailVerification(mode: "send" | "verify") {
    if (emailOtpBusy || !organizationEmail.trim()) return;
    setEmailOtpBusy(true);
    setEmailOtpMessage("");
    setEmailOtpError(false);

    try {
      const response = await fetch("/api/organizations/create/email-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          email: organizationEmail.trim(),
          ...(mode === "verify" ? { otp: emailOtp.trim() } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Unable to verify this email address.");
      }

      if (mode === "send") {
        setEmailOtpSent(true);
        setEmailOtp("");
        setEmailOtpMessage("Verification code sent to your email.");
      } else {
        setEmailVerified(true);
        setEmailOtpMessage("Email verified.");
      }
    } catch (caughtError) {
      setEmailOtpMessage(
        caughtError instanceof Error ? caughtError.message : "Unable to verify this email address.",
      );
      setEmailOtpError(true);
    } finally {
      setEmailOtpBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;

    if (!emailVerified) {
      setGstError("Verify your organization email before creating the organization.");
      return;
    }

    const normalizedGstNumber = gstNumber.trim().toUpperCase();
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(normalizedGstNumber)) {
      setGstError("Enter a valid 15-character GST number.");
      return;
    }
    if (!organizationEmail.trim() || !mobile.trim()) {
      setGstError("Organization email and mobile number are required.");
      return;
    }

    setLoadingStage("verifying");
    setGstError("");

    try {
      const verificationResponse = await fetch("/api/organizations/verify-gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gstNumber: normalizedGstNumber }),
      });
      const verification = await verificationResponse.json();
      if (!verificationResponse.ok || !verification?.valid || !verification.data?.organizationName) {
        throw new Error(verification?.error || "GST details could not be verified.");
      }

      const formData = new FormData();
      formData.set("ownerName", ownerName.trim());
      formData.set("organizationEmail", organizationEmail.trim());
      formData.set("mobileNo", mobile.trim());
      formData.set("gstNumber", normalizedGstNumber);

      setLoadingStage("creating");
      const creation = await action(formData);
      if (!creation.ok) throw new Error(creation.error);
      router.replace(`/dashboard/${workspaceId}/home?success=organization-created-background`);
    } catch (caughtError) {
      const errorMessage = caughtError instanceof Error ? caughtError.message : "Unable to complete organization setup.";
      setGstError(errorMessage);
    } finally {
      setLoadingStage(null);
    }
  }

  return (
    <Page className="max-w-3xl">
      <Section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="erp-eyebrow">Business Verification</p>
            <h1 className="erp-page-heading mt-1">Create Organization</h1>
            <p className="mt-2 hidden max-w-xl text-sm text-slate-600 sm:block">
              Verify your GST registration to create your organization and prepare its sample data.
            </p>
          </div>
          {!isOnboardingRequired && (
            <Link
              href={`/dashboard/${workspaceId}/home`}
              className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Back to Workspace
            </Link>
          )}
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                name="ownerName"
                label="Your Name"
                required
                placeholder="Enter your name"
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                disabled={isBusy}
              />
              <Input
                name="organizationEmail"
                label="Organization Email"
                required
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                value={organizationEmail}
                onChange={(event) => {
                  if (emailVerified) return;
                  setOrganizationEmail(event.target.value);
                  setEmailVerified(false);
                  setEmailOtpSent(false);
                  setEmailOtp("");
                  setEmailOtpMessage("");
                  setEmailOtpError(false);
                }}
                disabled={isBusy || emailOtpBusy || emailVerified}
              />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleEmailVerification("send")}
                  disabled={isBusy || emailOtpBusy || emailVerified || !organizationEmail.trim()}
                >
                  {emailOtpBusy ? "Sending..." : emailOtpSent ? "Resend code" : "Verify email"}
                </Button>
              </div>
              {emailOtpSent && !emailVerified && (
                <div className="flex items-end gap-2 sm:col-span-2">
                  <div className="flex-1">
                    <Input
                      name="organizationEmailOtp"
                      label="Email verification code"
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={emailOtp}
                      onChange={(event) => setEmailOtp(event.target.value.replace(/\D/g, ""))}
                      disabled={isBusy || emailOtpBusy}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => void handleEmailVerification("verify")}
                    disabled={isBusy || emailOtpBusy || emailOtp.length !== 6}
                  >
                    {emailOtpBusy ? "Verifying..." : "Verify code"}
                  </Button>
                </div>
              )}
              {emailOtpMessage && (
                <p
                  className={`text-sm sm:col-span-2 ${emailOtpError ? "text-red-700" : "text-emerald-700"}`}
                  role={emailOtpError ? "alert" : "status"}
                  aria-live="polite"
                >
                  {emailOtpMessage}
                </p>
              )}
              <div className="hidden">
                <Input
                  name="mobileNo"
                  label="Mobile Number"
                  placeholder="9876543210"
                  type="tel"
                  autoComplete="tel"
                  value={mobile}
                  onChange={(event) => setMobile(event.target.value)}
                  disabled
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  name="gstNumber"
                  label="GST Number"
                  required
                  placeholder="27ABCDE1234F1Z5"
                  maxLength={15}
                  autoCapitalize="characters"
                  value={gstNumber}
                  onChange={(event) => setGstNumber(event.target.value.toUpperCase())}
                  disabled={isBusy}
                />
              </div>
            </div>

            {gstError && <p className="text-sm text-red-700" role="alert">{gstError}</p>}

            {isBusy && (
              <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status" aria-live="polite" aria-busy="true">
                <LoaderCircle className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
                <span>{loadingLabels[loadingStage]}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={isBusy || !emailVerified}>
                {isBusy ? "Please wait..." : "Create Organization"}
              </Button>
            </div>
          </form>
        </Card>
      </Section>
    </Page>
  );
}
