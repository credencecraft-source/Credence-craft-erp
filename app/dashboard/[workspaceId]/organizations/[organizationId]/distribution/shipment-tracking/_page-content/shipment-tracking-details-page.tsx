"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";

type ShipmentBooking = {
  id: string;
  bookingId: string;
  orderNo: string;
  quotationNo: string | null;
  salesOrderNo: string | null;
  customer: string;
  quotationVendor: string | null;
  masterQuotationVendor: string | null;
  brand: string;
  styleName: string;
  deliveryDate: string;
  createdAt: string;
  totalBooked: number;
  totalAssigned: number;
  totalAllocated: number;
  totalUnassigned: number;
  totalFulfilled: number;
  assignmentStatus: string;
  fulfillmentStatus: string;
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
};

export default function ShipmentTrackingDetailsPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; bookingId: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<ShipmentBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showReversalConfirmation, setShowReversalConfirmation] = useState(false);
  const [isReversingAllocation, setIsReversingAllocation] = useState(false);
  const [reversalError, setReversalError] = useState("");
  const [reversalSuccess, setReversalSuccess] = useState("");

  const loadBooking = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        organizationId: params.organizationId,
        bookingId: params.bookingId,
      });
      const response = await fetch(`/api/distribution/advance-bookings?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.booking) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load shipment details.");
      }
      setBooking(data.booking as ShipmentBooking);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load shipment details.");
    } finally {
      setLoading(false);
    }
  }, [params.bookingId, params.organizationId]);

  useEffect(() => {
    void Promise.resolve().then(loadBooking);
  }, [loadBooking]);

  async function reverseAllocationToGeneralStock() {
    if (!booking || isReversingAllocation) return;
    setIsReversingAllocation(true);
    setReversalError("");
    setReversalSuccess("");
    try {
      const response = await fetch(
        `/api/distribution/advance-bookings/${encodeURIComponent(booking.id)}/fulfillment/reversal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: params.organizationId }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.reversed) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to move allocated stock to general inventory.");
      }
      setShowReversalConfirmation(false);
      const cancelledLineCount = data.reversed.cancelledRequestLineCount ?? 0;
      const cancelledRequestCount = data.reversed.fullyCancelledRequestCount ?? 0;
      const cancelledRequestNotice = cancelledLineCount > 0
        ? ` ${cancelledLineCount} linked request line${cancelledLineCount === 1 ? "" : "s"} cancelled` +
          (cancelledRequestCount > 0
            ? `; ${cancelledRequestCount} full request${cancelledRequestCount === 1 ? "" : "s"} cancelled.`
            : "; unrelated request lines remain active.")
        : "";
      setReversalSuccess(
        `${data.reversed.reversedQuantity.toLocaleString()} PCS from ${data.reversed.bookingNo} moved to general inventory. On-hand stock was preserved.${cancelledRequestNotice}`,
      );
      await loadBooking();
    } catch (reversalError) {
      setReversalError(
        reversalError instanceof Error ? reversalError.message : "Unable to move allocated stock to general inventory.",
      );
    } finally {
      setIsReversingAllocation(false);
    }
  }

  const shipmentPath = `/dashboard/${params.workspaceId}/organizations/${params.organizationId}/advance-booking/shipment-tracking`;

  return (
    <Page as="div">
      <Section>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Advance Booking / ASN / Shipment Tracking</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Shipment Details</h1>
          </div>
          <Button type="button" variant="secondary" onClick={() => router.push(shipmentPath)}>
            Back to Shipment Tracking
          </Button>
        </header>

        {loading ? <p role="status" className="text-sm text-slate-600">Loading shipment details...</p> : null}
        {error ? (
          <Card role="alert" className="space-y-3">
            <p className="text-sm text-slate-700">{error}</p>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={() => void loadBooking()}>Retry</Button>
              <Button type="button" variant="secondary" onClick={() => router.push(shipmentPath)}>Back to Shipment Tracking</Button>
            </div>
          </Card>
        ) : null}
        {reversalSuccess ? <p role="status" className="text-sm text-slate-700">{reversalSuccess}</p> : null}
        {reversalError ? <Card role="alert" className="border-[var(--erp-danger)] p-4 text-sm">{reversalError}</Card> : null}
        {booking ? (
          <>
            <Card className="space-y-4">
              <div>
                <p className="text-sm text-slate-600">Booking ID</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">{booking.bookingId}</h2>
              </div>
              <dl className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div><dt className="text-sm text-slate-600">Order No</dt><dd className="mt-1 text-sm font-medium text-slate-900">{booking.orderNo}</dd></div>
                <div><dt className="text-sm text-slate-600">Quotation No</dt><dd className="mt-1 text-sm font-medium text-slate-900">{booking.quotationNo || "-"}</dd></div>
                <div><dt className="text-sm text-slate-600">End Customer</dt><dd className="mt-1 text-sm font-medium text-slate-900">{booking.customer || "-"}</dd></div>
                <div><dt className="text-sm text-slate-600">Dealer</dt><dd className="mt-1 text-sm font-medium text-slate-900">{booking.quotationVendor || "-"}</dd></div>
                <div><dt className="text-sm text-slate-600">Distributor</dt><dd className="mt-1 text-sm font-medium text-slate-900">{booking.masterQuotationVendor || "-"}</dd></div>
                <div><dt className="text-sm text-slate-600">Brand</dt><dd className="mt-1 text-sm font-medium text-slate-900">{booking.brand || "-"}</dd></div>
                <div><dt className="text-sm text-slate-600">Style</dt><dd className="mt-1 text-sm font-medium text-slate-900">{booking.styleName || "-"}</dd></div>
                <div><dt className="text-sm text-slate-600">Delivery Date</dt><dd className="mt-1 text-sm font-medium text-slate-900">{booking.deliveryDate || "-"}</dd></div>
                <div><dt className="text-sm text-slate-600">Created Date</dt><dd className="mt-1 text-sm font-medium text-slate-900">{booking.createdAt.slice(0, 10)}</dd></div>
                <div>
                  <dt className="text-sm text-slate-600">Work Order Assignment</dt>
                  <dd className="mt-1"><Badge>{booking.assignmentStatus.replaceAll("_", " ")}</Badge></dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-600">Fulfillment Status</dt>
                  <dd className="mt-1"><Badge>{booking.fulfillmentStatus.replaceAll("_", " ")}</Badge></dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-600">Total Booked / Assigned / Unassigned / Fulfilled</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {booking.totalBooked} / {booking.totalAssigned} / {booking.totalUnassigned} / {booking.totalFulfilled}
                  </dd>
                </div>
              </dl>
            </Card>
            {booking.salesOrderNo && booking.totalFulfilled > 0 ? (
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900">Sales Order allocation</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Return unused GRN-allocated quantities to general inventory before removing sales order {booking.salesOrderNo}.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    setReversalError("");
                    setShowReversalConfirmation(true);
                  }}
                  disabled={loading || isReversingAllocation}
                >
                  Revert allocation to general stock
                </Button>
              </Card>
            ) : null}
            <Card className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Size and Work Order Details</h2>
                <p className="mt-1 text-sm text-slate-600">Booked, assigned, and fulfilled quantities for each booking size.</p>
              </div>
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <thead className="bg-[var(--erp-surface-soft)] text-xs font-semibold uppercase text-slate-600">
                    <tr>
                      <th scope="col" className="px-3 py-2">Size</th>
                      <th scope="col" className="px-3 py-2">Booked Qty</th>
                      <th scope="col" className="px-3 py-2">Assigned Qty</th>
                      <th scope="col" className="px-3 py-2">Unassigned Qty</th>
                      <th scope="col" className="px-3 py-2">Fulfilled Qty</th>
                      <th scope="col" className="px-3 py-2">Size Status</th>
                      <th scope="col" className="px-3 py-2">Work Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--erp-border)]">
                    {booking.sizes.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2 font-medium text-slate-900">{line.size}</td>
                        <td className="px-3 py-2">{line.bookedQuantity}</td>
                        <td className="px-3 py-2">{line.assignedQuantity}</td>
                        <td className="px-3 py-2">{line.unassignedQuantity}</td>
                        <td className="px-3 py-2">{line.fulfilledQuantity}</td>
                        <td className="px-3 py-2"><Badge>{line.fulfillmentStatus.replaceAll("_", " ")}</Badge></td>
                        <td className="space-y-1 px-3 py-2">
                          {line.assignments.length > 0
                            ? line.assignments.map((assignment) => (
                              <div key={assignment.id}>
                                <span className="font-medium">{assignment.workOrderNo}</span>
                                {`: ${assignment.assignedQuantity} assigned, ${assignment.fulfilledQuantity} fulfilled, ${assignment.remainingQuantity} remaining`}
                              </div>
                            ))
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          </>
        ) : null}
      </Section>
      <Modal
        open={showReversalConfirmation}
        onClose={() => {
          if (!isReversingAllocation) setShowReversalConfirmation(false);
        }}
        ariaLabelledBy="booking-allocation-reversal-title"
        ariaDescribedBy="booking-allocation-reversal-description"
        variant="danger"
        size="sm"
      >
        <div className="space-y-4 p-6">
          <header className="space-y-1">
            <h2 id="booking-allocation-reversal-title" className="text-lg font-semibold text-slate-900">
              Revert allocation to general stock?
            </h2>
            <p id="booking-allocation-reversal-description" className="text-sm text-slate-600">
              Unused quantities fulfilled from this booking&apos;s Work Order GRNs will be released from this booking and returned to general inventory. On-hand stock and the GRN audit history are preserved. This is blocked if stock has been issued, reserved by an active request, or the GRN quantities cannot be reconciled.
            </p>
          </header>
          {reversalError ? <p role="alert" className="text-sm text-[var(--erp-danger)]">{reversalError}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowReversalConfirmation(false)}
              disabled={isReversingAllocation}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void reverseAllocationToGeneralStock()}
              disabled={isReversingAllocation}
            >
              {isReversingAllocation ? "Reverting..." : "Confirm reversal"}
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
