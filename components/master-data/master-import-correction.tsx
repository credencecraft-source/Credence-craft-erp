"use client";

import type { ReactNode } from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Textarea from "@/components/ui/Textarea";

export type MasterImportCorrectionField = {
  key: string;
  label: string;
  sensitive?: boolean;
  placeholder?: string;
  multiline?: boolean;
};

export type MasterImportCorrectionRow = {
  id: string;
  identity: string;
  values: Record<string, string>;
  errors: Record<string, string[]>;
  fields?: MasterImportCorrectionField[];
};

export function MasterImportCorrection({
  open,
  title,
  description,
  rows,
  fields,
  isPending = false,
  errorMessage,
  relatedMasterActions,
  showValidateRowAction = true,
  onChange,
  onValidateRow,
  onClose,
  onRetry,
  retryLabel = "Validate and retry",
}: {
  open: boolean;
  title: string;
  description: string;
  rows: MasterImportCorrectionRow[];
  fields: MasterImportCorrectionField[];
  isPending?: boolean;
  errorMessage?: string;
  relatedMasterActions?: ReactNode;
  showValidateRowAction?: boolean;
  onChange: (rowId: string, fieldKey: string, value: string) => void;
  onValidateRow: (rowId: string) => void;
  onClose: () => void;
  onRetry: () => void;
  retryLabel?: string;
}) {
  const fieldErrorCount = rows.reduce(
    (count, row) => count + Object.entries(row.errors)
      .filter(([key]) => key !== "_row")
      .reduce((fieldCount, [, errors]) => fieldCount + errors.length, 0),
    0,
  );
  const rowErrorCount = rows.reduce((count, row) => count + (row.errors._row?.length ?? 0), 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      ariaLabel={title}
      size="2xl"
      className="max-w-[calc(100dvw-2rem)]"
    >
      <div className="space-y-4 p-6">
        <header>
          <h2 className="text-base font-semibold text-[var(--erp-text)]">{title}</h2>
          <p className="mt-2 text-sm text-[var(--erp-text-muted)]">{description}</p>
          <p className="mt-2 text-sm font-medium text-[var(--erp-danger)]" role="status" aria-live="polite">
            {rows.length} row{rows.length === 1 ? "" : "s"} need correction; {fieldErrorCount} field error{fieldErrorCount === 1 ? "" : "s"}
            {rowErrorCount ? ` and ${rowErrorCount} row-level issue${rowErrorCount === 1 ? "" : "s"}.` : "."}
          </p>
        </header>
        {errorMessage ? (
          <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-danger)]" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {relatedMasterActions}

        <div className="max-h-[min(60dvh,40rem)] space-y-4 overflow-y-auto pr-1">
          {rows.map((row) => {
            const safeId = row.id.replace(/[^A-Za-z0-9_-]/g, "_");
            const availableFields = row.fields ?? fields;
            const hasFieldErrors = availableFields.some((field) => row.errors[field.key]?.length);
            const fieldsToRender = availableFields.filter((field) =>
              hasFieldErrors ? row.errors[field.key]?.length : row.errors._row?.length,
            );
            return (
              <section
                key={row.id}
                aria-labelledby={`import-row-${safeId}`}
                className="min-w-0 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 id={`import-row-${safeId}`} className="text-sm font-semibold text-[var(--erp-text)]">
                    {row.identity}
                  </h3>
                  {showValidateRowAction ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => onValidateRow(row.id)}
                      disabled={isPending}
                    >
                      {isPending ? "Validating..." : "Validate row"}
                    </Button>
                  ) : null}
                </div>
              {row.errors._row?.length ? (
                <ul className="mb-3 list-disc space-y-1 pl-4 text-sm text-[var(--erp-danger)]" role="alert">
                  {row.errors._row.map((error, index) => <li key={`row-${index}`}>{error}</li>)}
                </ul>
              ) : null}
              <div className="flex min-w-0 flex-nowrap gap-3 overflow-x-auto pb-2">
                {fieldsToRender.map((field) => {
                  const errorId = `import-error-${safeId}-${field.key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
                  const errors = row.errors[field.key] ?? [];
                  return (
                    <div key={field.key} className={field.multiline ? "w-[32rem] shrink-0" : "w-56 shrink-0"}>
                      {field.multiline ? (
                        <Textarea
                          label={field.label}
                          textCase="preserve"
                          value={row.values[field.key] ?? ""}
                          placeholder={field.placeholder}
                          onChange={(event) => onChange(row.id, field.key, event.target.value)}
                          aria-describedby={errors.length ? errorId : undefined}
                          aria-invalid={errors.length > 0}
                          className={errors.length
                            ? "border-[var(--erp-danger)] bg-[var(--erp-surface)] ring-1 ring-[var(--erp-danger)]"
                            : ""}
                        />
                      ) : (
                        <Input
                          label={field.label}
                          type={field.sensitive ? "password" : "text"}
                          textCase={field.sensitive ? "preserve" : "uppercase"}
                          {...(field.sensitive
                            ? { defaultValue: "" }
                            : { value: row.values[field.key] ?? "" })}
                          placeholder={field.placeholder}
                          onChange={(event) => onChange(row.id, field.key, event.target.value)}
                          autoComplete="off"
                          aria-describedby={errors.length ? errorId : undefined}
                          aria-invalid={errors.length > 0}
                          className={errors.length
                            ? "border-[var(--erp-danger)] bg-[var(--erp-surface)] ring-1 ring-[var(--erp-danger)]"
                            : ""}
                        />
                      )}
                      {errors.length ? (
                        <ul id={errorId} className="mt-1 list-disc space-y-1 pl-4 text-xs text-[var(--erp-danger)]" role="alert">
                          {errors.map((error, index) => <li key={`${field.key}-${index}`}>{error}</li>)}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              </section>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Close
          </Button>
          <Button type="button" variant="primary" onClick={onRetry} disabled={isPending || rows.length === 0}>
            {isPending ? "Validating..." : retryLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
