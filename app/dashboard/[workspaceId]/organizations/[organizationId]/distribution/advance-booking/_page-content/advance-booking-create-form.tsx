"use client";

import type { FormEvent } from "react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

type OrderRecord = {
  id: string;
  orderNo: string;
  entityName?: string | null;
  buyer?: string | null;
  brand?: string | null;
  styleName?: string | null;
  deliveryDate?: string | null;
};

type OrderDetails = OrderRecord & {
  finishedGoods?: Array<{
    size?: string | null;
    buyerSize?: string | null;
    beforeExcessQty?: number | null;
    totalQty?: number | null;
  }>;
};

export type AdvanceBookingCreateFormProps = {
  orders: OrderRecord[];
  selectedOrder: OrderDetails | null;
  selectedOrderId: string;
  isLoadingOrders: boolean;
  ordersError: string;
  nextOrderCursor: string | null;
  isLoadingMoreOrders: boolean;
  onOrderChange: (orderId: string) => void;
  onLoadMoreOrders: () => void;
  orderDetailsError: string;
  onRetryOrderDetails: () => void;
  finishedGoodsBySize: Record<string, number>;
  bookedTotals: Record<string, number>;
  entry: Record<string, number>;
  onEntryChange: (size: string, value: string) => void;
  error: string;
  bookingsError: string;
  isSubmittingBooking: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
};

export default function AdvanceBookingCreateForm({
  orders,
  selectedOrder,
  selectedOrderId,
  isLoadingOrders,
  ordersError,
  nextOrderCursor,
  isLoadingMoreOrders,
  onOrderChange,
  onLoadMoreOrders,
  orderDetailsError,
  onRetryOrderDetails,
  finishedGoodsBySize,
  bookedTotals,
  entry,
  onEntryChange,
  error,
  bookingsError,
  isSubmittingBooking,
  onSubmit,
  onCancel,
}: AdvanceBookingCreateFormProps) {
  return (
    <Card className="space-y-3 p-3 shadow-none">
      <form onSubmit={onSubmit} className="space-y-3">
        <section className="space-y-3">
          <div className="border-b border-slate-200 pb-2">
            <h2 className="text-base font-semibold text-slate-900">Advance Booking Header</h2>
            <p className="mt-1 text-sm text-slate-600">Choose an order, then enter quantities by finished-goods size.</p>
          </div>
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Input label="Booking ID" value="Generated when saved" readOnly />
            <Select
              label="Order No"
              value={selectedOrderId}
              onChange={(event) => onOrderChange(event.target.value)}
              options={orders.map((order) => ({
                label: `${order.orderNo}${order.entityName || order.buyer ? ` · ${order.entityName ?? order.buyer}` : ""}`,
                value: order.id,
              }))}
              disabled={isLoadingOrders || orders.length === 0}
              required
            />
            <Input label="Brand" value={selectedOrder?.brand ?? ""} readOnly />
            <Input label="Style" value={selectedOrder?.styleName ?? ""} readOnly />
            <Input label="Delivery Date" type="date" value={selectedOrder?.deliveryDate?.slice(0, 10) ?? ""} readOnly />
          </div>
          {isLoadingOrders ? (
            <p role="status" className="text-sm text-slate-600">Loading organization orders...</p>
          ) : null}
          {orders.length === 0 && !isLoadingOrders && !ordersError ? (
            <p role="status" className="text-sm text-slate-600">No merchandising orders are available for advance booking.</p>
          ) : null}
          {nextOrderCursor ? (
            <Button type="button" variant="secondary" size="sm" onClick={onLoadMoreOrders} disabled={isLoadingMoreOrders}>
              {isLoadingMoreOrders ? "Loading orders..." : "Load more orders"}
            </Button>
          ) : null}
          {orderDetailsError ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">
              <span>{orderDetailsError}</span>
              <Button type="button" variant="secondary" size="sm" onClick={onRetryOrderDetails}>
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
                          onChange={(event) => onEntryChange(size, event.target.value)}
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
            {!selectedOrder ? "Select an order to enable saving." : "Ready to save."}
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onCancel}>
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
  );
}
