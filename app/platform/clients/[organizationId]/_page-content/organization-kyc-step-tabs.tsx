"use client";

import { useId, useState } from "react";
import Tabs, { type Tab } from "@/components/ui/Tabs";

type OrganizationKycStep = {
  label: string;
  details: Array<{ label: string; value: string }>;
};

export default function OrganizationKycStepTabs({
  steps,
}: {
  steps: OrganizationKycStep[];
}) {
  const [activeStep, setActiveStep] = useState(steps[0]?.label ?? "");
  const idPrefix = useId();
  const tabs: Tab[] = steps.map((step, index) => ({
    id: `${idPrefix}-tab-${index}`,
    label: `${index + 1}. ${step.label}`,
    value: step.label,
    panelId: `${idPrefix}-panel-${index}`,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--erp-text)]">KYC step details</h3>
        <p className="mt-1 text-sm text-[var(--erp-muted)]">Select a step to review the answers saved for that section.</p>
      </div>
      <Tabs
        tabs={tabs}
        value={activeStep}
        onChange={setActiveStep}
        ariaLabel="KYC review steps"
        scrollable
      />
      {steps.map((step, index) => (
        <section
          key={step.label}
          id={`${idPrefix}-panel-${index}`}
          role="tabpanel"
          aria-label={`KYC step ${index + 1}: ${step.label}`}
          tabIndex={0}
          hidden={activeStep !== step.label}
          className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
        >
          <h4 className="text-sm font-semibold text-[var(--erp-text)]">
            Step {index + 1}: {step.label}
          </h4>
          <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            {step.details.map((detail) => (
              <div key={detail.label}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-muted)]">
                  {detail.label}
                </dt>
                <dd className="mt-1 whitespace-pre-line break-words text-sm text-[var(--erp-text)]">
                  {detail.value || "Not provided"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
