"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { ReportGrid } from "@/components/reports/report-grid-display";
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
  { key: "customer", label: "End Customer" },
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

export default function AdvanceBookingPage({ view = "booking" }: { view?: "booking" | "fulfillment" | "shipment" } = {}) {
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
  const [allContactVendors, setAllContactVendors] = useState<{
    organizationId: string;
    search: string;
    options: VendorOption[];
  } | null>(null);
  const [contactLookupSearch, setContactLookupSearch] = useState("");
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [isLoadingAllContacts, setIsLoadingAllContacts] = useState(false);
  const [vendorsError, setVendorsError] = useState("");
  const [allContactsError, setAllContactsError] = useState("");
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [showAllQuotationContacts, setShowAllQuotationContacts] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [selectedQuotationVendorId, setSelectedQuotationVendorId] = useState("");
  const [orderDetailsRetry, setOrderDetailsRetry] = useState(0);
  const [orderDetails, setOrderDetails] = useState<{ id: string; order: OrderDetails } | null>(null);
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

  const loadBookings = useCallback(async (
    signal?: AbortSignal,
    options: { silent?: boolean; cursor?: string; preservePages?: boolean } = {},
  ) => {
    if (options.cursor) setIsLoadingMoreBookings(true);
    else if (!options.silent) setIsLoadingBookings(true);
    setBookingsError("");
    try {
      const query = new URLSearchParams({ organizationId, limit: String(ADVANCE_BOOKING_PAGE_SIZE), view });
      if (options.cursor) query.set("cursor", options.cursor);
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
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) void loadBookings(controller.signal);
    });
    return () => {
      controller.abort();
    };
  }, [isCreating, loadBookings, view]);

  const selectedOrder = orderDetails?.id === selectedOrderId ? orderDetails.order : null;
  const currentAllContactVendors = allContactVendors?.organizationId === organizationId
    && allContactVendors.search === contactLookupSearch.trim()
    ? allContactVendors.options
    : null;
  const selectedAllContactVendor = currentAllContactVendors?.find((vendor) => vendor.id === selectedVendorId) ?? null;
  const endCustomerVendors = showAllContacts && currentAllContactVendors
    ? currentAllContactVendors
    : vendors;
  const selectedVendor = endCustomerVendors.find((vendor) => vendor.id === selectedVendorId) ?? null;
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
    [bookings, view],
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
    () => workOrderTrackingRows.filter((booking) => selectedBookingIds.includes(booking.bookingId)),
    [workOrderTrackingRows, selectedBookingIds],
  );
  const selectedShipmentBookings = useMemo(
    () => shipmentTrackingRows.filter((booking) => selectedBookingIds.includes(booking.bookingId)),
    [shipmentTrackingRows, selectedBookingIds],
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
    if (view !== "booking" || !isCreating) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) void loadInitialOrders(controller.signal);
    });
    return () => {
      controller.abort();
    };
  }, [isCreating, loadInitialOrders, view]);

  const loadVendors = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingVendors(true);
    setVendorsError("");
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/master-data/vendor?includeInactive=false&includeDummyData=true&limit=200`,
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
    if (view !== "booking" || (!isCreating && !isQuotationVendorModalOpen)) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) void loadVendors(controller.signal);
    });
    return () => {
      controller.abort();
    };
  }, [isCreating, isQuotationVendorModalOpen, loadVendors, view]);

  useEffect(() => {
    const contactLookupRequested = view === "booking"
      && ((isCreating && showAllContacts) || (isQuotationVendorModalOpen && showAllQuotationContacts));
    if (!contactLookupRequested || currentAllContactVendors !== null) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void loadAllContacts(contactLookupSearch, controller.signal);
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [contactLookupSearch, currentAllContactVendors, isCreating, isQuotationVendorModalOpen, loadAllContacts, showAllContacts, showAllQuotationContacts, view]);

  useEffect(() => {
    if (view !== "booking" || !isCreating || !selectedOrderId) return;

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
          setOrderDetails({ id: selectedOrderId, order: data.order });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setOrderDetailsError("Unable to load the selected order’s finished-goods sizes.");
        }
      });

    return () => controller.abort();
  }, [isCreating, organizationId, orderDetailsRetry, selectedOrderId, view]);

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

  async function loadMoreBookings() {
    if (!nextBookingCursor || isLoadingMoreBookings || isLoadingBookings) return;
    await loadBookings(undefined, { cursor: nextBookingCursor });
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
          vendorId: selectedVendor?.contactId ? "" : selectedVendor?.id ?? "",
          contactId: selectedVendor?.contactId ?? "",
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
      setIsCreating(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save advance booking.");
    } finally {
      setIsSubmittingBooking(false);
    }
  }

  function matchingWorkOrderSizeLine(workOrder: AssignableWorkOrder | null, size: string) {
    return workOrder?.sizeLines.find((line) =>
      line.size.trim().toLocaleUpperCase() === size.trim().toLocaleUpperCase(),
    );
  }

  function plannedStockQuantity(line: BookingRecord["sizes"][number]) {
    if (allocationPlan !== "general-stock-first" || assignmentBooking?.orderSourceStatus !== "ARTICLE_BASED") return 0;
    return Math.min(line.generalInventoryAvailableQuantity, line.unassignedQuantity);
  }

  function plannedWorkOrderQuantity(line: BookingRecord["sizes"][number]) {
    if (allocationPlan === "general-stock-first" && !selectedAssignmentWorkOrder) return 0;
    return Math.max(line.unassignedQuantity - plannedStockQuantity(line), 0);
  }

  async function openAssignment(booking: BookingRecord) {
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
  }

  async function saveBookingAllocation() {
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
  }

  function startCreating() {
    setError("");
    setStatus("");
    setIsCreating(true);
  }

  async function createQuotationFromSelectedBookings(selectedBookings: BookingRecord[]) {
    if (view !== "booking") return;
    setError("");
    setStatus("");
    if (quotationSelectionError || !selectedQuotationVendorId || isCreatingQuotation) {
      setError(quotationSelectionError || (!selectedQuotationVendorId
        ? "Select a Dealer or Contact for the quotation."
        : "Wait for the current quotation to finish saving."));
      return;
    }
    const isContactSelection = selectedQuotationVendorId.startsWith("contact:");
    const selectedCounterpartyId = selectedQuotationVendorId.slice(selectedQuotationVendorId.indexOf(":") + 1);
    if (!selectedCounterpartyId) {
      setError("Select a valid Dealer or Contact for the quotation.");
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
          vendorId: isContactSelection ? null : selectedCounterpartyId,
          contactId: isContactSelection ? selectedCounterpartyId : null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.quotation || typeof data.quotation.id !== "string") {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to create the quotation.");
      }
      setSelectedBookingIds([]);
      setIsQuotationVendorModalOpen(false);
      const createdQuotation = data.quotation as { quotationNo?: string; customer?: string };
      const quotationNo = createdQuotation.quotationNo ?? null;
      setBookings((current) => current.map((booking) =>
        selectedBookings.some((selected) => selected.id === booking.id)
          ? {
              ...booking,
              quotationNo,
              quotationVendor: createdQuotation.customer ?? booking.quotationVendor,
            }
          : booking,
      ));
      setStatus(
        `${typeof data.quotation.quotationNo === "string" ? `${data.quotation.quotationNo} was` : "Quotation was"} created and saved as a draft. Unit prices default to 0.00.`,
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
        <Card className="space-y-3 p-3 shadow-none">
          <form onSubmit={handleSubmit} className="space-y-3">
            <section className="space-y-3">
              <div className="border-b border-slate-200 pb-2">
                <h2 className="text-base font-semibold text-slate-900">Advance Booking Header</h2>
                <p className="mt-1 text-sm text-slate-600">Choose an order, optionally assign an End Customer, then enter quantities by finished-goods size.</p>
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
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Select
                      label="End Customer (Optional)"
                      value={selectedVendorId}
                      onChange={(event) => {
                        setSelectedVendorId(event.target.value);
                        setError("");
                      }}
                      options={[
                        {
                          label: isLoadingVendors
                            ? "Loading Vendor Master..."
                            : showAllContacts && isLoadingAllContacts
                              ? "Searching contacts..."
                              : "No End Customer",
                          value: "",
                        },
                        ...endCustomerVendors.map((vendor) => ({ label: vendor.label, value: vendor.id })),
                      ]}
                      disabled={showAllContacts ? isLoadingAllContacts : isLoadingVendors}
                    />
                  </div>
                  <Checkbox
                    label="LIST ALL"
                    checked={showAllContacts}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      if (!checked && selectedAllContactVendor) setSelectedVendorId("");
                      setShowAllContacts(checked);
                      setContactLookupSearch("");
                    }}
                    className="mt-0.5 shrink-0"
                  />
                </div>
                {showAllContacts ? (
                  <>
                    <Input
                      label="Search Contact Master"
                      value={contactLookupSearch}
                      onChange={(event) => {
                        setContactLookupSearch(event.target.value);
                        setSelectedVendorId("");
                      }}
                      placeholder="Search name or code"
                    />
                    <p className="text-xs text-slate-600">Showing up to 100 matches. Refine your search if the contact is not listed.</p>
                  </>
                ) : null}
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
              {showAllContacts && allContactsError ? (
                <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">
                  <span>{allContactsError}</span>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void loadAllContacts(contactLookupSearch)} disabled={isLoadingAllContacts}>
                    Retry Contact Search
                  </Button>
                </div>
              ) : null}
              {!showAllContacts && !isLoadingVendors && !vendorsError && vendors.length === 0 ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p role="status" className="text-sm text-slate-600">No active End Customer is available. End Customer is optional.</p>
                </div>
              ) : null}
              {showAllContacts && currentAllContactVendors?.length === 0 && !isLoadingAllContacts && !allContactsError ? (
                <p role="status" className="text-sm text-slate-600">No contacts are available in Contact Master.</p>
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
                <p className="mt-1 text-sm text-slate-600">
                  Book Qty may exceed the current balance. Excess booked is calculated automatically.
                </p>
              </div>
              {!selectedOrder ? (
                <p role="status" className="text-sm text-slate-600">
                  {selectedOrderId ? "Loading selected order sizes..." : "Select an organization order to load its finished-goods sizes."}
                </p>
              ) : Object.keys(finishedGoodsBySize).length ? null : (
                <p role="status" className="text-sm text-slate-600">This order has no finished-goods size quantities.</p>
              )}
              <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[52rem] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                    <tr>
                      <th scope="col" className="px-3 py-2">Size</th>
                      <th scope="col" className="px-3 py-2">Order Qty</th>
                      <th scope="col" className="px-3 py-2">Already Booked</th>
                      <th scope="col" className="px-3 py-2">Balance to Book</th>
                      <th scope="col" className="px-3 py-2">Excess booked</th>
                      <th scope="col" className="px-3 py-2">Book Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {Object.keys(finishedGoodsBySize).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                          Select an order with finished-goods sizes to enter booking quantities.
                        </td>
                      </tr>
                    )}
                    {Object.keys(finishedGoodsBySize).map((size) => {
                      const orderQty = finishedGoodsBySize[size];
                      const alreadyBooked = bookedTotals[size] ?? 0;
                      const balanceToBook = Math.max(0, orderQty - alreadyBooked);
                      const excessBooked = Math.max(0, (entry[size] ?? 0) - balanceToBook);

                      return (
                        <tr key={size}>
                          <td className="px-3 py-1.5 font-medium text-slate-700">{size}</td>
                          <td className="px-3 py-1.5 text-slate-700">{orderQty}</td>
                          <td className="px-3 py-1.5 text-slate-700">{alreadyBooked}</td>
                          <td className="px-3 py-1.5 font-medium text-slate-900">{balanceToBook}</td>
                          <td className="px-3 py-1.5">
                            <Input
                              type="number"
                              value={String(excessBooked)}
                              className="max-w-40"
                              disabled
                              readOnly
                              aria-label={`Excess booked quantity for size ${size}`}
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <Input
                              type="number"
                              min={0}
                              max={2147483647}
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
                  ? "Loading optional End Customers..."
                  : !selectedOrder
                    ? "Select an order to enable saving."
                    : "Ready to save; End Customer is optional."}
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsCreating(false);
                    setEntry(emptySizes());
                    setError("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!selectedOrder || Boolean(bookingsError) || isSubmittingBooking}
                  title={!selectedOrder ? "Select an order before saving." : undefined}
                >
                  {isSubmittingBooking ? "Saving booking..." : "Submit Advance Booking"}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      ) : (
        <>
        {view !== "shipment" ? <Card className="p-1 shadow-none">
          <ReportGrid
            title={view === "fulfillment" ? "Work Order Tracking Report" : "Advance Bookings"}
            records={workOrderTrackingRows}
            isLoading={isLoadingBookings}
            fields={view === "fulfillment" ? fulfillmentReportFields : advanceBookingReportFields}
            visibleFields={visibleReportFields}
            onVisibleFieldsChange={(fields) => setVisibleReportFields(orderBookingReportFields(fields as BookingReportField[]))}
            storageKey={`distribution-booking-report-columns:v2:${organizationId}`}
            rowIdSelector={getBookingRowId}
            selectedIds={selectedBookingIds}
            selectable={view === "booking"}
            onToggleSelectAll={(checked) => setSelectedBookingIds(checked ? workOrderTrackingRows.map((booking) => booking.bookingId) : [])}
            onToggleRowSelection={(bookingId, checked) => setSelectedBookingIds((current) =>
              checked
                ? current.includes(bookingId) ? current : [...current, bookingId]
                : current.filter((id) => id !== bookingId),
            )}
            onRowClick={(bookingId) => {
              const booking = workOrderTrackingRows.find((record) => record.bookingId === bookingId);
              if (booking) handleOpenShipmentDetails(booking);
            }}
            onRowAction={view === "fulfillment" ? (bookingId) => {
              const booking = workOrderTrackingRows.find((record) => record.bookingId === bookingId);
              if (booking) void openAssignment(booking);
            } : undefined}
            rowActionPosition="start"
            rowActionLabel="Allocate"
            rowActionDisabledSelector={(booking) =>
              booking.totalUnassigned <= 0 || isLoadingBookings || isSavingAssignment
            }
            rowActionHiddenSelector={(booking) => !booking.salesOrderNo}
            onNewOrder={view === "booking" ? startCreating : undefined}
            newActionLabel="Create Advance Booking"
            toolbarActions={(
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
                    onClick={() => {
                      setError("");
                      setIsQuotationVendorModalOpen(true);
                    }}
                  >
                    {isCreatingQuotation ? "Creating Quotation..." : `Create & Save Quotation${selectedBookingIds.length > 0 ? ` (${selectedBookingIds.length})` : ""}`}
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" size="sm" onClick={() => void loadBookings(undefined, { preservePages: true })} disabled={isLoadingBookings}>
                  Refresh bookings
                </Button>
                {nextBookingCursor ? (
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
            )}
            emptyMessage={isLoadingBookings
              ? "Loading advance bookings..."
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
              isLoading={isLoadingBookings}
              fields={shipmentTrackingReportFields}
              visibleFields={visibleReportFields}
              onVisibleFieldsChange={(fields) => setVisibleReportFields(orderBookingReportFields(fields as BookingReportField[]))}
              storageKey={`distribution-shipment-tracking-report-columns:v2:${organizationId}`}
              rowIdSelector={getBookingRowId}
              selectedIds={selectedBookingIds}
              selectable
              onToggleSelectAll={(checked) => setSelectedBookingIds(checked ? shipmentTrackingRows.map((booking) => booking.bookingId) : [])}
              onToggleRowSelection={(bookingId, checked) => setSelectedBookingIds((current) =>
                checked
                  ? current.includes(bookingId) ? current : [...current, bookingId]
                  : current.filter((id) => id !== bookingId),
              )}
              onRecordClick={handleOpenShipmentDetails}
              onRowClick={(bookingId) => {
                const booking = shipmentTrackingRows.find((record) => record.bookingId === bookingId);
                if (booking) handleOpenShipmentDetails(booking);
              }}
              toolbarActions={(
                <>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={selectedShipmentBookings.length === 0 || isLoadingBookings || isRequestingFinishedGoods ||
                      selectedShipmentBookings.some((booking) => !booking.quotationVendor?.trim() || !booking.masterQuotationVendor?.trim())}
                    title={selectedShipmentBookings.some((booking) => !booking.quotationVendor?.trim() || !booking.masterQuotationVendor?.trim())
                      ? "Quotation and Sales Order vendors are required before requesting finished goods."
                      : undefined}
                    onClick={() => {
                      setFinishedGoodsRequestQuantities(Object.fromEntries(
                        selectedShipmentBookings.flatMap((booking) =>
                          booking.sizes.map((size) => [size.id, String(size.fulfilledQuantity)]),
                        ),
                      ));
                      setFinishedGoodsRequestError("");
                      setIsFinishedGoodsRequestOpen(true);
                    }}
                  >
                    Request FG Quantity{selectedShipmentBookings.length > 0 ? ` (${selectedShipmentBookings.length})` : ""}
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void loadBookings(undefined, { preservePages: true })} disabled={isLoadingBookings}>
                    Refresh bookings
                  </Button>
                  {nextBookingCursor ? (
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
              )}
              emptyMessage={isLoadingBookings
                ? "Loading shipment tracking..."
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
      <Modal
        open={isQuotationVendorModalOpen}
        onClose={() => {
          if (!isCreatingQuotation) setIsQuotationVendorModalOpen(false);
        }}
        ariaLabelledBy="quotation-vendor-title"
        size="sm"
        closeOnBackdrop={!isCreatingQuotation}
      >
        <form
          className="space-y-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void createQuotationFromSelectedBookings(selectedReportBookings);
          }}
        >
          <header className="space-y-1">
            <h2 id="quotation-vendor-title" className="text-lg font-semibold text-slate-900">Create Quotation</h2>
            <p className="text-sm text-slate-600">Select a Dealer, or enable LIST ALL to choose any Contact Master contact. End Customer remains optional.</p>
          </header>
          <Checkbox
            label="LIST ALL"
            checked={showAllQuotationContacts}
            onChange={(event) => {
              setShowAllQuotationContacts(event.target.checked);
              setSelectedQuotationVendorId("");
              setError("");
              setContactLookupSearch("");
            }}
            disabled={isCreatingQuotation}
          />
          {showAllQuotationContacts ? (
            <>
              <Input
                label="Search Contact Master"
                value={contactLookupSearch}
                onChange={(event) => {
                  setContactLookupSearch(event.target.value);
                  setSelectedQuotationVendorId("");
                }}
                placeholder="Search name or code"
                disabled={isCreatingQuotation}
              />
              <p className="text-xs text-slate-600">Showing up to 100 matches. Refine your search if the contact is not listed.</p>
            </>
          ) : null}
          <Select
            label="Dealer / Contact"
            required
            value={selectedQuotationVendorId}
            onChange={(event) => {
              setSelectedQuotationVendorId(event.target.value);
              setError("");
            }}
            options={[
              {
                label: showAllQuotationContacts
                  ? isLoadingAllContacts ? "Searching contacts..." : "Select a Contact"
                  : isLoadingVendors ? "Loading vendors..." : "Select a Dealer",
                value: "",
              },
              ...(showAllQuotationContacts
                ? (currentAllContactVendors ?? []).map((contact) => ({
                    label: contact.label,
                    value: `contact:${contact.contactId ?? contact.id}`,
                  }))
                : vendors.map((vendor) => ({ label: vendor.label, value: `vendor:${vendor.id}` }))),
            ]}
            disabled={(showAllQuotationContacts ? isLoadingAllContacts : isLoadingVendors) || isCreatingQuotation}
          />
          {showAllQuotationContacts && allContactsError ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">
              <span>{allContactsError}</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => void loadAllContacts(contactLookupSearch)} disabled={isLoadingAllContacts}>
                Retry Contact Search
              </Button>
            </div>
          ) : null}
          {showAllQuotationContacts && currentAllContactVendors?.length === 0 && !isLoadingAllContacts && !allContactsError ? (
            <p role="status" className="text-sm text-slate-600">No contacts are available in Contact Master.</p>
          ) : null}
          {showAllQuotationContacts ? (
            <p className="text-sm text-slate-600">Contacts without a Vendor Master record are saved on the quotation by name.</p>
          ) : null}
          {!showAllQuotationContacts && !isLoadingVendors && !vendorsError && vendors.length === 0 ? (
            <p role="status" className="text-sm text-slate-600">No active Dealers are available. Enable LIST ALL to choose a Contact Master contact.</p>
          ) : null}
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <footer className="flex justify-end gap-3 border-t border-[var(--erp-border)] pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsQuotationVendorModalOpen(false)} disabled={isCreatingQuotation}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!selectedQuotationVendorId || (showAllQuotationContacts ? isLoadingAllContacts : isLoadingVendors) || isCreatingQuotation}
            >
              {isCreatingQuotation ? "Creating..." : "Create Quotation"}
            </Button>
          </footer>
        </form>
      </Modal>
      <Modal
        open={assignmentBooking !== null}
        onClose={() => { if (!isSavingAssignment) setAssignmentBooking(null); }}
        ariaLabelledBy="advance-booking-assignment-title"
        ariaDescribedBy="advance-booking-assignment-description"
        size="2xl"
      >
        {assignmentBooking ? (
          <div className="space-y-6 p-6">
            <header className="space-y-2">
              <h2 id="advance-booking-assignment-title" className="text-xl font-semibold text-slate-900">
                Allocate Booking
              </h2>
              <p id="advance-booking-assignment-description" className="text-sm text-slate-600">
                {assignmentBooking.bookingId} · {assignmentBooking.orderNo}. Choose an allocation plan and review the automatic size-wise quantities.
              </p>
            </header>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Booking balance", value: assignmentBooking.totalUnassigned },
                {
                  label: "Order type",
                  value: assignmentBooking.orderSourceStatus === "ARTICLE_BASED" ? "Article-based" : "Direct",
                },
                {
                  label: assignmentBooking.orderSourceStatus === "ARTICLE_BASED" && allocationPlan === "general-stock-first"
                    ? "Available to take from stock"
                    : "To work order",
                  value: isLoadingAssignment
                    ? "Loading…"
                    : assignmentBooking.orderSourceStatus === "ARTICLE_BASED"
                      ? allocationPlan === "general-stock-first"
                        ? assignmentBooking.sizes.reduce((sum, line) => sum + plannedStockQuantity(line), 0)
                        : assignmentBooking.sizes.reduce((sum, line) => sum + plannedWorkOrderQuantity(line), 0)
                      : selectedAssignmentWorkOrder
                        ? assignmentBooking.totalUnassigned
                        : "Select below",
                },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-600">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>

            {isLoadingAssignment ? (
              <p role="status" className="text-sm text-slate-600">Loading work orders for this booking...</p>
            ) : (
              <Select
                label={allocationPlan === "work-order-only"
                  ? "Work Order (required)"
                  : "Work Order for remaining quantities (optional)"}
                value={selectedAssignmentWorkOrderId}
                onChange={(event) => {
                  setSelectedAssignmentWorkOrderId(event.target.value);
                  setAssignmentError("");
                }}
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

            {assignmentBooking.orderSourceStatus === "ARTICLE_BASED" ? (
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
                    disabled={isSavingAssignment}
                    onClick={() => setAllocationPlan("general-stock-first")}
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
                    disabled={isSavingAssignment}
                    onClick={() => setAllocationPlan("work-order-only")}
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
                  {assignmentBooking.orderSourceStatus === "ARTICLE_BASED"
                    ? allocationPlan === "general-stock-first"
                      ? selectedAssignmentWorkOrder
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
                      {assignmentBooking.orderSourceStatus === "ARTICLE_BASED" ? (
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
                    {assignmentBooking.sizes.map((line) => {
                      const stockQuantity = plannedStockQuantity(line);
                      const quantityToWorkOrder = plannedWorkOrderQuantity(line);
                      const workOrderLine = matchingWorkOrderSizeLine(selectedAssignmentWorkOrder, line.size);
                      const workOrderBalance = workOrderLine?.availableQuantity ?? 0;
                      const notYetAllocated = Math.max(line.unassignedQuantity - stockQuantity - quantityToWorkOrder, 0);
                      return (
                        <tr key={line.id}>
                          <td className="px-3 py-3 font-medium text-slate-900">{line.size}</td>
                          <td className="px-3 py-3">{line.unassignedQuantity}</td>
                          {assignmentBooking.orderSourceStatus === "ARTICLE_BASED" ? (
                            <>
                              <td className="px-3 py-3">{line.generalInventoryAvailableQuantity}</td>
                              <td className="px-3 py-3 font-medium">{stockQuantity}</td>
                            </>
                          ) : null}
                          <td className="px-3 py-3">
                            {selectedAssignmentWorkOrder
                              ? workOrderLine?.availableQuantity ?? "Size unavailable"
                              : allocationPlan === "general-stock-first"
                                ? "Optional"
                                : "Select a work order"}
                          </td>
                          <td className="px-3 py-3 font-medium">{quantityToWorkOrder}</td>
                          <td className="px-3 py-3">
                            {selectedAssignmentWorkOrder && quantityToWorkOrder > workOrderBalance
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--erp-border)] pt-4">
              <p className="text-sm text-slate-600">
                General Stock can be submitted alone. Any unassigned balance stays in Work Order Tracking; selected stock and Work Order allocations save together.
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAssignmentBooking(null)}
                  disabled={isSavingAssignment}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void saveBookingAllocation()}
                  disabled={isLoadingAssignment || isSavingAssignment || (
                    !assignmentBooking.sizes.some((line) =>
                      plannedStockQuantity(line) > 0 || plannedWorkOrderQuantity(line) > 0,
                    ) ||
                    assignmentBooking.sizes.some((line) => plannedWorkOrderQuantity(line) > 0) &&
                    !selectedAssignmentWorkOrder
                  ) || assignmentBooking.sizes.some((line) => {
                    const workOrderLine = matchingWorkOrderSizeLine(selectedAssignmentWorkOrder, line.size);
                    return plannedWorkOrderQuantity(line) > (workOrderLine?.availableQuantity ?? 0);
                  })}
                >
                  {isSavingAssignment ? "Saving allocation..." : "Save Allocation"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
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
