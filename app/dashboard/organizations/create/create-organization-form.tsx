"use client";

import { useState } from "react";
import Link from "next/link";

import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

interface CreateOrgFormProps {
  workspaceId: string;
  error?: string;
  message?: string;
  action: (formData: FormData) => Promise<void>;
}

export default function CreateOrganizationForm({
  workspaceId,
  error,
  message,
  action,
}: CreateOrgFormProps) {
  const errorMessage =
    message || (error ? "Unable to complete verification. Please verify details." : "");

  // Verification States
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  const [gstNumber, setGstNumber] = useState("");
  const [loadingGst, setLoadingGst] = useState(false);
  const [gstError, setGstError] = useState("");
  const [isGstVerified, setIsGstVerified] = useState(false);
  const [showGstSuccess, setShowGstSuccess] = useState(false);

  // Form Field States
  const [ownerName, setOwnerName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [websiteError, setWebsiteError] = useState("");
  const [linkedIn, setLinkedIn] = useState("");

  const [priorErp, setPriorErp] = useState("TALLY");
  const [otherErpName, setOtherErpName] = useState("");

  const [personalCity, setPersonalCity] = useState("");
  const [personalState, setPersonalState] = useState("");

  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("India");
  const [pinCode, setPinCode] = useState("");

  function validateWebsiteFormat(url: string) {
    if (!url) {
      setWebsiteError("");
      return true;
    }
    const pattern = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/;
    if (!pattern.test(url.trim())) {
      setWebsiteError("Invalid website format (e.g., https://example.com or example.com)");
      return false;
    }
    setWebsiteError("");
    return true;
  }

  async function handleVerifyGstAndSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!gstNumber || gstNumber.length !== 15) {
      setGstError("Please enter a valid 15-character GST number.");
      return;
    }

    setLoadingGst(true);
    setGstError("");

    try {
      const res = await fetch(
        `https://sheet.gstincheck.co.in/check/866b7fa68c374dce92f9e5d02583661f/${gstNumber.trim().toUpperCase()}`
      );
      const resp = await res.json();

      if (resp && resp.flag === true) {
        const data = resp.data;
        const fetchedOrgName = data.tradeNam || "";
        setOrganizationName(fetchedOrgName);
        
        const pradr = data.pradr;
        let fetchedAddr1 = "";
        let fetchedCity = "";
        let fetchedState = "";
        let fetchedPin = "";

        if (pradr && pradr.adr) {
          fetchedAddr1 = pradr.adr.split(",")[0] || "";
          fetchedCity = pradr.addr.dst || "";
          fetchedState = pradr.addr.stcd || "";
          fetchedPin = pradr.addr.pncd || "";
        }

        setAddressLine1(fetchedAddr1);
        setCity(fetchedCity);
        setState(fetchedState);
        setPinCode(fetchedPin);
        setIsGstVerified(true);

        const formData = new FormData();
        formData.append("role", "FOUNDER");
        formData.append("aboutBio", "");
        formData.append("ownerName", ownerName);
        formData.append("organizationEmail", email);
        formData.append("mobileNo", mobile);
        formData.append("personalCity", personalCity);
        formData.append("personalState", personalState);
        formData.append("linkedIn", linkedIn);
        formData.append("companyWebsite", companyWebsite);
        formData.append("priorErp", priorErp);
        if (priorErp === "OTHERS") formData.append("otherErpName", otherErpName);
        formData.append("gstNumber", gstNumber.trim().toUpperCase());
        formData.append("organizationName", fetchedOrgName);
        formData.append("addressLine1", fetchedAddr1);
        formData.append("addressLine2", addressLine2);
        formData.append("city", fetchedCity);
        formData.append("state", fetchedState);
        formData.append("country", country);
        formData.append("pinCode", fetchedPin);

        await action(formData);
        setShowGstSuccess(true);
      } else {
        setGstError("❌ GST NOT FOUND or invalid response. Organization cannot be created.");
        setIsGstVerified(false);
      }
    } catch {
      setGstError("Failed to fetch GST details. Organization creation aborted.");
      setIsGstVerified(false);
    } finally {
      setLoadingGst(false);
    }
  }

  return (
    <Page className="max-w-3xl">
      <Section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="erp-eyebrow">Strong KYC Verification</p>
            <h1 className="erp-page-heading mt-1">Create & Verify Organization</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600">
              Complete business entity verification and profile details.
            </p>
          </div>
          <Link
            href={`/dashboard/${workspaceId}/home`}
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
          >
            Back to Workspace
          </Link>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {errorMessage}
          </div>
        )}

        <Card>
          <form onSubmit={handleVerifyGstAndSubmit} className="space-y-6">
            <input type="hidden" name="role" value="FOUNDER" />

            <div className="space-y-6 animate-fadeIn">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  name="ownerName"
                  label="Founder/Owner Name"
                  required
                  placeholder="Jassim Mp"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                />

                <Input
                  name="organizationEmail"
                  label="Email ID"
                  required
                  placeholder="contact@credencecraft.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <Input
                  name="mobileNo"
                  label="Mobile No"
                  required
                  placeholder="9876543210"
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                />

                <Input
                  name="personalCity"
                  label="Your City (Personal)"
                  required
                  placeholder="Kochi"
                  value={personalCity}
                  onChange={(e) => setPersonalCity(e.target.value)}
                />
                <Input
                  name="personalState"
                  label="Your State (Personal)"
                  required
                  placeholder="Kerala"
                  value={personalState}
                  onChange={(e) => setPersonalState(e.target.value)}
                />

                <Input
                  name="linkedIn"
                  label="LinkedIn Profile"
                  placeholder="https://linkedin.com/in/username"
                  value={linkedIn}
                  onChange={(e) => setLinkedIn(e.target.value)}
                />

                <div>
                  <Input
                    name="companyWebsite"
                    label="Company Website"
                    placeholder="https://credencecraft.com"
                    value={companyWebsite}
                    onChange={(e) => {
                      setCompanyWebsite(e.target.value);
                      if (websiteError) validateWebsiteFormat(e.target.value);
                    }}
                    onBlur={() => validateWebsiteFormat(companyWebsite)}
                  />
                  {websiteError && <p className="text-xs text-red-600 mt-1">{websiteError}</p>}
                </div>

                {/* Prior ERP Usage */}
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-slate-700">Do you use any other ERP? *</label>
                  <select
                    name="priorErp"
                    value={priorErp}
                    onChange={(e) => setPriorErp(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm bg-white"
                  >
                    <option value="TALLY">Only Tally</option>
                    <option value="ZOHO">Zoho</option>
                    <option value="BLUEKATUS">Bluekatus</option>
                    <option value="TOP_APPAREL_ERP">Top Apparel ERP</option>
                    <option value="OTHERS">Others</option>
                  </select>
                </div>

                {priorErp === "OTHERS" && (
                  <div className="sm:col-span-2">
                    <Input
                      name="otherErpName"
                      label="Specify Other ERP Name"
                      required
                      placeholder="Enter ERP name"
                      value={otherErpName}
                      onChange={(e) => setOtherErpName(e.target.value)}
                    />
                  </div>
                )}

                {/* GST Verification Section & Submit Action */}
                <div className="sm:col-span-2 flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      name="gstNumber"
                      label="GST Number"
                      required
                      placeholder="27ABCDE1234F1Z5"
                      value={gstNumber}
                      readOnly={isGstVerified}
                      onChange={(e) => setGstNumber(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loadingGst || isGstVerified}
                    className="mb-[2px] h-10 px-6 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {loadingGst ? "Verifying & Creating..." : isGstVerified ? "Created" : "Submit"}
                  </button>
                </div>

                {gstError && <p className="text-xs text-red-600 sm:col-span-2">{gstError}</p>}

                {isGstVerified && (
                  <>
                    <input type="hidden" name="organizationName" value={organizationName} />
                    <div className="sm:col-span-2 bg-emerald-50 border border-emerald-200 p-4 rounded-md">
                      <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Verified Organization (Locked)</p>
                      <p className="text-base font-bold text-emerald-950 mt-1">{organizationName || "N/A"}</p>
                    </div>

                    <Input name="addressLine1" label="Address Line 1" required value={addressLine1} readOnly onChange={(e) => setAddressLine1(e.target.value)} />
                    <Input name="addressLine2" label="Address Line 2" value={addressLine2} readOnly onChange={(e) => setAddressLine2(e.target.value)} />
                    <Input name="city" label="City" required value={city} readOnly onChange={(e) => setCity(e.target.value)} />
                    <Input name="state" label="State" required value={state} readOnly onChange={(e) => setState(e.target.value)} />
                    <Input name="country" label="Country" required value={country} readOnly onChange={(e) => setCountry(e.target.value)} />
                    <Input name="pinCode" label="PIN Code" required value={pinCode} readOnly onChange={(e) => setPinCode(e.target.value)} />
                  </>
                )}
              </div>
            </div>
          </form>
        </Card>

        {showGstSuccess && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="gst-success-title">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-700">✓</div>
                <div>
                  <h2 id="gst-success-title" className="text-xl font-bold text-slate-900">GST verified successfully</h2>
                  <p className="mt-1 text-sm text-slate-600">Review the official GST details before creating your organization.</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Organization</p><p className="mt-1 font-bold text-slate-900">{organizationName || "Not available"}</p></div>
                <div><p className="text-xs text-slate-500">GST number</p><p className="mt-1 font-semibold text-slate-900">{gstNumber.toUpperCase()}</p></div>
                <div><p className="text-xs text-slate-500">PIN code</p><p className="mt-1 font-semibold text-slate-900">{pinCode || "Not available"}</p></div>
                <div><p className="text-xs text-slate-500">City</p><p className="mt-1 font-semibold text-slate-900">{city || "Not available"}</p></div>
                <div><p className="text-xs text-slate-500">State</p><p className="mt-1 font-semibold text-slate-900">{state || "Not available"}</p></div>
                <div className="sm:col-span-2"><p className="text-xs text-slate-500">Registered address</p><p className="mt-1 font-semibold text-slate-900">{addressLine1 || "Not available"}{addressLine2 ? `, ${addressLine2}` : ""}</p></div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Link href={`/dashboard/${workspaceId}/home?success=organization-created`} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">Go to dashboard</Link>
              </div>
            </div>
          </div>
        )}
      </Section>
    </Page>
  );
}