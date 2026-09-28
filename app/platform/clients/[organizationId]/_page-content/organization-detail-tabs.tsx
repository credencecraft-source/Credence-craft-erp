"use client";

import { useId, useState, type ReactNode } from "react";
import Tabs, { type Tab } from "@/components/ui/Tabs";

interface OrganizationDetailPanel {
  label: string;
  value: string;
  content: ReactNode;
}

export default function OrganizationDetailTabs({
  panels,
}: {
  panels: OrganizationDetailPanel[];
}) {
  const [activeTab, setActiveTab] = useState(panels[0]?.value ?? "");
  const panelIdPrefix = useId();
  const tabs: Tab[] = panels.map((panel) => ({
    label: panel.label,
    value: panel.value,
    panelId: `${panelIdPrefix}-panel-${panel.value}`,
  }));

  return (
    <div>
      <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} ariaLabel="Organisation sections" />
      {panels.map((panel) => (
        <section
          key={panel.value}
          id={`${panelIdPrefix}-panel-${panel.value}`}
          role="tabpanel"
          tabIndex={0}
          hidden={activeTab !== panel.value}
          className="pt-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          {panel.content}
        </section>
      ))}
    </div>
  );
}