"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

export default function GMMerchandiserDashboardPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const organizationId = params?.organizationId ?? "demo-org";

  const [activeTab, setActiveTab] = useState<"pipeline" | "delivery" | "summary">("pipeline");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const [metrics, setMetrics] = useState({
    totalOrders: 0,
    draftCount: 0,
    approvalCount: 0,
    productionCount: 0,
    shippedCount: 0,
    totalGarmentQty: 0,
  });
  const [orders, setOrders] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ [key: string]: { bookedQty: number; orderCount: number; orders: any[] } }>({});
  const [loading, setLoading] = useState(true);

  const MONTHLY_CAPACITY = 50000;

  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/orders?organizationId=${encodeURIComponent(organizationId)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.orders ?? data ?? [];

        const totalOrders = list.length;
        const draftCount = list.filter((o: any) => (o.finalStatus || "Draft").toUpperCase() === "DRAFT").length;
        const approvalCount = list.filter((o: any) => (o.finalStatus || "").toUpperCase() === "WAITING FOR APPROVAL").length;
        const productionCount = list.filter(
          (o: any) =>
            (o.finalStatus || "").toUpperCase() === "WORK ORDER" ||
            (o.finalStatus || "").toUpperCase() === "WAITING FOR PRODUCTION SCHEDULE" ||
            (o.finalStatus || "").toUpperCase() === "APPROVED"
        ).length;
        const shippedCount = list.filter(
          (o: any) =>
            (o.finalStatus || "").toUpperCase() === "SHIPPED" ||
            (o.finalStatus || "").toUpperCase() === "CLOSED"
        ).length;
        const totalGarmentQty = list.reduce((acc: number, curr: any) => acc + (Number(curr.orderQty) || 0), 0);

        setMetrics({
          totalOrders,
          draftCount,
          approvalCount,
          productionCount,
          shippedCount,
          totalGarmentQty,
        });
        setOrders(list);

        const aggregation: { [key: string]: { bookedQty: number; orderCount: number; orders: any[] } } = {};
        list.forEach((order: any) => {
          const dateStr = order.deliveryDate ? order.deliveryDate.slice(0, 7) : "";
          if (!dateStr) return;
          if (!aggregation[dateStr]) {
            aggregation[dateStr] = { bookedQty: 0, orderCount: 0, orders: [] };
          }
          aggregation[dateStr].bookedQty += Number(order.orderQty) || 0;
          aggregation[dateStr].orderCount += 1;
          aggregation[dateStr].orders.push(order);
        });
        setMonthlyData(aggregation);

        const currentYearStr = String(selectedYear);
        const availableForYear = Object.keys(aggregation).filter((k) => k.startsWith(currentYearStr)).sort();
        if (availableForYear.length > 0 && (!selectedMonth || !selectedMonth.startsWith(currentYearStr))) {
          setSelectedMonth(availableForYear[0]);
        } else if (availableForYear.length === 0 && !selectedMonth) {
          setSelectedMonth(`${currentYearStr}-01`);
        }
      }
    } catch (err) {
      console.error("Data fetch error", err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, selectedYear, selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const maxQty = Math.max(...orders.map((o) => Number(o.orderQty) || 0), 1);

  // Generate all 12 months for the selected yearly calendar view
  const calendarMonths = Array.from({ length: 12 }, (_, index) => {
    const monthNum = String(index + 1).padStart(2, "0");
    return `${selectedYear}-${monthNum}`;
  });

  const formatMonthName = (monthStr: string) => {
    if (!monthStr) return "";
    const [year, month] = monthStr.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleString("en-US", { month: "long", year: "numeric" });
  };

  const formatShortMonthName = (monthStr: string) => {
    if (!monthStr) return "";
    const [year, month] = monthStr.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleString("en-US", { month: "short" });
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-bold text-slate-900">GM Dashboard & Metrics</h1>
        <p className="text-xs text-slate-500 mt-0.5">Visual analytical view of active pipeline, delivery capacity, and bookings.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-3 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("pipeline")}
          className={`border-b-2 pb-2 transition cursor-pointer ${
            activeTab === "pipeline" ? "border-emerald-600 text-emerald-700 font-bold" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Order In Hand & Pipeline
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("delivery")}
          className={`border-b-2 pb-2 transition cursor-pointer ${
            activeTab === "delivery" ? "border-emerald-600 text-emerald-700 font-bold" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Delivery Month-wise Capacity
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("summary")}
          className={`border-b-2 pb-2 transition cursor-pointer ${
            activeTab === "summary" ? "border-emerald-600 text-emerald-700 font-bold" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Order Booking Summary
        </button>
      </div>

      {/* TAB 1: ORDER IN HAND & PIPELINE */}
      {activeTab === "pipeline" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Orders</span>
              <div className="text-2xl font-black text-slate-900 mt-2">{loading ? "..." : metrics.totalOrders}</div>
            </div>
            <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending Approvals</span>
              <div className="text-2xl font-black text-amber-600 mt-2">{loading ? "..." : metrics.approvalCount}</div>
            </div>
            <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">In Production</span>
              <div className="text-2xl font-black text-blue-600 mt-2">{loading ? "..." : metrics.productionCount}</div>
            </div>
            <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Garment Volume</span>
              <div className="text-2xl font-black text-emerald-700 mt-2">
                {loading ? "..." : metrics.totalGarmentQty.toLocaleString("en-IN")} <span className="text-xs font-normal text-slate-500">pcs</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-sm space-y-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">Order Status Distribution</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
                  <span>Draft ({metrics.draftCount})</span>
                  <span className="text-slate-500">{metrics.totalOrders ? Math.round((metrics.draftCount / metrics.totalOrders) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-slate-400 h-2.5 rounded-full" style={{ width: `${metrics.totalOrders ? (metrics.draftCount / metrics.totalOrders) * 100 : 0}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
                  <span>Waiting For Approval ({metrics.approvalCount})</span>
                  <span className="text-amber-600">{metrics.totalOrders ? Math.round((metrics.approvalCount / metrics.totalOrders) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: `${metrics.totalOrders ? (metrics.approvalCount / metrics.totalOrders) * 100 : 0}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
                  <span>In Production / Work Order ({metrics.productionCount})</span>
                  <span className="text-blue-600">{metrics.totalOrders ? Math.round((metrics.productionCount / metrics.totalOrders) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${metrics.totalOrders ? (metrics.productionCount / metrics.totalOrders) * 100 : 0}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
                  <span>Shipped / Closed ({metrics.shippedCount})</span>
                  <span className="text-emerald-600">{metrics.totalOrders ? Math.round((metrics.shippedCount / metrics.totalOrders) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-600 h-2.5 rounded-full" style={{ width: `${metrics.totalOrders ? (metrics.shippedCount / metrics.totalOrders) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DELIVERY MONTH-WISE CAPACITY & YEARLY CALENDAR */}
      {activeTab === "delivery" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Standard Monthly Capacity</span>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {MONTHLY_CAPACITY.toLocaleString("en-IN")} <span className="text-xs font-normal text-slate-500">pcs / month</span>
              </div>
            </div>
          </div>

          {/* Yearly Calendar View Container */}
          <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">Yearly Delivery Calendar</h2>
                <p className="text-xs text-slate-500 mt-0.5">Select a year and click any month tile to review scheduled order quotas.</p>
              </div>

              {/* Year Selector */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedYear((y) => y - 1)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  &larr; Prev
                </button>
                <span className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold">
                  {selectedYear}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedYear((y) => y + 1)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Next &rarr;
                </button>
              </div>
            </div>

            {/* 12-Month Calendar Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {calendarMonths.map((mKey) => {
                const monthInfo = monthlyData[mKey];
                const booked = monthInfo?.bookedQty || 0;
                const count = monthInfo?.orderCount || 0;
                const pct = Math.round((booked / MONTHLY_CAPACITY) * 100);
                const isOver = booked > MONTHLY_CAPACITY;
                const isSelected = selectedMonth === mKey;

                return (
                  <button
                    key={mKey}
                    type="button"
                    onClick={() => setSelectedMonth(mKey)}
                    className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold uppercase tracking-wider ${isSelected ? "text-white" : "text-slate-800"}`}>
                        {formatShortMonthName(mKey)}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${booked > 0 ? (isOver ? "bg-red-400" : "bg-emerald-500") : "bg-slate-300"}`} />
                    </div>

                    <div>
                      <div className={`text-sm font-black ${isSelected ? "text-white" : "text-slate-900"}`}>
                        {booked > 0 ? `${booked.toLocaleString("en-IN")} pcs` : "No Orders"}
                      </div>
                      <div className={`text-[10px] mt-0.5 ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                        {count} orders ({pct}%)
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Month Details View */}
            {selectedMonth && (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                {(() => {
                  const data = monthlyData[selectedMonth] || { bookedQty: 0, orderCount: 0, orders: [] };
                  const percentage = Math.round((data.bookedQty / MONTHLY_CAPACITY) * 100);
                  const isOverloaded = data.bookedQty > MONTHLY_CAPACITY;

                  return (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{formatMonthName(selectedMonth)} Detailed Schedule</h3>
                          <p className="text-xs text-slate-500 mt-0.5">{data.orderCount} total orders scheduled for this month</p>
                        </div>
                        <div className="flex items-center gap-4 mt-2 sm:mt-0">
                          <div className="text-right">
                            <span className="text-xs text-slate-500 block">Total Booked</span>
                            <span className="text-sm font-bold text-slate-900">{data.bookedQty.toLocaleString("en-IN")} pcs</span>
                          </div>
                          <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                            isOverloaded ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}>
                            {percentage}% Capacity
                          </span>
                        </div>
                      </div>

                      <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                        <div
                          className={`h-3 rounded-full transition-all duration-500 ${isOverloaded ? "bg-red-500" : "bg-emerald-600"}`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>

                      <div className="space-y-3 pt-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Orders in {formatMonthName(selectedMonth)}</h4>
                        <div className="space-y-2">
                          {data.orders.length === 0 ? (
                            <p className="text-xs text-slate-400 py-3">No orders scheduled for {formatMonthName(selectedMonth)}.</p>
                          ) : (
                            data.orders.map((ord: any) => (
                              <div key={ord.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg text-xs">
                                <div>
                                  <span className="font-bold text-slate-900">{ord.orderNo}</span>
                                  <span className="text-slate-500 ml-2">({ord.styleName || "No Style"})</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-slate-500">Delivery: {ord.deliveryDate ? String(ord.deliveryDate).slice(0, 10) : "-"}</span>
                                  <span className="font-bold text-slate-900">{Number(ord.orderQty || 0).toLocaleString("en-IN")} pcs</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ORDER BOOKING SUMMARY */}
      {activeTab === "summary" && (
        <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-sm space-y-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">Top Quantities by Recent Order</h2>
          <div className="space-y-4">
            {loading ? (
              <p className="text-xs text-slate-400">Loading visual data...</p>
            ) : orders.length === 0 ? (
              <p className="text-xs text-slate-400">No data available.</p>
            ) : (
              orders.slice(0, 10).map((order) => {
                const qty = Number(order.orderQty) || 0;
                const pct = Math.min(Math.round((qty / maxQty) * 100), 100);
                return (
                  <div key={order.id} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-800">{order.orderNo} — {order.styleName || "No Style"}</span>
                      <span className="font-bold text-slate-900">{qty.toLocaleString("en-IN")} pcs</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-600 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}