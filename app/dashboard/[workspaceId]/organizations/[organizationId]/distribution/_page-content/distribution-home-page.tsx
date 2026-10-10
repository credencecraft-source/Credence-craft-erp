"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function DistributionHomePage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const workspaceId = params?.workspaceId ?? "";
  const organizationId = params?.organizationId ?? "";
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/distribution`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <p className="erp-eyebrow">Distribution</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Distribution Module</h1>
        <p className="mt-2 text-sm text-slate-600">
          Advance booking, sales-order visibility, and quotation creation in one place.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href={`${base}/advance-booking`} className="block">
          <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">Booking</p>
            <h2 className="mt-3 text-2xl font-bold text-slate-900">Advance Booking</h2>
            <p className="mt-2 text-sm text-slate-600">
              Select an order, review size-wise demand, and save booked quantities with auto-generated booking IDs.
            </p>
            <span className="mt-6 inline-block text-sm font-semibold text-indigo-700">Open →</span>
          </div>
        </Link>

        <Link href={`${base}/quotation`} className="block">
          <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">Sales</p>
            <h2 className="mt-3 text-2xl font-bold text-slate-900">Quotation</h2>
            <p className="mt-2 text-sm text-slate-600">
              Choose one or many bookings and create a single combined quotation or separate quotations per booking.
            </p>
            <span className="mt-6 inline-block text-sm font-semibold text-indigo-700">Open →</span>
          </div>
        </Link>

        <Link href={`${base}/sales-order`} className="block">
          <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">Sales</p>
            <h2 className="mt-3 text-2xl font-bold text-slate-900">Sales Order</h2>
            <p className="mt-2 text-sm text-slate-600">
              Review sales orders and the quotation records grouped beneath each order.
            </p>
            <span className="mt-6 inline-block text-sm font-semibold text-indigo-700">Open →</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
