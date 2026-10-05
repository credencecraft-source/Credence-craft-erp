"use client";

import { useId, useState } from "react";
import { BadgePercent } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Tabs, { type Tab } from "@/components/ui/Tabs";

type SegmentPricing = {
  assignmentId: string;
  segmentName: string;
  isActive: boolean;
  versionPrice: number | null;
  effectivePrice: number | null;
  isCustomPrice: boolean;
};

type BusinessTypePricing = {
  id: string;
  name: string;
  segments: SegmentPricing[];
};

interface OrganizationSubscriptionPricingProps {
  businessTypes: BusinessTypePricing[];
  initialBusinessTypeId?: string;
  onSaveCustomSegmentPrice: (formData: FormData) => Promise<void>;
  onResetCustomSegmentPrice: (formData: FormData) => Promise<void>;
}

export default function OrganizationSubscriptionPricing({
  businessTypes,
  initialBusinessTypeId,
  onSaveCustomSegmentPrice,
  onResetCustomSegmentPrice,
}: OrganizationSubscriptionPricingProps) {
  const panelIdPrefix = useId();
  const initialTab = businessTypes.some(({ id }) => id === initialBusinessTypeId)
    ? initialBusinessTypeId!
    : businessTypes[0]?.id ?? "";
  const [activeBusinessTypeId, setActiveBusinessTypeId] = useState(initialTab);
  const tabs: Tab[] = businessTypes.map((businessType) => ({
    label: businessType.name,
    value: businessType.id,
    panelId: `${panelIdPrefix}-panel-${businessType.id}`,
  }));
  const activeBusinessType = businessTypes.find(({ id }) => id === activeBusinessTypeId);

  if (!activeBusinessType) return null;

  return (
    <div>
      <Tabs
        tabs={tabs}
        value={activeBusinessTypeId}
        onChange={setActiveBusinessTypeId}
        ariaLabel="Subscription business types"
      />
      <section
        id={`${panelIdPrefix}-panel-${activeBusinessType.id}`}
        role="tabpanel"
        aria-label={`${activeBusinessType.name} segments`}
        tabIndex={0}
        className="min-w-0 max-w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        {activeBusinessType.segments.length > 0 ? (
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Segment</th>
                <th className="px-4 py-3 text-right font-semibold">Version price</th>
                <th className="px-4 py-3 font-semibold">Organization price</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeBusinessType.segments.map((segment) => (
                <tr key={segment.assignmentId}>
                  <td className="px-4 py-3 font-medium text-slate-800">{segment.segmentName}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {segment.versionPrice == null ? "Not set" : `₹${segment.versionPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                  </td>
                  <td className="px-4 py-3">
                    <form action={onSaveCustomSegmentPrice} className="flex items-center gap-2">
                      <input type="hidden" name="assignmentId" value={segment.assignmentId} />
                      <input type="hidden" name="businessTypeId" value={activeBusinessType.id} />
                      <label className="sr-only" htmlFor={`organization-price-${segment.assignmentId}`}>
                        Organization price for {activeBusinessType.name}, {segment.segmentName}
                      </label>
                      <span className="text-xs text-slate-500">₹</span>
                      <Input
                        id={`organization-price-${segment.assignmentId}`}
                        name="price"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        defaultValue={segment.effectivePrice ?? ""}
                        className="w-28 text-right tabular-nums"
                      />
                      <Button type="submit" size="sm">Save</Button>
                    </form>
                  </td>
                  <td className="px-4 py-3">
                    {segment.isCustomPrice ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                        <BadgePercent aria-hidden="true" className="h-3.5 w-3.5" /> Custom Price
                      </span>
                    ) : <span className="text-xs text-slate-500">Version snapshot</span>}
                    {segment.isCustomPrice && (
                      <form action={onResetCustomSegmentPrice} className="mt-1">
                        <input type="hidden" name="assignmentId" value={segment.assignmentId} />
                        <input type="hidden" name="businessTypeId" value={activeBusinessType.id} />
                        <Button type="submit" variant="secondary" size="sm" className="mt-1 border-0 px-0 text-xs text-emerald-700 hover:bg-transparent hover:underline">
                          Reset to snapshot
                        </Button>
                      </form>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${segment.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {segment.isActive ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="p-5 text-sm text-slate-500">No segments are configured for this business type.</p>}
      </section>
    </div>
  );
}