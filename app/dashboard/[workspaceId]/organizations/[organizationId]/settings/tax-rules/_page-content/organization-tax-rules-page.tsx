"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const defaultProfile = {
  country: "IN",
  taxRegime: "GST",
  gstin: "",
  state: "",
  cgstRate: "",
  sgstRate: "",
  igstRate: "",
  vatRate: "",
  salesTaxRate: "",
  isDefault: true,
};

export default function OrganizationTaxRulesPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const [route, setRoute] = useState<{ workspaceId: string; organizationId: string }>();
  const [profile, setProfile] = useState(defaultProfile);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void params.then(setRoute);
  }, [params]);

  useEffect(() => {
    if (!route) return;
    void fetch(`/api/organizations/${route.organizationId}/tax-rules`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          setMessage(payload.error || "Unable to load tax rules.");
          return;
        }

        if (payload.profile) {
          setProfile({
            country: payload.profile.country || "IN",
            taxRegime: payload.profile.taxRegime || "GST",
            gstin: payload.profile.gstin || "",
            state: payload.profile.state || "",
            cgstRate: payload.profile.cgstRate ?? "",
            sgstRate: payload.profile.sgstRate ?? "",
            igstRate: payload.profile.igstRate ?? "",
            vatRate: payload.profile.vatRate ?? "",
            salesTaxRate: payload.profile.salesTaxRate ?? "",
            isDefault: payload.profile.isDefault ?? true,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [route]);

  const regimeOptions = useMemo(() => [
    { value: "GST", label: "India GST" },
    { value: "VAT", label: "VAT" },
    { value: "SALES_TAX", label: "Sales Tax" },
    { value: "NONE", label: "No Tax" },
  ], []);

  async function saveProfile() {
    if (!route) return;
    const response = await fetch(`/api/organizations/${route.organizationId}/tax-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country: profile.country,
        taxRegime: profile.taxRegime,
        gstin: profile.gstin,
        state: profile.state,
        cgstRate: profile.cgstRate === "" ? null : Number(profile.cgstRate),
        sgstRate: profile.sgstRate === "" ? null : Number(profile.sgstRate),
        igstRate: profile.igstRate === "" ? null : Number(profile.igstRate),
        vatRate: profile.vatRate === "" ? null : Number(profile.vatRate),
        salesTaxRate: profile.salesTaxRate === "" ? null : Number(profile.salesTaxRate),
        isDefault: profile.isDefault,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "Unable to save tax configuration.");
      return;
    }
    setMessage("Tax configuration saved.");
  }

  if (!route || loading) return <main className="p-6">Loading tax rules...</main>;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tax Rules</h1>
        <p className="mt-1 text-sm text-slate-600">Configure the default tax regime used across this organization.</p>
      </div>

      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Country
            <select
              value={profile.country}
              onChange={(event) => setProfile((current) => ({ ...current, country: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="IN">India</option>
              <option value="US">United States</option>
              <option value="AE">United Arab Emirates</option>
              <option value="GB">United Kingdom</option>
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            Tax regime
            <select
              value={profile.taxRegime}
              onChange={(event) => setProfile((current) => ({ ...current, taxRegime: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {regimeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
            GSTIN / Tax registration number
            <input
              value={profile.gstin}
              onChange={(event) => setProfile((current) => ({ ...current, gstin: event.target.value }))}
              placeholder="Enter GSTIN or tax registration number"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            State / Region
            <input
              value={profile.state}
              onChange={(event) => setProfile((current) => ({ ...current, state: event.target.value }))}
              placeholder="Kerala"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            Default profile
            <div className="flex h-[42px] items-center rounded-lg border border-slate-300 bg-white px-3">
              <input
                type="checkbox"
                checked={profile.isDefault}
                onChange={(event) => setProfile((current) => ({ ...current, isDefault: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600"
              />
              <span className="ml-2 text-sm text-slate-700">Use as default tax profile</span>
            </div>
          </label>

          {profile.taxRegime === "GST" && (
            <>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                CGST %
                <input
                  type="number"
                  value={profile.cgstRate}
                  onChange={(event) => setProfile((current) => ({ ...current, cgstRate: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  placeholder="0"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                SGST %
                <input
                  type="number"
                  value={profile.sgstRate}
                  onChange={(event) => setProfile((current) => ({ ...current, sgstRate: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  placeholder="0"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                IGST %
                <input
                  type="number"
                  value={profile.igstRate}
                  onChange={(event) => setProfile((current) => ({ ...current, igstRate: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  placeholder="0"
                />
              </label>
            </>
          )}

          {profile.taxRegime === "VAT" && (
            <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
              VAT %
              <input
                type="number"
                value={profile.vatRate}
                onChange={(event) => setProfile((current) => ({ ...current, vatRate: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="0"
              />
            </label>
          )}

          {profile.taxRegime === "SALES_TAX" && (
            <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
              Sales Tax %
              <input
                type="number"
                value={profile.salesTaxRate}
                onChange={(event) => setProfile((current) => ({ ...current, salesTaxRate: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="0"
              />
            </label>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => void saveProfile()}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Save tax rules
          </button>
        </div>
      </section>
    </main>
  );
}
