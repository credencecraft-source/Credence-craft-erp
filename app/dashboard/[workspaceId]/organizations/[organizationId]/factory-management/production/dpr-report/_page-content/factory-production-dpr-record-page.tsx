"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type FactoryProductionReceipt = {
  id: string;
  grnNo: string;
  acceptedAt: string;
  orderNo: string;
  styleNo: string | null;
  styleName: string | null;
  workOrderNo: string;
  fromProcess: string;
  toProcess: string;
  transferQty: number;
  acceptedQty: number;
  acceptedBy: string | null;
  status: string;
  operations: string[];
};

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-[var(--erp-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{value || "-"}</dd>
    </div>
  );
}

export default function FactoryProductionDprRecordPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; grnId: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<FactoryProductionReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reportPath = `/dashboard/${params.workspaceId}/organizations/${params.organizationId}/factory-management/production/dpr-report`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/factory/production/completion-report?organizationId=${encodeURIComponent(params.organizationId)}&grnId=${encodeURIComponent(params.grnId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.record) {
          throw new Error(data.error || "Unable to load factory production receipt.");
        }
        setRecord(data.record as FactoryProductionReceipt);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load factory production receipt.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params.grnId, params.organizationId, reloadKey]);

  return (
    <Page as="div">
      <Section>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Factory / Production / DPR</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--erp-text)]">
              {record?.grnNo ?? "Production Receipt Details"}
            </h1>
          </div>
          <Button type="button" variant="secondary" onClick={() => router.push(reportPath)}>
            Back to Factory DPR
          </Button>
        </header>
        {loading ? <p role="status" className="text-sm text-[var(--erp-muted)]">Loading production receipt...</p> : null}
        {error ? (
          <Card role="alert" className="space-y-3 border-[var(--erp-danger)] text-sm">
            <p>{error}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLoading(true);
                setError("");
                setRecord(null);
                setReloadKey((key) => key + 1);
              }}
            >
              Retry
            </Button>
          </Card>
        ) : null}
        {record ? (
          <>
            <Card>
              <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailField label="GRN Number" value={record.grnNo} />
                <DetailField label="Status" value={record.status} />
                <DetailField label="Accepted Date" value={new Date(record.acceptedAt).toLocaleString("en-IN")} />
                <DetailField label="Order Number" value={record.orderNo} />
                <DetailField label="Style Number" value={record.styleNo ?? ""} />
                <DetailField label="Style Name" value={record.styleName ?? ""} />
                <DetailField label="Work Order" value={record.workOrderNo} />
                <DetailField label="From Process" value={record.fromProcess} />
                <DetailField label="To Process" value={record.toProcess} />
                <DetailField label="Transferred Quantity" value={record.transferQty.toLocaleString("en-IN")} />
                <DetailField label="Accepted Quantity" value={record.acceptedQty.toLocaleString("en-IN")} />
                <DetailField label="Accepted By" value={record.acceptedBy ?? ""} />
              </dl>
            </Card>
            <Card>
              <h2 className="text-base font-semibold text-[var(--erp-text)]">Operations and made quantities</h2>
              {record.operations.length > 0 ? (
                <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-[var(--erp-text)]">
                  {record.operations.map((operation, index) => <li key={`${operation}-${index}`}>{operation}</li>)}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[var(--erp-muted)]">No operation quantities were recorded.</p>
              )}
            </Card>
          </>
        ) : null}
      </Section>
    </Page>
  );
}
