"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type GateEntry = {
  id: string;
  entry_no: string;
  direction: string;
  movement_type: string;
  challan_no: string | null;
  person_name: string;
  company_name: string | null;
  id_type: string | null;
  id_number: string | null;
  contact_number: string | null;
  vehicle_number: string | null;
  purpose: string | null;
  item_description: string | null;
  quantity: string | number | null;
  from_to: string | null;
  entry_at: string;
  status: string;
  notes: string | null;
  created_by: string | null;
  purchaseOrder: { purchase_order_no: string } | null;
};

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-[var(--erp-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{value || "-"}</dd>
    </div>
  );
}

function maskIdNumber(value: string | null) {
  if (!value) return "-";
  return value.length > 4 ? `${"*".repeat(value.length - 4)}${value.slice(-4)}` : "****";
}

export default function GateEntryDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; entryId: string }>();
  const router = useRouter();
  const organizationId = params.organizationId;
  const reportPath = `/dashboard/${params.workspaceId}/organizations/${organizationId}/inventory-management/gate-entry/reports`;
  const [entry, setEntry] = useState<GateEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/inventory/gate-entries?organizationId=${encodeURIComponent(organizationId)}&entryId=${encodeURIComponent(params.entryId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.entries) || !data.entries[0]) {
          throw new Error(data.error || "Unable to load gate entry.");
        }
        setEntry(data.entries[0] as GateEntry);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load gate entry.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [organizationId, params.entryId]);

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Inventory / Gate Entry</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--erp-text)]">
              {entry?.entry_no ?? "Gate Entry Details"}
            </h1>
          </div>
          <Button type="button" variant="secondary" onClick={() => router.push(reportPath)}>
            Back to Gate Entry Report
          </Button>
        </header>
        {loading ? <p role="status" className="text-sm text-[var(--erp-muted)]">Loading gate entry...</p> : null}
        {error ? <Card role="alert" className="border-[var(--erp-danger)] text-sm">{error}</Card> : null}
        {entry ? (
          <>
            <Card className="p-6">
              <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailField label="Entry Number" value={entry.entry_no} />
                <DetailField label="Direction" value={entry.direction} />
                <DetailField label="Movement Type" value={entry.movement_type} />
                <DetailField label="Person / Party" value={entry.person_name} />
                <DetailField label="Company" value={entry.company_name ?? ""} />
                <DetailField label="Contact Number" value={entry.contact_number ?? ""} />
                <DetailField label="ID Type" value={entry.id_type ?? ""} />
                <DetailField label="ID Number" value={maskIdNumber(entry.id_number)} />
                <DetailField label="Vehicle Number" value={entry.vehicle_number ?? ""} />
                <DetailField label="Challan Number" value={entry.challan_no ?? ""} />
                <DetailField label="Purchase Order" value={entry.purchaseOrder?.purchase_order_no ?? ""} />
                <DetailField label="Quantity" value={entry.quantity === null ? "-" : String(entry.quantity)} />
                <DetailField label="From / To" value={entry.from_to ?? ""} />
                <DetailField label="Purpose" value={entry.purpose ?? ""} />
                <DetailField label="Item Description" value={entry.item_description ?? ""} />
                <DetailField label="Entry Time" value={new Date(entry.entry_at).toLocaleString("en-IN")} />
                <DetailField label="Status" value={entry.status} />
                <DetailField label="Recorded By" value={entry.created_by ?? ""} />
                <DetailField label="Notes" value={entry.notes ?? ""} />
              </dl>
            </Card>
          </>
        ) : null}
      </Section>
    </Page>
  );
}
