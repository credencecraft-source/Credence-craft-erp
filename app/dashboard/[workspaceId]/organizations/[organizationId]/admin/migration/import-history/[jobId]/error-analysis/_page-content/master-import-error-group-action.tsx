"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";

type RelatedMasterSuggestion = {
  moduleKey: string;
  label: string;
  fields: Record<string, unknown>;
};

type ImportRun = {
  id: string;
  status: string;
  progress: number;
  total: number;
  error: string | null;
};

const MODULE_CREATION_ORDER: Record<string, number> = {
  brand: 0,
  "product-master": 0,
  category: 1,
  "sub-category": 2,
  color: 3,
  size: 4,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readError(payload: unknown, fallback: string) {
  return isRecord(payload) && typeof payload.error === "string" ? payload.error : fallback;
}

function isRelatedMasterSuggestion(value: unknown): value is RelatedMasterSuggestion {
  return isRecord(value)
    && typeof value.moduleKey === "string"
    && typeof value.label === "string"
    && isRecord(value.fields);
}

function isImportRun(value: unknown): value is ImportRun {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.status === "string"
    && typeof value.progress === "number"
    && typeof value.total === "number"
    && (value.error === null || typeof value.error === "string");
}

export default function MasterImportErrorGroupAction({
  organizationId,
  jobId,
  reason,
  affectedRows,
}: {
  organizationId: string;
  jobId: string;
  reason: string;
  affectedRows: number;
}) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/master-imports/${encodeURIComponent(jobId)}`;

  const createMastersAndValidate = async () => {
    if (isProcessing) return;
    if (!window.confirm(
      `Create the suggested related masters for up to ${Math.min(affectedRows, 10_000).toLocaleString()} rows with this reason, then revalidate those rows? No Article records will be imported.`,
    )) return;

    setIsProcessing(true);
    setMessage("Finding matching rows and suggested masters...");
    setError("");
    let createdCount = 0;
    try {
      const actionResponse = await fetch(`${endpoint}/error-analysis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
        cache: "no-store",
      });
      const actionPayload: unknown = await actionResponse.json();
      if (!actionResponse.ok) {
        throw new Error(readError(actionPayload, "Unable to load suggested masters for this reason."));
      }
      if (!isRecord(actionPayload)
        || !Array.isArray(actionPayload.rowNumbers)
        || !actionPayload.rowNumbers.every((rowNumber) =>
          typeof rowNumber === "number" && Number.isSafeInteger(rowNumber) && rowNumber > 0)
        || !Array.isArray(actionPayload.suggestions)
        || !actionPayload.suggestions.every(isRelatedMasterSuggestion)
        || typeof actionPayload.totalAffectedRows !== "number"
        || typeof actionPayload.truncated !== "boolean") {
        throw new Error("Error-group action response is invalid.");
      }
      const suggestions = actionPayload.suggestions;
      const rowNumbers = actionPayload.rowNumbers as number[];
      if (rowNumbers.length === 0) {
        setMessage("No rows remain with this error reason. Refresh the report to see current counts.");
        router.refresh();
        return;
      }
      if (suggestions.some((suggestion) => suggestion.moduleKey === "size-group")) {
        throw new Error("This reason includes a Size Group that needs manual review of its Brand and sizes. Create it from the error-row correction form.");
      }
      const supportedSuggestions = suggestions.filter((suggestion) =>
        Object.hasOwn(MODULE_CREATION_ORDER, suggestion.moduleKey));
      if (supportedSuggestions.length === 0) {
        throw new Error("No automatically creatable related master is attached to this reason. Correct these rows from the Errors tab.");
      }

      const uniqueSuggestions = new Map<string, RelatedMasterSuggestion>();
      for (const suggestion of supportedSuggestions) {
        uniqueSuggestions.set(
          `${suggestion.moduleKey}:${suggestion.label.toLocaleLowerCase()}`,
          suggestion,
        );
      }
      const orderedSuggestions = [...uniqueSuggestions.values()].sort((first, second) =>
        MODULE_CREATION_ORDER[first.moduleKey] - MODULE_CREATION_ORDER[second.moduleKey]);

      for (const suggestion of orderedSuggestions) {
        const masterEndpoint = `/api/organizations/${encodeURIComponent(organizationId)}/master-data/${encodeURIComponent(suggestion.moduleKey)}`;
        const query = new URLSearchParams({
          search: suggestion.label,
          exact: "true",
          includeInactive: "true",
          limit: "200",
        });
        const lookupResponse = await fetch(`${masterEndpoint}?${query}`, { cache: "no-store" });
        const lookupPayload: unknown = await lookupResponse.json();
        if (!lookupResponse.ok || !Array.isArray(lookupPayload)) {
          throw new Error(readError(lookupPayload, `Unable to check ${suggestion.moduleKey} "${suggestion.label}".`));
        }
        const existing = lookupPayload.find((value) =>
          isRecord(value)
          && typeof value.label === "string"
          && value.label.toLocaleLowerCase() === suggestion.label.toLocaleLowerCase());
        if (existing && isRecord(existing) && existing.is_active !== true) {
          throw new Error(`${suggestion.moduleKey} "${suggestion.label}" already exists but is inactive. Activate it before retrying.`);
        }
        if (existing) continue;

        const createResponse = await fetch(masterEndpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            label: suggestion.label,
            fields: suggestion.fields,
            createOnly: true,
          }),
        });
        const createPayload: unknown = await createResponse.json();
        if (!createResponse.ok) {
          throw new Error(readError(createPayload, `Unable to create ${suggestion.moduleKey} "${suggestion.label}".`));
        }
        createdCount += 1;
      }

      setMessage(`Created ${createdCount} masters. Queueing validation for ${rowNumbers.length.toLocaleString()} matching rows...`);
      const queueResponse = await fetch(`${endpoint}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "VALIDATE", rowNumbers }),
      });
      const queuePayload: unknown = await queueResponse.json();
      if (!queueResponse.ok) {
        throw new Error(readError(queuePayload, "Masters were created, but validation could not be queued."));
      }
      if (!isRecord(queuePayload) || !isImportRun(queuePayload.run)) {
        throw new Error("Validation run response is invalid.");
      }

      let run = queuePayload.run;
      while (run.status === "QUEUED" || run.status === "RUNNING") {
        await new Promise((resolve) => window.setTimeout(resolve, 1_500));
        const processResponse = await fetch(`${endpoint}/runs/${encodeURIComponent(run.id)}/process`, {
          method: "POST",
        });
        const processPayload: unknown = await processResponse.json();
        if (!processResponse.ok) {
          throw new Error(readError(processPayload, "Unable to process the validation run."));
        }
        if (!isRecord(processPayload) || !isImportRun(processPayload.run)) {
          throw new Error("Validation run status response is invalid.");
        }
        run = processPayload.run;
        setMessage(`Validating ${run.progress.toLocaleString()} of ${run.total.toLocaleString()} rows...`);
        if (run.status === "FAILED") {
          throw new Error(run.error ?? "Validation failed.");
        }
      }

      if (run.status !== "COMPLETED") {
        throw new Error(run.error ?? "Validation did not complete.");
      }
      setMessage(
        `Done: ${createdCount} masters created and ${run.progress.toLocaleString()} rows revalidated.${actionPayload.truncated ? " The group exceeded 10,000 rows; run this action again for remaining errors." : ""}`,
      );
      router.refresh();
    } catch (actionError) {
      const message = actionError instanceof Error
        ? actionError.message
        : "Unable to create masters and validate this error group.";
      setError(createdCount > 0
        ? `${message} ${createdCount} masters were already created and remain saved.`
        : message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-w-48 space-y-2">
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => void createMastersAndValidate()}
        disabled={isProcessing}
      >
        {isProcessing ? "Fixing and validating..." : "Auto-fix & validate"}
      </Button>
      {message ? <p className="text-xs text-[var(--erp-muted)]" role="status">{message}</p> : null}
      {error ? <p className="text-xs text-[var(--erp-danger)]" role="alert">{error}</p> : null}
    </div>
  );
}
