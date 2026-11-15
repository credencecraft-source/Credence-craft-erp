"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { ReportGrid } from "@/components/reports/report-grid-display";
import type { AdvanceBookingCreateFormProps } from "./advance-booking-create-form";
import type { AdvanceBookingContactLookupDialogProps } from "./advance-booking-contact-lookup-dialog";
import type { AdvanceBookingAllocationDialogProps } from "./advance-booking-allocation-dialog";
import {
  filterBookingsWaitingForWorkOrderAssignment,
  filterAdvanceBookingsForView,
  filterBookingsForShipmentTracking,
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
  contactId?: string;
};

type BookingRecord = {
  id: string;
  bookingId: string;
  orderId: string;
  orderSourceStatus: string;
  vendorId: string | null;
  orderNo: string;
  quotationNo: string | null;
  customer: string | null;
  quotationVendor: string | null;
  masterQuotationVendor: string | null;
  salesOrderNo: string | null;
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
    generalInventoryAvailableQuantity: number;
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
  totalAllocated: number;
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
  | "quotationVendor"
  | "masterQuotationVendor"
  | "brand"
  | "styleName"
  | "sizeSummary"
  | "totalBooked"
  | "totalUnassigned"
  | "totalAssigned"
  | "totalAllocated"
  | "assignmentStatus"
  | "fulfillmentStatus"
  | "createdAt";

type BookingReportRow = BookingRecord & { sizeSummary: string };

const ADVANCE_BOOKING_PAGE_SIZE = 25;

const bookingReportFields: Array<{ key: BookingReportField; label: string }> = [
  { key: "assignmentStatus", label: "Work Order Assignment" },
  { key: "fulfillmentStatus", label: "Fulfillment Status" },
  { key: "bookingId", label: "Booking ID" },
  { key: "orderNo", label: "Order No" },
  { key: "quotationVendor", label: "Dealer" },
  { key: "masterQuotationVendor", label: "Distributor" },
  { key: "brand", label: "Brand" },
  { key: "styleName", label: "Style" },
  { key: "sizeSummary", label: "Size-wise Qty Breakup" },
  { key: "totalBooked", label: "Total Qty" },
  { key: "totalUnassigned", label: "Work Order Balance" },
  { key: "totalAssigned", label: "Assigned Qty" },
  { key: "createdAt", label: "Created Date" },
];

const fulfillmentReportFields = bookingReportFields.filter(
  ({ key }) => key !== "assignmentStatus" && key !== "fulfillmentStatus",
);

const advanceBookingReportFields = bookingReportFields.filter(
  ({ key }) =>
    key !== "assignmentStatus" &&
    key !== "fulfillmentStatus" &&
    key !== "totalUnassigned" &&
    key !== "quotationVendor" &&
    key !== "masterQuotationVendor",
);

const shipmentTrackingReportFields = [
  ...bookingReportFields.filter(({ key }) => key === "bookingId"),
  ...bookingReportFields.filter(({ key }) => key === "totalBooked"),
  { key: "totalAllocated" as const, label: "Allocated Qty" },
  ...bookingReportFields.filter(({ key }) =>
    key !== "totalAssigned" &&
    key !== "bookingId" &&
    key !== "totalBooked" &&
    key !== "totalAllocated" &&
    key !== "totalUnassigned" &&
    key !== "assignmentStatus",
  ),
];
function orderBookingReportFields(fields: BookingReportField[]) {
  const selected = new Set(fields);
  return [...bookingReportFields.map(({ key }) => key), "totalAllocated" as const]
    .filter((key) => selected.has(key));
}

function getBookingRowId(booking: BookingReportRow) {
  return booking.bookingId;
}

function renderBookingCell(fieldKey: string, booking: BookingReportRow) {
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
}

const emptySizes = (): Record<string, number> => ({});

const AdvanceBookingCreateForm = dynamic<AdvanceBookingCreateFormProps>(
  () => import("./advance-booking-create-form"),
  { ssr: false, loading: () => <p role="status" className="text-sm text-slate-600">Loading booking form...</p> },
);
const AdvanceBookingContactLookupDialog = dynamic<AdvanceBookingContactLookupDialogProps>(
  () => import("./advance-booking-contact-lookup-dialog"),
  { ssr: false },
);
const AdvanceBookingAllocationDialog = dynamic<AdvanceBookingAllocationDialogProps>(
  () => import("./advance-booking-allocation-dialog"),
  { ssr: false },
);

export default function AdvanceBookingPage({ view = "booking" }: { view?: "booking" | "fulfillment" | "shipment" } = {}) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params?.organizationId ?? "demo-org";
  const skipNextBookingFetch = useRef(false);

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [ordersLoadedFor, setOrdersLoadedFor] = useState("");
  const [nextOrderCursor, setNextOrderCursor] = useState<string | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingMoreOrders, setIsLoadingMoreOrders] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [allContactVendors, setAllContactVendors] = useState<{
    organizationId: string;
    search: string;
    options: VendorOption[];
  } | null>(null);
  const [contactLookupSearch, setContactLookupSearch] = useState("");
  const [isLoadingAllContacts, setIsLoadingAllContacts] = useState(false);
  const [allContactsError, setAllContactsError] = useState("");
  const [selectedQuotationVendorId, setSelectedQuotationVendorId] = useState("");
  const [orderDetailsRetry, setOrderDetailsRetry] = useState(0);
  const [orderDetails, setOrderDetails] = useState<{
    organizationId: string;
    id: string;
    order: OrderDetails;
  } | null>(null);
  const [orderDetailsError, setOrderDetailsError] = useState("");
  const [entry, setEntry] = useState<Record<string, number>>(emptySizes());
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [isCreatingQuotation, setIsCreatingQuotation] = useState(false);
  const [isQuotationVendorModalOpen, setIsQuotationVendorModalOpen] = useState(false);
  const [isRequestingFinishedGoods, setIsRequestingFinishedGoods] = useState(false);
  const [isFinishedGoodsRequestOpen, setIsFinishedGoodsRequestOpen] = useState(false);
  const [finishedGoodsRequestQuantities, setFinishedGoodsRequestQuantities] = useState<Record<string, string>>({});
  const [finishedGoodsRequestError, setFinishedGoodsRequestError] = useState("");
  const [isDeletingBookings, setIsDeletingBookings] = useState(false);
  const [showDeleteBookingsConfirmation, setShowDeleteBookingsConfirmation] = useState(false);
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [bookingsError, setBookingsError] = useState("");
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [isLoadingMoreBookings, setIsLoadingMoreBookings] = useState(false);
  const [nextBookingCursor, setNextBookingCursor] = useState<string | null>(null);
  const [bookingSearch, setBookingSearch] = useState("");
  const [assignmentBooking, setAssignmentBooking] = useState<BookingRecord | null>(null);
  const [assignableWorkOrders, setAssignableWorkOrders] = useState<AssignableWorkOrder[]>([]);
  const [selectedAssignmentWorkOrderId, setSelectedAssignmentWorkOrderId] = useState("");
  const [isLoadingAssignment, setIsLoadingAssignment] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [allocationPlan, setAllocationPlan] = useState<"general-stock-first" | "work-order-only">("general-stock-first");
  const [assignmentError, setAssignmentError] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [visibleReportFields, setVisibleReportFields] = useState<BookingReportField[]>(
    [...bookingReportFields.map(({ key }) => key), "totalAllocated"],
  );
  const isSearchBelowThreshold = bookingSearch.trim().length > 0 && bookingSearch.trim().length < 3;

  const loadBookings = useCallback(async (
    signal?: AbortSignal,
    options: { silent?: boolean; cursor?: string; preservePages?: boolean; search?: string } = {},
  ) => {
    if (options.cursor) setIsLoadingMoreBookings(true);
    else if (!options.silent) setIsLoadingBookings(true);
    setBookingsError("");
    try {
      const query = new URLSearchParams({ organizationId, limit: String(ADVANCE_BOOKING_PAGE_SIZE), view });
      if (options.cursor) query.set("cursor", options.cursor);
      if (options.search?.trim()) query.set("search", options.search.trim());
      const response = await fetch(`/api/distribution/advance-bookings?${query}`, {
        cache: "no-store",
        signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.bookings)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load advance bookings.");
      }
      setBookings((current) => {
        if (!options.cursor && !options.silent && !options.preservePages) return data.bookings;
        const merged = new Map(current.map((booking: BookingRecord) => [booking.id, booking]));
        for (const booking of data.bookings as BookingRecord[]) merged.set(booking.id, booking);
        return [...merged.values()];
      });
      if (!options.silent && !options.preservePages) {
        setNextBookingCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
      }
    } catch (loadError) {
      if (!signal?.aborted) {
        setBookingsError(loadError instanceof Error ? loadError.message : "Unable to load advance bookings.");
      }
    } finally {
      if (!signal?.aborted) {
        if (options.cursor) setIsLoadingMoreBookings(false);
        else if (!options.silent) setIsLoadingBookings(false);
      }
    }
  }, [organizationId, view]);

  useEffect(() => {
    if (view === "booking" && isCreating) return;
    if (skipNextBookingFetch.current) {
      skipNextBookingFetch.current = false;
      return;
    }
    if (isSearchBelowThreshold) return;
    const controller = new AbortController();
    const load = () => {
      if (!controller.signal.aborted) void loadBookings(controller.signal, { search: bookingSearch });
    };
    const timer = bookingSearch.trim() ? window.setTimeout(load, 250) : window.setTimeout(load, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bookingSearch, isCreating, isSearchBelowThreshold, loadBookings, view]);

  const selectedOrder = orderDetails?.organizationId === organizationId && orderDetails.id === selectedOrderId
    ? orderDetails.order
    : null;
  const currentAllContactVendors = allContactVendors?.organizationId === organizationId
    && allContactVendors.search === contactLookupSearch.trim()
    ? allContactVendors.options
    : null;
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
    () => isSearchBelowThreshold
      ? []
      :
      filterAdvanceBookingsForView(
        bookings.filter((booking) => Boolean(booking.orderId)),
        view,
      )
        .map((booking) => ({
          ...booking,
          sizeSummary: booking.sizes
            .filter((line) => line.bookedQuantity > 0)
            .map((line) => `${line.size}: ${line.bookedQuantity}`)
            .join(", "),
        })),
    [bookings, isSearchBelowThreshold, view],
  );
  const workOrderTrackingRows = useMemo(
    () => view === "shipment"
      ? []
      : view === "fulfillment"
        ? filterBookingsWaitingForWorkOrderAssignment(reportRows)
        : reportRows,
    [reportRows, view],
  );
  const shipmentTrackingRows = useMemo(
    () => view === "fulfillment" || view === "shipment" ? filterBookingsForShipmentTracking(reportRows) : [],
    [reportRows, view],
  );
  const selectedReportBookings = useMemo(
    () => {
      const selectedIds = new Set(selectedBookingIds);
      return workOrderTrackingRows.filter((booking) => selectedIds.has(booking.bookingId));
    },
    [workOrderTrackingRows, selectedBookingIds],
  );
  const selectedShipmentBookings = useMemo(
    () => {
      const selectedIds = new Set(selectedBookingIds);
      return shipmentTrackingRows.filter((booking) => selectedIds.has(booking.bookingId));
    },
    [selectedBookingIds, shipmentTrackingRows],
  );
  const quotationSelectionError = validateBookingQuotationSelection(selectedReportBookings);
  const selectedAssignmentWorkOrder = assignableWorkOrders.find(
    (workOrder) => workOrder.id === selectedAssignmentWorkOrderId,
  ) ?? null;
  const handleOpenShipmentDetails = useCallback((booking: BookingReportRow) => {
    router.push(
      `/dashboard/${params.workspaceId}/organizations/${organizationId}/distribution/shipment-tracking/${encodeURIComponent(booking.id)}`,
    );
  }, [organizationId, params.workspaceId, router]);
  const renderShipmentBookingCell = useCallback((fieldKey: string, booking: BookingReportRow) => {
    if (fieldKey === "bookingId") {
      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`View booking ${booking.bookingId}`}
          onClick={(event) => {
            event.stopPropagation();
            handleOpenShipmentDetails(booking);
          }}
        >
          {booking.bookingId}
        </Button>
      );
    }
    if (fieldKey === "assignmentStatus") {
      const isFullyAllocated = booking.totalAllocated >= booking.totalBooked;
      return <Badge>{isFullyAllocated ? "Stock Available" : "Allocation Pending"}</Badge>;
    }
    return renderBookingCell(fieldKey, booking);
  }, [handleOpenShipmentDetails]);

  const loadInitialOrders = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingOrders(true);
    setOrdersError("");
    try {
      const query = new URLSearchParams({
        organizationId,
        limit: String(ADVANCE_BOOKING_PAGE_SIZE),
        purpose: "advance-booking",
      });
      const response = await fetch(`/api/orders?${query.toString()}`, {
        cache: "no-store",
        signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.orders)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load organization orders.");
      }
      setOrders(data.orders);
      setOrdersLoadedFor(organizationId);
      setNextOrderCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
      setSelectedOrderId((current) =>
        data.orders.some((order: OrderRecord) => order.id === current) ? current : data.orders[0]?.id || "",
      );
    } catch (loadError) {
      if (signal?.aborted) return;
      setOrdersError(loadError instanceof Error ? loadError.message : "Unable to load organization orders.");
    } finally {
      if (!signal?.aborted) setIsLoadingOrders(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (view !== "booking" || !isCreating) return;
    if (ordersLoadedFor === organizationId) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) void loadInitialOrders(controller.signal);
    });
    return () => {
      controller.abort();
    };
  }, [isCreating, loadInitialOrders, organizationId, ordersLoadedFor, view]);

  const loadAllContacts = useCallback(async (search: string, signal?: AbortSignal) => {
    setIsLoadingAllContacts(true);
    setAllContactsError("");
    try {
      const query = new URLSearchParams({ limit: "100" });
      if (search.trim()) query.set("search", search.trim());
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/contacts/lookup?${query}`,
        { cache: "no-store", signal },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load all contacts.");
      }
      if (data.some((contact) =>
        !contact ||
        typeof contact.id !== "string" ||
        typeof contact.code !== "string" ||
        typeof contact.label !== "string"
      )) {
        throw new Error("The contact list returned an invalid response. Refresh and try again.");
      }
      const options = (data as VendorOption[])
        .map((contact) => ({ ...contact, contactId: contact.id }))
        .filter((contact) => contact.label.trim())
        .sort((left, right) => left.label.localeCompare(right.label));
      setAllContactVendors({ organizationId, search: search.trim(), options });
    } catch (loadError) {
      if (signal?.aborted) return;
      setAllContactsError(loadError instanceof Error ? loadError.message : "Unable to load all contacts.");
    } finally {
      if (!signal?.aborted) setIsLoadingAllContacts(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const contactLookupRequested = view === "booking"
      && isQuotationVendorModalOpen;
    if (!contactLookupRequested || currentAllContactVendors !== null) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void loadAllContacts(contactLookupSearch, controller.signal);
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [contactLookupSearch, currentAllContactVendors, isQuotationVendorModalOpen, loadAllContacts, view]);

  useEffect(() => {
    if (view !== "booking" || !isCreating || !selectedOrderId) return;
    if (orderDetails?.organizationId === organizationId && orderDetails.id === selectedOrderId) return;

    const controller = new AbortController();
    const query = new URLSearchParams({ organizationId, purpose: "advance-booking" });
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
          setOrderDetails({ organizationId, id: selectedOrderId, order: data.order });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setOrderDetailsError("Unable to load the selected order’s finished-goods sizes.");
        }
      });

    return () => controller.abort();
  }, [isCreating, organizationId, orderDetails, orderDetailsRetry, selectedOrderId, view]);

  async function loadMoreOrders() {
    if (!nextOrderCursor || isLoadingMoreOrders) return;
    setIsLoadingMoreOrders(true);
    setOrdersError("");
    try {
      const query = new URLSearchParams({
        organizationId,
        limit: String(ADVANCE_BOOKING_PAGE_SIZE),
        cursor: nextOrderCursor,
        purpose: "advance-booking",
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

  const loadMoreBookings = useCallback(async () => {
    if (!nextBookingCursor || isLoadingMoreBookings || isLoadingBookings) return;
    await loadBookings(undefined, { cursor: nextBookingCursor, search: bookingSearch });
  }, [bookingSearch, isLoadingBookings, isLoadingMoreBookings, loadBookings, nextBookingCursor]);

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
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647) {
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

    try {
      setIsSubmittingBooking(true);
      const response = await fetch("/api/distribution/advance-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          orderId: selectedOrder.id,
          sizes: Object.entries(quantities).map(([size, quantity]) => ({
            size,
            quantity,
          })),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.booking) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to save advance booking.");
      }
      const createdBooking = data.booking as BookingRecord;
      setBookings((current) => [
        createdBooking,
        ...current.filter((booking) => booking.id !== createdBooking.id),
      ]);
      setEntry(emptySizes());
      setStatus(`Advance booking ${createdBooking.bookingId} submitted.`);
      skipNextBookingFetch.current = true;
      setIsCreating(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save advance booking.");
    } finally {
      setIsSubmittingBooking(false);
    }
  }

  const matchingWorkOrderSizeLine = useCallback((workOrder: AssignableWorkOrder | null, size: string) => {
    return workOrder?.sizeLines.find((line) =>
      line.size.trim().toLocaleUpperCase() === size.trim().toLocaleUpperCase(),
    );
  }, []);

  const plannedStockQuantity = useCallback((line: BookingRecord["sizes"][number]) => {
    if (allocationPlan !== "general-stock-first" || assignmentBooking?.orderSourceStatus !== "ARTICLE_BASED") return 0;
    return Math.min(line.generalInventoryAvailableQuantity, line.unassignedQuantity);
  }, [allocationPlan, assignmentBooking?.orderSourceStatus]);

  const plannedWorkOrderQuantity = useCallback((line: BookingRecord["sizes"][number]) => {
    if (allocationPlan === "general-stock-first" && !selectedAssignmentWorkOrder) return 0;
    return Math.max(line.unassignedQuantity - plannedStockQuantity(line), 0);
  }, [allocationPlan, plannedStockQuantity, selectedAssignmentWorkOrder]);

  const openAssignment = useCallback(async (booking: BookingRecord) => {
    setAssignmentBooking(booking);
    setAssignableWorkOrders([]);
    setSelectedAssignmentWorkOrderId("");
    setAllocationPlan(booking.orderSourceStatus === "ARTICLE_BASED" ? "general-stock-first" : "work-order-only");
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
  }, [organizationId]);

  const saveBookingAllocation = useCallback(async () => {
    if (!assignmentBooking || isSavingAssignment) return;
    const generalStockLines: Array<{ bookingSizeLineId: string; quantity: number }> = [];
    const workOrderLines: Array<{ bookingSizeLineId: string; assignedQuantity: number }> = [];
    for (const line of assignmentBooking.sizes) {
      const stockQuantity = plannedStockQuantity(line);
      if (stockQuantity > 0) generalStockLines.push({ bookingSizeLineId: line.id, quantity: stockQuantity });
      const workOrderQuantity = plannedWorkOrderQuantity(line);
      const workOrderLine = matchingWorkOrderSizeLine(selectedAssignmentWorkOrder, line.size);
      const maxWorkOrderQuantity = workOrderLine?.availableQuantity ?? 0;
      if (workOrderQuantity > maxWorkOrderQuantity) {
        setAssignmentError(
          `Size ${line.size} needs ${workOrderQuantity} units for the selected work order, but only ${maxWorkOrderQuantity} are available.`,
        );
        return;
      }
      if (workOrderQuantity > 0) {
        workOrderLines.push({ bookingSizeLineId: line.id, assignedQuantity: workOrderQuantity });
      }
    }
    if (generalStockLines.length === 0 && workOrderLines.length === 0) {
      setAssignmentError("No available General Stock or Work Order quantity is selected to allocate.");
      return;
    }
    if (workOrderLines.length > 0 && !selectedAssignmentWorkOrder) {
      setAssignmentError("Select a work order before assigning the remaining quantity.");
      return;
    }

    setIsSavingAssignment(true);
    setAssignmentError("");
    try {
      const response = await fetch(
        `/api/distribution/advance-bookings/${encodeURIComponent(assignmentBooking.id)}/allocation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            workOrderId: selectedAssignmentWorkOrder?.id ?? "",
            generalStockLines,
            workOrderLines,
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok !== true) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to save the booking allocation.");
      }
      const stockQuantity = generalStockLines.reduce((sum, line) => sum + line.quantity, 0);
      const workOrderQuantity = workOrderLines.reduce((sum, line) => sum + line.assignedQuantity, 0);
      if (stockQuantity > 0) {
        const allocatedLines = data.generalStock?.allocatedLines;
        const allocatedTotal = Array.isArray(allocatedLines)
          ? allocatedLines.reduce((sum: number, line: unknown) => {
              const quantity = line && typeof line === "object"
                ? (line as { quantity?: unknown }).quantity
                : undefined;
              return sum + (typeof quantity === "number" && Number.isSafeInteger(quantity) ? quantity : 0);
            }, 0)
          : 0;
        if (allocatedTotal !== stockQuantity) {
          throw new Error("The stock allocation did not match the requested quantities. Refresh and review the booking.");
        }
      }
      if (workOrderQuantity > 0 && data.workOrder?.workOrderId !== selectedAssignmentWorkOrder?.id) {
        throw new Error("The work-order assignment was not confirmed. Refresh and review the booking.");
      }
      const allocationSummary = [
        stockQuantity > 0 ? `${stockQuantity} from general stock` : "",
        workOrderQuantity > 0 ? `${workOrderQuantity} to ${selectedAssignmentWorkOrder?.workOrderNo}` : "",
      ].filter(Boolean).join(" and ");
      setAssignmentBooking(null);
      setStatus(`Allocated ${allocationSummary} for booking ${assignmentBooking.bookingId}.`);
      await loadBookings(undefined, { silent: true, preservePages: true });
    } catch (allocationError) {
      setAssignmentError(allocationError instanceof Error ? allocationError.message : "Unable to save the booking allocation.");
    } finally {
      setIsSavingAssignment(false);
    }
  }, [
    assignmentBooking,
    isSavingAssignment,
    loadBookings,
    matchingWorkOrderSizeLine,
    organizationId,
    plannedStockQuantity,
    plannedWorkOrderQuantity,
    selectedAssignmentWorkOrder,
  ]);

  const startCreating = useCallback(() => {
    setError("");
    setStatus("");
    setIsCreating(true);
  }, []);

  async function createQuotationFromSelectedBookings(selectedBookings: BookingRecord[]) {
    if (view !== "booking") return;
    setError("");
    setStatus("");
    if (quotationSelectionError || !selectedQuotationVendorId || isCreatingQuotation) {
      setError(quotationSelectionError || (!selectedQuotationVendorId
        ? "Select a Contact for the Order Form."
        : "Wait for the current Order Form to finish saving."));
      return;
    }
    const isContactSelection = selectedQuotationVendorId.startsWith("contact:");
    const selectedCounterpartyId = selectedQuotationVendorId.slice(selectedQuotationVendorId.indexOf(":") + 1);
    if (!selectedCounterpartyId) {
      setError("Select a valid Contact for the Order Form.");
      return;
    }
    setIsCreatingQuotation(true);
    try {
      const response = await fetch("/api/distribution/order-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          bookingIds: selectedBookings.map((booking) => booking.id),
          vendorId: isContactSelection ? null : selectedCounterpartyId,
          contactId: isContactSelection ? selectedCounterpartyId : null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.orderForm || typeof data.orderForm.id !== "string") {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to create the Order Form.");
      }
      setSelectedBookingIds([]);
      setIsQuotationVendorModalOpen(false);
      setStatus(`Created Order Form ${data.orderForm.orderFormNo}.`);
      router.push(
        `/dashboard/${params.workspaceId}/organizations/${organizationId}/advance-booking/order/order-form`,
      );
    } catch (quotationError) {
      setError(quotationError instanceof Error ? quotationError.message : "Unable to create the quotation.");
    } finally {
      setIsCreatingQuotation(false);
    }
  }

  async function requestFinishedGoodsForSelectedBookings() {
    if (view !== "shipment" || selectedShipmentBookings.length === 0 || isRequestingFinishedGoods) return;
    const invalidBooking = selectedShipmentBookings.find((booking) => {
      return booking.sizes.some((size) => {
        const rawQuantity = finishedGoodsRequestQuantities[size.id] ?? "";
        const requestedQuantity = Number(rawQuantity);
        return !/^\d+$/.test(rawQuantity) ||
          !Number.isSafeInteger(requestedQuantity) ||
          requestedQuantity < 0 ||
          requestedQuantity > size.fulfilledQuantity;
      });
    });
    if (invalidBooking) {
      setFinishedGoodsRequestError(
        `Enter a whole-number quantity from zero to each size's fulfilled quantity for ${invalidBooking.bookingId}.`,
      );
      return;
    }
    const totalRequested = selectedShipmentBookings.reduce((total, booking) =>
      total + booking.sizes.reduce((sizeTotal, size) =>
        sizeTotal + Number(finishedGoodsRequestQuantities[size.id] ?? 0), 0), 0);
    if (totalRequested <= 0) {
      setFinishedGoodsRequestError("Enter a request quantity greater than zero for at least one size.");
      return;
    }
    setFinishedGoodsRequestError("");
    const bookingRequests = selectedShipmentBookings.map((booking) => ({
      bookingId: booking.id,
      sizeRequests: booking.sizes.map((size) => ({
        sizeLineId: size.id,
        quantity: finishedGoodsRequestQuantities[size.id] ?? "",
      })),
    }));
    setIsRequestingFinishedGoods(true);
    try {
      const response = await fetch("/api/inventory/finished-goods-outward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          action: "request-bookings",
          bookingRequests,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.request || typeof data.request.request_no !== "string") {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to request finished goods for the selected bookings.");
      }
      setSelectedBookingIds([]);
      setFinishedGoodsRequestQuantities({});
      setIsFinishedGoodsRequestOpen(false);
      setStatus(
        `Finished-goods request ${data.request.request_no} sent for Inventory approval for ${selectedShipmentBookings.length} booking${selectedShipmentBookings.length === 1 ? "" : "s"}.`,
      );
    } catch (requestError) {
      setFinishedGoodsRequestError(requestError instanceof Error ? requestError.message : "Unable to request finished goods for the selected bookings.");
    } finally {
      setIsRequestingFinishedGoods(false);
    }
  }

  async function deleteSelectedBookings() {
    if (selectedReportBookings.length === 0 || isDeletingBookings) return;
    setError("");
    setStatus("");
    setIsDeletingBookings(true);
    try {
      const response = await fetch("/api/distribution/advance-bookings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          bookingIds: selectedReportBookings.map((booking) => booking.id),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.deletedBookingNos)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to delete the selected bookings.");
      }
      setSelectedBookingIds([]);
      setShowDeleteBookingsConfirmation(false);
      setStatus(`Deleted ${data.deletedBookingNos.length} advance booking${data.deletedBookingNos.length === 1 ? "" : "s"}.`);
      const deletedBookingNos = new Set<string>(data.deletedBookingNos);
      setBookings((current) => current.filter((booking) => !deletedBookingNos.has(booking.bookingId)));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete the selected bookings.");
    } finally {
      setIsDeletingBookings(false);
    }
  }

  const handleReportFieldsChange = useCallback((fields: string[]) => {
    setVisibleReportFields(orderBookingReportFields(fields as BookingReportField[]));
  }, []);
  const handleSearchQueryChange = useCallback((search: string) => {
    setBookingSearch(search);
    if (search.trim().length > 0 && search.trim().length < 3) {
      setSelectedBookingIds([]);
      setIsLoadingBookings(false);
    }
  }, []);
  const handleToggleSelectAll = useCallback((checked: boolean, recordIds: string[]) => {
    setSelectedBookingIds(checked ? recordIds : []);
  }, []);
  const handleToggleRowSelection = useCallback((bookingId: string, checked: boolean) => {
    setSelectedBookingIds((current) => checked
      ? current.includes(bookingId) ? current : [...current, bookingId]
      : current.filter((id) => id !== bookingId));
  }, []);
  const handleBookingRowClick = useCallback((bookingId: string) => {
    const booking = workOrderTrackingRows.find((record) => record.bookingId === bookingId);
    if (booking) handleOpenShipmentDetails(booking);
  }, [handleOpenShipmentDetails, workOrderTrackingRows]);
  const handleShipmentRowClick = useCallback((bookingId: string) => {
    const booking = shipmentTrackingRows.find((record) => record.bookingId === bookingId);
    if (booking) handleOpenShipmentDetails(booking);
  }, [handleOpenShipmentDetails, shipmentTrackingRows]);
  const handleBookingRowAction = useCallback((bookingId: string) => {
    const booking = workOrderTrackingRows.find((record) => record.bookingId === bookingId);
    if (booking) void openAssignment(booking);
  }, [openAssignment, workOrderTrackingRows]);
  const rowActionDisabledSelector = useCallback((booking: BookingReportRow) =>
    booking.totalUnassigned <= 0 || isLoadingBookings || isSavingAssignment,
  [isLoadingBookings, isSavingAssignment]);
  const rowActionHiddenSelector = useCallback((booking: BookingReportRow) => !booking.salesOrderNo, []);
  const refreshBookings = useCallback(() => {
    void loadBookings(undefined, { preservePages: true, search: bookingSearch });
  }, [bookingSearch, loadBookings]);
  const openQuotationContactLookup = useCallback(() => {
    setError("");
    setIsQuotationVendorModalOpen(true);
  }, []);
  const openFinishedGoodsRequest = useCallback(() => {
    setFinishedGoodsRequestQuantities(Object.fromEntries(
      selectedShipmentBookings.flatMap((booking) =>
        booking.sizes.map((size) => [size.id, String(size.fulfilledQuantity)]),
      ),
    ));
    setFinishedGoodsRequestError("");
    setIsFinishedGoodsRequestOpen(true);
  }, [selectedShipmentBookings]);

  const bookingToolbarActions = useMemo(() => (
    <>
      {view === "booking" ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={selectedBookingIds.length === 0 || isLoadingBookings || isDeletingBookings}
          onClick={() => setShowDeleteBookingsConfirmation(true)}
        >
          Delete Booking{selectedBookingIds.length === 1 ? "" : "s"}{selectedBookingIds.length > 0 ? ` (${selectedBookingIds.length})` : ""}
        </Button>
      ) : null}
      {view === "booking" ? (
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={Boolean(quotationSelectionError) || isLoadingBookings || isCreatingQuotation}
          title={quotationSelectionError || undefined}
          onClick={openQuotationContactLookup}
        >
          {isCreatingQuotation ? "Creating Order Form..." : `Confirm${selectedBookingIds.length > 0 ? ` (${selectedBookingIds.length})` : ""}`}
        </Button>
      ) : null}
      <Button type="button" variant="secondary" size="sm" onClick={refreshBookings} disabled={isLoadingBookings}>
        Refresh bookings
      </Button>
      {nextBookingCursor && !isSearchBelowThreshold ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void loadMoreBookings()}
          disabled={isLoadingBookings || isLoadingMoreBookings}
        >
          {isLoadingMoreBookings ? "Loading..." : "Load more"}
        </Button>
      ) : null}
    </>
  ), [
    isCreatingQuotation,
    isDeletingBookings,
    isLoadingBookings,
    isLoadingMoreBookings,
    loadMoreBookings,
    nextBookingCursor,
    isSearchBelowThreshold,
    openQuotationContactLookup,
    quotationSelectionError,
    refreshBookings,
    selectedBookingIds.length,
    view,
  ]);
  const shipmentToolbarActions = useMemo(() => {
    const vendorMissing = selectedShipmentBookings.some(
      (booking) => !booking.quotationVendor?.trim() || !booking.masterQuotationVendor?.trim(),
    );
    return (
      <>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={selectedShipmentBookings.length === 0 || isLoadingBookings || isRequestingFinishedGoods || vendorMissing}
          title={vendorMissing
            ? "Quotation and Sales Order vendors are required before requesting finished goods."
            : undefined}
          onClick={openFinishedGoodsRequest}
        >
          Request FG Quantity{selectedShipmentBookings.length > 0 ? ` (${selectedShipmentBookings.length})` : ""}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={refreshBookings} disabled={isLoadingBookings}>
          Refresh bookings
        </Button>
        {nextBookingCursor && !isSearchBelowThreshold ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void loadMoreBookings()}
            disabled={isLoadingBookings || isLoadingMoreBookings}
          >
            {isLoadingMoreBookings ? "Loading..." : "Load more"}
          </Button>
        ) : null}
      </>
    );
  }, [
    isLoadingBookings,
    isLoadingMoreBookings,
    isRequestingFinishedGoods,
    loadMoreBookings,
    nextBookingCursor,
    isSearchBelowThreshold,
    openFinishedGoodsRequest,
    refreshBookings,
    selectedShipmentBookings,
  ]);

  return (
    <div className="w-full min-w-0 space-y-3 p-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="erp-eyebrow">
            {view === "booking" ? "Advance Booking / Order" : `Advance Booking / ASN / ${view === "fulfillment" ? "Work Order Tracking" : "Shipment Tracking"}`}
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            {view === "booking" ? "Advance Booking" : view === "fulfillment" ? "Work Order Tracking" : "Shipment Tracking"}
          </h1>
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
          {view === "booking"
            ? "Advance bookings linked to a quotation are hidden from this register. They remain available in Work Order Tracking."
            : view === "shipment"
              ? "Shipment Tracking shows quoted bookings with fulfilled quantities or fully assigned quantities. Any remaining balance stays in Work Order Tracking."
              : "Advance bookings are saved to this organization’s database and shared across users."}
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
        <AdvanceBookingCreateForm
          orders={orders}
          selectedOrder={selectedOrder}
          selectedOrderId={selectedOrderId}
          isLoadingOrders={isLoadingOrders}
          ordersError={ordersError}
          nextOrderCursor={nextOrderCursor}
          isLoadingMoreOrders={isLoadingMoreOrders}
          onOrderChange={(orderId) => {
            setSelectedOrderId(orderId);
            setEntry(emptySizes());
            setError("");
            setOrderDetailsError("");
          }}
          onLoadMoreOrders={() => void loadMoreOrders()}
          orderDetailsError={orderDetailsError}
          onRetryOrderDetails={() => {
            setOrderDetailsError("");
            setOrderDetailsRetry((current) => current + 1);
          }}
          finishedGoodsBySize={finishedGoodsBySize}
          bookedTotals={bookedTotals}
          entry={entry}
          onEntryChange={updateEntry}
          error={error}
          bookingsError={bookingsError}
          isSubmittingBooking={isSubmittingBooking}
          onSubmit={handleSubmit}
          onCancel={() => {
            setIsCreating(false);
            setEntry(emptySizes());
            setError("");
          }}
        />
      ) : (
        <>
        {view !== "shipment" ? <Card className="p-1 shadow-none">
          <ReportGrid
            title={view === "fulfillment" ? "Work Order Tracking Report" : "Advance Bookings"}
            records={workOrderTrackingRows}
            onSearchQueryChange={handleSearchQueryChange}
            serverSideSearch
            isLoading={isLoadingBookings}
            fields={view === "fulfillment" ? fulfillmentReportFields : advanceBookingReportFields}
            visibleFields={visibleReportFields}
            onVisibleFieldsChange={handleReportFieldsChange}
            storageKey={`distribution-booking-report-columns:v2:${organizationId}`}
            rowIdSelector={getBookingRowId}
            selectedIds={selectedBookingIds}
            selectable={view === "booking"}
            onToggleSelectAll={handleToggleSelectAll}
            onToggleRowSelection={handleToggleRowSelection}
            onRowClick={handleBookingRowClick}
            onRowAction={view === "fulfillment" ? handleBookingRowAction : undefined}
            rowActionPosition="start"
            rowActionLabel="Allocate"
            rowActionDisabledSelector={rowActionDisabledSelector}
            rowActionHiddenSelector={rowActionHiddenSelector}
            onNewOrder={view === "booking" ? startCreating : undefined}
            newActionLabel="Create Advance Booking"
            toolbarActions={bookingToolbarActions}
            emptyMessage={isLoadingBookings
              ? "Loading advance bookings..."
              : isSearchBelowThreshold
                ? "Enter at least 3 characters to search bookings."
              : view === "fulfillment"
                ? reportRows.length === 0
                  ? "No advance bookings have a quotation yet."
                  : "No unassigned quantities remain here. Open Shipment Tracking for fulfilled or fully assigned bookings."
                : "No unquoted advance bookings are available."}
            renderCell={renderBookingCell}
          />
        </Card> : null}
        {view === "shipment" ? (
          <Card className="p-1 shadow-none">
            <ReportGrid
              title="Shipment Tracking"
              records={shipmentTrackingRows}
              onSearchQueryChange={handleSearchQueryChange}
              serverSideSearch
              isLoading={isLoadingBookings}
              fields={shipmentTrackingReportFields}
              visibleFields={visibleReportFields}
              onVisibleFieldsChange={handleReportFieldsChange}
              storageKey={`distribution-shipment-tracking-report-columns:v2:${organizationId}`}
              rowIdSelector={getBookingRowId}
              selectedIds={selectedBookingIds}
              selectable
              onToggleSelectAll={handleToggleSelectAll}
              onToggleRowSelection={handleToggleRowSelection}
              onRecordClick={handleOpenShipmentDetails}
              onRowClick={handleShipmentRowClick}
              toolbarActions={shipmentToolbarActions}
              emptyMessage={isLoadingBookings
                ? "Loading shipment tracking..."
                : isSearchBelowThreshold
                  ? "Enter at least 3 characters to search bookings."
                  : "No quoted bookings have fulfilled quantities or fully assigned quantities yet."}
              renderCell={renderShipmentBookingCell}
            />
          </Card>
        ) : null}
        </>
      )}
      <Modal
        open={isFinishedGoodsRequestOpen}
        onClose={() => {
          if (!isRequestingFinishedGoods) setIsFinishedGoodsRequestOpen(false);
        }}
        ariaLabelledBy="finished-goods-request-title"
        ariaDescribedBy="finished-goods-request-description"
        size="lg"
      >
        <div className="space-y-4 p-6">
          <header className="space-y-1">
            <h2 id="finished-goods-request-title" className="text-xl font-semibold text-slate-900">
              Request Finished-Goods Quantity
            </h2>
            <p id="finished-goods-request-description" className="text-sm text-slate-600">
              Quantities are prefilled with the fulfilled amount for each size. Adjust any size as needed; enter zero to skip it.
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="erp-table-head">
                <tr>
                  <th className="p-3">Booking</th>
                  <th className="p-3">Finished Good</th>
                  <th className="p-3">Size</th>
                  <th className="p-3 text-right">Fulfilled</th>
                  <th className="p-3">Request Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--erp-border)]">
                {isFinishedGoodsRequestOpen && selectedShipmentBookings.flatMap((booking) => booking.sizes.map((size) => (
                  <tr key={size.id}>
                    <td className="p-3 font-medium">{booking.bookingId}</td>
                    <td className="p-3">{booking.styleName || "-"}<span className="block text-xs text-slate-500">{booking.orderNo}</span></td>
                    <td className="p-3">{size.size}</td>
                    <td className="p-3 text-right">{size.fulfilledQuantity}</td>
                    <td className="p-3">
                      <Input
                        aria-label={`Request quantity for ${size.size} in booking ${booking.bookingId}`}
                        type="number"
                        min="0"
                        max={size.fulfilledQuantity}
                        step="1"
                        value={finishedGoodsRequestQuantities[size.id] ?? ""}
                        onChange={(event) => setFinishedGoodsRequestQuantities((current) => ({
                          ...current,
                          [size.id]: event.target.value,
                        }))}
                        className="max-w-32"
                      />
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          {finishedGoodsRequestError && (
            <Card role="alert" className="border-[var(--erp-danger)] bg-[var(--erp-surface-soft)] text-sm text-[var(--erp-danger)]">
              {finishedGoodsRequestError}
            </Card>
          )}
          <footer className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setIsFinishedGoodsRequestOpen(false)} disabled={isRequestingFinishedGoods}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void requestFinishedGoodsForSelectedBookings()} disabled={isRequestingFinishedGoods}>
              {isRequestingFinishedGoods ? "Requesting..." : "Submit FG Request"}
            </Button>
          </footer>
        </div>
      </Modal>
      {isQuotationVendorModalOpen ? (
        <AdvanceBookingContactLookupDialog
          isCreatingQuotation={isCreatingQuotation}
          search={contactLookupSearch}
          onSearchChange={(search) => {
            setContactLookupSearch(search);
            setSelectedQuotationVendorId("");
          }}
          selectedContactId={selectedQuotationVendorId}
          onContactChange={(contactId) => {
            setSelectedQuotationVendorId(contactId);
            setError("");
          }}
          contacts={currentAllContactVendors}
          isLoadingContacts={isLoadingAllContacts}
          contactsError={allContactsError}
          onRetry={() => void loadAllContacts(contactLookupSearch)}
          error={error}
          onSubmit={() => void createQuotationFromSelectedBookings(selectedReportBookings)}
          onClose={() => setIsQuotationVendorModalOpen(false)}
        />
      ) : null}
      {assignmentBooking ? (
        <AdvanceBookingAllocationDialog
          booking={assignmentBooking}
          assignableWorkOrders={assignableWorkOrders}
          selectedWorkOrder={selectedAssignmentWorkOrder}
          selectedWorkOrderId={selectedAssignmentWorkOrderId}
          isLoading={isLoadingAssignment}
          isSaving={isSavingAssignment}
          allocationPlan={allocationPlan}
          error={assignmentError}
          plannedStockQuantity={plannedStockQuantity}
          plannedWorkOrderQuantity={plannedWorkOrderQuantity}
          matchingWorkOrderSizeLine={matchingWorkOrderSizeLine}
          onWorkOrderChange={(workOrderId) => {
            setSelectedAssignmentWorkOrderId(workOrderId);
            setAssignmentError("");
          }}
          onAllocationPlanChange={setAllocationPlan}
          onClose={() => setAssignmentBooking(null)}
          onSave={() => void saveBookingAllocation()}
        />
      ) : null}
      <Modal
        open={showDeleteBookingsConfirmation}
        onClose={() => {
          if (!isDeletingBookings) setShowDeleteBookingsConfirmation(false);
        }}
        ariaLabelledBy="advance-booking-delete-title"
        ariaDescribedBy="advance-booking-delete-description"
        variant="danger"
        size="sm"
      >
        <div className="space-y-4 p-6">
          <header className="space-y-1">
            <h2 id="advance-booking-delete-title" className="text-xl font-semibold text-slate-900">
              Delete selected advance bookings?
            </h2>
            <p id="advance-booking-delete-description" className="text-sm text-slate-600">
              {selectedReportBookings.length} booking record(s) and their size rows will be permanently deleted. Remove any quotation first. Unfulfilled work-order assignments will be removed automatically; reverse inventory fulfillment before deleting a booking with received goods.
            </p>
          </header>
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--erp-border)] pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowDeleteBookingsConfirmation(false)}
              disabled={isDeletingBookings}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteSelectedBookings()}
              disabled={isDeletingBookings || selectedReportBookings.length === 0}
            >
              {isDeletingBookings ? "Deleting..." : "Delete Booking Records"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
