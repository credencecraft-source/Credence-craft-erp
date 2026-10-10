"use client";

import { useState } from "react";
import { ArrowDownRight, Check, Circle, Factory, PackageCheck, ShoppingBag, X } from "lucide-react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import type {
  StyleHealthMaterialCategory,
  StyleHealthMilestoneRecord,
  StyleHealthOrder,
} from "@/lib/services/orders/style-health-service";

type MilestoneKey = "orderCreated" | "materials" | "workOrders";

type SelectedMilestone =
  | { kind: "records"; title: string; records: StyleHealthMilestoneRecord[] }
  | { kind: "materials"; title: string; materials: StyleHealthMaterialCategory[] }
  | null;

const milestoneFields: Array<{ key: keyof StyleHealthOrder | string; label: string }> = [
  { key: "brand", label: "Brand" },
  { key: "orderNo", label: "Order / Style" },
  { key: "progress", label: "Milestone progress" },
];

const milestoneLabels: Record<MilestoneKey, string> = {
  orderCreated: "Order created",
  materials: "Materials",
  workOrders: "Work order",
};

const milestoneIcons: Record<MilestoneKey, typeof ShoppingBag> = {
  orderCreated: ShoppingBag,
  materials: PackageCheck,
  workOrders: Factory,
};

const milestoneKeys: MilestoneKey[] = [
  "orderCreated",
  "materials",
  "workOrders",
];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function searchMilestones(records: StyleHealthMilestoneRecord[]) {
  return records.map((record) => [
    record.documentNo,
    record.status,
    record.createdBy,
    record.detail,
    record.occurredAt,
  ].filter(Boolean).join(" ")).join(" ");
}

function searchMaterials(materials: StyleHealthMaterialCategory[]) {
  return materials.map((material) => [
    material.subCategory,
    material.poCreatedAt,
    material.orderedStatus,
    material.receivedStatus,
    material.materialReceivedAt,
  ].filter(Boolean).join(" ")).join(" ");
}

function getLatestMilestoneDate(records: StyleHealthMilestoneRecord[]) {
  return records.reduce<string | undefined>(
    (latest, record) => !latest || record.occurredAt > latest ? record.occurredAt : latest,
    undefined,
  );
}

function getMaterialState(order: StyleHealthOrder) {
  const receivedCount = order.materials.filter(({ receivedStatus }) => receivedStatus === "FULL").length;
  const isComplete = order.materials.length > 0 && receivedCount === order.materials.length;
  const latestDate = order.materials.reduce<string | undefined>((latest, material) => {
    for (const value of [material.poCreatedAt, material.materialReceivedAt]) {
      if (value && (!latest || value > latest)) latest = value;
    }
    return latest;
  }, undefined);
  return { receivedCount, isComplete, latestDate };
}

function renderMilestoneStepper(
  order: StyleHealthOrder,
  onSelect: (milestone: SelectedMilestone) => void,
) {
  const currentIndex = milestoneKeys.findIndex((key) => (
    key === "materials"
      ? !getMaterialState(order).isComplete
      : order[key].length === 0
  ));
  const completedCount = currentIndex === -1 ? milestoneKeys.length : currentIndex;

  return (
    <ol
      aria-label={`Milestone progress for ${order.orderNo}`}
      className="flex min-w-[34rem] items-start px-2 py-2"
    >
      {milestoneKeys.map((key, index) => {
        const isMaterials = key === "materials";
        const records = isMaterials ? [] : order[key];
        const materialState = isMaterials ? getMaterialState(order) : null;
        const isComplete = isMaterials ? materialState!.isComplete : records.length > 0;
        const isCurrent = index === currentIndex;
        const Icon = milestoneIcons[key];
        const latestDate = isMaterials ? materialState!.latestDate : getLatestMilestoneDate(records);
        const countLabel = isMaterials
          ? `${order.materials.length} material categor${order.materials.length === 1 ? "y" : "ies"}`
          : `${records.length} record${records.length === 1 ? "" : "s"}`;

        return (
          <li key={key} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {index < milestoneKeys.length - 1 && (
              <span
                className={`absolute left-1/2 top-4 h-0.5 w-full ${index < completedCount ? "bg-[var(--erp-brand)]" : "bg-[var(--erp-border)]"}`}
                aria-hidden="true"
              />
            )}
            <Button
              type="button"
              variant={isComplete ? "outline" : "secondary"}
              size="sm"
              aria-label={`${milestoneLabels[key]}: ${isComplete ? countLabel : isMaterials && order.materials.length > 0 ? `${countLabel}, ${materialState!.receivedCount} fully received` : isCurrent ? "in progress, not started" : "upcoming, not started"} for ${order.orderNo}`}
              aria-current={isCurrent ? "step" : undefined}
              className={`relative z-10 h-8 min-h-8 w-8 shrink-0 rounded-full p-0 ${
                isComplete
                  ? "border-[var(--erp-brand)] bg-[var(--erp-brand)] text-white hover:bg-[var(--erp-brand-hover)]"
                  : isCurrent
                    ? "border-2 border-[var(--erp-brand)] bg-[var(--erp-surface)] text-[var(--erp-brand)] ring-4 ring-[var(--erp-brand-soft)]"
                    : "border-2 border-[var(--erp-border)] bg-[var(--erp-surface)] text-[var(--erp-muted)]"
              }`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(isMaterials
                  ? { kind: "materials", title: milestoneLabels[key], materials: order.materials }
                  : { kind: "records", title: milestoneLabels[key], records });
              }}
            >
              {isComplete
                ? <Check className="h-4 w-4" aria-hidden="true" />
                : isCurrent
                  ? <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  : <Circle className="h-3.5 w-3.5" aria-hidden="true" />}
            </Button>
            <span className={`mt-2 text-xs font-semibold ${isComplete || isCurrent ? "text-[var(--erp-brand)]" : "text-[var(--erp-muted)]"}`}>
              {milestoneLabels[key]}
            </span>
            <span className="mt-0.5 text-[11px] text-[var(--erp-muted)]">
              {isMaterials && order.materials.length > 0
                ? `${materialState!.receivedCount}/${order.materials.length} fully received`
                : latestDate
                  ? formatDateTime(latestDate)
                  : isCurrent
                    ? "In progress"
                    : "Upcoming"}
              {!isMaterials && records.length > 1 ? ` · ${records.length} docs` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function StyleHealthPage({
  orders,
  organizationId,
}: {
  orders: StyleHealthOrder[];
  organizationId: string;
}) {
  const [visibleFields, setVisibleFields] = useState<(keyof StyleHealthOrder | string)[]>(
    milestoneFields.map(({ key }) => key),
  );
  const [selectedMilestone, setSelectedMilestone] = useState<SelectedMilestone>(null);

  return (
    <Page as="div">
      <Section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-[var(--erp-brand)]">Order Management · Merchandising</p>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--erp-text)]">Style Health</h1>
            <p className="max-w-3xl text-sm text-[var(--erp-muted)]">
              Track each style from order creation through BOM material ordering, receipt, and work-order release.
              Select a milestone to inspect its progress and details.
            </p>
          </div>
          <Badge className="gap-1.5">
            <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
            {orders.length.toLocaleString("en-IN")} styles / orders
          </Badge>
        </div>

        <Card className="space-y-3">
          <ReportGrid
            title="Style milestone report"
            records={orders}
            fields={milestoneFields}
            visibleFields={visibleFields}
            onVisibleFieldsChange={setVisibleFields}
            storageKey={`credence-craft-style-health-${organizationId}`}
            rowIdSelector={(order) => order.id}
            selectedIds={[]}
            selectable={false}
            onRowClick={() => undefined}
            emptyMessage="No merchandising orders found for this organization."
            getSearchValue={(fieldKey, order) => {
              if (fieldKey === "progress") {
                return milestoneKeys.map((key) => key === "materials"
                  ? searchMaterials(order.materials)
                  : searchMilestones(order[key])).join(" ");
              }
              if (fieldKey === "brand") return order.brand ?? "";
              if (fieldKey === "orderNo") return order.orderNo;
              if (fieldKey === "styleName") return order.styleName ?? "";
              return "";
            }}
            renderCell={(fieldKey, order) => {
              if (fieldKey === "brand") return order.brand || "—";
              if (fieldKey === "orderNo") {
                return (
                  <div className="min-w-40 space-y-1">
                    <p className="font-semibold text-[var(--erp-text)]">{order.orderNo}</p>
                    <p className="text-xs text-[var(--erp-muted)]">{order.styleName || "Style not specified"}</p>
                  </div>
                );
              }
              if (fieldKey === "progress") return renderMilestoneStepper(order, setSelectedMilestone);
              return "";
            }}
          />
        </Card>
      </Section>

      <Modal
        open={selectedMilestone !== null}
        onClose={() => setSelectedMilestone(null)}
        ariaLabelledBy="style-health-milestone-title"
        size="lg"
      >
        {selectedMilestone && (
          <div className="space-y-5 p-6">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--erp-border)] pb-4">
              <div>
                <p className="text-sm font-medium text-[var(--erp-muted)]">Style milestone details</p>
                <h2 id="style-health-milestone-title" className="mt-1 text-xl font-bold text-[var(--erp-text)]">
                  {selectedMilestone.title}
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedMilestone(null)}
                aria-label="Close milestone details"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {selectedMilestone.kind === "materials" ? (
              selectedMilestone.materials.length === 0 ? (
                <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-5 text-sm text-[var(--erp-muted)]">
                  No BOM raw-material subcategories are linked to this order yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="border-b border-[var(--erp-border)] text-[var(--erp-muted)]">
                      <tr>
                        <th scope="col" className="px-3 py-3 font-medium">Raw-material subcategory</th>
                        <th scope="col" className="px-3 py-3 font-medium">PO created</th>
                        <th scope="col" className="px-3 py-3 font-medium">Material received</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--erp-border)]">
                      {selectedMilestone.materials.map((material) => (
                        <tr key={material.subCategory}>
                          <th scope="row" className="px-3 py-4 font-semibold text-[var(--erp-text)]">
                            {material.subCategory}
                          </th>
                          <td className="px-3 py-4">
                            <Badge>
                              {material.orderedStatus === "FULL"
                                ? "Full quantity ordered"
                                : material.orderedStatus === "PARTIAL"
                                  ? "Partial quantity ordered"
                                  : "PO not created"}
                            </Badge>
                            {material.poCreatedAt && (
                              <p className="mt-1 text-xs text-[var(--erp-muted)]">
                                {formatDateTime(material.poCreatedAt)}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-4">
                            <Badge>
                              {material.receivedStatus === "FULL"
                                ? "Fully received"
                                : material.receivedStatus === "PARTIAL"
                                  ? "Partially received"
                                  : "Not received"}
                            </Badge>
                            {material.materialReceivedAt && (
                              <p className="mt-1 text-xs text-[var(--erp-muted)]">
                                {formatDateTime(material.materialReceivedAt)}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : selectedMilestone.records.length === 0 ? (
              <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-5 text-sm text-[var(--erp-muted)]">
                This milestone has not been recorded for this order.
              </div>
            ) : (
              <ol className="space-y-3">
                {selectedMilestone.records.map((record) => (
                  <li key={record.id} className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--erp-text)]">{record.documentNo}</p>
                        <p className="mt-1 text-sm text-[var(--erp-muted)]">{formatDateTime(record.occurredAt)}</p>
                      </div>
                      {record.status && <Badge>{record.status.replaceAll("_", " ")}</Badge>}
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-[var(--erp-muted)]">Created by</dt>
                        <dd className="mt-0.5 font-medium text-[var(--erp-text)]">
                          {record.createdBy || "Creator not recorded"}
                        </dd>
                      </div>
                      {record.detail && (
                        <div>
                          <dt className="text-[var(--erp-muted)]">Details</dt>
                          <dd className="mt-0.5 font-medium text-[var(--erp-text)]">{record.detail}</dd>
                        </div>
                      )}
                    </dl>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </Modal>
    </Page>
  );
}
