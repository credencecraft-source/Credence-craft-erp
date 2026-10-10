"use client";

import { useState } from "react";
import { ArrowDownRight, Check, Circle, Factory, PackageCheck, ScanLine, Truck, X } from "lucide-react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import type {
  FactoryStyleActivity,
  FactoryStyleProcessProgress,
  FactoryStyleStatusOrder,
} from "@/lib/services/factory/factory-style-status-service";

type FactoryStepKey = "workOrders" | "production" | "transfers" | "finishedGoods";
type SelectedStep =
  | { key: "processes"; title: string; processes: FactoryStyleProcessProgress[] }
  | { key: "activities"; title: string; activities: FactoryStyleActivity[] }
  | null;

const reportFields: Array<{ key: string; label: string }> = [
  { key: "brand", label: "Brand" },
  { key: "orderNo", label: "Order / Style" },
  { key: "progress", label: "Factory progress" },
];

const stepLabels: Record<FactoryStepKey, string> = {
  workOrders: "Work order",
  production: "Production",
  transfers: "Process flow",
  finishedGoods: "Finished goods",
};

const stepIcons: Record<FactoryStepKey, typeof Factory> = {
  workOrders: Factory,
  production: PackageCheck,
  transfers: Truck,
  finishedGoods: ScanLine,
};

const stepKeys: FactoryStepKey[] = ["workOrders", "production", "transfers", "finishedGoods"];

function formatDate(value: string | null) {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function processIsComplete(process: FactoryStyleProcessProgress) {
  return process.plannedQuantity > 0 && process.completedQuantity >= process.plannedQuantity;
}

function stepIsComplete(order: FactoryStyleStatusOrder, key: FactoryStepKey) {
  if (key === "workOrders") return order.workOrders.length > 0;
  if (key === "production") {
    return order.processes.length > 0 && order.processes.every(processIsComplete);
  }
  if (key === "transfers") {
    return order.transfers.length > 0 && order.transfers.every(({ status }) => (
      ["RECEIVED", "APPROVED", "COMPLETED", "TRANSFERRED"].includes(status?.toUpperCase() ?? "")
    ));
  }
  return order.plannedFinishedGoodsQuantity > 0
    && order.approvedFinishedGoodsQuantity >= order.plannedFinishedGoodsQuantity;
}

function stepDate(order: FactoryStyleStatusOrder, key: FactoryStepKey) {
  const values = key === "production"
    ? order.processes.map(({ occurredAt }) => occurredAt)
    : order[key].map(({ occurredAt }) => occurredAt);
  return values.reduce<string | null>(
    (latest, value) => value && (!latest || value > latest) ? value : latest,
    null,
  );
}

function searchOrder(order: FactoryStyleStatusOrder) {
  return [
    order.brand,
    order.orderNo,
    order.styleName,
    ...order.workOrders.map(({ documentNo, status }) => `${documentNo} ${status ?? ""}`),
    ...order.processes.map(({ processName, status }) => `${processName} ${status}`),
    ...order.transfers.map(({ documentNo, status }) => `${documentNo} ${status ?? ""}`),
    ...order.finishedGoods.map(({ documentNo, status }) => `${documentNo} ${status ?? ""}`),
  ].filter(Boolean).join(" ");
}

function renderStepper(order: FactoryStyleStatusOrder, onSelect: (step: SelectedStep) => void) {
  const currentIndex = stepKeys.findIndex((key) => !stepIsComplete(order, key));
  const completedCount = currentIndex === -1 ? stepKeys.length : currentIndex;

  return (
    <ol aria-label={`Factory progress for ${order.orderNo}`} className="flex min-w-[36rem] items-start px-2 py-2">
      {stepKeys.map((key, index) => {
        const complete = stepIsComplete(order, key);
        const current = currentIndex === index;
        const Icon = stepIcons[key];
        const count = key === "production"
          ? `${order.processes.filter(processIsComplete).length}/${order.processes.length} processes complete`
          : key === "workOrders"
            ? `${order.workOrders.length} work orders`
            : key === "transfers"
              ? `${order.transfers.length} activities`
              : `${order.approvedFinishedGoodsQuantity.toLocaleString("en-IN")}/${order.plannedFinishedGoodsQuantity.toLocaleString("en-IN")} units approved`;
        const activities = key === "workOrders"
          ? order.workOrders
          : key === "transfers"
            ? order.transfers
            : order.finishedGoods;

        return (
          <li key={key} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {index < stepKeys.length - 1 && (
              <span
                className={`absolute left-1/2 top-4 h-0.5 w-full ${index < completedCount ? "bg-[var(--erp-brand)]" : "bg-[var(--erp-border)]"}`}
                aria-hidden="true"
              />
            )}
            <Button
              type="button"
              variant={complete ? "outline" : "secondary"}
              size="sm"
              aria-label={`${stepLabels[key]} ${complete ? "complete" : current ? "in progress" : "upcoming"} for ${order.orderNo}`}
              aria-current={current ? "step" : undefined}
              className={`relative z-10 h-8 min-h-8 w-8 shrink-0 rounded-full p-0 ${
                complete
                  ? "border-[var(--erp-brand)] bg-[var(--erp-brand)] text-white hover:bg-[var(--erp-brand-hover)]"
                  : current
                    ? "border-2 border-[var(--erp-brand)] bg-[var(--erp-surface)] text-[var(--erp-brand)] ring-4 ring-[var(--erp-brand-soft)]"
                    : "border-2 border-[var(--erp-border)] bg-[var(--erp-surface)] text-[var(--erp-muted)]"
              }`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(key === "production"
                  ? { key: "processes", title: stepLabels[key], processes: order.processes }
                  : { key: "activities", title: stepLabels[key], activities });
              }}
            >
              {complete ? <Check className="h-4 w-4" aria-hidden="true" /> : current ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5" aria-hidden="true" />}
            </Button>
            <span className={`mt-2 text-xs font-semibold ${complete || current ? "text-[var(--erp-brand)]" : "text-[var(--erp-muted)]"}`}>
              {stepLabels[key]}
            </span>
            <span className="mt-0.5 text-[11px] text-[var(--erp-muted)]">
              {key === "production" && order.processes.length === 0
                ? "No process plan"
                : `${count} · ${formatDate(stepDate(order, key))}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function FactoryStyleStatusPage({
  orders,
  organizationId,
}: {
  orders: FactoryStyleStatusOrder[];
  organizationId: string;
}) {
  const [visibleFields, setVisibleFields] = useState<(keyof FactoryStyleStatusOrder | string)[]>(
    reportFields.map(({ key }) => key),
  );
  const [selectedStep, setSelectedStep] = useState<SelectedStep>(null);

  return (
    <Page as="div">
      <Section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-[var(--erp-brand)]">Factory Management</p>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--erp-text)]">Factory Style Status</h1>
            <p className="max-w-3xl text-sm text-[var(--erp-muted)]">
              Follow each order through work-order release, process production, shop-floor movement, and finished-goods receipt.
            </p>
          </div>
          <Badge className="gap-1.5">
            <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
            {orders.length.toLocaleString("en-IN")} styles / orders
          </Badge>
        </div>

        <Card>
          <ReportGrid
            title="Factory style status report"
            records={orders}
            fields={reportFields}
            visibleFields={visibleFields}
            onVisibleFieldsChange={setVisibleFields}
            storageKey={`credence-craft-factory-style-status-${organizationId}`}
            rowIdSelector={(order) => order.id}
            selectedIds={[]}
            selectable={false}
            onRowClick={() => undefined}
            emptyMessage="No merchandising orders found for this organization."
            getSearchValue={(fieldKey, order) => (
              fieldKey === "brand" ? order.brand ?? ""
                : fieldKey === "orderNo" ? `${order.orderNo} ${order.styleName ?? ""}`
                  : fieldKey === "progress" ? searchOrder(order)
                    : ""
            )}
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
              if (fieldKey === "progress") return renderStepper(order, setSelectedStep);
              return "";
            }}
          />
        </Card>
      </Section>

      <Modal
        open={selectedStep !== null}
        onClose={() => setSelectedStep(null)}
        ariaLabelledBy="factory-style-status-title"
        size="lg"
      >
        {selectedStep && (
          <div className="space-y-5 p-6">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--erp-border)] pb-4">
              <div>
                <p className="text-sm font-medium text-[var(--erp-muted)]">Factory milestone details</p>
                <h2 id="factory-style-status-title" className="mt-1 text-xl font-bold text-[var(--erp-text)]">
                  {selectedStep.title}
                </h2>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedStep(null)} aria-label="Close milestone details">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {selectedStep.key === "processes" ? (
              selectedStep.processes.length === 0 ? (
                <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-5 text-sm text-[var(--erp-muted)]">
                  No process controller has been set up for this style’s work orders.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[38rem] text-left text-sm">
                    <thead className="border-b border-[var(--erp-border)] text-[var(--erp-muted)]">
                      <tr>
                        <th scope="col" className="px-3 py-3 font-medium">Process</th>
                        <th scope="col" className="px-3 py-3 font-medium">Planned</th>
                        <th scope="col" className="px-3 py-3 font-medium">Produced</th>
                        <th scope="col" className="px-3 py-3 font-medium">Completed</th>
                        <th scope="col" className="px-3 py-3 font-medium">Received</th>
                        <th scope="col" className="px-3 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--erp-border)]">
                      {selectedStep.processes.map((process) => (
                        <tr key={process.id}>
                          <th scope="row" className="px-3 py-4 font-semibold text-[var(--erp-text)]">{process.processName}</th>
                          <td className="px-3 py-4">{process.plannedQuantity.toLocaleString("en-IN")}</td>
                          <td className="px-3 py-4">{process.producedQuantity.toLocaleString("en-IN")}</td>
                          <td className="px-3 py-4">{process.completedQuantity.toLocaleString("en-IN")}</td>
                          <td className="px-3 py-4">{process.receivedQuantity.toLocaleString("en-IN")}</td>
                          <td className="px-3 py-4"><Badge>{process.status.replaceAll("_", " ")}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : selectedStep.activities.length === 0 ? (
              <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-5 text-sm text-[var(--erp-muted)]">
                No activity has been recorded for this milestone yet.
              </div>
            ) : (
              <ol className="space-y-3">
                {selectedStep.activities.map((activity) => (
                  <li key={activity.id} className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--erp-text)]">{activity.documentNo}</p>
                        <p className="mt-1 text-sm text-[var(--erp-muted)]">{formatDate(activity.occurredAt)}</p>
                      </div>
                      {activity.status && <Badge>{activity.status.replaceAll("_", " ")}</Badge>}
                    </div>
                    {activity.detail && <p className="mt-3 text-sm text-[var(--erp-text)]">{activity.detail}</p>}
                    {activity.createdBy && (
                      <p className="mt-2 text-xs text-[var(--erp-muted)]">Created by {activity.createdBy}</p>
                    )}
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
