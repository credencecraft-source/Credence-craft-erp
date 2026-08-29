"use client";

import { useMemo, useState } from "react";
import AppShell from "../../../components/AppShell";

type ModuleTab =
  | "Factory"
  | "Retail & Wholesale"
  | "Both";

type PlanCard = {
  name: string;
  price: string;
  cadence: string;
  modules: string[];
};

type CartItem = {
  id: string;
  module: ModuleTab;
  planName: string;
  price: string;
  cadence: string;
};

const planGroups: Record<ModuleTab, PlanCard[]> = {
  Factory: [
    { name: "Plan 1", price: "₹6,000", cadence: "/ month", modules: ["Core factory operations", "Basic reports", "Standard support"] },
    { name: "Plan 2", price: "₹14,000", cadence: "/ month", modules: ["Advanced planning", "Production insights", "Priority assistance"] },
    { name: "Plan 3", price: "₹28,000", cadence: "/ month", modules: ["Full factory suite", "Live dashboard", "Advanced automation"] },
  ],
  "Retail & Wholesale": [
    { name: "Plan 1", price: "₹6,000", cadence: "/ month", modules: ["Sales overview", "Distribution basics", "Store tracking"] },
    { name: "Plan 2", price: "₹14,000", cadence: "/ month", modules: ["Retail and wholesale control", "Inventory visibility", "Smart reporting"] },
    { name: "Plan 3", price: "₹28,000", cadence: "/ month", modules: ["Complete retail & wholesale stack", "Unified dashboard", "Growth insights"] },
  ],
  Both: [
    { name: "Get all", price: "₹36,000", cadence: "/ month", modules: ["Full ERP bundle", "All modules included", "Priority support", "Complete automation"] },
  ],
};

const parseAmount = (value: string) => Number(String(value).replace(/[^\d]/g, ""));

export default function OrganizationSubscriptionPage() {
  const [activeTab, setActiveTab] = useState<ModuleTab>("Factory");
  const [cart, setCart] = useState<CartItem[]>([]);
  const selectedPlans = planGroups[activeTab] ?? [];

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + parseAmount(item.price), 0),
    [cart],
  );

  const addToCart = (plan: PlanCard) => {
    const item: CartItem = {
      id: `${activeTab}-${plan.name}`,
      module: activeTab,
      planName: plan.name,
      price: plan.price,
      cadence: plan.cadence,
    };

    setCart((currentCart) => {
      const existingSameModule = currentCart.find((entry) => entry.module === item.module);

      if (existingSameModule) {
        return currentCart.map((entry) =>
          entry.module === item.module ? { ...entry, ...item, id: entry.id } : entry,
        );
      }

      return [...currentCart, item];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((currentCart) => currentCart.filter((item) => item.id !== id));
  };

  return (
    <AppShell>
      <div className="page-frame space-y-6">
        <header className="flex flex-col gap-3 border-b border-[#dce4dc] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="page-kicker">Organization / Settings</p>
            <h1 className="page-title">Subscription</h1>
            <p className="page-description">Manage module access and service plans for the organization.</p>
          </div>
          <span className="rounded-full border border-[#cddbcf] bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600">Monthly pricing</span>
        </header>

        <div className="rounded-2xl border border-[#dce4dc] bg-white p-2">
          <div className="flex flex-wrap gap-2">
            {(["Factory", "Retail & Wholesale", "Both"] as ModuleTab[]).map((module) => (
              <button
                key={module}
                type="button"
                onClick={() => setActiveTab(module)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${activeTab === module ? "border-emerald-700 bg-emerald-700 text-white" : "border-transparent bg-[#f7faf7] text-zinc-700 hover:border-emerald-700/40 hover:text-emerald-800"}`}
              >
                {module}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-[#dce4dc] bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Provisioning</p>
              <h3 className="mt-2 text-xl font-semibold text-[#17372a]">Cart</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {cart.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d7e0d8] bg-[#f5f8f6] px-3 py-2 text-sm text-zinc-500">
                  No plan selected yet.
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-xl border border-[#dce4dc] bg-[#f9fbf9] px-3 py-2">
                    <div className="text-left">
                      <p className="text-xs font-semibold text-[#17372a]">{item.planName}</p>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{item.module}</p>
                    </div>
                    <span className="text-xs font-medium text-zinc-700">{item.price}</span>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.id)}
                      className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-600 transition hover:border-red-300 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-[#edf8f1] px-4 py-2">
              <span className="text-sm text-zinc-700">Subtotal</span>
              <span className="text-base font-semibold text-[#17372a]">₹{subtotal.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

        <section className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-4 gap-3">
            {selectedPlans.map((plan) => (
              <div key={`${activeTab}-${plan.name}`} className="rounded-2xl border border-[#dce4dc] bg-white p-3 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Plan</p>
                    <h2 className="mt-1 text-lg font-semibold text-[#17372a]">{plan.name}</h2>
                  </div>
                  {plan.name === "Basic" && <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-white">Popular</span>}
                </div>

                <div className="mt-3 flex items-end gap-2">
                  <span className="text-xl font-bold text-[#17372a]">{plan.price}</span>
                  <span className="pb-1 text-[10px] font-medium text-zinc-500">{plan.cadence}</span>
                </div>

                <ul className="mt-3 space-y-1.5">
                  {plan.modules.map((module) => (
                    <li key={`${plan.name}-${module}`} className="flex items-start gap-2 text-[11px] text-zinc-700">
                      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
                      <span>{module}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => addToCart(plan)}
                  className="mt-4 w-full rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-emerald-800"
                >
                  Add to cart
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
