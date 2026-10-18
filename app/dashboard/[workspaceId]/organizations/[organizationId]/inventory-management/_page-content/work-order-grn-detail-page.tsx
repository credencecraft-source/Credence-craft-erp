"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type WorkOrderGrn = {
  id: string;
  grnNo: string;
  receivedDate: string;
  status: string;
  notes: string;
  createdAt: string;
  workOrder: {
    id: string;
    workOrderNo: string;
    orderNo: string;
    totalQty: number;
    status: string;
    article: string | null;
    styleName: string | null;
    brand: string | null;
  };
  lines: Array<{
    id: string;
    size: string | null;
    buyerSize: string | null;
    orderedQuantity: number;
    receivedQuantity: number;
    verifiedActualQuantity: number | null;
    approvedQuantity: number | null;
    rejectedQuantity: number | null;
  }>;
};

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-[var(--erp-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{value || "-"}</dd>
    </div>
  );
}

export default function WorkOrderGrnDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; grnId: string }>();
  const router = useRouter();
  const organizationId = params.organizationId;
  const basePath = `/dashboard/${params.workspaceId}/organizations/${organizationId}/inventory-management/inward/wo-grn`;
  const [grn, setGrn] = useState<WorkOrderGrn | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/inventory/work-order-grns?organizationId=${encodeURIComponent(organizationId)}&grnId=${encodeURIComponent(params.grnId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.grns) || !data.grns[0]) {
          throw new Error(data.error || "Unable to load Work Order GRN.");
        }
        setGrn(data.grns[0] as WorkOrderGrn);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load Work Order GRN.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [organizationId, params.grnId, reloadKey]);

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Inventory / Inward / Work Order GRN</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--erp-text)]">
              {grn?.grnNo ?? "Work Order GRN Details"}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => router.push(`${basePath}/report`)}>
              Back to Work Order GRNs
            </Button>
          </div>
        </header>
        {loading ? <p role="status" className="text-sm text-[var(--erp-muted)]">Loading Work Order GRN...</p> : null}
        {error ? (
          <Card role="alert" className="space-y-3 border-[var(--erp-danger)] text-sm">
            <p>{error}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLoading(true);
                setError("");
                setGrn(null);
                setReloadKey((key) => key + 1);
              }}
            >
              Retry
            </Button>
          </Card>
        ) : null}
        {grn ? (
          <>
            <Card className="p-6">
              <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailField label="GRN Number" value={grn.grnNo} />
                <DetailField label="Status" value={grn.status} />
                <DetailField label="Received Date" value={grn.receivedDate} />
                <DetailField label="Work Order" value={grn.workOrder.workOrderNo} />
                <DetailField label="Order Number" value={grn.workOrder.orderNo} />
                <DetailField label="Style" value={grn.workOrder.styleName || grn.workOrder.article || ""} />
                <DetailField label="Brand" value={grn.workOrder.brand ?? ""} />
                <DetailField label="Created" value={new Date(grn.createdAt).toLocaleString("en-IN")} />
                <DetailField label="Notes" value={grn.notes} />
              </dl>
            </Card>
            <Card className="space-y-3 p-6">
              <h2 className="text-base font-semibold text-[var(--erp-text)]">Received quantities</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead className="bg-[var(--erp-surface-soft)] text-xs uppercase text-[var(--erp-muted)]">
                    <tr>
                      <th className="px-3 py-2">Size</th>
                      <th className="px-3 py-2 text-right">Ordered</th>
                      <th className="px-3 py-2 text-right">Submitted</th>
                      <th className="px-3 py-2 text-right">Verified</th>
                      <th className="px-3 py-2 text-right">Approved</th>
                      <th className="px-3 py-2 text-right">Rejected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grn.lines.map((line) => (
                      <tr key={line.id} className="border-t border-[var(--erp-border)]">
                        <td className="px-3 py-2">{line.size || line.buyerSize || "-"}</td>
                        <td className="px-3 py-2 text-right">{line.orderedQuantity.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2 text-right">{line.receivedQuantity.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2 text-right">{line.verifiedActualQuantity?.toLocaleString("en-IN") ?? "-"}</td>
                        <td className="px-3 py-2 text-right">{line.approvedQuantity?.toLocaleString("en-IN") ?? "-"}</td>
                        <td className="px-3 py-2 text-right">{line.rejectedQuantity?.toLocaleString("en-IN") ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : null}
      </Section>
    </Page>
  );
}
