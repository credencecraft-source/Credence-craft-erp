"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type AllocatedStockRecord = {
  id: string;
  location: { location_name: string } | null;
  inventory_bucket?: string;
  [key: string]: unknown;
};

const detailFields = [
  { key: "id", label: "Record ID" },
  { key: "inventory_bucket", label: "Stock Type" },
  { key: "location", label: "Location" },
  { key: "grn_no", label: "GRN No" },
  { key: "style_name", label: "Style" },
  { key: "order_no", label: "Order No" },
  { key: "work_order_no", label: "Work Order No" },
  { key: "booking_no", label: "Booking No" },
  { key: "booking_id", label: "Booking ID" },
  { key: "booking_assignment_id", label: "Booking Assignment ID" },
  { key: "buyer", label: "Buyer" },
  { key: "size", label: "Size" },
  { key: "buyer_size", label: "Buyer Size" },
  { key: "colour", label: "Colour" },
  { key: "qty_in", label: "Qty In" },
  { key: "qty_out", label: "Qty Out" },
  { key: "current_stock", label: "Current Stock" },
  { key: "received_quantity", label: "GRN Submitted Qty" },
  { key: "actual_received_quantity", label: "GRN Actual Qty" },
  { key: "approved_quantity", label: "GRN Approved Qty" },
  { key: "rejected_quantity", label: "GRN Rejected Qty" },
  { key: "added_user", label: "Added User Email" },
  { key: "created_by", label: "GRN Submitted By" },
  { key: "verified_by", label: "GRN Verified By" },
  { key: "posted_at", label: "Posted At" },
] as const;

export default function AllocatedStockDetailPage({
  workspaceId,
  organizationId,
  recordId,
}: {
  workspaceId: string;
  organizationId: string;
  recordId: string;
}) {
  const router = useRouter();
  const [record, setRecord] = useState<AllocatedStockRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const listPath = `/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/inventory-management/stock/fg-stock/allocated-stock`;

  useEffect(() => {
    let active = true;

    async function loadRecord() {
      try {
        const query = new URLSearchParams({
          organizationId,
          bucket: "ALLOCATED",
        });
        const response = await fetch(`/api/inventory/stock/fg-sku?${query.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          records?: AllocatedStockRecord[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load allocated stock details.");
        }

        const foundRecord = payload.records?.find(
          (candidate) => candidate.id === recordId && candidate.inventory_bucket === "ALLOCATED",
        );
        if (!foundRecord) {
          throw new Error("Allocated stock record not found.");
        }
        if (active) setRecord(foundRecord);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load allocated stock details.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadRecord();
    return () => {
      active = false;
    };
  }, [organizationId, recordId]);

  return (
    <Page as="div">
      <Section>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-950">Allocated Finished Goods Stock</h1>
            {record && (
              <p className="mt-1 text-sm text-slate-600">
                {record.grn_no ? String(record.grn_no) : record.id}
              </p>
            )}
          </div>
          <Button type="button" variant="secondary" onClick={() => router.push(listPath)}>
            Back to Allocated Stock
          </Button>
        </header>

        {loading && <p role="status" className="text-sm text-slate-600">Loading allocated stock details...</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {record && !error && (
          <section aria-label="Allocated stock record details" className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {detailFields.map(({ key, label }) => {
              const rawValue = key === "location" ? record.location?.location_name : record[key];
              const value = key === "posted_at" && rawValue
                ? new Date(String(rawValue)).toLocaleString()
                : key === "inventory_bucket" && typeof rawValue === "string"
                  ? rawValue.replaceAll("_", " ")
                  : rawValue === null || rawValue === undefined || rawValue === ""
                    ? "-"
                    : String(rawValue);
              return <Input key={key} label={label} readOnly value={value} />;
            })}
          </section>
        )}
      </Section>
    </Page>
  );
}
