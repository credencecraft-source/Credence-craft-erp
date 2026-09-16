"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import ProcessTab from "@/app/dashboard/[workspaceId]/organizations/[organizationId]/order-management/merchandising/order/[orderId]/components/ProcessTab";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type WorkOrderTab = "details" | "finishedGoods" | "bom" | "process";

type WorkOrderLine = {
  id?: string;
  source_finished_goods_id?: string;
  sourceFinishedGoodsId?: string;
  size?: string | null;
  buyerSize?: string | null;
  quantity?: number;
};

type WorkOrderBomLine = {
  id: string;
  sourceBomItemId: string;
  categoryType: string | null;
  category: string | null;
  subCategory: string | null;
  rawMaterialName: string | null;
  size: string | null;
  workOrderQty: number;
  internalConsumption: number | null;
  requiredQty: number;
  itemWiseExcessPercentage: number | null;
  itemWiseExcessQty: number;
  totalRequiredQty: number;
};

type WorkOrderDetail = {
  id: string;
  workOrderNo: string;
  orderNo: string;
  article: string | null;
  styleName: string | null;
  buyer: string | null;
  totalQty: number;
  status: string;
  createdAt: string;
  sizeLines: WorkOrderLine[];
  bomLines: WorkOrderBomLine[];
  processController?: {
    processes?: Array<Record<string, unknown>>;
  } | null;
};

type OrderRecord = {
  id: string;
  orderNo: string;
  article: string | null;
  styleName: string | null;
  buyer: string | null;
  orderQty: number | null;
  bomItems?: Array<Record<string, unknown>>;
  processTemplate?: { id?: string; process_name?: string; Process_Template_Name?: string } | null;
  processSteps?: Array<Record<string, unknown>>;
};

export default function FactoryWorkOrderDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; workOrderId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const organizationId = params?.organizationId;
  const workspaceId = params?.workspaceId;
  const workOrderId = params?.workOrderId;
  const orderNo = searchParams.get("orderNo")?.trim();

  const [activeTab, setActiveTab] = useState<WorkOrderTab>("details");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [workOrder, setWorkOrder] = useState<WorkOrderDetail | null>(null);
  const [orderRecord, setOrderRecord] = useState<OrderRecord | null>(null);
  const [form, setForm] = useState({
    processTemplateId: "",
    processRows: [] as Array<Record<string, unknown>>,
    rows: [] as Array<Record<string, unknown>>,
    bomRows: [] as Array<Record<string, unknown>>,
    orderNo: "",
    article: "",
    styleName: "",
    buyer: "",
    totalQty: 0,
    status: "OPEN",
  });

  useEffect(() => {
    if (!organizationId || !orderNo || !workOrderId) {
      setError("Work order details could not be loaded.");
      setLoading(false);
      return;
    }

    let active = true;
    const loadDetails = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}&orderNo=${encodeURIComponent(orderNo)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load work order details.");

        const selectedWorkOrder = Array.isArray(data?.workOrders)
          ? data.workOrders.find((item: WorkOrderDetail) => item.id === workOrderId) ?? data.workOrders[0]
          : null;

        if (!selectedWorkOrder && !data?.order) throw new Error("Selected work order was not found.");

        const orderDetails = data?.order ?? null;
        if (active) {
          setWorkOrder(selectedWorkOrder ?? {
            id: workOrderId,
            workOrderNo: "-",
            orderNo: orderNo,
            article: orderDetails?.article ?? null,
            styleName: orderDetails?.styleName ?? null,
            buyer: orderDetails?.buyer ?? null,
            totalQty: Number(orderDetails?.orderQty ?? 0),
            status: "OPEN",
            createdAt: new Date().toISOString(),
            sizeLines: [],
                      bomLines: [],
          });

          if (orderDetails?.id) {
            const orderResponse = await fetch(`/api/orders/${encodeURIComponent(orderDetails.id)}?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
            const orderData = await orderResponse.json();
            if (orderResponse.ok) {
              const sourceOrder = orderData.order ?? null;
              const mappedProcessRows = Array.isArray(sourceOrder?.processSteps)
                ? sourceOrder.processSteps.map((step: any, index: number) => ({
                    id: step.id,
                    processId: step.process_id ?? step.process?.id,
                    processName: step.process_name ?? step.process?.process_name,
                    operation: step.process_name ?? step.process?.process_name,
                    slNo: step.sl_no ?? index + 1,
                    operationTemplateName: step.operation_template_name ?? step.operationTemplateName ?? null,
                    operations: Array.isArray(step.operations) ? step.operations.map((operation: any) => ({
                      id: operation.id,
                      sourceOperationId: operation.source_operation_template_step_id ?? operation.sourceOperationId,
                      operation: operation.operation,
                      slNo: operation.sl_no,
                      price: operation.price !== null && operation.price !== undefined ? Number(operation.price) : 0,
                    })) : [],
                  }))
                : [];

              setOrderRecord(sourceOrder);
              const workOrderProcessRows = Array.isArray(selectedWorkOrder?.processController?.processes)
                ? selectedWorkOrder.processController.processes.map((process: Record<string, any>) => ({
                    id: process.id,
                    processId: process.processId,
                    processName: process.processName,
                    operation: process.processName,
                    slNo: process.slNo,
                    operations: Array.isArray(process.operations) ? process.operations.map((operation: Record<string, any>) => ({
                      id: operation.id,
                      sourceOperationId: operation.sourceOperationId,
                      operation: operation.operation,
                      slNo: operation.slNo,
                      price: operation.budgetedPrice,
                    })) : [],
                  }))
                : mappedProcessRows;
              setForm({
                processTemplateId: sourceOrder?.processTemplate?.id ?? sourceOrder?.process_template_id ?? "",
                processRows: workOrderProcessRows,
                rows: Array.isArray(sourceOrder?.finishedGoods) ? sourceOrder.finishedGoods : [],
                bomRows: Array.isArray(sourceOrder?.bomItems) ? sourceOrder.bomItems : [],
                orderNo: sourceOrder?.orderNo ?? orderNo,
                article: sourceOrder?.article ?? selectedWorkOrder.article ?? "",
                styleName: sourceOrder?.styleName ?? selectedWorkOrder.styleName ?? "",
                buyer: sourceOrder?.buyer ?? selectedWorkOrder.buyer ?? "",
                totalQty: Number(selectedWorkOrder?.totalQty ?? 0),
                status: selectedWorkOrder.status ?? "OPEN",
              });
            }
          }
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load work order details.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadDetails();
    return () => {
      active = false;
    };
  }, [organizationId, orderNo, workOrderId]);

  const tabs = useMemo(() => [
    { id: "details", label: "General Details" },
    { id: "finishedGoods", label: "Finished Goods", count: workOrder?.sizeLines?.length ?? 0 },
    { id: "bom", label: "BOM", count: orderRecord?.bomItems?.length ?? 0 },
    { id: "process", label: "Process", count: orderRecord?.processSteps?.length ?? 0 },
  ] as const, [orderRecord, workOrder]);

  async function saveWorkOrder() {
    if (!workOrder || !organizationId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/factory/work-orders/${encodeURIComponent(workOrder.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          status: form.status,
          lines: workOrder.sizeLines.map((line) => ({
            sourceFinishedGoodsId: line.source_finished_goods_id ?? line.sourceFinishedGoodsId,
            quantity: Number(line.quantity ?? 0),
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save work order.");
      setWorkOrder((current) => current ? { ...current, totalQty: Number(data.workOrder.total_qty), status: data.workOrder.status, sizeLines: data.workOrder.sizeLines } : current);
        setWorkOrder((current) => current ? { ...current, totalQty: Number(data.workOrder.total_qty), status: data.workOrder.status, sizeLines: data.workOrder.sizeLines, bomLines: data.workOrder.bomLines ?? current.bomLines } : current);
      setForm((current) => ({ ...current, totalQty: Number(data.workOrder.total_qty), status: data.workOrder.status }));
      setMessage("Work order updated successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save work order.");
    } finally {
      setSaving(false);
    }
  }

  async function removeWorkOrder() {
    if (!workOrder || !organizationId || !window.confirm(`Delete work order ${workOrder.workOrderNo}?`)) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/factory/work-orders/${encodeURIComponent(workOrder.id)}?organizationId=${encodeURIComponent(organizationId)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete work order.");
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/pre-production/work-order/dashboard/work-orders`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete work order.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <Page as="div">
        <Section className="space-y-6">
          <Card className="border-slate-200 p-6 text-sm text-slate-600">Loading work order details...</Card>
        </Section>
      </Page>
    );
  }

  if (error || !workOrder) {
    return (
      <Page as="div">
        <Section className="space-y-6">
          <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{error || "Work order not found."}</Card>
        </Section>
      </Page>
    );
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                ← Back
              </button>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Work Order</p>
                <h1 className="text-xl font-bold text-slate-900">{workOrder.workOrderNo}</h1>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void saveWorkOrder()}
              disabled={saving || deleting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Work Order"}
            </button>
            <button
              type="button"
              onClick={() => void removeWorkOrder()}
              disabled={saving || deleting}
              className="rounded-lg border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete Work Order"}
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === tab.id
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {tab.label}{"count" in tab && tab.count ? ` (${tab.count})` : ""}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}

        {activeTab === "details" && (
          <Card className="border-slate-200 p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
                Order No
                <input
                  value={form.orderNo}
                  readOnly
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-500"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
                Article
                <input
                  value={form.article}
                  readOnly
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-500"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
                Style Name
                <input
                  value={form.styleName}
                  readOnly
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-500"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
                Buyer
                <input
                  value={form.buyer}
                  readOnly
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-500"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
                Work Order No
                <input
                  value={workOrder.workOrderNo}
                  readOnly
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-500"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
                Status
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="OPEN">OPEN</option>
                  <option value="IN PRODUCTION">IN PRODUCTION</option>
                  <option value="READY FOR PACKING">READY FOR PACKING</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
                Created
                <input
                  value={new Date(workOrder.createdAt).toLocaleDateString("en-IN")}
                  readOnly
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-500"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
                Total Qty
                <input
                  type="number"
                  value={form.totalQty}
                  readOnly
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-500"
                />
              </label>
            </div>
          </Card>
        )}

        {activeTab === "finishedGoods" && (
          <Card className="border-slate-200 p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Work Order Finished Goods</h2>
                <p className="mt-1 text-xs text-slate-500">These rows belong to this work order and are stored separately from the parent order quantities.</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Work Order Total</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{workOrder.totalQty.toLocaleString("en-IN")}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Size</th>
                    <th className="px-3 py-2 font-semibold">Buyer Size</th>
                    <th className="px-3 py-2 text-right font-semibold">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workOrder.sizeLines.length > 0 ? (
                    workOrder.sizeLines.map((line, index) => (
                      <tr key={`${line.id ?? index}-${line.size ?? "size"}`}>
                        <td className="px-3 py-3 font-medium text-slate-700">{line.size || "-"}</td>
                        <td className="px-3 py-3 text-slate-600">{line.buyerSize || "-"}</td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number"
                            min="0"
                            value={line.quantity ?? 0}
                            onChange={(event) => {
                              const quantity = Math.max(Number(event.target.value || 0), 0);
                              setWorkOrder((current) => {
                                if (!current) return current;
                                const sizeLines = current.sizeLines.map((currentLine, currentIndex) => currentIndex === index ? { ...currentLine, quantity } : currentLine);
                                return { ...current, sizeLines, totalQty: sizeLines.reduce((total, sizeLine) => total + Number(sizeLine.quantity ?? 0), 0) };
                              });
                              setForm((current) => ({ ...current, totalQty: workOrder.sizeLines.reduce((total, sizeLine, currentIndex) => total + (currentIndex === index ? quantity : Number(sizeLine.quantity ?? 0)), 0) }));
                            }}
                            className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none"
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-slate-500">No size rows are attached to this work order yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end border-t border-slate-100 pt-3 text-sm font-bold text-slate-900">
              Allocation total: {workOrder.sizeLines.reduce((total, line) => total + Number(line.quantity ?? 0), 0).toLocaleString("en-IN")}
            </div>
          </Card>
        )}

        {activeTab === "bom" && (
          <Card className="border-slate-200 p-5">
            {workOrder.bomLines.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Raw Material</th>
                      <th className="px-3 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 font-semibold">Size</th>
                      <th className="px-3 py-2 text-right font-semibold">Work Order Qty</th>
                      <th className="px-3 py-2 text-right font-semibold">Required Qty</th>
                      <th className="px-3 py-2 text-right font-semibold">Total With Excess</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workOrder.bomLines.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-3 font-medium text-slate-700">{item.rawMaterialName || "-"}</td>
                        <td className="px-3 py-3 text-slate-600">{item.category || "-"}</td>
                        <td className="px-3 py-3 text-slate-600">{item.size || "-"}</td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-900">{Number(item.workOrderQty ?? 0).toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-900">{Number(item.requiredQty ?? 0).toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-semibold text-emerald-700">{Number(item.totalRequiredQty ?? 0).toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                    {workOrder.bomLines.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No BOM rows are linked to this work order yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No BOM rows are linked to this work order yet.</p>
            )}
          </Card>
        )}

        {activeTab === "process" && (
          <div className="space-y-4">
            {(form.processRows?.length ?? 0) > 0 ? (
              <ProcessTab form={form} setForm={setForm} organizationId={organizationId} isOrderLoading />
            ) : (
              <Card className="border-slate-200 p-5">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  No process template is linked to this work order yet. The process will be auto-created from the order template when the work order is created.
                </div>
              </Card>
            )}
          </div>
        )}
      </Section>
    </Page>
  );
}
