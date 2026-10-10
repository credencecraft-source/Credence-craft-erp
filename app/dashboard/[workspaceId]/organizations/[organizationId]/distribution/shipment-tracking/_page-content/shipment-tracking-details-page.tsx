"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";

type ShipmentBooking = {
  id: string;
  bookingId: string;
  orderNo: string;
  quotationNo: string | null;
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
    const initialLoad = window.setTimeout(() => void loadBooking(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadBooking]);

  const shipmentPath = `/dashboard/${params.workspaceId}/organizations/${params.organizationId}/distribution/shipment-tracking`;

  return (
    <Page as="div">
      <Section>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Distribution / ASN / Shipment Tracking</p>
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
                <div><dt className="text-sm text-slate-600">Booking Vendor</dt><dd className="mt-1 text-sm font-medium text-slate-900">{booking.customer || "-"}</dd></div>
                <div><dt className="text-sm text-slate-600">Quotation Vendor</dt><dd className="mt-1 text-sm font-medium text-slate-900">{booking.quotationVendor || "-"}</dd></div>
                <div><dt className="text-sm text-slate-600">Sales Order Vendor</dt><dd className="mt-1 text-sm font-medium text-slate-900">{booking.masterQuotationVendor || "-"}</dd></div>
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
    </Page>
  );
}
