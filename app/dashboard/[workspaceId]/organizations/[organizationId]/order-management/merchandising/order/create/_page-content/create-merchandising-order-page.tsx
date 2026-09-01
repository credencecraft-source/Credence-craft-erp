"use client";

import { startTransition, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function CreateMerchandisingOrderPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";

  const [orders, setOrders] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("DRAFT");

  useEffect(() => {
    let isMounted = true;
    
    // Render immediately with empty state or cached shell, fetch data asynchronously in background
    async function fetchOrdersAsync() {
      try {
        const res = await fetch(`/api/orders?organizationId=${encodeURIComponent(organizationId)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setOrders(data.orders ?? data ?? []);
          }
        }
      } catch (err) {
        console.error("Background sync failed", err);
      }
    }

    fetchOrdersAsync();

    return () => {
      isMounted = false;
    };
  }, [organizationId]);

  const handleCreateNew = () => {
    startTransition(() => {
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/create`);
    });
  };

  const handleRowClick = (orderId: string) => {
    startTransition(() => {
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/${orderId}`);
    });
  };

  const tabs = ["DRAFT", "WAITING FOR APPROVAL", "APPROVED", "WAITING FOR PRODUCTION SCHEDULE", "WORK ORDER", "SHIPPED", "CLOSED"];

  const filteredOrders = orders.filter((order) => {
    const status = (order.finalStatus || "Draft").toUpperCase();
    return status === activeTab;
  });

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Order Management</p>
          <h2 className="text-xl font-bold text-slate-900">Order Management</h2>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 text-xs font-semibold text-slate-600">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 pb-2 transition ${
              activeTab === tab
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Orders List</h3>
          <p className="text-xs text-slate-500">{filteredOrders.length} records available</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            placeholder="Search report..."
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleCreateNew}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            + New Order
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="p-3 w-10"><input type="checkbox" className="rounded border-slate-300" /></th>
              <th className="p-3">ORDER NO</th>
              <th className="p-3">ENTITY NAME</th>
              <th className="p-3">CATEGORY</th>
              <th className="p-3">SUB CATEGORY</th>
              <th className="p-3">SEASON</th>
              <th className="p-3">ARTICLE</th>
              <th className="p-3">STYLE NAME</th>
              <th className="p-3">COLORS</th>
              <th className="p-3">BUYER</th>
              <th className="p-3">BRAND</th>
              <th className="p-3">SIZE GROUP</th>
              <th className="p-3">ORDER QTY</th>
              <th className="p-3">DELIVERY DATE</th>
              <th className="p-3">PROCESS STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={15} className="p-8 text-center text-slate-400">
                  No records found in this view. Click <span className="text-emerald-600 font-semibold">+ New Order</span> above to add records.
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => handleRowClick(order.id)}
                  className="cursor-pointer hover:bg-slate-50 transition"
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="rounded border-slate-300" /></td>
                  <td className="p-3 font-medium text-emerald-700">{order.orderNo}</td>
                  <td className="p-3">{order.entityName || "-"}</td>
                  <td className="p-3">{order.category || "-"}</td>
                  <td className="p-3">{order.subCategory || "-"}</td>
                  <td className="p-3">{order.season || "-"}</td>
                  <td className="p-3">{order.article || "-"}</td>
                  <td className="p-3">{order.styleName || "-"}</td>
                  <td className="p-3">{order.colors || "-"}</td>
                  <td className="p-3">{order.buyer || "-"}</td>
                  <td className="p-3">{order.brand || "-"}</td>
                  <td className="p-3">{order.sizeGroup || "-"}</td>
                  <td className="p-3">{order.orderQty ?? "-"}</td>
                  <td className="p-3">{order.deliveryDate ? order.deliveryDate.slice(0, 10) : "-"}</td>
                  <td className="p-3">{order.processStatus || "Draft"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
