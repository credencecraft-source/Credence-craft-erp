"use client";

type RestrictionAssignmentCheckboxProps = {
  action: (formData: FormData) => void | Promise<void>;
  restrictionId: string;
  segmentId: string;
  checked: boolean;
  label: string;
};

export default function RestrictionAssignmentCheckbox({
  action,
  restrictionId,
  segmentId,
  checked,
  label,
}: RestrictionAssignmentCheckboxProps) {
  return (
    <form action={action} className="flex justify-center">
      <input type="hidden" name="restrictionId" value={restrictionId} />
      <input type="hidden" name="segmentId" value={segmentId} />
      <input type="hidden" name="enabled" value={String(!checked)} />
      <input
        type="checkbox"
        defaultChecked={checked}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        aria-label={label}
        className="h-4 w-4 accent-emerald-600"
      />
    </form>
  );
}
