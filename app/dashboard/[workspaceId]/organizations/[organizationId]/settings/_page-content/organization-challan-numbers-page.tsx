"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type Configuration = { id: string; document_type: string; label: string; prefix: string; start_number: number; current_number: number; nextNumber: number; tables: string };

export default function OrganizationChallanNumbersPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const workspaceId = params?.workspaceId ?? "";
  const organizationId = params?.organizationId ?? "";
  const [configurations, setConfigurations] = useState<Configuration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch(`/api/organizations/${encodeURIComponent(organizationId)}/challan-number-configurations`, { cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load settings."); setConfigurations(data.configurations ?? []); })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load settings."))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const update = (documentType: string, field: "prefix" | "start_number", value: string) => setConfigurations((current) => current.map((item) => item.document_type === documentType ? { ...item, [field]: field === "start_number" ? Number(value) : value } : item));
  async function save(configuration: Configuration) {
    setSaving(configuration.document_type); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/challan-number-configurations`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentType: configuration.document_type, prefix: configuration.prefix, startNumber: configuration.start_number }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save settings.");
      setConfigurations((current) => current.map((item) => item.document_type === configuration.document_type ? { ...item, ...data.configuration, nextNumber: Math.max(data.configuration.start_number, data.configuration.current_number + 1), tables: item.tables } : item));
      setMessage(`${configuration.label} numbering saved.`);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save settings."); } finally { setSaving(""); }
  }

  return <Page><Section className="space-y-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings`} className="text-xs font-semibold text-emerald-700">&larr; Organization Settings</Link><p className="mt-4 erp-eyebrow">Organization Settings</p><h1 className="erp-page-heading">Challan Number Configuration</h1><p className="erp-page-subheading">Central control for prefixes and starting numbers used by challans, GRNs, gate entries, and related documents.</p></div></div>{error ? <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card> : null}{message ? <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</Card> : null}{loading ? <Card className="p-6 text-sm text-slate-500">Loading number configurations...</Card> : <div className="grid gap-4 lg:grid-cols-2">{configurations.map((configuration) => <Card key={configuration.document_type} className="space-y-4"><div><h2 className="text-lg font-bold text-slate-900">{configuration.label}</h2><p className="mt-1 text-xs text-slate-500">Tables: {configuration.tables}</p></div><div className="grid gap-3 sm:grid-cols-2"><Input label="Prefix" value={configuration.prefix} onChange={(event) => update(configuration.document_type, "prefix", event.target.value)} maxLength={20} /><Input label="Start number" type="number" min="1" value={String(configuration.start_number)} onChange={(event) => update(configuration.document_type, "start_number", event.target.value)} /></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs"><span className="text-slate-500">Current: <strong className="text-slate-800">{configuration.current_number || "Not used"}</strong> · Next: <strong className="text-slate-800">{configuration.prefix}-{configuration.nextNumber}</strong></span><Button type="button" size="sm" onClick={() => void save(configuration)} disabled={saving === configuration.document_type}>{saving === configuration.document_type ? "Saving..." : "Save"}</Button></div></Card>)}</div>}</Section></Page>;
}
