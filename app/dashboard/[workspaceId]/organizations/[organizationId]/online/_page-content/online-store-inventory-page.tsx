"use client";

import { useState } from "react";
import { Boxes, ChevronRight, Store } from "lucide-react";
import Link from "next/link";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Switch from "@/components/ui/Switch";
import type { OnlineStoreInventoryLocation } from "@/lib/services/pos/online-store-inventory-service";

export default function OnlineStoreInventoryPage({
  organizationId,
  inventoryPath,
  initialLocations,
}: {
  organizationId: string;
  inventoryPath: string;
  initialLocations: OnlineStoreInventoryLocation[];
}) {
  const [locations, setLocations] = useState(initialLocations);
  const [savingLocationIds, setSavingLocationIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const updateLocation = async (locationId: string, enabled: boolean) => {
    if (savingLocationIds.has(locationId)) return;
    setSavingLocationIds((current) => new Set(current).add(locationId));
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/online-store/inventory`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locationId, enabled }),
        },
      );
      const data = await response.json() as {
        locations?: OnlineStoreInventoryLocation[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(data.locations)) {
        throw new Error(data.error || "Unable to update this location.");
      }
      setLocations(data.locations);
      setNotice(enabled
        ? "Location enabled. Its in-stock POS products can now appear in your online store."
        : "Location disabled. Its products are no longer available in your online store.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update this location.");
    } finally {
      setSavingLocationIds((current) => {
        const next = new Set(current);
        next.delete(locationId);
        return next;
      });
    }
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="erp-page-header">
          <div>
            <p className="erp-eyebrow flex items-center gap-2"><Boxes aria-hidden="true" size={16} /> ONLINE STORE INVENTORY</p>
            <h1 className="erp-page-heading mt-1">Store locations</h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Choose which active inventory locations can publish their eligible in-stock POS products to the public store.
            </p>
          </div>
        </header>

        {notice ? <p role="status" className="erp-status-success">{notice}</p> : null}
        {error ? <p role="alert" className="erp-status-error">{error}</p> : null}

        {locations.length === 0 ? (
          <Card className="space-y-2">
            <h2 className="erp-card-title">No inventory locations found</h2>
            <p className="text-sm text-[var(--erp-muted)]">
              Create a location in Admin &gt; Masters, then return here to make it available in the online store.
            </p>
          </Card>
        ) : (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {locations.map((location) => {
              const saving = savingLocationIds.has(location.id);
              return (
                <Card key={location.id} className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="erp-eyebrow">{location.entityName}</p>
                      <h2 className="erp-card-title mt-1 break-words">{location.locationName}</h2>
                    </div>
                    <Store aria-hidden="true" className="shrink-0 text-[var(--erp-brand)]" size={20} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{location.active ? "Inventory active" : "Inventory inactive"}</Badge>
                    <Badge>{location.onlineEnabled ? "Online enabled" : "Online disabled"}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-t border-[var(--erp-border)] pt-4">
                    <div>
                      <p className="text-xs text-[var(--erp-muted)]">In-stock products</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--erp-text)]">{location.stockItemCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--erp-muted)]">Available units</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--erp-text)]">{location.availableQuantity}</p>
                    </div>
                  </div>
                  <Link
                    href={`${inventoryPath}/${encodeURIComponent(location.segment)}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--erp-brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
                  >
                    Open location hierarchy <ChevronRight aria-hidden="true" size={16} />
                  </Link>
                  <div className="flex items-center justify-between gap-3 border-t border-[var(--erp-border)] pt-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--erp-text)]">
                        {location.onlineEnabled ? "Available in online store" : "Hide from online store"}
                      </p>
                      {!location.active ? (
                        <p className="mt-1 text-xs text-[var(--erp-muted)]">
                          Activate this location, its Division and Entity, and its Location/Site node before publishing it.
                        </p>
                      ) : null}
                    </div>
                    <Switch
                      checked={location.onlineEnabled}
                      label={`${location.onlineEnabled ? "Disable" : "Enable"} ${location.locationName} in online store`}
                      onCheckedChange={(enabled) => void updateLocation(location.id, enabled)}
                      disabled={saving || (!location.active && !location.onlineEnabled)}
                    />
                    {saving ? <span className="sr-only" role="status">Saving location availability</span> : null}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>
    </Page>
  );
}
