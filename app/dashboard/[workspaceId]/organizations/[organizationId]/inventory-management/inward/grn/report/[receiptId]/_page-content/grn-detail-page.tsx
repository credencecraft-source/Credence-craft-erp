"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import UiPage from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type Receipt = {
  receipt_no: string;
  received_date: string;
  entity: { entity_name: string } | null;
  location: { location_name: string };
  purchaseOrder: { purchase_order_no: string; display_no: number | null };
  lines: Array<{
    id: string;
    raw_material: string | null;
    ordered_quantity: number | string;
    received_quantity: number | string;
    accepted_quantity: number | string;
    rejected_quantity: number | string;
  }>;
};

const quantity = (value: number | string) => Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function GrnDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; receiptId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const receiptId = params?.receiptId ?? "";
  const reportPath = `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/grn/report`;
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function deleteReceipt() {
    if (!receipt || deleting || !window.confirm(`Delete GRN ${receipt.receipt_no}? Its verification and allocations will also be deleted, and accepted stock will be reversed.`)) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/inventory/receipts?organizationId=${encodeURIComponent(organizationId)}&receiptId=${encodeURIComponent(receiptId)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete GRN.");
      router.push(reportPath);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete GRN.");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/inventory/receipts?organizationId=${encodeURIComponent(organizationId)}&receiptId=${encodeURIComponent(receiptId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load GRN.");
        if (!data.receipt) throw new Error("GRN was not found.");
        setReceipt(data.receipt);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Unable to load GRN.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [organizationId, receiptId]);

  return (
    <UiPage as="div">
      <Section className="space-y-6">
        <Link href={reportPath} className="text-xs font-semibold text-emerald-700">&larr; RM GRN Report</Link>
        {loading && <Card className="p-6 text-sm text-slate-600">Loading GRN details...</Card>}
        {error && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}
        {receipt && (
          <>
            <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">GRN Detail</p>
                <h1 className="mt-2 text-2xl font-bold text-slate-900">{receipt.receipt_no}</h1>
                <p className="mt-1 text-sm text-slate-500">
                  PO {receipt.purchaseOrder.display_no ? `PO-${receipt.purchaseOrder.display_no}` : receipt.purchaseOrder.purchase_order_no}
                  {` · ${receipt.entity?.entity_name ?? "Missing Entity"} · ${receipt.location.location_name}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold text-slate-600">{new Date(receipt.received_date).toLocaleDateString("en-IN")}</p>
                <Button type="button" variant="danger" size="sm" onClick={() => void deleteReceipt()} disabled={deleting}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {deleting ? "Deleting..." : "Delete GRN"}
                </Button>
              </div>
            </header>
            <Card className="border-slate-200 p-5">
              <h2 className="mb-4 text-lg font-bold text-slate-900">Line Items</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-3">Raw Material</th>
                      <th className="p-3 text-right">Ordered</th>
                      <th className="p-3 text-right">Received</th>
                      <th className="p-3 text-right">Accepted</th>
                      <th className="p-3 text-right">Rejected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receipt.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="p-3 font-semibold">{line.raw_material || "-"}</td>
                        <td className="p-3 text-right">{quantity(line.ordered_quantity)}</td>
                        <td className="p-3 text-right">{quantity(line.received_quantity)}</td>
                        <td className="p-3 text-right font-semibold text-emerald-700">{quantity(line.accepted_quantity)}</td>
                        <td className="p-3 text-right">{quantity(line.rejected_quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </Section>
    </UiPage>
  );
}