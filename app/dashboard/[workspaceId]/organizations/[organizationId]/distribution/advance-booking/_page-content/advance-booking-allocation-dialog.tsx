"use client";

import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";

type BookingSize = {
  id: string;
  size: string;
  bookedQuantity: number;
  assignedQuantity: number;
  unassignedQuantity: number;
  fulfilledQuantity: number;
  assignmentStatus: string;
  fulfillmentStatus: string;
  generalInventoryAvailableQuantity: number;
  assignments: Array<{
    id: string;
    workOrderId: string;
    workOrderNo: string;
    assignedQuantity: number;
    fulfilledQuantity: number;
    remainingQuantity: number;
  }>;
};

type AllocationBooking = {
  id: string;
  bookingId: string;
  orderNo: string;
  orderSourceStatus: string;
  sizes: BookingSize[];
  totalUnassigned: number;
};

type WorkOrderSizeLine = {
  id: string;
  size: string;
  quantity: number;
  assignedQuantity: number;
  availableQuantity: number;
};

type AssignableWorkOrder = {
  id: string;
  workOrderNo: string;
  status: string;
  sizeLines: WorkOrderSizeLine[];
};

export type AdvanceBookingAllocationDialogProps = {
  booking: AllocationBooking | null;
  assignableWorkOrders: AssignableWorkOrder[];
  selectedWorkOrder: AssignableWorkOrder | null;
  selectedWorkOrderId: string;
  isLoading: boolean;
  isSaving: boolean;
  allocationPlan: "general-stock-first" | "work-order-only";
  error: string;
  plannedStockQuantity: (line: BookingSize) => number;
  plannedWorkOrderQuantity: (line: BookingSize) => number;
  matchingWorkOrderSizeLine: (workOrder: AssignableWorkOrder | null, size: string) => WorkOrderSizeLine | undefined;
  onWorkOrderChange: (id: string) => void;
  onAllocationPlanChange: (plan: "general-stock-first" | "work-order-only") => void;
  onClose: () => void;
  onSave: () => void;
};

export default function AdvanceBookingAllocationDialog({
  booking,
  assignableWorkOrders,
  selectedWorkOrder,
  selectedWorkOrderId,
  isLoading,
  isSaving,
  allocationPlan,
  error,
  plannedStockQuantity,
  plannedWorkOrderQuantity,
  matchingWorkOrderSizeLine,
  onWorkOrderChange,
  onAllocationPlanChange,
  onClose,
  onSave,
}: AdvanceBookingAllocationDialogProps) {
  return (
    <Modal
      open={booking !== null}
      onClose={() => {
        if (!isSaving) onClose();
      }}
      ariaLabelledBy="advance-booking-assignment-title"
      ariaDescribedBy="advance-booking-assignment-description"
      size="rectangle"
    >
      {booking ? (
        <div className="space-y-6 p-6">
          <header className="space-y-2">
            <h2 id="advance-booking-assignment-title" className="text-xl font-semibold text-slate-900">
              Allocate Booking
            </h2>
            <p id="advance-booking-assignment-description" className="text-sm text-slate-600">
              {booking.bookingId} · {booking.orderNo}. Choose an allocation plan and review the automatic size-wise quantities.
            </p>
          </header>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Booking balance", value: booking.totalUnassigned },
              {
                label: "Order type",
                value: booking.orderSourceStatus === "ARTICLE_BASED" ? "Article-based" : "Direct",
              },
              {
                label: booking.orderSourceStatus === "ARTICLE_BASED" && allocationPlan === "general-stock-first"
                  ? "Available to take from stock"
                  : "To work order",
                value: isLoading
                  ? "Loading..."
                  : booking.orderSourceStatus === "ARTICLE_BASED"
                    ? allocationPlan === "general-stock-first"
                      ? booking.sizes.reduce((sum, line) => sum + plannedStockQuantity(line), 0)
                      : booking.sizes.reduce((sum, line) => sum + plannedWorkOrderQuantity(line), 0)
                    : selectedWorkOrder
                      ? booking.totalUnassigned
                      : "Select below",
              },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>

          {isLoading ? (
            <p role="status" className="text-sm text-slate-600">Loading work orders for this booking...</p>
          ) : (
            <Select
              label={allocationPlan === "work-order-only"
                ? "Work Order (required)"
                : "Work Order for remaining quantities (optional)"}
              value={selectedWorkOrderId}
              onChange={(event) => onWorkOrderChange(event.target.value)}
              disabled={assignableWorkOrders.length === 0}
              options={[
                {
                  label: assignableWorkOrders.length
                    ? allocationPlan === "general-stock-first"
                      ? "Leave remaining quantity in Work Order Tracking"
                      : "Choose a work order"
                    : "No work orders available",
                  value: "",
                },
                ...assignableWorkOrders.map((workOrder) => ({
                  label: `${workOrder.workOrderNo} · ${workOrder.status}`,
                  value: workOrder.id,
                })),
              ]}
            />
          )}

          {booking.orderSourceStatus === "ARTICLE_BASED" ? (
            <section className="space-y-2" aria-labelledby="allocation-plan-label">
              <h3 id="allocation-plan-label" className="text-sm font-semibold text-slate-900">Allocation plan</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="card"
                  size="sm"
                  className={`min-h-0 w-full p-3 ${
                    allocationPlan === "general-stock-first"
                      ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)]"
                      : ""
                  }`}
                  aria-pressed={allocationPlan === "general-stock-first"}
                  disabled={isSaving}
                  onClick={() => onAllocationPlanChange("general-stock-first")}
                >
                  <span className="block text-sm font-semibold">Use available General Stock first</span>
                  <span className="block whitespace-normal text-xs font-normal text-slate-600">
                    Submit matching stock by itself. Any balance stays in Work Order Tracking unless you select a Work Order.
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="card"
                  size="sm"
                  className={`min-h-0 w-full p-3 ${
                    allocationPlan === "work-order-only"
                      ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)]"
                      : ""
                  }`}
                  aria-pressed={allocationPlan === "work-order-only"}
                  disabled={isSaving}
                  onClick={() => onAllocationPlanChange("work-order-only")}
                >
                  <span className="block text-sm font-semibold">Allocate full quantity to Work Order</span>
                  <span className="block whitespace-normal text-xs font-normal text-slate-600">
                    Leave General Stock untouched and assign the full balance.
                  </span>
                </Button>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Size-wise allocation</h3>
              <p className="text-sm text-slate-600">
                {booking.orderSourceStatus === "ARTICLE_BASED"
                  ? allocationPlan === "general-stock-first"
                    ? selectedWorkOrder
                      ? "Available stock is used first. The remaining quantity is assigned to the selected Work Order."
                      : "Available stock can be submitted by itself. Any balance remains in Work Order Tracking."
                    : "The full remaining quantity for each size will be assigned to the work order."
                  : "Direct orders have no reusable Article stock. Allocate quantities to a work order only."}
              </p>
            </div>
            <div className="max-w-full overflow-x-auto rounded-lg border border-[var(--erp-border)]">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead className="border-b border-[var(--erp-border)] bg-[var(--erp-surface-soft)] text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th scope="col" className="px-3 py-3">Size</th>
                    <th scope="col" className="px-3 py-3">Booking balance</th>
                    {booking.orderSourceStatus === "ARTICLE_BASED" ? (
                      <>
                        <th scope="col" className="px-3 py-3">General stock</th>
                        <th scope="col" className="px-3 py-3">Take from stock</th>
                      </>
                    ) : null}
                    <th scope="col" className="px-3 py-3">Work-order balance</th>
                    <th scope="col" className="px-3 py-3">Assign to work order</th>
                    <th scope="col" className="px-3 py-3">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--erp-border)]">
                  {booking.sizes.map((line) => {
                    const stockQuantity = plannedStockQuantity(line);
                    const quantityToWorkOrder = plannedWorkOrderQuantity(line);
                    const workOrderLine = matchingWorkOrderSizeLine(selectedWorkOrder, line.size);
                    const workOrderBalance = workOrderLine?.availableQuantity ?? 0;
                    const notYetAllocated = Math.max(line.unassignedQuantity - stockQuantity - quantityToWorkOrder, 0);

                    return (
                      <tr key={line.id}>
                        <td className="px-3 py-3 font-medium text-slate-900">{line.size}</td>
                        <td className="px-3 py-3">{line.unassignedQuantity}</td>
                        {booking.orderSourceStatus === "ARTICLE_BASED" ? (
                          <>
                            <td className="px-3 py-3">{line.generalInventoryAvailableQuantity}</td>
                            <td className="px-3 py-3 font-medium">{stockQuantity}</td>
                          </>
                        ) : null}
                        <td className="px-3 py-3">
                          {selectedWorkOrder
                            ? workOrderLine?.availableQuantity ?? "Size unavailable"
                            : allocationPlan === "general-stock-first"
                              ? "Optional"
                              : "Select a work order"}
                        </td>
                        <td className="px-3 py-3 font-medium">{quantityToWorkOrder}</td>
                        <td className="px-3 py-3">
                          {selectedWorkOrder && quantityToWorkOrder > workOrderBalance
                            ? `${quantityToWorkOrder - workOrderBalance} over work-order balance`
                            : notYetAllocated}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {booking.sizes.some((line) => line.assignments.length > 0) ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Existing work-order assignments</h3>
              <ul className="space-y-1 text-sm text-slate-600">
                {booking.sizes.flatMap((line) => line.assignments.map((assignment) => (
                  <li key={assignment.id}>
                    {line.size}: {assignment.workOrderNo} · {assignment.assignedQuantity} assigned · {assignment.fulfilledQuantity} fulfilled
                  </li>
                )))}
              </ul>
            </section>
          ) : null}
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--erp-border)] pt-4">
            <p className="text-sm text-slate-600">
              General Stock can be submitted alone. Any unassigned balance stays in Work Order Tracking; selected stock and Work Order allocations save together.
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={onSave}
                disabled={isLoading || isSaving || (
                  !booking.sizes.some((line) => plannedStockQuantity(line) > 0 || plannedWorkOrderQuantity(line) > 0) ||
                  (booking.sizes.some((line) => plannedWorkOrderQuantity(line) > 0) && !selectedWorkOrder)
                ) || booking.sizes.some((line) => {
                  const workOrderLine = matchingWorkOrderSizeLine(selectedWorkOrder, line.size);
                  return plannedWorkOrderQuantity(line) > (workOrderLine?.availableQuantity ?? 0);
                })}
              >
                {isSaving ? "Saving allocation..." : "Save Allocation"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
