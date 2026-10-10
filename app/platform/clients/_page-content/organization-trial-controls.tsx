"use client";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type OrganizationTrialControlsProps = {
  organizationId: string;
  organizationName: string;
  trialEnabled: boolean;
  extendAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
};

export default function OrganizationTrialControls({
  organizationId,
  organizationName,
  trialEnabled,
  extendAction,
  removeAction,
}: OrganizationTrialControlsProps) {
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <form action={extendAction} className="flex items-center gap-1">
        <input type="hidden" name="organizationId" value={organizationId} />
        <label className="sr-only" htmlFor={`trial-hours-${organizationId}`}>Additional trial hours for {organizationName}</label>
        <Input
          id={`trial-hours-${organizationId}`}
          type="number"
          name="extensionHours"
          min="1"
          max="8760"
          defaultValue="24"
          required
          className="w-16 rounded-md px-1.5 py-1 text-xs"
        />
        <span className="text-xs text-slate-600">hours</span>
        <Button type="submit" variant="secondary" size="sm">Extend</Button>
      </form>
      <form
        action={removeAction}
        onSubmit={(event) => {
          if (!window.confirm(`Remove the trial for ${organizationName}? Access will require an active paid subscription.`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="organizationId" value={organizationId} />
        <Button type="submit" variant="ghost" size="sm" disabled={!trialEnabled}>Remove</Button>
      </form>
    </div>
  );
}