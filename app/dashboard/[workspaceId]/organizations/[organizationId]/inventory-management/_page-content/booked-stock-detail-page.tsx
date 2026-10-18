"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type BookedStock = {
  id: string;
  takeFromStockId: string;
  currentStoreVendor: string;
  rawMaterial: string;
  location: string;
  entity: string;
  orderNo: string;
  styleName: string | null;
  bookedQuantity: number;
  fulfilledQuantity: number;
  status: string;
  bookedBy: string | null;
  bookedAt: string;
};

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-[var(--erp-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{value || "-"}</dd>
    </div>
  );
}

export default function BookedStockDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; bookingId: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<BookedStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reportPath = `/dashboard/${params.workspaceId}/organizations/${params.organizationId}/inventory-management/stock/rm-stock/general-inventory`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/inventory/booked-stock?organizationId=${encodeURIComponent(params.organizationId)}&bookingId=${encodeURIComponent(params.bookingId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.booking) {
          throw new Error(data.error || "Unable to load booked stock record.");
        }
        setBooking(data.booking as BookedStock);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load booked stock record.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params.bookingId, params.organizationId, reloadKey]);

  return (
    <Page as="div">
      <Section>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Inventory / Stock / Booked Stock</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--erp-text)]">Booking Details</h1>
          </div>
          <Button type="button" variant="secondary" onClick={() => router.push(reportPath)}>
            Back to Booked Stock
          </Button>
        </header>
        {loading ? <p role="status" className="text-sm text-[var(--erp-muted)]">Loading booked stock...</p> : null}
        {error ? (
          <Card role="alert" className="space-y-3 border-[var(--erp-danger)] text-sm">
            <p>{error}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLoading(true);
                setError("");
                setBooking(null);
                setReloadKey((key) => key + 1);
              }}
            >
              Retry
            </Button>
          </Card>
        ) : null}
        {booking ? (
          <Card>
            <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField label="Booking ID" value={booking.id} />
              <DetailField label="Status" value={booking.status} />
              <DetailField label="Booked At" value={new Date(booking.bookedAt).toLocaleString("en-IN")} />
              <DetailField label="Raw Material" value={booking.rawMaterial} />
              <DetailField label="Source Stock ID" value={booking.takeFromStockId} />
              <DetailField label="Current Store Vendor" value={booking.currentStoreVendor} />
              <DetailField label="Entity" value={booking.entity} />
              <DetailField label="Location" value={booking.location} />
              <DetailField label="Order Number" value={booking.orderNo} />
              <DetailField label="Style" value={booking.styleName ?? ""} />
              <DetailField label="Booked Quantity" value={booking.bookedQuantity.toLocaleString("en-IN")} />
              <DetailField label="Fulfilled Quantity" value={booking.fulfilledQuantity.toLocaleString("en-IN")} />
              <DetailField label="Booked By" value={booking.bookedBy ?? ""} />
            </dl>
          </Card>
        ) : null}
      </Section>
    </Page>
  );
}
