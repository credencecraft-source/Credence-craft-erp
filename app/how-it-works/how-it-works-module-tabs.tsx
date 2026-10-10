"use client";

import { useState } from "react";
import {
  Boxes,
  Check,
  ClipboardCheck,
  CircleDollarSign,
  Factory,
  Gauge,
  Layers3,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import Tabs from "@/components/ui/Tabs";
import {
  getModuleCuriosityTeaser,
  type TaggedHowItWorksGroup,
} from "./modulesData";

type BusinessTypeGroup = TaggedHowItWorksGroup["businessTypes"][number];
type HowItWorksModule = BusinessTypeGroup["modules"][number];

const moduleIcons: Record<string, LucideIcon> = {
  online: Gauge,
  pos: ReceiptText,
  "order-management": ClipboardCheck,
  "design-development": Sparkles,
  "factory-management": Factory,
  "quality-management-system": ShieldCheck,
  "finance-management": CircleDollarSign,
  "inventory-management": Boxes,
  "security-management": ShieldCheck,
  approvals: Check,
  settings: Users,
  admin: Layers3,
};

function ModuleWorkflow({ module }: { module: HowItWorksModule }) {
  const hasMasters = module.masterGroups.some((group) => group.masters.length > 0);
  const teaser = getModuleCuriosityTeaser(module.key, module.label);
  const Icon = moduleIcons[module.key] ?? PackageCheck;

  return (
    <div className="rounded-[1.35rem] border border-[#d9e3dc] bg-white p-4 shadow-[0_14px_45px_rgba(24,59,44,0.05)] sm:p-5">
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf5e7] text-[#6d8c46]">
          <Icon size={20} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#93a39a]">A question worth asking</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.045em] text-[#183b2c]">{module.label}</h2>
          <p className="mt-1 text-[15px] font-semibold leading-6 text-[#183b2c]">{teaser.question}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-[#e7eee8] bg-[#fbfdf9] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6d8c46]">The blind spot</p>
          <p className="mt-1 text-[12px] leading-5 text-[#587066]">{teaser.factoryContext}</p>
        </div>
        <div className="rounded-xl border border-[#d9e3dc] bg-[#f3f6f1] p-3">
          <div className="flex items-center gap-2">
            <Check size={15} className="shrink-0 text-[#6d8c46]" aria-hidden="true" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6d8c46]">A quiet advantage</p>
          </div>
          <p className="mt-1 text-[12px] font-semibold leading-5 text-[#183b2c]">{teaser.hint}</p>
        </div>
      </div>

      {hasMasters && (
        <section className="mt-4 border-t border-[#e7eee8] pt-3" aria-label={`${module.label} master modules`}>
          <div className="mb-2 flex items-center gap-2">
            <Layers3 size={14} className="text-[#6d8c46]" aria-hidden="true" />
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6d8c46]">Master modules</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {module.masterGroups.filter((group) => group.masters.length > 0).map((group) => (
              <section key={group.key} className="rounded-xl border border-[#e7eee8] bg-[#fbfdf9] p-3" aria-label={`${group.label} masters`}>
                <h4 className="text-[11px] font-semibold capitalize text-[#183b2c]">{group.label}</h4>
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {group.masters.map((master) => (
                    <li key={master.key} className="rounded-full border border-[#e7eee8] bg-white px-2 py-0.5 text-[10px] text-[#587066]">
                      {master.label}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BusinessTypeContent({ businessType }: { businessType: BusinessTypeGroup }) {
  const [activeModuleKey, setActiveModuleKey] = useState(businessType.modules[0]?.key ?? "");
  const selectedModule = businessType.modules.find((item) => item.key === activeModuleKey) ?? businessType.modules[0];

  if (!selectedModule) return null;

  return (
    <section className="mt-3" aria-label={`${businessType.label} modules`}>
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#93a39a]">Modules</h2>
      <Tabs
        tabs={businessType.modules.map((item) => ({
          value: item.key,
          label: item.key === businessType.key ? "Overview" : item.label,
          id: `module-tab-${item.key}`,
          panelId: `module-panel-${item.key}`,
        }))}
        value={selectedModule.key}
        onChange={setActiveModuleKey}
        ariaLabel={`${businessType.label} modules`}
        scrollable
        compact
      />
      <div className="mt-2" id={`module-panel-${selectedModule.key}`} role="tabpanel" aria-labelledby={`module-tab-${selectedModule.key}`}>
        <ModuleWorkflow key={selectedModule.key} module={selectedModule} />
      </div>
    </section>
  );
}

export default function ModuleTabs({
  groups,
}: {
  groups: TaggedHowItWorksGroup[];
}) {
  const [activeTag, setActiveTag] = useState(groups[0]?.tag ?? "");
  const selectedGroup = groups.find((group) => group.tag === activeTag) ?? groups[0];
  const [activeBusinessTypeKey, setActiveBusinessTypeKey] = useState(selectedGroup?.businessTypes[0]?.key ?? "");
  const selectedBusinessType = selectedGroup?.businessTypes.find((item) => item.key === activeBusinessTypeKey)
    ?? selectedGroup?.businessTypes[0];

  if (!selectedGroup || !selectedBusinessType) {
    return (
      <div className="rounded-2xl border border-[#d9e3dc] bg-white p-6 text-[13px] leading-6 text-[#587066]">
        No tagged operational business types are configured for this version.
      </div>
    );
  }

  return (
    <div>
      <Tabs
        tabs={groups.map((group) => ({
          value: group.tag,
          label: group.tag,
          id: `audience-tag-${encodeURIComponent(group.tag)}`,
        }))}
        value={selectedGroup.tag}
        onChange={(tag) => {
          setActiveTag(tag);
          setActiveBusinessTypeKey(groups.find((group) => group.tag === tag)?.businessTypes[0]?.key ?? "");
        }}
        ariaLabel="Audience tags"
        scrollable
        compact
      />

      <section className="mt-2" aria-label={`${selectedGroup.tag} business types`}>
        <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#93a39a]">
          {selectedGroup.tag} business types
        </h2>
        <Tabs
          tabs={selectedGroup.businessTypes.map((businessType) => ({
            value: businessType.key,
            label: businessType.label,
            id: `business-type-tab-${businessType.key}`,
          }))}
          value={selectedBusinessType.key}
          onChange={setActiveBusinessTypeKey}
          ariaLabel={`${selectedGroup.tag} business types`}
          scrollable
          compact
        />
      </section>

      <div role="tabpanel" aria-labelledby={`business-type-tab-${selectedBusinessType.key}`}>
        <BusinessTypeContent key={selectedBusinessType.key} businessType={selectedBusinessType} />
      </div>
    </div>
  );
}
