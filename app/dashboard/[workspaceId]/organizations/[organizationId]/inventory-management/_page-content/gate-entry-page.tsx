"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { BriefcaseBusiness, Car, ClipboardList, FileText, IdCard, Package, Truck, UsersRound } from "lucide-react";

type Challan = { challanNo: string; vendorName: string; lines: Array<{ rawMaterial: string | null; quantity: number }> };
type FormState = { direction: string; movementType: string; challanNo: string; personName: string; companyName: string; idNumber: string; contactNumber: string; vehicleNumber: string; purpose: string; itemDescription: string; quantity: string; fromTo: string; entryAt: string; notes: string };
const initialForm: FormState = { direction: "INWARD", movementType: "CHALLAN", challanNo: "", personName: "", companyName: "", idNumber: "", contactNumber: "", vehicleNumber: "", purpose: "", itemDescription: "", quantity: "", fromTo: "", entryAt: new Date().toISOString().slice(0, 16), notes: "" };
const movementTypes = [
  { value: "CHALLAN", label: "Material Challan", hint: "Link PO or challan", icon: ClipboardList },
  { value: "VISITOR", label: "Visitor", hint: "Visitor register", icon: UsersRound },
  { value: "STAFF", label: "Staff Movement", hint: "Employee movement", icon: IdCard },
  { value: "COURIER", label: "Courier", hint: "Parcel handover", icon: Package },
  { value: "OTHER", label: "Other", hint: "Manual movement", icon: FileText },
];

export default function GateEntryPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params?.organizationId ?? "";
  const [form, setForm] = useState<FormState>(initialForm);
  const [challan, setChallan] = useState<Challan | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const update = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const lookupChallan = async () => {
    if (!form.challanNo.trim()) return;
    setLookingUp(true); setError("");
    try {
      const response = await fetch(`/api/inventory/gate-entries?organizationId=${encodeURIComponent(organizationId)}&challanNo=${encodeURIComponent(form.challanNo.trim())}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Challan not found.");
      setChallan(data.challan);
      setForm((current) => ({ ...current, companyName: data.challan.vendorName, itemDescription: data.challan.lines.map((line: Challan["lines"][number]) => line.rawMaterial || "Item").join(", "), quantity: String(data.challan.lines.reduce((total: number, line: Challan["lines"][number]) => total + line.quantity, 0)) }));
    } catch (lookupError) { setChallan(null); setError(lookupError instanceof Error ? lookupError.message : "Challan not found."); } finally { setLookingUp(false); }
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/inventory/gate-entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, ...form }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to save gate entry.");
      setForm({ ...initialForm, entryAt: new Date().toISOString().slice(0, 16) }); setChallan(null); setMessage(data.grn ? `Gate entry ${data.entry.entry_no} saved. GRN ${data.grn.receipt_no} created.` : `Gate entry ${data.entry.entry_no} saved.`);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save gate entry."); } finally { setSaving(false); }
  };
  const input = (key: keyof FormState, label: string, type = "text", required = false) => <label className="block text-xs font-semibold text-slate-700">{label}<input required={required} type={type} value={form[key]} onChange={(event) => update(key, event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>;

  return <main className="mx-auto max-w-[1500px] space-y-4">{error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}{message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}<form onSubmit={submit} className="space-y-4"><section className="erp-surface p-4"><div className="text-center"><div className="mx-auto grid max-w-md grid-cols-2 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => update("direction", "INWARD")} className={`flex items-center justify-center gap-2 rounded-lg px-7 py-3 text-sm font-bold transition ${form.direction === "INWARD" ? "bg-emerald-700 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}><Truck size={20} /> Inward</button><button type="button" onClick={() => update("direction", "OUTWARD")} className={`flex items-center justify-center gap-2 rounded-lg px-7 py-3 text-sm font-bold transition ${form.direction === "OUTWARD" ? "bg-amber-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}><Car size={20} /> Outward</button></div></div></section><section className="erp-surface p-4"><div className="mb-3 text-center"><h2 className="text-lg font-bold text-slate-950">What is moving {form.direction === "INWARD" ? "in" : "out"}?</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{movementTypes.map(({ value, label, hint, icon: Icon }) => <button key={value} type="button" onClick={() => update("movementType", value)} className={`min-h-28 rounded-xl border p-3 text-left transition ${form.movementType === value ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50"}`}><Icon size={30} strokeWidth={1.7} className={form.movementType === value ? "text-emerald-700" : "text-slate-500"} /><span className="mt-3 block text-sm font-bold text-slate-900">{label}</span><span className="mt-1 block text-xs text-slate-500">{hint}</span></button>)}</div></section><section className="erp-surface space-y-4 p-4"><div className="flex items-center justify-center gap-3"><div className="rounded-lg bg-slate-100 p-2 text-slate-600"><BriefcaseBusiness size={20} /></div><h2 className="text-lg font-bold text-slate-950">Enter movement details</h2></div><div className="grid gap-3 md:grid-cols-4">{input("entryAt", "Entry date and time", "datetime-local", true)}{input("personName", form.movementType === "VISITOR" ? "Visitor name" : "Person / party name", "text", true)}{input("companyName", "Company / vendor")}{input("contactNumber", "Contact number")}</div><div className="grid gap-3 md:grid-cols-4">{input("challanNo", "Challan / PO number")}{input("idNumber", "ID number")}{input("vehicleNumber", "Vehicle number")}{input("fromTo", "From / To")}</div><div className="grid gap-3 md:grid-cols-4">{input("purpose", "Purpose")}{input("quantity", "Quantity", "number")}{input("itemDescription", "Material / parcel details")}{input("notes", "Notes")}</div>{form.movementType === "CHALLAN" ? <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><button type="button" onClick={() => void lookupChallan()} disabled={lookingUp || !form.challanNo.trim()} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{lookingUp ? "Looking up..." : "Auto-populate challan details"}</button>{challan ? <p className="text-xs text-emerald-900"><strong>{challan.challanNo}</strong> linked to {challan.vendorName} · {challan.lines.length} line(s)</p> : <p className="text-xs text-slate-600">Enter a Purchase Order number to fill vendor and material details.</p>}</div> : null}<div className="flex justify-center border-t border-slate-200 pt-3"><button type="submit" disabled={saving} className={`rounded-lg px-8 py-3 text-sm font-bold text-white shadow-sm disabled:bg-slate-300 ${form.direction === "INWARD" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-amber-600 hover:bg-amber-700"}`}>{saving ? "Saving..." : `Save ${form.direction === "INWARD" ? "Inward" : "Outward"} Gate Entry`}</button></div></section></form></main>;
}
