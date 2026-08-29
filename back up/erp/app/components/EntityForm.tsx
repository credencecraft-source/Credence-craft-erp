"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type EntityFormState = {
  name: string;
  gstNumber: string;
  email: string;
  phone: string;
  displayName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};
type EntityInitialData = EntityFormState & { id: string };

const initialState: EntityFormState = {
  name: "",
  gstNumber: "",
  email: "",
  phone: "",
  displayName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
};

export default function EntityForm({ editId, initialData }: { editId?: string; initialData?: EntityInitialData }) {
  const router = useRouter();
  const [formData, setFormData] = useState<EntityFormState>(initialData ? { ...initialData, id: undefined } as EntityFormState : initialState);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");

    const res = await fetch("/api/tenants", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editId ? { ...formData, id: editId } : formData),
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus("error");
      setMessage(data.error ?? "Something went wrong");
      return;
    }

    setStatus("idle");
    setMessage(data.message);
    router.replace("/masters/entities");
  }

  return (
    <form onSubmit={handleSubmit} className="page-frame space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-[#dce4dc] pb-6 sm:flex-row sm:items-end">
        <div><p className="page-kicker">Settings</p><h1 className="page-title">{editId ? "Edit entity" : "Entity"}</h1><p className="page-description">Set up the business entity for the workspace.</p></div>
        <span className="w-fit rounded-full border border-[#cddbcf] bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600">Record</span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_0.55fr]">
        <div className="surface p-5 sm:p-6">
          <div className="mb-6 flex items-center justify-between border-b border-zinc-100 pb-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">01 / Identity</p><h2 className="mt-1 text-lg font-semibold">Business details</h2></div><span className="grid size-9 place-items-center rounded-lg bg-[#e8f0e5] text-sm font-bold text-emerald-800">E</span></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-zinc-800 sm:col-span-2">Entity name<input name="name" value={formData.name} onChange={handleChange} required className="field" placeholder="Enter legal entity name" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">GST number<input name="gstNumber" value={formData.gstNumber} onChange={handleChange} className="field" placeholder="Optional GSTIN" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Entity email<input type="email" name="email" maxLength={80} value={formData.email} onChange={handleChange} className="field" placeholder="accounts@company.com" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Phone<input name="phone" value={formData.phone} onChange={handleChange} className="field" placeholder="Primary contact number" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Display name<textarea name="displayName" value={formData.displayName} onChange={handleChange} className="field min-h-24 resize-y" placeholder="Short name used across the workspace" /></label>
          </div>
        </div>
      </div>

      <section className="surface p-5 sm:p-6"><div className="mb-6 border-b border-zinc-100 pb-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">02 / Location</p><h2 className="mt-1 text-lg font-semibold">Registered address</h2></div><div className="grid gap-5 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium text-zinc-800 sm:col-span-2">Address line 1<input name="addressLine1" placeholder="Street and building" value={formData.addressLine1} onChange={handleChange} className="field" /></label><label className="space-y-2 text-sm font-medium text-zinc-800 sm:col-span-2">Address line 2<input name="addressLine2" placeholder="Suite, floor, or landmark" value={formData.addressLine2} onChange={handleChange} className="field" /></label><label className="space-y-2 text-sm font-medium text-zinc-800">City / District<input name="city" placeholder="City" value={formData.city} onChange={handleChange} className="field" /></label><label className="space-y-2 text-sm font-medium text-zinc-800">State / Province<input name="state" placeholder="State" value={formData.state} onChange={handleChange} className="field" /></label><label className="space-y-2 text-sm font-medium text-zinc-800">Postal code<input name="postalCode" placeholder="Postal code" value={formData.postalCode} onChange={handleChange} className="field" /></label><label className="space-y-2 text-sm font-medium text-zinc-800">Country<input name="country" placeholder="Country" value={formData.country} onChange={handleChange} className="field" /></label></div></section>

      <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={status === "saving"} className="button-primary">{status === "saving" ? "Saving..." : editId ? "Update entity" : "Create entity"}</button><button type="button" onClick={() => { setFormData(initialState); setMessage(null); }} className="button-secondary">Reset form</button>{message && <p role="status" className="text-sm text-zinc-600">{message}</p>}</div>
    </form>
  );
}