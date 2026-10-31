"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Section from "@/components/ui/Section";
import {
  MOBILE_COUNTRY_CODE_OPTIONS,
  getDisplayMobileNumber,
  splitStoredMobileNumber,
} from "@/lib/phone/mobile-country-code-options";
import { isValidInternationalMobileNumber } from "@/lib/phone/international-mobile-number";
import type { UpdateWorkspaceUserInput } from "@/lib/services/platform/workspace-user-service";

type WorkspaceUserDetailsData = {
  id: string;
  fullName: string;
  canDelete: boolean;
  profileName: string;
  email: string | null;
  emailVerified: boolean;
  sendAuthOtpToCredencecraftOnly: boolean;
  mobileNumber: string | null;
  mobileVerified: boolean;
  createdAt: string;
  lastLogin: string;
  organisations: { id: string; name: string }[];
  totalRecords: number;
  status: string;
};

type SaveResult = { ok: true } | { ok: false; error: string };
type RefreshEmailResult =
  | { ok: true; changed: boolean; email: string }
  | { ok: false; error: string };
type SaveOtpRecipientResult = { ok: true } | { ok: false; error: string };

export default function WorkspaceUserDetails({
  user,
  deleteWorkspaceUser,
  deleteError,
  saveWorkspaceUser,
  refreshOrganizationEmail,
  saveAuthOtpRecipient,
}: {
  user: WorkspaceUserDetailsData;
  deleteWorkspaceUser: () => Promise<void>;
  deleteError?: string;
  saveWorkspaceUser: (
    input: UpdateWorkspaceUserInput,
  ) => Promise<SaveResult>;
  refreshOrganizationEmail: () => Promise<RefreshEmailResult>;
  saveAuthOtpRecipient: (enabled: boolean) => Promise<SaveOtpRecipientResult>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshingEmail, setRefreshingEmail] = useState(false);
  const [error, setError] = useState("");
  const [emailRefreshMessage, setEmailRefreshMessage] = useState("");
  const [emailRefreshError, setEmailRefreshError] = useState("");
  const [authOtpRecipientEnabled, setAuthOtpRecipientEnabled] = useState(
    user.sendAuthOtpToCredencecraftOnly,
  );
  const [savingAuthOtpRecipient, setSavingAuthOtpRecipient] = useState(false);
  const [authOtpRecipientMessage, setAuthOtpRecipientMessage] = useState("");
  const [authOtpRecipientError, setAuthOtpRecipientError] = useState("");
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
        !isValidInternationalMobileNumber(`${dialCode}${nationalNumber}`))
    ) {
      setError(
        dialCode === "91"
          ? "Enter a 10-digit Indian mobile number after country code +91."
          : "Enter a valid country code and mobile number.",
      );
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

  async function refreshEmail() {
    if (refreshingEmail) return;
    setRefreshingEmail(true);
    setEmailRefreshMessage("");
    setEmailRefreshError("");
    try {
      const result = await refreshOrganizationEmail();
      if (!result.ok) {
        setEmailRefreshError(result.error);
        return;
      }
      setEmail(result.email);
      setEmailRefreshMessage(
        result.changed
          ? "Organization email refreshed and marked verified."
          : "Email already matches the verified organization email.",
      );
      router.refresh();
    } catch {
      setEmailRefreshError("Unable to refresh the email from the organization. Please try again.");
    } finally {
      setRefreshingEmail(false);
    }
  }

  async function saveAuthOtpRecipientSetting() {
    if (savingAuthOtpRecipient) return;
    setSavingAuthOtpRecipient(true);
    setAuthOtpRecipientMessage("");
    setAuthOtpRecipientError("");
    try {
      const result = await saveAuthOtpRecipient(authOtpRecipientEnabled);
      if (!result.ok) {
        setAuthOtpRecipientError(result.error);
        return;
      }
      setAuthOtpRecipientMessage("Authentication OTP recipient setting saved.");
      router.refresh();
    } catch {
      setAuthOtpRecipientError(
        "Unable to update the authentication OTP recipient. Please try again.",
      );
    } finally {
      setSavingAuthOtpRecipient(false);
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
          <div className="flex flex-wrap gap-2">
            <Button onClick={beginEditing}>Edit details</Button>
            <Button
              variant="secondary"
              onClick={refreshEmail}
              disabled={refreshingEmail}
            >
              {refreshingEmail ? "Fetching email..." : "Fetch email from organisation"}
            </Button>
            {user.canDelete && (
              <form
                action={deleteWorkspaceUser}
                onSubmit={(event) => {
                  if (!window.confirm(`Permanently delete the workspace user "${user.fullName}" and associated account records, including submitted support tickets? This cannot be undone.`)) {
                    event.preventDefault();
                  }
                }}
              >
                <Button
                  type="submit"
                  variant="danger"
                  aria-describedby="workspace-user-delete-warning"
                >
                  Delete user
                </Button>
              </form>
            )}
          </div>
        )}
      </div>
      {user.canDelete && (
        <p id="workspace-user-delete-warning" className="text-xs text-red-700">
          Deleting this user also removes associated account records, including submitted support tickets.
        </p>
      )}

      <Card className="p-5 sm:p-6">
        {emailRefreshMessage && (
          <p role="status" className="mb-4 text-sm text-slate-600">
            {emailRefreshMessage}
          </p>
        )}
        {emailRefreshError && (
          <p role="alert" className="mb-4 text-sm font-medium text-red-700">
            {emailRefreshError}
          </p>
        )}
        {deleteError && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {deleteError}
          </p>
        )}
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
                  onChange={(event) =>
                    setMobileNumber(
                      countryCode.replace(/\D/g, "") === "91"
                        ? event.target.value.replace(/\D/g, "")
                        : event.target.value,
                    )
                  }
                  onPaste={(event) => {
                    if (countryCode.replace(/\D/g, "") !== "91") return;
                    event.preventDefault();
                    const pastedDigits = event.clipboardData
                      .getData("text")
                      .replace(/\D/g, "");
                    if (pastedDigits.length > 10) {
                      setError("Paste only the 10-digit number, without +91.");
                      return;
                    }
                    setMobileNumber(pastedDigits);
                    setError("");
                  }}
                  placeholder="98765 43210"
                  hint={
                    user.mobileNumber && !countryCode
                      ? "Existing number is kept as saved. Enter a country code when replacing it."
                      : "Enter the number without its country code."
                  }
                  maxLength={countryCode.replace(/\D/g, "") === "91" ? 10 : 20}
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={refreshEmail}
                disabled={refreshingEmail}
              >
                {refreshingEmail ? "Fetching email..." : "Fetch email from organisation"}
              </Button>
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
            <section className="space-y-3 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--erp-text)]">
                  Authentication OTP delivery
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  When enabled, authentication OTPs for this account are sent only to credencecraft@gmail.com, not to the account email.
                </p>
              </div>
              <Checkbox
                checked={authOtpRecipientEnabled}
                onChange={(event) => {
                  setAuthOtpRecipientEnabled(event.target.checked);
                  setAuthOtpRecipientMessage("");
                  setAuthOtpRecipientError("");
                }}
                disabled={savingAuthOtpRecipient}
                label="Send authentication OTP only to credencecraft@gmail.com"
              />
              <Button
                type="button"
                size="sm"
                onClick={saveAuthOtpRecipientSetting}
                disabled={
                  savingAuthOtpRecipient ||
                  authOtpRecipientEnabled === user.sendAuthOtpToCredencecraftOnly
                }
              >
                {savingAuthOtpRecipient ? "Saving..." : "Save OTP setting"}
              </Button>
              {authOtpRecipientMessage && (
                <p role="status" className="text-sm text-slate-600">
                  {authOtpRecipientMessage}
                </p>
              )}
              {authOtpRecipientError && (
                <p role="alert" className="text-sm font-medium text-red-700">
                  {authOtpRecipientError}
                </p>
              )}
            </section>
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
                  getDisplayMobileNumber(user.mobileNumber) || "Not provided"
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
