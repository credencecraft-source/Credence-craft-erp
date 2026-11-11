"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  createUniformEmployeeMeasurementAction,
  createUniformParticipantAction,
  getUniformMeasurementChartDetailsAction,
  type UniformActionState,
} from "../actions";

const EMPTY_ACTION_STATE: UniformActionState = { error: "" };

function SubmitButton({ label, disabled = false }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Saving..." : label}
    </Button>
  );
}

function ActionError({ error }: { error: string }) {
  return error ? <p className="text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null;
}

export function UniformParticipantForm({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const action = createUniformParticipantAction.bind(null, workspaceId, organizationId);
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);
  return (
    <form action={formAction} className="space-y-6">
      <Card className="space-y-4">
        <h2 className="text-base font-semibold text-[var(--erp-text)]">Participant details</h2>
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          <Input name="participantCode" label="Person ID" required maxLength={64} />
          <Input name="fullName" label="Name" required maxLength={255} />
          <Input name="groupLabel" label="Optional group or department" maxLength={160} />
        </div>
        <p className="text-sm text-[var(--erp-muted)]">
          Add students or employees to one shared people list. The optional group is for local organization use; no school/corporate classification is required.
        </p>
        <ActionError error={state.error} />
        <div className="flex justify-end"><SubmitButton label="Create person" /></div>
      </Card>
    </form>
  );
}

type EmployeeMeasurementSetup = {
  participants: Array<{ id: string; participant_code: string; full_name: string }>;
  categories: Array<{ id: string; category_name: string }>;
  subcategories: Array<{ id: string; category_id: string | null; sub_category: string }>;
  styles: Array<{ id: string; article: string; category_id: string | null; sub_category_id: string | null }>;
  charts: Array<{ id: string; measurement_chart: string }>;
};

type EmployeeMeasurementChartDetail = {
  id: string;
  measurement_area_name: string;
  minimum_value: string | null;
  maximum_value: string | null;
  size_id: string | null;
  size_name: string | null;
};

export function UniformEmployeeMeasurementForm({ workspaceId, organizationId, setup }: {
  workspaceId: string;
  organizationId: string;
  setup: EmployeeMeasurementSetup;
}) {
  const action = createUniformEmployeeMeasurementAction.bind(null, workspaceId, organizationId);
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);
  const [categoryId, setCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [styleId, setStyleId] = useState("");
  const [measurementChartId, setMeasurementChartId] = useState("");
  const [templateRows, setTemplateRows] = useState<EmployeeMeasurementChartDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [measurementValues, setMeasurementValues] = useState<Record<string, string>>({});
  const detailRequestId = useRef(0);
  const subcategories = setup.subcategories.filter((item) => item.category_id === categoryId);
  const styles = setup.styles.filter((item) => item.category_id === categoryId && item.sub_category_id === subCategoryId);
  function loadTemplateDetails(chartId: string) {
    const requestId = ++detailRequestId.current;
    setTemplateRows([]);
    setDetailsError("");
    setDetailsLoading(Boolean(chartId));
    if (!chartId) return;

    void getUniformMeasurementChartDetailsAction(workspaceId, organizationId, chartId)
      .then((result) => {
        if (requestId !== detailRequestId.current) return;
        if (result.error) {
          setDetailsError(result.error);
          return;
        }
        setTemplateRows(result.details);
      })
      .catch(() => {
        if (requestId === detailRequestId.current) {
          setDetailsError("Unable to load measurement areas. Try again.");
        }
      })
      .finally(() => {
        if (requestId === detailRequestId.current) setDetailsLoading(false);
      });
  }
  const hasUnconfiguredTemplateRows = templateRows.some((row) =>
    row.minimum_value === null || row.maximum_value === null || !row.size_id || !row.size_name,
  );
  const canSubmit = Boolean(
    setup.participants.length && categoryId && subCategoryId && styleId
    && measurementChartId && !detailsLoading && !detailsError && templateRows.length && !hasUnconfiguredTemplateRows,
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="detailCount" value={templateRows.length} />
      <Card className="space-y-4">
        <h2 className="text-base font-semibold text-[var(--erp-text)]">Measurement header</h2>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Select name="participantId" label="Employee Name" required disabled={!setup.participants.length} options={[
            { value: "", label: "Select a person" },
            ...setup.participants.map((person) => ({ value: person.id, label: `${person.full_name} (${person.participant_code})` })),
          ]} />
          <Select name="categoryId" label="Product Category" required value={categoryId} onChange={(event) => {
            setCategoryId(event.target.value); setSubCategoryId(""); setStyleId("");
          }} options={[
            { value: "", label: "Select a product category" },
            ...setup.categories.map((category) => ({ value: category.id, label: category.category_name })),
          ]} />
          <Select name="subCategoryId" label="Subcategory" required disabled={!categoryId || !subcategories.length} value={subCategoryId} onChange={(event) => {
            setSubCategoryId(event.target.value); setStyleId("");
          }} options={[
            { value: "", label: categoryId ? "Select a subcategory" : "Choose a category first" },
            ...subcategories.map((item) => ({ value: item.id, label: item.sub_category })),
          ]} />
          <Select name="styleId" label="Style" required disabled={!subCategoryId || !styles.length} value={styleId} onChange={(event) => setStyleId(event.target.value)} options={[
            { value: "", label: subCategoryId ? "Select a style" : "Choose a subcategory first" },
            ...styles.map((style) => ({ value: style.id, label: style.article })),
          ]} />
          <Select name="measurementChartId" label="Measurement Template" required value={measurementChartId} onChange={(event) => {
            const chartId = event.target.value;
            setMeasurementChartId(chartId);
            setMeasurementValues({});
            loadTemplateDetails(chartId);
          }} options={[
            { value: "", label: "Select a measurement template" },
            ...setup.charts.map((chart) => ({ value: chart.id, label: chart.measurement_chart })),
          ]} />
        </div>
        {!setup.participants.length ? <p className="text-sm text-[var(--erp-muted)]">Add a person before recording measurements.</p> : null}
        {detailsLoading ? <p className="text-sm text-[var(--erp-muted)]" role="status">Loading measurement areas…</p> : null}
        {detailsError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-[var(--erp-danger)]" role="alert">{detailsError}</p>
            <Button type="button" size="sm" variant="secondary" onClick={() => loadTemplateDetails(measurementChartId)}>Retry</Button>
          </div>
        ) : null}
        {measurementChartId && !templateRows.length ? (
          !detailsLoading && !detailsError ? <p className="text-sm text-[var(--erp-danger)]" role="alert">
            Add measurement areas to this chart in{" "}
            <Link className="font-semibold underline" href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/measurement-chart`}>
              Master Data &gt; Measurement Chart
            </Link>
            {" "}before capturing measurements.
          </p> : null
        ) : null}
      </Card>
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--erp-text)]">Measurement details</h2>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">Enter each value; the template range determines its mapped size.</p>
          </div>
        </div>
        {templateRows.length ? (
          <div className="space-y-4">
            {templateRows.map((row, index) => (
              <Card key={row.id} className="space-y-4">
                <input type="hidden" name={`templateDetail:${index}`} value={row.id} />
              <div className="grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[2.5rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(8rem,0.8fr)_minmax(0,0.8fr)]">
                <span className="pb-2 text-sm font-semibold tabular-nums text-[var(--erp-muted)]">{index + 1}</span>
                <Input className="h-9 px-2 py-1.5 text-sm" label="Measurement Area" value={row.measurement_area_name} readOnly textCase="preserve" />
                <Input className="h-9 px-2 py-1.5 text-sm" label="Allowed Range" value={row.minimum_value !== null && row.maximum_value !== null ? `${row.minimum_value} - ${row.maximum_value}` : "Configure Min and Max in the template"} readOnly textCase="preserve" />
                <Input
                  className="h-9 px-2 py-1.5 text-sm"
                  name={`input:${index}`}
                  label="Measurement"
                  type="number"
                  min="0.01"
                  max="9999.99"
                  step="0.01"
                  required
                  value={measurementValues[row.id] ?? ""}
                  onChange={(event) => setMeasurementValues((current) => ({ ...current, [row.id]: event.target.value }))}
                />
                <Input
                  className="h-9 px-2 py-1.5 text-sm"
                  label="Matched Size"
                  value={(() => {
                    const enteredValue = Number(measurementValues[row.id]);
                    const minimum = Number(row.minimum_value);
                    const maximum = Number(row.maximum_value);
                    return measurementValues[row.id] && Number.isFinite(enteredValue)
                      && enteredValue >= minimum && enteredValue <= maximum
                      ? row.size_name ?? "Size unavailable"
                      : measurementValues[row.id] ? "No size match" : "Enter a measurement";
                  })()}
                  readOnly
                  textCase="preserve"
                />
              </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--erp-muted)]">
            {measurementChartId ? "This template has no measurement areas yet." : "Select a Measurement Template to load its measurement rows."}
          </p>
        )}
        {hasUnconfiguredTemplateRows ? (
          <p className="text-sm text-[var(--erp-danger)]" role="alert">
            Configure Min, Max, and Size for every area in Admin &gt; Master Data &gt; Measurement Chart before taking measurements.
          </p>
        ) : null}
        <ActionError error={state.error} />
        <div className="flex justify-end"><SubmitButton label="Save employee measurements" disabled={!canSubmit} /></div>
      </Card>
    </form>
  );
}
