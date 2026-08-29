"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChangeEvent, FormEvent } from "react";
import {
  GST_TYPE_INTER_STATE,
  GST_TYPE_INTRA_STATE,
} from "../lib/vendors";

type Entity = {
  id: string;
  name: string;
  gstRegisteredStateId: string | null;
};

type GstState = { id: string; name: string };

type VendorFormProps = { entities: Entity[]; states: GstState[] };

type VendorFormState = {
  tenantId: string;
  gstNumber: string;
  vendorName: string;
  currencyType: string;
  registeredGstStateId: string;
  gstType: string;
  isThisCustomer: boolean;
  city: string;
  addressLine1: string;
  addressLine2: string;
  stateProvince: string;
  postalCode: string;
  country: string;
};
type VendorInitialData = VendorFormState & { id: string };

const initialState: VendorFormState = {
  tenantId: "",
  gstNumber: "",
  vendorName: "",
  currencyType: "INR",
  registeredGstStateId: "",
  gstType: "",
  isThisCustomer: false,
  city: "",
  addressLine1: "",
  addressLine2: "",
  stateProvince: "",
  postalCode: "",
  country: "India",
};

export default function VendorForm({ entities, states, editId, initialData }: VendorFormProps & { editId?: string; initialData?: VendorInitialData }) {
  const router = useRouter();
  const [formData, setFormData] = useState<VendorFormState>(initialData ? { ...initialData, id: undefined } as VendorFormState : initialState);
  const [fetchCount, setFetchCount] = useState(0);
  const [status, setStatus] = useState<"idle" | "saving" | "fetching">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const selectedEntity = entities.find((entity) => entity.id === formData.tenantId);

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = event.target;
    const checked = type === "checkbox" && (event.target as HTMLInputElement).checked;
    setFormData((previous) => {
      const next = { ...previous, [name]: type === "checkbox" ? checked : value };
      if (name === "registeredGstStateId") {
        next.gstType =
          selectedEntity?.gstRegisteredStateId && value
            ? selectedEntity.gstRegisteredStateId === value
              ? GST_TYPE_INTRA_STATE
              : GST_TYPE_INTER_STATE
            : "";
      }
      return next;
    });
    setMessage(null);
  }

  async function fetchAddress() {
    setStatus("fetching");
    setMessage(null);
    const response = await fetch("/api/vendors/gst-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: formData.tenantId, gstNumber: formData.gstNumber }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus("idle");
      setMessage(data.error ?? "GST lookup failed");
      return;
    }

    setFetchCount(data.fetchCount ?? fetchCount + 1);
    setFormData((previous) => ({
      ...previous,
      vendorName: data.vendorName ?? previous.vendorName,
      addressLine1: data.addressLine1 ?? previous.addressLine1,
      addressLine2: data.addressLine2 ?? previous.addressLine2,
      city: data.city ?? previous.city,
      stateProvince: data.stateProvince ?? previous.stateProvince,
      postalCode: data.postalCode ?? previous.postalCode,
      country: data.country ?? previous.country,
    }));
    setStatus("idle");
    setMessage("GST details fetched successfully");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage(null);
    const response = await fetch(editId ? `/api/vendors/${editId}` : "/api/vendors", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    const data = await response.json();
    setStatus("idle");
    if (!response.ok) {
      setMessage(data.error ?? "Vendor could not be saved");
      return;
    }
    router.replace("/masters/vendors");
    setFetchCount(0);
    setMessage(`${data.vendorName ?? data.vendor?.vendorName} added successfully`);
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-8">
      <header className="border-b border-zinc-200 pb-5">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-700">Vendor</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{editId ? "Edit vendor" : "Add vendor"}</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">Capture supplier details and GST information.</p>
      </header>

      <section className="grid gap-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-zinc-800">
          Entity Name
          <select name="tenantId" value={formData.tenantId} onChange={handleChange} required className="field">
            <option value="">Select entity</option>
            {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-zinc-800">
          GST No
          <input name="gstNumber" value={formData.gstNumber} onChange={handleChange} maxLength={15} className="field uppercase" placeholder="15-character GSTIN" />
        </label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={fetchAddress} disabled={!formData.tenantId || formData.gstNumber.length !== 15 || status !== "idle" || fetchCount >= 5} className="button-primary">
            {status === "fetching" ? "Fetching..." : "Fetch GST details"}
          </button>
          <span className="text-xs text-zinc-500">Used today: {fetchCount} / 5</span>
        </div>
        <label className="space-y-2 text-sm font-medium text-zinc-800">
          Vendor Name
          <input name="vendorName" value={formData.vendorName} onChange={handleChange} required className="field" />
        </label>
        <label className="space-y-2 text-sm font-medium text-zinc-800">
          Currency Type
          <select name="currencyType" value={formData.currencyType} onChange={handleChange} className="field"><option>INR</option><option>USD</option><option>EUR</option></select>
        </label>
        <label className="space-y-2 text-sm font-medium text-zinc-800">
          Registered GST State
          <select name="registeredGstStateId" value={formData.registeredGstStateId} onChange={handleChange} className="field">
            <option value="">Select state</option>
            {states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-zinc-800">
          GST Type
          <input value={formData.gstType} readOnly className="field bg-zinc-100" placeholder="Derived from entity and vendor state" />
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-zinc-800 sm:col-span-2"><input type="checkbox" name="isThisCustomer" checked={formData.isThisCustomer} onChange={handleChange} className="size-4 accent-emerald-700" />This vendor is also a customer</label>
      </section>

      <section className="grid gap-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-lg font-semibold text-zinc-950">Registered GST address</h2>
        <label className="space-y-2 text-sm font-medium text-zinc-800 sm:col-span-2">Address line 1<input name="addressLine1" value={formData.addressLine1} onChange={handleChange} className="field" /></label>
        <label className="space-y-2 text-sm font-medium text-zinc-800 sm:col-span-2">Address line 2<input name="addressLine2" value={formData.addressLine2} onChange={handleChange} className="field" /></label>
        <label className="space-y-2 text-sm font-medium text-zinc-800">City / District<input name="city" value={formData.city} onChange={handleChange} className="field" /></label>
        <label className="space-y-2 text-sm font-medium text-zinc-800">State / Province<input name="stateProvince" value={formData.stateProvince} onChange={handleChange} className="field" /></label>
        <label className="space-y-2 text-sm font-medium text-zinc-800">Postal Code<input name="postalCode" value={formData.postalCode} onChange={handleChange} className="field" /></label>
        <label className="space-y-2 text-sm font-medium text-zinc-800">Country<input name="country" value={formData.country} onChange={handleChange} className="field" /></label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={status !== "idle"} className="button-primary">{status === "saving" ? "Saving..." : editId ? "Update vendor" : "Save vendor"}</button>
        <button type="button" onClick={() => { setFormData(initialState); setMessage(null); }} className="button-secondary">Reset</button>
        {message && <p role="status" className="text-sm text-zinc-600">{message}</p>}
      </div>
    </form>
  );
}
