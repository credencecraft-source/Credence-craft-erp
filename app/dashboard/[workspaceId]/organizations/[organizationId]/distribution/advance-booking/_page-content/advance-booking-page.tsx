"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { ReportGrid } from "@/components/reports/report-grid-display";
import {
  validateBookingQuotationSelection,
} from "@/lib/services/distribution/quotation-selection-service";

type SizeKey = string;

type OrderRecord = {
  id: string;
  orderNo: string;
  entityName?: string | null;
  buyer?: string | null;
  brand?: string | null;
  styleName?: string | null;
  deliveryDate?: string | null;
  orderQty?: number | null;
  finalStatus?: string | null;
};

type OrderDetails = OrderRecord & {
  finishedGoods?: Array<{
    size?: string | null;
    buyerSize?: string | null;
    beforeExcessQty?: number | null;
    totalQty?: number | null;
  }>;
};

type VendorOption = {
  id: string;
  label: string;
};

type BookingRecord = {
  id: string;
  bookingId: string;
  orderId: string;
  vendorId: string;
  orderNo: string;
  customer: string;
  brand: string;
  styleName: string;
  deliveryDate: string;
  sizes: Array<{
    id: string;
    size: string;
    bookedQuantity: number;
    assignedQuantity: number;
    unassignedQuantity: number;
    fulfilledQuantity: number;
    assignmentStatus: string;
    fulfillmentStatus: string;
    assignments: Array<{
      id: string;
      workOrderId: string;
      workOrderNo: string;
      assignedQuantity: number;
      fulfilledQuantity: number;
      remainingQuantity: number;
    }>;
  }>;
  createdAt: string;
  totalBooked: number;
  totalAssigned: number;
  totalUnassigned: number;
  totalFulfilled: number;
  assignmentStatus: string;
  fulfillmentStatus: string;
};

type AssignableWorkOrder = {
  id: string;
  workOrderNo: string;
  status: string;
  sizeLines: Array<{
    id: string;
    size: string;
    quantity: number;
    assignedQuantity: number;
    availableQuantity: number;
  }>;
};

type BookingReportField =
  | "bookingId"
  | "orderNo"
  | "customer"
  | "brand"
  | "styleName"
  | "totalBooked"
  | "totalAssigned"
  | "assignmentStatus"
  | "fulfillmentStatus"
  | "createdAt";

type BookingReportRow = BookingRecord & { sizeSummary: string };

const bookingReportFields: Array<{ key: BookingReportField; label: string }> = [
  { key: "assignmentStatus", label: "Work Order Assignment" },
  { key: "fulfillmentStatus", label: "Fulfillment Status" },
  { key: "bookingId", label: "Booking ID" },
  { key: "orderNo", label: "Order No" },
  { key: "customer", label: "Vendor" },
  { key: "brand", label: "Brand" },
  { key: "styleName", label: "Style" },
  { key: "totalBooked", label: "Total Qty" },
  { key: "totalAssigned", label: "Assigned Qty" },
  { key: "createdAt", label: "Created Date" },
];

function orderBookingReportFields(fields: BookingReportField[]) {
  const selected = new Set(fields);
  return bookingReportFields
    .map(({ key }) => key)
    .filter((key) => selected.has(key));
}

const emptySizes = (): Record<string, number> => ({});

export default function AdvanceBookingPage({ view = "booking" }: { view?: "booking" | "fulfillment" } = {}) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params?.organizationId ?? "demo-org";

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [nextOrderCursor, setNextOrderCursor] = useState<string | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingMoreOrders, setIsLoadingMoreOrders] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [vendorsError, setVendorsError] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [orderDetailsRetry, setOrderDetailsRetry] = useState(0);
  const [orderDetails, setOrderDetails] = useState<{ id: string; order: OrderDetails } | null>(null);
  const [orderDetailsError, setOrderDetailsError] = useState("");
  const [entry, setEntry] = useState<Record<string, number>>(emptySizes());
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [isCreatingQuotation, setIsCreatingQuotation] = useState(false);
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [bookingsError, setBookingsError] = useState("");
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [assignmentBooking, setAssignmentBooking] = useState<BookingRecord | null>(null);
  const [assignableWorkOrders, setAssignableWorkOrders] = useState<AssignableWorkOrder[]>([]);
  const [selectedAssignmentWorkOrderId, setSelectedAssignmentWorkOrderId] = useState("");
  const [assignmentQuantities, setAssignmentQuantities] = useState<Record<string, number>>({});
  const [isLoadingAssignment, setIsLoadingAssignment] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [visibleReportFields, setVisibleReportFields] = useState<BookingReportField[]>(
    bookingReportFields.map(({ key }) => key),
  );

  const loadBookings = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingBookings(true);
    setBookingsError("");
    try {
      const query = new URLSearchParams({ organizationId });
      const response = await fetch(`/api/distribution/advance-bookings?${query}`, {
        cache: "no-store",
        signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.bookings)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load advance bookings.");
      }
      setBookings(data.bookings);
    } catch (loadError) {
      if (!signal?.aborted) {
        setBookingsError(loadError instanceof Error ? loadError.message : "Unable to load advance bookings.");
      }
    } finally {
      if (!signal?.aborted) setIsLoadingBookings(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = window.setTimeout(() => void loadBookings(controller.signal), 0);
    return () => {
      window.clearTimeout(initialLoad);
      controller.abort();
    };
  }, [loadBookings]);

  const selectedOrder = orderDetails?.id === selectedOrderId ? orderDetails.order : null;
  const selectedVendor = vendors.find((vendor) => vendor.id === selectedVendorId) ?? null;
  const finishedGoodsBySize = useMemo(() => {
    const sizes = emptySizes();
    for (const row of selectedOrder?.finishedGoods ?? []) {
      const size = String(row.size?.trim() || row.buyerSize?.trim() || "").toUpperCase();
      if (!size) continue;
      const quantity = Number(row.totalQty ?? row.beforeExcessQty ?? 0);
      if (Number.isSafeInteger(quantity) && quantity > 0) {
        sizes[size] = (sizes[size] ?? 0) + quantity;
      }
    }
    return sizes;
  }, [selectedOrder]);

  const orderBookings = useMemo(
    () => bookings.filter((booking) => booking.orderId === selectedOrderId),
    [bookings, selectedOrderId],
  );

  const bookedTotals = useMemo(() => {
    const totals = emptySizes();
    for (const booking of orderBookings) {
      booking.sizes.forEach(({ size, bookedQuantity }) => {
        totals[size] = (totals[size] ?? 0) + bookedQuantity;
      });
    }
    return totals;
  }, [orderBookings]);

  const reportRows = useMemo<BookingReportRow[]>(
    () =>
      bookings
        .filter((booking) => Boolean(booking.orderId))
        .map((booking) => ({
          ...booking,
          sizeSummary: booking.sizes
            .filter((line) => line.bookedQuantity > 0)
            .map((line) => `${line.size}: ${line.bookedQuantity}`)
            .join(", "),
        })),
    [bookings],
  );
  const selectedReportBookings = useMemo(
    () => reportRows.filter((booking) => selectedBookingIds.includes(booking.bookingId)),
    [reportRows, selectedBookingIds],
  );
  const quotationSelectionError = validateBookingQuotationSelection(selectedReportBookings);
  const selectedAssignmentWorkOrder = assignableWorkOrders.find(
    (workOrder) => workOrder.id === selectedAssignmentWorkOrderId,
  ) ?? null;

  const loadInitialOrders = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingOrders(true);
    setOrdersError("");
    try {
      const query = new URLSearchParams({ organizationId, limit: "100" });
      const response = await fetch(`/api/orders?${query.toString()}`, {
        cache: "no-store",
        signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.orders)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load organization orders.");
      }
      setOrders(data.orders);
      setNextOrderCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
      setSelectedOrderId((current) => current || data.orders[0]?.id || "");
    } catch (loadError) {
      if (signal?.aborted) return;
      setOrdersError(loadError instanceof Error ? loadError.message : "Unable to load organization orders.");
    } finally {
      if (!signal?.aborted) setIsLoadingOrders(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = window.setTimeout(() => {
      void loadInitialOrders(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(initialLoad);
      controller.abort();
    };
  }, [loadInitialOrders]);

  const loadVendors = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingVendors(true);
    setVendorsError("");
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/master-data/vendor?includeInactive=false&includeDummyData=true`,
        {
        cache: "no-store",
        signal,
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load Vendor Master.");
      }
      const options = data
        .filter((value: { id?: string; label?: string }) => typeof value?.id === "string" && typeof value?.label === "string" && value.label.trim())
        .map((value: { id: string; label: string }) => ({ id: value.id, label: value.label.trim() }))
        .sort((left: VendorOption, right: VendorOption) => left.label.localeCompare(right.label));
      setVendors(options);
      setSelectedVendorId((current) => options.some((vendor: VendorOption) => vendor.id === current) ? current : "");
    } catch (loadError) {
      if (signal?.aborted) return;
      setVendorsError(loadError instanceof Error ? loadError.message : "Unable to load Vendor Master.");
    } finally {
      if (!signal?.aborted) setIsLoadingVendors(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = window.setTimeout(() => {
      void loadVendors(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(initialLoad);
      controller.abort();
    };
  }, [loadVendors]);

  useEffect(() => {
    if (!selectedOrderId) return;

    const controller = new AbortController();
    const query = new URLSearchParams({ organizationId });
    void fetch(`/api/orders/${encodeURIComponent(selectedOrderId)}?${query.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.order || typeof data.order.id !== "string") {
          throw new Error("Unable to load the selected order’s finished-goods sizes.");
        }
        if (!controller.signal.aborted) {
          setOrderDetails({ id: selectedOrderId, order: data.order });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setOrderDetailsError("Unable to load the selected order’s finished-goods sizes.");
        }
      });

    return () => controller.abort();
  }, [organizationId, orderDetailsRetry, selectedOrderId]);

  async function loadMoreOrders() {
    if (!nextOrderCursor || isLoadingMoreOrders) return;
    setIsLoadingMoreOrders(true);
    setOrdersError("");
    try {
      const query = new URLSearchParams({
        organizationId,
        limit: "100",
        cursor: nextOrderCursor,
      });
      const response = await fetch(`/api/orders?${query.toString()}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.orders)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load more organization orders.");
      }
      setOrders((current) => {
        const knownIds = new Set(current.map((order) => order.id));
        return [...current, ...data.orders.filter((order: OrderRecord) => !knownIds.has(order.id))];
      });
      setNextOrderCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (loadError) {
      setOrdersError(loadError instanceof Error ? loadError.message : "Unable to load more organization orders.");
    } finally {
      setIsLoadingMoreOrders(false);
    }
  }

  function updateEntry(size: SizeKey, value: string) {
    const parsed = value === "" ? 0 : Number(value);
    setEntry((current) => ({
      ...current,
      [size]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (bookingsError) {
      setError(bookingsError);
      return;
    }

    if (!selectedOrder) {
      setError("Select an order before submitting the advance booking.");
      return;
    }
    if (!selectedVendor) {
      setError("Select a customer from Vendor Master before submitting the advance booking.");
      return;
    }
    if (orderDetailsError) {
      setError(orderDetailsError);
      return;
    }
    if (!selectedOrder.finishedGoods?.length) {
      setError("The selected order has no finished-goods size quantities to book.");
      return;
    }

    const quantities: Record<string, number> = {};
    let totalBooked = 0;

    for (const size of Object.keys(finishedGoodsBySize)) {
      const quantity = Number(entry[size] || 0);
      if (!Number.isSafeInteger(quantity) || quantity < 0) {
        setError(`Quantity for size ${size} must be a whole number greater than or equal to zero.`);
        return;
      }
      if (quantity > 0) quantities[size] = quantity;
      totalBooked += quantity;
    }

    if (totalBooked <= 0) {
      setError("Enter at least one size quantity before submitting the advance booking.");
      return;
    }

    const exceedsBalance = Object.keys(finishedGoodsBySize).some((size) =>
      (quantities[size] ?? 0) > finishedGoodsBySize[size] - (bookedTotals[size] ?? 0),
    );
    if (exceedsBalance) {
      setError("One or more quantities exceed the remaining order balance for that size.");
      return;
    }

    try {
      setIsSubmittingBooking(true);
      const response = await fetch("/api/distribution/advance-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          orderId: selectedOrder.id,
          vendorId: selectedVendor.id,
          sizes: Object.entries(quantities).map(([size, quantity]) => ({ size, quantity })),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.booking) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to save advance booking.");
      }
      await loadBookings();
      setEntry(emptySizes());
      setStatus(`Advance booking ${data.booking.bookingId} submitted.`);
      setIsCreating(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save advance booking.");
    } finally {
      setIsSubmittingBooking(false);
    }
  }

  async function openAssignment(booking: BookingRecord) {
    setAssignmentBooking(booking);
    setSelectedAssignmentWorkOrderId("");
    setAssignmentQuantities({});
    setAssignmentError("");
    setIsLoadingAssignment(true);
    try {
      const query = new URLSearchParams({
        organizationId,
        assignableWorkOrdersFor: booking.id,
      });
      const response = await fetch(`/api/distribution/advance-bookings?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.workOrders)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load work orders for this booking.");
      }
      setAssignableWorkOrders(data.workOrders);
    } catch (loadError) {
      setAssignmentError(loadError instanceof Error ? loadError.message : "Unable to load work orders for this booking.");
    } finally {
      setIsLoadingAssignment(false);
    }
  }

  async function saveWorkOrderAssignment() {
    if (!assignmentBooking || !selectedAssignmentWorkOrder) {
      setAssignmentError("Select a work order before assigning this booking.");
      return;
    }
    setIsSavingAssignment(true);
    setAssignmentError("");
    try {
      const response = await fetch(`/api/distribution/advance-bookings/${encodeURIComponent(assignmentBooking.id)}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          workOrderId: selectedAssignmentWorkOrder.id,
          lines: assignmentBooking.sizes.map((line) => ({
            bookingSizeLineId: line.id,
            assignedQuantity: assignmentQuantities[line.id] ?? 0,
          })),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok !== true) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to assign this booking.");
      }
      await loadBookings();
      setAssignmentBooking(null);
      setStatus(`Booking ${assignmentBooking.bookingId} assigned to ${selectedAssignmentWorkOrder.workOrderNo}.`);
    } catch (saveError) {
      setAssignmentError(saveError instanceof Error ? saveError.message : "Unable to assign this booking.");
    } finally {
      setIsSavingAssignment(false);
    }
  }

  function startCreating() {
    setError("");
    setStatus("");
    setIsCreating(true);
  }

  async function createQuotationFromSelectedBookings(selectedBookings: BookingRecord[]) {
    setError("");
    setStatus("");
    if (quotationSelectionError || isCreatingQuotation) {
      setError(quotationSelectionError || "Wait for the current quotation to finish saving.");
      return;
    }
    setIsCreatingQuotation(true);
    try {
      const response = await fetch("/api/distribution/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          bookingIds: selectedBookings.map((booking) => booking.id),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.quotation || typeof data.quotation.id !== "string") {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to create the quotation.");
      }
      setSelectedBookingIds([]);
      router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/distribution/quotation/${encodeURIComponent(data.quotation.id)}`);
    } catch (quotationError) {
      setError(quotationError instanceof Error ? quotationError.message : "Unable to create the quotation.");
    } finally {
      setIsCreatingQuotation(false);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-3 p-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="erp-eyebrow">{view === "fulfillment" ? "Distribution / Fulfillment" : "Distribution / Order"}</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{view === "fulfillment" ? "Fulfillment" : "Advance Booking"}</h1>
        </div>
        {isCreating ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setIsCreating(false);
              setError("");
            }}
          >
            Back to Advance Bookings
          </Button>
        ) : null}
      </div>

      {ordersError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span>{ordersError}</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => void loadInitialOrders()} disabled={isLoadingOrders}>
            Retry loading orders
          </Button>
        </div>
      ) : null}

      {bookingsError ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {bookingsError}
        </p>
      ) : null}
      {!bookingsError && !isLoadingBookings ? (
        <p role="status" className="rounded-md border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] px-3 py-2 text-sm text-slate-700">
          Advance bookings are saved to this organization’s database and shared across users. Bookings made in the older browser-only version are not included in this database register.
        </p>
      ) : null}

      {status ? (
        <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {status}
        </p>
      ) : null}
      {!isCreating && error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {isCreating ? (
        <Card className="space-y-3 p-3 shadow-none">
          <form onSubmit={handleSubmit} className="space-y-3">
            <section className="space-y-3">
              <div className="border-b border-slate-200 pb-2">
                <h2 className="text-base font-semibold text-slate-900">Advance Booking Header</h2>
                <p className="mt-1 text-sm text-slate-600">Choose an order and customer, then enter quantities by finished-goods size.</p>
              </div>
              <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Input label="Booking ID" value="Generated when saved" readOnly />
                <Select
                  label="Order No"
                  value={selectedOrderId}
                  onChange={(event) => {
                    setSelectedOrderId(event.target.value);
                    setEntry(emptySizes());
                    setError("");
                    setOrderDetailsError("");
                  }}
                  options={orders.map((order) => ({
                    label: `${order.orderNo}${order.entityName || order.buyer ? ` · ${order.entityName ?? order.buyer}` : ""}`,
                    value: order.id,
                  }))}
                  disabled={isLoadingOrders || orders.length === 0}
                  required
                />
                <Select
                  label="Customer (Vendor Master)"
                  value={selectedVendorId}
                  onChange={(event) => {
                    setSelectedVendorId(event.target.value);
                    setError("");
                  }}
                  options={[
                    { label: isLoadingVendors ? "Loading Vendor Master..." : "Select customer", value: "" },
                    ...vendors.map((vendor) => ({ label: vendor.label, value: vendor.id })),
                  ]}
                  disabled={isLoadingVendors || vendors.length === 0}
                  required
                />
                <Input label="Brand" value={selectedOrder?.brand ?? ""} readOnly />
                <Input label="Style" value={selectedOrder?.styleName ?? ""} readOnly />
                <Input label="Delivery Date" type="date" value={selectedOrder?.deliveryDate?.slice(0, 10) ?? ""} readOnly />
              </div>
              {vendorsError ? (
                <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">
                  <span>{vendorsError}</span>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void loadVendors()} disabled={isLoadingVendors}>
                    Retry Vendor Master
                  </Button>
                </div>
              ) : null}
              {!isLoadingVendors && !vendorsError && vendors.length === 0 ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p role="status" className="text-sm text-slate-600">No active customer/vendor is available. Add one to Vendor Master before saving.</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/admin/master-data/vendor`)}
                  >
                    Open Vendor Master
                  </Button>
                </div>
              ) : null}
              {isLoadingOrders ? (
                <p role="status" className="text-sm text-slate-600">Loading organization orders...</p>
              ) : null}
              {orders.length === 0 && !isLoadingOrders && !ordersError ? (
                <p role="status" className="text-sm text-slate-600">No merchandising orders are available for advance booking.</p>
              ) : null}
              {nextOrderCursor ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => void loadMoreOrders()} disabled={isLoadingMoreOrders}>
                  {isLoadingMoreOrders ? "Loading orders..." : "Load more orders"}
                </Button>
              ) : null}
              {orderDetailsError ? (
                <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">
                  <span>{orderDetailsError}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setOrderDetailsError("");
                      setOrderDetailsRetry((current) => current + 1);
                    }}
                  >
                    Retry order details
                  </Button>
                </div>
              ) : null}
            </section>

            <section className="space-y-3">
              <div className="border-b border-slate-200 pb-2">
                <h2 className="text-base font-semibold text-slate-900">Finished Goods Sizes</h2>
                <p className="mt-1 text-sm text-slate-600">Enter the advance booking quantity for each size.</p>
              </div>
              {!selectedOrder ? (
                <p role="status" className="text-sm text-slate-600">
                  {selectedOrderId ? "Loading selected order sizes..." : "Select an organization order to load its finished-goods sizes."}
                </p>
              ) : Object.keys(finishedGoodsBySize).length ? null : (
                <p role="status" className="text-sm text-slate-600">This order has no finished-goods size quantities.</p>
              )}
              <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                    <tr>
                      <th scope="col" className="px-3 py-2">Size</th>
                      <th scope="col" className="px-3 py-2">Order Qty</th>
                      <th scope="col" className="px-3 py-2">Already Booked</th>
                      <th scope="col" className="px-3 py-2">Balance to Book</th>
                      <th scope="col" className="px-3 py-2">Book Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {Object.keys(finishedGoodsBySize).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                          Select an order with finished-goods sizes to enter booking quantities.
                        </td>
                      </tr>
                    )}
                    {Object.keys(finishedGoodsBySize).map((size) => {
                      const orderQty = finishedGoodsBySize[size];
                      const alreadyBooked = bookedTotals[size] ?? 0;
                      const balanceToBook = Math.max(0, orderQty - alreadyBooked);

                      return (
                        <tr key={size}>
                          <td className="px-3 py-1.5 font-medium text-slate-700">{size}</td>
                          <td className="px-3 py-1.5 text-slate-700">{orderQty}</td>
                          <td className="px-3 py-1.5 text-slate-700">{alreadyBooked}</td>
                          <td className="px-3 py-1.5 font-medium text-slate-900">{balanceToBook}</td>
                          <td className="px-3 py-1.5">
                            <Input
                              type="number"
                              min={0}
                              max={balanceToBook}
                              step={1}
                              value={String(entry[size] ?? 0)}
                              onChange={(event) => updateEntry(size, event.target.value)}
                              className="max-w-40"
                              disabled={!selectedOrder}
                              aria-label={`Booking quantity for size ${size}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {error ? (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
              <p role="status" className="text-sm text-slate-600">
                {isLoadingVendors
                  ? "Loading customers..."
                  : vendorsError
                    ? "Retry Vendor Master before saving."
                    : !selectedVendor
                      ? vendors.length === 0
                        ? "Add an active customer in Vendor Master to enable saving."
                        : "Select a customer to enable saving."
                      : !selectedOrder
                        ? "Select an order to enable saving."
                        : "Ready to save this advance booking."}
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsCreating(false);
                    setError("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!selectedOrder || !selectedVendor || isLoadingVendors || Boolean(vendorsError) || Boolean(bookingsError) || isSubmittingBooking}
                  title={
                    !selectedVendor
                      ? vendors.length === 0
                        ? "Add an active customer to Vendor Master before saving."
                        : "Select a customer before saving."
                      : undefined
                  }
                >
                  {isSubmittingBooking ? "Saving booking..." : "Submit Advance Booking"}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      ) : (
        <>
        <Card className="p-1 shadow-none">
          <ReportGrid
            title={view === "fulfillment" ? "Fulfillment Report" : "Advance Bookings"}
            records={reportRows}
            fields={bookingReportFields}
            visibleFields={visibleReportFields}
            onVisibleFieldsChange={(fields) => setVisibleReportFields(orderBookingReportFields(fields as BookingReportField[]))}
            storageKey={`distribution-booking-report-columns:${organizationId}`}
            rowIdSelector={(booking) => booking.bookingId}
            selectedIds={selectedBookingIds}
            onToggleSelectAll={(checked) => setSelectedBookingIds(checked ? reportRows.map((booking) => booking.bookingId) : [])}
            onToggleRowSelection={(bookingId, checked) => setSelectedBookingIds((current) =>
              checked
                ? current.includes(bookingId) ? current : [...current, bookingId]
                : current.filter((id) => id !== bookingId),
            )}
            onRowClick={() => undefined}
            onRowAction={(bookingId) => {
              const booking = reportRows.find((record) => record.bookingId === bookingId);
              if (booking) void openAssignment(booking);
            }}
            rowActionPosition="start"
            rowActionLabel="Assign Work Order"
            rowActionLabelSelector={(booking) => booking.totalUnassigned > 0 ? "Assign Work Order" : "Fully Assigned"}
            rowActionDisabledSelector={(booking) => booking.totalUnassigned <= 0 || isLoadingBookings}
            onNewOrder={view === "booking" ? startCreating : undefined}
            newActionLabel="Create Advance Booking"
            toolbarActions={(
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={Boolean(quotationSelectionError) || isLoadingBookings || isCreatingQuotation}
                  title={quotationSelectionError || undefined}
                  onClick={() => void createQuotationFromSelectedBookings(selectedReportBookings)}
                >
                  {isCreatingQuotation ? "Saving Quotation..." : `Create Quotation${selectedBookingIds.length > 0 ? ` (${selectedBookingIds.length})` : ""}`}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void loadBookings()} disabled={isLoadingBookings}>
                  Refresh bookings
                </Button>
              </>
            )}
            emptyMessage={isLoadingBookings ? "Loading advance bookings..." : undefined}
            renderCell={(fieldKey, booking) => {
              if (fieldKey === "createdAt") return booking.createdAt.slice(0, 10);
              if (fieldKey === "assignmentStatus") {
                return (
                  <Badge className={booking.assignmentStatus === "UNASSIGNED" ? "border-red-200 bg-red-50 text-red-800" : ""}>
                    {booking.assignmentStatus.replaceAll("_", " ")}
                  </Badge>
                );
              }
              if (fieldKey === "fulfillmentStatus") {
                return (
                  <Badge className={booking.fulfillmentStatus === "UNFULFILLED" ? "border-red-200 bg-red-50 text-red-800" : ""}>
                    {booking.fulfillmentStatus.replaceAll("_", " ")}
                  </Badge>
                );
              }
              const value = booking[fieldKey as keyof BookingReportRow];
              return value === null || value === undefined ? "" : String(value);
            }}
          />
        </Card>
        </>
      )}
      <Modal
        open={assignmentBooking !== null}
        onClose={() => {
          if (!isSavingAssignment) setAssignmentBooking(null);
        }}
        ariaLabelledBy="advance-booking-assignment-title"
        ariaDescribedBy="advance-booking-assignment-description"
        size="lg"
      >
        {assignmentBooking ? (
          <div className="space-y-4 p-6">
            <header className="space-y-1">
              <h2 id="advance-booking-assignment-title" className="text-xl font-semibold text-slate-900">
                Assign Booking to Work Order
              </h2>
              <p id="advance-booking-assignment-description" className="text-sm text-slate-600">
                {assignmentBooking.bookingId} · {assignmentBooking.orderNo} · Remaining booking quantity: {assignmentBooking.totalUnassigned}
              </p>
            </header>
            {isLoadingAssignment ? (
              <p role="status" className="text-sm text-slate-600">Loading work orders for this booking...</p>
            ) : (
              <Select
                label="Work Order"
                value={selectedAssignmentWorkOrderId}
                onChange={(event) => {
                  setSelectedAssignmentWorkOrderId(event.target.value);
                  setAssignmentQuantities({});
                  setAssignmentError("");
                }}
                disabled={assignableWorkOrders.length === 0}
                options={[
                  { label: assignableWorkOrders.length ? "Select a work order" : "No work orders for this order", value: "" },
                  ...assignableWorkOrders.map((workOrder) => ({
                    label: `${workOrder.workOrderNo} · ${workOrder.status}`,
                    value: workOrder.id,
                  })),
                ]}
              />
            )}
            {selectedAssignmentWorkOrder ? (
              <div className="max-w-full overflow-x-auto rounded-lg border border-[var(--erp-border)]">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="border-b border-[var(--erp-border)] bg-[var(--erp-surface-soft)] text-xs font-semibold uppercase text-slate-600">
                    <tr>
                      <th scope="col" className="px-3 py-2">Size</th>
                      <th scope="col" className="px-3 py-2">Booking Qty</th>
                      <th scope="col" className="px-3 py-2">Assigned</th>
                      <th scope="col" className="px-3 py-2">Work Order Balance</th>
                      <th scope="col" className="px-3 py-2">Assign Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--erp-border)]">
                    {assignmentBooking.sizes.map((line) => {
                      const workOrderLine = selectedAssignmentWorkOrder.sizeLines.find(
                        (candidate) => candidate.size.trim().toLocaleUpperCase() === line.size.trim().toLocaleUpperCase(),
                      );
                      const workOrderBalance = workOrderLine?.availableQuantity ?? 0;
                      const maxAssignable = Math.min(line.unassignedQuantity, workOrderBalance);
                      return (
                        <tr key={line.id}>
                          <td className="px-3 py-2 font-medium text-slate-800">{line.size}</td>
                          <td className="px-3 py-2">{line.bookedQuantity}</td>
                          <td className="px-3 py-2">{line.assignedQuantity}</td>
                          <td className="px-3 py-2">{workOrderLine ? workOrderBalance : "Size unavailable"}</td>
                          <td className="w-36 px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              max={maxAssignable}
                              step={1}
                              value={String(assignmentQuantities[line.id] ?? 0)}
                              disabled={!workOrderLine || maxAssignable === 0}
                              onChange={(event) => {
                                const value = event.target.value;
                                if (value !== "" && !/^\d+$/.test(value)) return;
                                setAssignmentQuantities((current) => ({
                                  ...current,
                                  [line.id]: value === "" ? 0 : Number(value),
                                }));
                              }}
                              aria-label={`Assign quantity for booking ${assignmentBooking.bookingId}, size ${line.size}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {assignmentBooking.sizes.some((line) => line.assignments.length > 0) ? (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">Existing work-order assignments</h3>
                <ul className="space-y-1 text-sm text-slate-600">
                  {assignmentBooking.sizes.flatMap((line) => line.assignments.map((assignment) => (
                    <li key={assignment.id}>
                      {line.size}: {assignment.workOrderNo} · {assignment.assignedQuantity} assigned · {assignment.fulfilledQuantity} fulfilled
                    </li>
                  )))}
                </ul>
              </section>
            ) : null}
            {assignmentError ? <p role="alert" className="text-sm text-red-700">{assignmentError}</p> : null}
            <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--erp-border)] pt-4">
              <Button type="button" variant="secondary" onClick={() => setAssignmentBooking(null)} disabled={isSavingAssignment}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void saveWorkOrderAssignment()}
                disabled={!selectedAssignmentWorkOrder || isLoadingAssignment || isSavingAssignment}
              >
                {isSavingAssignment ? "Saving assignment..." : "Assign to Work Order"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
