"use client";

import { useState } from "react";
import Link from "next/link";

import Button from "@/components/ui/Button";
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
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  const [mobile, setMobile] = useState("");
  const [mobileOtpSent, setMobileOtpSent] = useState(false);
  const [mobileVerified, setMobileVerified] = useState(false);

  const [gstNumber, setGstNumber] = useState("");
  const [loadingGst, setLoadingGst] = useState(false);
  const [gstError, setGstError] = useState("");
  const [isGstVerified, setIsGstVerified] = useState(false);

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
      setWebsiteError("Website is required.");
      return false;
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

    if (!validateWebsiteFormat(companyWebsite)) {
      return;
    }

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

        // Build and submit the form data via the Server Action
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
        if (priorErp === "OTHERS") {
          formData.append("otherErpName", otherErpName);
        }
        formData.append("gstNumber", gstNumber.trim().toUpperCase());
        formData.append("organizationName", fetchedOrgName);
        formData.append("addressLine1", fetchedAddr1);
        formData.append("addressLine2", addressLine2);
        formData.append("city", fetchedCity);
        formData.append("state", fetchedState);
        formData.append("country", country);
        formData.append("pinCode", fetchedPin);

        await action(formData);
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

                {/* Email with OTP */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      name="organizationEmail"
                      label="Email ID"
                      required
                      placeholder="contact@credencecraft.com"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setEmailOtpSent(true)}
                    disabled={emailVerified}
                    className="mb-[2px] h-10 px-3 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 disabled:bg-slate-400"
                  >
                    {emailVerified ? "Verified" : emailOtpSent ? "Verify OTP" : "View OTP"}
                  </button>
                </div>

                {/* Mobile with OTP */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      name="mobileNo"
                      label="Mobile No"
                      required
                      placeholder="9876543210"
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileOtpSent(true)}
                    disabled={mobileVerified}
                    className="mb-[2px] h-10 px-3 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 disabled:bg-slate-400"
                  >
                    {mobileVerified ? "Verified" : mobileOtpSent ? "Verify OTP" : "View OTP"}
                  </button>
                </div>

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
                  required
                  placeholder="https://linkedin.com/in/username"
                  value={linkedIn}
                  onChange={(e) => setLinkedIn(e.target.value)}
                />

                <div>
                  <Input
                    name="companyWebsite"
                    label="Company Website"
                    required
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
      </Section>
    </Page>
  );
}