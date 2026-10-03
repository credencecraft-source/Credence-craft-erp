"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";
import UiPage from "@/components/ui/Page";

type PurchaseOrder = {
  id: string;
  purchaseOrderNo: string;
  status: string;
  entityId: string | null;
  vendor: { name: string };
};

type LocationOption = { id: string; label: string };

export default function CreateGrnPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const grnPath = `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/grn`;
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/orders/purchase-orders?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load Purchase Orders.");
        setPurchaseOrders((data.purchaseOrders ?? []).filter((order: PurchaseOrder) => ["APPROVED", "SHARED"].includes(order.status)));
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load Purchase Orders."))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const selectedOrder = purchaseOrders.find((order) => order.id === purchaseOrderId);

  useEffect(() => {
    if (!selectedOrder?.entityId) return;

    const controller = new AbortController();
    void fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/location?entityId=${encodeURIComponent(selectedOrder.entityId)}&includeInactive=false`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load Locations.");
        setLocations(Array.isArray(data) ? data.map((location: { id: string; label: string }) => ({ id: location.id, label: location.label })) : []);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Unable to load Locations.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLocationsLoading(false);
      });

    return () => controller.abort();
  }, [organizationId, selectedOrder?.entityId]);

  async function createGrn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!selectedOrder?.entityId || !locationId) {
      setError("Select a Purchase Order and Location before saving the RM GRN.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/inventory/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, purchaseOrderId, locationId, createOnly: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create RM GRN.");
      router.replace(`${grnPath}/verification`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create RM GRN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <UiPage as="div">
      <Section className="space-y-4">
        <Link href={`${grnPath}/report`} className="text-xs font-semibold text-emerald-700">
          &larr; RM GRN Report
        </Link>
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Purchase Order Receiving</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Create GRN</h1>
        </header>
        {error ? <Card role="alert" className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</Card> : null}
        <form onSubmit={(event) => void createGrn(event)}>
          <Card className="space-y-4 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Purchase Order"
                value={purchaseOrderId}
                onChange={(event) => {
                  const nextPurchaseOrderId = event.target.value;
                  const nextOrder = purchaseOrders.find((order) => order.id === nextPurchaseOrderId);
                  setPurchaseOrderId(nextPurchaseOrderId);
                  setLocations([]);
                  setLocationId("");
                  setLocationsLoading(Boolean(nextOrder?.entityId));
                  setError("");
                }}
                disabled={loading || saving}
                options={[
                  { value: "", label: loading ? "Loading Purchase Orders..." : "Select approved Purchase Order" },
                  ...purchaseOrders.map((order) => ({ value: order.id, label: `${order.purchaseOrderNo} - ${order.vendor.name}` })),
                ]}
              />
              <Select
                label="Location"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                disabled={!selectedOrder?.entityId || locationsLoading || locations.length === 0 || saving}
                options={[
                  {
                    value: "",
                    label: !selectedOrder
                      ? "Select a Purchase Order first"
                      : !selectedOrder.entityId
                        ? "Selected PO has no active Entity"
                        : locationsLoading
                          ? "Loading Locations..."
                          : locations.length === 0
                            ? "No active Locations for this Entity"
                            : "Select Location",
                  },
                  ...locations.map((location) => ({ value: location.id, label: location.label })),
                ]}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving || loading || locationsLoading || !selectedOrder?.entityId || !locationId}>
                {saving ? "Saving RM GRN..." : "Submit"}
              </Button>
            </div>
          </Card>
        </form>
      </Section>
    </UiPage>
  );
}
