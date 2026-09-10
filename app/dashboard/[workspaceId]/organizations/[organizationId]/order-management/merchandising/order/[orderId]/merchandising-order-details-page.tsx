"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import OrderDetailsTab from "./components/OrderDetailsTab";
import FinishedGoodsTab from "./components/FinishedGoodsTab";
import BomTab from "./components/BomTab";
import CostingTab from "./components/costing";
import TecPackTab from "./components/Tecpack";
import MeasurementsTab from "./components/MeasurementsTab";
import ProcessTab from "./components/ProcessTab";
import AttachmentsTab from "./components/Attachments";

type TabType = "details" | "finishedGoods" | "bom" | "costing" | "techPack" | "measurements" | "process" | "attachments";

export default function MerchandisingOrderDetailsPage() {
  const params = useParams<{
    workspaceId: string;
    organizationId: string;
    orderId?: string;
  }>();

  const router = useRouter();
  const orderId = params?.orderId;
  const workspaceId = params?.workspaceId;
  const organizationId = params?.organizationId;

  const [activeTab, setActiveTab] = useState<TabType>("details");
  const [isSaving, setIsSaving] = useState(false);

  // Master Data & Lookups State
  const [masterOptions, setMasterOptions] = useState<Record<string, any[]>>({});
  const [orderLookups, setOrderLookups] = useState<any[]>([]);

  const [form, setForm] = useState({
    rows: [] as any[],
    bomRows: [] as any[],
    costingRows: [] as any[],
    techPackRows: [] as any[],
    measurementRows: [] as any[],
    processRows: [] as any[],
    attachmentRows: [] as any[],
    orderQty: 1,
    sellingPricePerPcs: 0,
    orderNo: "",
    article: "",
    entityName: "",
    category: "",
    subCategory: "",
    season: "",
    styleName: "",
    colors: "",
    buyer: "",
    brand: "",
    sizeGroup: "",
    haveSizeRatio: false,
    ratioOrderQty: "",
    deliveryDate: "",
    finalStatus: "Draft",
    processStatus: "Draft",
  });

  const fetchMasterData = async (orgId: string) => {
    try {
      const keys = ["article", "entity", "category", "sub-category", "season", "color", "buyer", "brand", "size-group"];
      const fetchedMasters: Record<string, any[]> = {};

      for (const key of keys) {
        try {
          const mRes = await fetch(`/api/organizations/${orgId}/master-data/${key}`);
          if (mRes.ok) {
            const data = await mRes.json();
            fetchedMasters[key] = Array.isArray(data) ? data : data.items || [];
          }
        } catch (e) {
          // Ignore individual fetch errors gracefully
        }
      }

      setMasterOptions(fetchedMasters);

      const lookupsRes = await fetch(`/api/organizations/${orgId}/order-lookups`);
      if (lookupsRes.ok) {
        const lookupData = await lookupsRes.json();
        setOrderLookups(Array.isArray(lookupData) ? lookupData : lookupData.items || []);
      }
    } catch (error) {
      console.error("Error fetching master options:", error);
    }
  };

  // Fetch on mount and re-fetch when window regains focus (e.g., coming back from creating a master)
  useEffect(() => {
    if (organizationId) {
      fetchMasterData(organizationId);

      const handleFocus = () => {
        fetchMasterData(organizationId);
      };
      window.addEventListener("focus", handleFocus);
      return () => window.removeEventListener("focus", handleFocus);
    }
  }, [organizationId]);

  // Handler to open/redirect to create master view using the `+ New` button
  const handleOpenCreateMaster = (masterKey: string) => {
    if (!workspaceId || !organizationId) return;
    router.push(
      `/dashboard/${workspaceId}/organizations/${organizationId}/settings/master-data/${masterKey}`
    );
  };

  const goBack = () => {
    router.back();
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      if (!form.orderNo || form.orderNo.trim() === "") {
        throw new Error("Blocking Field Missing: 'Order No' is required.");
      }
      if (!form.article || form.article.trim() === "") {
        throw new Error("Blocking Field Missing: 'Article' is required.");
      }
      
      const endpoint = orderId 
        ? `/api/workspaces/${workspaceId}/organizations/${organizationId}/merchandising-orders/${orderId}`
        : `/api/workspaces/${workspaceId}/organizations/${organizationId}/merchandising-orders`;
      
      const method = orderId ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const serverMessage = errorData?.message || errorData?.error || `Server responded with status ${response.status}`;
        throw new Error(`Blocking Error: ${serverMessage}`);
      }

      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order`);
      router.refresh();
    } catch (error: any) {
      console.error("Error saving order:", error);
      alert(error.message || "Failed to save order. Please check your inputs and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "details", label: "General Details" },
    { id: "finishedGoods", label: "Finished Goods", count: form.rows.length },
    { id: "bom", label: "Bill of Materials", count: form.bomRows.length },
    { id: "costing", label: "Costing", count: form.costingRows?.length ?? 0 },
    { id: "techPack", label: "Tech Pack", count: form.techPackRows?.length ?? 0 },
    { id: "measurements", label: "Measurements", count: form.measurementRows?.length ?? 0 },
    { id: "process", label: "Process", count: form.processRows?.length ?? 0 },
    { id: "attachments", label: "Attachments", count: form.attachmentRows?.length ?? 0 },
  ];

  return (
    <div className="space-y-4 p-4 text-xs">
      {/* Header and Tab Navigation Block */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-200"
            >
              ← Back
            </button>
            <h2 className="text-lg font-bold text-slate-900">
              {orderId ? "Edit Order" : "Create New Order"}
            </h2>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Order"}
          </button>
        </div>
        
        {/* Scrollable Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap px-3 py-1.5 font-semibold rounded-lg transition-colors ${
                activeTab === tab.id
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {tab.label} {tab.count !== undefined && tab.count > 0 ? `(${tab.count})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content Area */}
      <div className="pt-2">
        {activeTab === "details" && (
          <OrderDetailsTab 
            form={form} 
            setForm={setForm} 
            masterOptions={masterOptions}
            orderLookups={orderLookups}
            onOpenCreateMaster={handleOpenCreateMaster}
          />
        )}
        {activeTab === "finishedGoods" && <FinishedGoodsTab form={form} setForm={setForm} />}
        {activeTab === "bom" && <BomTab form={form} setForm={setForm} />}
        {activeTab === "costing" && <CostingTab form={form} setForm={setForm} />}
        {activeTab === "techPack" && <TecPackTab form={form} setForm={setForm} />}
        {activeTab === "measurements" && <MeasurementsTab form={form} setForm={setForm} />}
        {activeTab === "process" && <ProcessTab form={form} setForm={setForm} />}
        {activeTab === "attachments" && <AttachmentsTab form={form} setForm={setForm} />}
      </div>
    </div>
  );
}