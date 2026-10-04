"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Section from "@/components/ui/Section";
import {
  MOBILE_COUNTRY_CODE_OPTIONS,
  splitStoredMobileNumber,
} from "@/lib/phone/mobile-country-code-options";
import type { UpdateWorkspaceUserInput } from "@/lib/services/platform/workspace-user-service";

type WorkspaceUserDetailsData = {
  id: string;
  fullName: string;
  profileName: string;
  email: string | null;
  emailVerified: boolean;
  mobileNumber: string | null;
  mobileVerified: boolean;
  createdAt: string;
  lastLogin: string;
  organisations: { id: string; name: string }[];
  totalRecords: number;
  status: string;
};

type SaveResult = { ok: true } | { ok: false; error: string };

export default function WorkspaceUserDetails({
  user,
  saveWorkspaceUser,
}: {
  user: WorkspaceUserDetailsData;
  saveWorkspaceUser: (
    input: UpdateWorkspaceUserInput,
  ) => Promise<SaveResult>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resetEmailVerification, setResetEmailVerification] = useState(false);
  const [resetMobileVerification, setResetMobileVerification] = useState(false);
  const [fullName, setFullName] = useState(user.fullName);
  const [profileName, setProfileName] = useState(user.profileName);
  const [email, setEmail] = useState(user.email ?? "");
  const [countryCode, setCountryCode] = useState(
    () => splitStoredMobileNumber(user.mobileNumber).countryCode,
  );
  const [mobileNumber, setMobileNumber] = useState(
    () => splitStoredMobileNumber(user.mobileNumber).nationalNumber,
  );
  const countryCodeListId = `workspace-user-country-codes-${useId().replace(/:/g, "")}`;

  function beginEditing() {
    setFullName(user.fullName);
    setProfileName(user.profileName);
    setEmail(user.email ?? "");
    const mobileNumberFields = splitStoredMobileNumber(user.mobileNumber);
    setCountryCode(mobileNumberFields.countryCode);
    setMobileNumber(mobileNumberFields.nationalNumber);
    setResetEmailVerification(false);
    setResetMobileVerification(false);
    setError("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setError("");
  }

  async function saveChanges(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    const dialCode = countryCode.replace(/\D/g, "");
    const nationalNumber = mobileNumber.replace(/\D/g, "");
    const unchangedUnparsedNumber =
      !dialCode &&
      Boolean(user.mobileNumber) &&
      nationalNumber === user.mobileNumber?.replace(/\D/g, "");
    if (
      nationalNumber &&
      !unchangedUnparsedNumber &&
      (!/^\d{1,4}$/.test(dialCode) ||
        !/^\d{6,14}$/.test(nationalNumber) ||
        !/^\d{7,15}$/.test(`${dialCode}${nationalNumber}`))
    ) {
      setError("Enter a valid country code and mobile number.");
      return;
    }

    const mobileNumberToSave = unchangedUnparsedNumber
      ? user.mobileNumber ?? ""
      : dialCode && nationalNumber
        ? `+${dialCode}${nationalNumber}`
        : "";

    setSaving(true);
    try {
      const result = await saveWorkspaceUser({
        userId: user.id,
        fullName,
        profileName,
        email,
        mobileNumber: mobileNumberToSave,
        resetEmailVerification,
        resetMobileVerification,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Unable to save workspace user details. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/platform/workspace-users"
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
          >
            Back to Workspace Users
          </Link>
          <p className="erp-eyebrow mt-4">Platform · Workspace account</p>
          <h1 className="erp-page-heading mt-1">{user.fullName}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Review the account and edit its contact details.
          </p>
        </div>
        {!editing && (
          <Button onClick={beginEditing}>Edit details</Button>
        )}
      </div>

      <Card className="p-5 sm:p-6">
        {editing ? (
          <form onSubmit={saveChanges} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                maxLength={255}
                required
                disabled={saving}
              />
              <Input
                label="Profile name"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                maxLength={100}
                required
                disabled={saving}
              />
              <Input
                label="Email (optional)"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={255}
                disabled={saving}
              />
              <div className="grid w-full max-w-md grid-cols-[5.5rem_minmax(0,1fr)] gap-3 sm:col-span-2">
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
                  disabled={saving}
                  className="min-h-10 px-2.5 text-sm font-semibold"
                />
                <Input
                  label="Mobile number (optional)"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={mobileNumber}
                  onChange={(event) => setMobileNumber(event.target.value)}
                  placeholder="98765 43210"
                  hint={
                    user.mobileNumber && !countryCode
                      ? "Existing number is kept as saved. Enter a country code when replacing it."
                      : "Enter the number without its country code."
                  }
                  maxLength={20}
                  disabled={saving}
                  className="min-h-10 text-sm"
                />
              </div>
            </div>
            <datalist id={countryCodeListId}>
              {MOBILE_COUNTRY_CODE_OPTIONS.map(({ code, country }) => (
                <option key={code} value={code} label={country} />
              ))}
            </datalist>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-semibold text-amber-950">
                Verification status
              </h2>
              <p className="mt-1 text-sm text-amber-900">
                A verified status can only be set after the account holder
                completes OTP verification. Changing an email or mobile number
                automatically resets its verification.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={resetEmailVerification ? "danger" : "secondary"}
                  size="sm"
                  disabled={saving || !user.emailVerified}
                  aria-pressed={resetEmailVerification}
                  onClick={() =>
                    setResetEmailVerification((current) => !current)
                  }
                >
                  {resetEmailVerification
                    ? "Email verification will be reset"
                    : `Email: ${user.email ? user.emailVerified ? "Verified" : "Pending" : "Not provided"}`}
                </Button>
                <Button
                  type="button"
                  variant={resetMobileVerification ? "danger" : "secondary"}
                  size="sm"
                  disabled={saving || !user.mobileVerified}
                  aria-pressed={resetMobileVerification}
                  onClick={() =>
                    setResetMobileVerification((current) => !current)
                  }
                >
                  {resetMobileVerification
                    ? "Mobile verification will be reset"
                    : `Mobile: ${user.mobileNumber ? user.mobileVerified ? "Verified" : "Pending" : "Not provided"}`}
                </Button>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm font-medium text-red-700">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={cancelEditing}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <DetailValue label="Profile name" value={user.profileName} />
              <DetailValue label="Email" value={user.email || "Not provided"} />
              <DetailValue
                label="Email verification"
                value={
                  user.email
                    ? user.emailVerified
                      ? "Verified"
                      : "Pending"
                    : "Not provided"
                }
                verified={user.emailVerified}
              />
              <DetailValue
                label="Country code"
                value={
                  splitStoredMobileNumber(user.mobileNumber).countryCode ||
                  "Not separated"
                }
              />
              <DetailValue
                label="Mobile number"
                value={
                  user.mobileNumber
                    ? splitStoredMobileNumber(user.mobileNumber).nationalNumber
                    : "Not provided"
                }
              />
              <DetailValue
                label="Mobile verification"
                value={
                  user.mobileNumber
                    ? user.mobileVerified
                      ? "Verified"
                      : "Pending"
                    : "Not provided"
                }
                verified={user.mobileVerified}
              />
              <DetailValue label="Created" value={user.createdAt} />
              <DetailValue label="Last login" value={user.lastLogin} />
              <DetailValue label="Organisation count" value={String(user.organisations.length)} />
              <DetailValue
                label="Total records"
                value={user.totalRecords.toLocaleString("en-IN")}
              />
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </dt>
                <dd className="mt-1">
                  <Badge
                    className={
                      user.status === "Active"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }
                  >
                    {user.status}
                  </Badge>
                </dd>
              </div>
            </dl>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Organisations
              </h2>
              {user.organisations.length ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {user.organisations.map((organization) => (
                    <li
                      key={organization.id}
                      className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                    >
                      {organization.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-slate-500">No active organisations.</p>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Organisation membership, record totals, account status, and login
              history are system-derived and cannot be edited here.
            </p>
          </div>
        )}
      </Card>
    </Section>
  );
}

function DetailValue({
  label,
  value,
  verified,
}: {
  label: string;
  value: string;
  verified?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-slate-900">
        {label.toLowerCase().includes("verification") && value !== "Not provided" ? (
          <Badge
            className={
              verified
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }
          >
            {value}
          </Badge>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
