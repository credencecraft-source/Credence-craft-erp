"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";

type CreateOrganizationResult =
  | { ok: true }
  | { ok: false; error: string };

interface CreateOrgFormProps {
  workspaceId: string;
  userName: string;
  userEmail: string;
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
  userName,
  userEmail,
  isOnboardingRequired,
  error,
  message,
  action,
}: CreateOrgFormProps) {
  const router = useRouter();
  const [ownerName, setOwnerName] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const [mobile, setMobile] = useState("");
  const [linkedIn, setLinkedIn] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [websiteError, setWebsiteError] = useState("");
  const [priorErp, setPriorErp] = useState("TALLY");
  const [otherErpName, setOtherErpName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [loadingStage, setLoadingStage] = useState<LoadingStage>(null);
  const [gstError, setGstError] = useState(message || (error ? "Unable to complete verification. Please verify details." : ""));

  const isBusy = loadingStage !== null;

  function validateWebsiteFormat(value: string) {
    if (!value.trim() || /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/.test(value.trim())) {
      setWebsiteError("");
      return true;
    }
    setWebsiteError("Enter a valid website address.");
    return false;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;

    const normalizedGstNumber = gstNumber.trim().toUpperCase();
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(normalizedGstNumber)) {
      setGstError("Enter a valid 15-character GST number.");
      return;
    }
    if (!email.trim() || !mobile.trim()) {
      setGstError("Email and mobile number are required.");
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
      formData.set("organizationEmail", email.trim());
      formData.set("mobileNo", mobile.trim());
      formData.set("gstNumber", normalizedGstNumber);
      formData.set("linkedIn", linkedIn.trim());
      formData.set("companyWebsite", companyWebsite.trim());
      formData.set("priorErp", priorErp);
      if (priorErp === "OTHERS") formData.set("otherErpName", otherErpName.trim());

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
            <p className="mt-2 max-w-xl text-sm text-slate-600">
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
                label="Account Email"
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isBusy}
              />
              <Input
                name="mobileNo"
                label="Mobile Number"
                required
                placeholder="9876543210"
                type="tel"
                autoComplete="tel"
                value={mobile}
                onChange={(event) => setMobile(event.target.value)}
                disabled={isBusy}
              />
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
              <Input
                name="linkedIn"
                label="LinkedIn Profile"
                placeholder="https://linkedin.com/in/username"
                value={linkedIn}
                onChange={(event) => setLinkedIn(event.target.value)}
                disabled={isBusy}
              />
              <div>
                <Input
                  name="companyWebsite"
                  label="Company Website"
                  placeholder="https://example.com"
                  value={companyWebsite}
                  onChange={(event) => {
                    setCompanyWebsite(event.target.value);
                    if (websiteError) validateWebsiteFormat(event.target.value);
                  }}
                  onBlur={() => validateWebsiteFormat(companyWebsite)}
                  disabled={isBusy}
                />
                {websiteError && <p className="mt-1 text-xs text-red-600" role="alert">{websiteError}</p>}
              </div>
              <div className="sm:col-span-2">
                <Select
                  id="priorErp"
                  name="priorErp"
                  label="Do you use any other ERP?"
                  required
                  value={priorErp}
                  onChange={(event) => setPriorErp(event.target.value)}
                  disabled={isBusy}
                  options={[
                    { value: "TALLY", label: "Only Tally" },
                    { value: "ZOHO", label: "Zoho" },
                    { value: "BLUEKATUS", label: "Bluekatus" },
                    { value: "TOP_APPAREL_ERP", label: "Top Apparel ERP" },
                    { value: "OTHERS", label: "Others" },
                  ]}
                />
              </div>
              {priorErp === "OTHERS" && (
                <div className="sm:col-span-2">
                  <Input
                    name="otherErpName"
                    label="Specify Other ERP Name"
                    required
                    placeholder="Enter ERP name"
                    value={otherErpName}
                    onChange={(event) => setOtherErpName(event.target.value)}
                    disabled={isBusy}
                  />
                </div>
              )}
            </div>

            {gstError && <p className="text-sm text-red-700" role="alert">{gstError}</p>}

            {isBusy && (
              <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status" aria-live="polite" aria-busy="true">
                <LoaderCircle className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
                <span>{loadingLabels[loadingStage]}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={isBusy}>
                {isBusy ? "Please wait..." : "Create Organization"}
              </Button>
            </div>
          </form>
        </Card>
      </Section>
    </Page>
  );
}
