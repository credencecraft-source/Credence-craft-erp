"use client";

import { useState } from "react";

import { ReportGrid } from "@/components/reports/report-grid-display";

type ReportField = { key: string; label: string };

export default function EmptyReportGrid({
  title,
  fields,
  storageKey,
  emptyMessage,
}: {
  title: string;
  fields: ReportField[];
  storageKey: string;
  emptyMessage: string;
}) {
  const [visibleFields, setVisibleFields] = useState<Array<string | number | symbol>>(fields.map((field) => field.key));

  return (
    <ReportGrid
      title={title}
      records={[]}
      fields={fields}
      visibleFields={visibleFields as Array<string | number | symbol>}
      onVisibleFieldsChange={(nextFields) => setVisibleFields(nextFields as Array<string | number | symbol>)}
      storageKey={storageKey}
      rowIdSelector={() => "empty-report-row"}
      selectedIds={[]}
      onRowClick={() => undefined}
      renderCell={() => ""}
      emptyMessage={emptyMessage}
    />
  );
}
