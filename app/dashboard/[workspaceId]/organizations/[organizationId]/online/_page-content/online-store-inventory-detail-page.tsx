import { Boxes, ChevronRight } from "lucide-react";
import Link from "next/link";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import type { OnlineStoreInventoryView } from "@/lib/services/pos/online-store-inventory-service";

type OnlineStoreInventoryDetailView = Extract<
  OnlineStoreInventoryView,
  { level: "SUB_LOCATIONS" | "SUB_SUB_LOCATIONS" | "STOCK" }
>;

function StockSummary({
  stockItemCount,
  availableQuantity,
}: {
  stockItemCount: number;
  availableQuantity: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-[var(--erp-border)] pt-4">
      <div>
        <p className="text-xs text-[var(--erp-muted)]">In-stock products</p>
        <p className="mt-1 text-sm font-semibold text-[var(--erp-text)]">{stockItemCount}</p>
      </div>
      <div>
        <p className="text-xs text-[var(--erp-muted)]">Available units</p>
        <p className="mt-1 text-sm font-semibold text-[var(--erp-text)]">{availableQuantity}</p>
      </div>
    </div>
  );
}

export default function OnlineStoreInventoryDetailPage({
  view,
  inventoryPath,
}: {
  view: OnlineStoreInventoryDetailView;
  inventoryPath: string;
}) {
  const heading = view.level === "SUB_LOCATIONS"
    ? view.location.locationName
    : view.level === "SUB_SUB_LOCATIONS"
      ? view.subLocation.name
      : view.subSubLocation.name;
  const parentPath = view.canonicalPath.slice(0, -1);

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="erp-page-header">
          <div className="min-w-0">
            <p className="erp-eyebrow flex items-center gap-2">
              <Boxes aria-hidden="true" size={16} /> ONLINE STORE INVENTORY
            </p>
            <h1 className="erp-page-heading mt-1 break-words">{heading}</h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              {view.level === "STOCK"
                ? `${view.location.locationName} / ${view.subLocation.name} / ${view.subSubLocation.name}`
                : `${view.location.entityName} · ${view.location.locationName}`}
            </p>
          </div>
          <Link
            href={`${inventoryPath}${parentPath.length ? `/${parentPath.map(encodeURIComponent).join("/")}` : ""}`}
            className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3.5 py-2 text-sm font-semibold text-[var(--erp-text)] shadow-sm hover:bg-[var(--erp-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
          >
            Back
          </Link>
        </header>

        {view.level === "SUB_LOCATIONS" ? (
          view.location.subLocations.length ? (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {view.location.subLocations.map((subLocation) => (
                <Card key={subLocation.id} className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="erp-eyebrow">SUB-LOCATION</p>
                      <h2 className="erp-card-title mt-1 break-words">{subLocation.name}</h2>
                      <p className="mt-1 text-sm text-[var(--erp-muted)]">{subLocation.code}</p>
                    </div>
                    <Badge>{subLocation.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <StockSummary
                    stockItemCount={subLocation.stockItemCount}
                    availableQuantity={subLocation.availableQuantity}
                  />
                  <Link
                    href={`${inventoryPath}/${encodeURIComponent(view.location.segment)}/${encodeURIComponent(subLocation.segment)}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--erp-brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
                  >
                    Open sub-locations <ChevronRight aria-hidden="true" size={16} />
                  </Link>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <h2 className="erp-card-title">No sub-locations configured</h2>
              <p className="mt-2 text-sm text-[var(--erp-muted)]">
                Add active Warehouse nodes under this Location/Site in Inventory setup.
              </p>
            </Card>
          )
        ) : null}

        {view.level === "SUB_SUB_LOCATIONS" ? (
          view.subLocation.subSubLocations.length ? (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {view.subLocation.subSubLocations.map((subSubLocation) => (
                <Card key={subSubLocation.id} className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="erp-eyebrow">SUB-SUB-LOCATION</p>
                      <h2 className="erp-card-title mt-1 break-words">{subSubLocation.name}</h2>
                      <p className="mt-1 text-sm text-[var(--erp-muted)]">{subSubLocation.code}</p>
                    </div>
                    <Badge>{subSubLocation.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <StockSummary
                    stockItemCount={subSubLocation.stockItemCount}
                    availableQuantity={subSubLocation.availableQuantity}
                  />
                  <Link
                    href={`${inventoryPath}/${view.canonicalPath.map(encodeURIComponent).join("/")}/${encodeURIComponent(subSubLocation.segment)}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--erp-brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
                  >
                    View stock <ChevronRight aria-hidden="true" size={16} />
                  </Link>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <h2 className="erp-card-title">No sub-sub-locations configured</h2>
              <p className="mt-2 text-sm text-[var(--erp-muted)]">
                Add active Sub-store nodes under this Warehouse in Inventory setup.
              </p>
            </Card>
          )
        ) : null}

        {view.level === "STOCK" ? (
          view.stockItems.length ? (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {view.stockItems.map((item) => (
                <Card key={item.id} className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="erp-card-title break-words">{item.styleName}</h2>
                      <p className="mt-1 text-sm text-[var(--erp-muted)]">{item.articleNo}</p>
                    </div>
                    <Badge>{item.currentStock} units</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.brand ? <Badge>{item.brand}</Badge> : null}
                    {item.colour ? <Badge>{item.colour}</Badge> : null}
                    {item.size ? <Badge>Size {item.size}</Badge> : null}
                  </div>
                  {item.salesPrice || item.mrp ? (
                    <p className="border-t border-[var(--erp-border)] pt-3 text-sm text-[var(--erp-muted)]">
                      {item.salesPrice ? `Sale price ₹${item.salesPrice}` : `MRP ₹${item.mrp}`}
                    </p>
                  ) : null}
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <h2 className="erp-card-title">No eligible stock at this sub-sub-location</h2>
              <p className="mt-2 text-sm text-[var(--erp-muted)]">
                Only in-stock POS finished goods with a selling price or MRP are shown here.
              </p>
            </Card>
          )
        ) : null}
      </Section>
    </Page>
  );
}
