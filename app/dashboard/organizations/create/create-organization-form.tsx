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
    message || (error ? "Unable to create organization. Please verify the details and try again." : "");

  const [loadingGst, setLoadingGst] = useState(false);
  const [gstError, setGstError] = useState("");
  const [isVerified, setIsVerified] = useState(false);

  const [organizationName, setOrganizationName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("India");
  const [pinCode, setPinCode] = useState("");

  async function handleFetchGST() {
    if (!gstNumber || gstNumber.length !== 15) {
      setGstError("Please enter a valid 15-character GST number.");
      return;
    }

    setLoadingGst(true);
    setGstError("");

    try {
      const res = await fetch(`https://sheet.gstincheck.co.in/check/866b7fa68c374dce92f9e5d02583661f/${gstNumber.trim().toUpperCase()}`);
      const resp = await res.json();

      if (resp && resp.flag === true) {
        const data = resp.data;

        if (data.tradeNam) {
          setOrganizationName(data.tradeNam);
        }

        const pradr = data.pradr;
        if (pradr && pradr.adr) {
          const fullAddr = pradr.adr;
          const addrList = fullAddr.split(",");
          let line1 = "";
          let line2 = "";
          
          addrList.forEach((item: string, count: number) => {
            if (count <= 2) {
              line1 += item.trim() + ", ";
            } else {
              line2 += item.trim() + ", ";
            }
          });

          line1 = line1.trim();
          if (line1.length > 2) line1 = line1.substring(0, line1.length - 2);

          line2 = line2.trim();
          if (line2.length > 2) line2 = line2.substring(0, line2.length - 2);

          setAddressLine1(line1);
          setAddressLine2(line2);

          if (pradr.addr) {
            if (pradr.addr.dst) setCity(pradr.addr.dst);
            if (pradr.addr.stcd) setState(pradr.addr.stcd);
            if (pradr.addr.pncd) setPinCode(pradr.addr.pncd);
            setCountry("India");
          }
        }

        setIsVerified(true);
      } else {
        setGstError("❌ GST NOT FOUND or invalid response.");
        setIsVerified(false);
      }
    } catch (err) {
      setGstError("Failed to fetch GST details. Please try again.");
      setIsVerified(false);
    } finally {
      setLoadingGst(false);
    }
  }

  return (
    <Page className="max-w-3xl">
      <Section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="erp-eyebrow">Organization</p>
            <h1 className="erp-page-heading mt-1">Create Organization</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600">Add a legal business entity to start managing its ERP operations.</p>
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
          <form action={action} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="ownerName" label="Founder/owner Name" required placeholder="Jassim Mp" />
              <Input name="organizationEmail" label="Organization Email id" required placeholder="contact@credencecraft.com" type="email" />
              <Input name="mobileNo" label="Mobile No" required placeholder="9876543210" type="tel" />

              <div className="sm:col-span-2 flex items-end gap-2">
                <div className="flex-1">
                  <Input 
                    name="gstNumber" 
                    label="GST number" 
                    required 
                    placeholder="27ABCDE1234F1Z5" 
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleFetchGST}
                  disabled={loadingGst}
                  className="mb-[2px] h-10 px-4 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {loadingGst ? "Verifying..." : "Verify"}
                </button>
              </div>

              {gstError && <p className="text-xs text-red-600 sm:col-span-2">{gstError}</p>}

              {isVerified && (
                <>
                  <input type="hidden" name="organizationName" value={organizationName} />
                  <div className="sm:col-span-2 bg-emerald-50 border border-emerald-200 p-4 rounded-md">
                    <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Verified Organization Name</p>
                    <p className="text-base font-bold text-emerald-950 mt-1">{organizationName || "N/A"}</p>
                  </div>

                  <Input 
                    name="addressLine1" 
                    label="Address line 1" 
                    required 
                    placeholder="12 Market Road" 
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                  />
                  <Input 
                    name="addressLine2" 
                    label="Address line 2" 
                    required 
                    placeholder="Floor 4, Suite 7" 
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                  />
                  <Input 
                    name="city" 
                    label="City" 
                    required 
                    placeholder="Bengaluru" 
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                  <Input 
                    name="state" 
                    label="State" 
                    required 
                    placeholder="Karnataka" 
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                  />
                  <Input 
                    name="country" 
                    label="Country" 
                    required 
                    placeholder="India" 
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                  <Input 
                    name="pinCode" 
                    label="PIN code" 
                    required 
                    placeholder="560001" 
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value)}
                  />
                </>
              )}
            </div>

            {isVerified && (
              <div className="flex justify-end border-t border-slate-200 pt-4">
                <Button type="submit">Create Organization</Button>
              </div>
            )}
          </form>
        </Card>
      </Section>
    </Page>
  );
}