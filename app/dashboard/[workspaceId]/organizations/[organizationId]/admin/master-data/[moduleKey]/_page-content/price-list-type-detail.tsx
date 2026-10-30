"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { ReportGrid } from "@/components/reports/report-grid-display";
import PriceListContactCreateDialog from "./price-list-contact-create-dialog";

type PriceListRecord = {
  id: string;
  label: string;
  code: string | null;
  isActive: boolean;
};

const REPORT_FIELDS = [
  { key: "label", label: "Group Name" },
  { key: "status", label: "Status" },
];

export default function PriceListTypeDetail({
  workspaceId,
  organizationId,
  priceListType,
  records,
  saved,
}: {
  workspaceId: string;
  organizationId: string;
  priceListType: string;
  records: PriceListRecord[];
  saved?: string;
}) {
  const router = useRouter();
  const [visibleFields, setVisibleFields] = useState(REPORT_FIELDS.map(({ key }) => key));
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [savedMessage, setSavedMessage] = useState(saved === "create");
  const priceListPath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/price-list`;
  const getSearchValue = (fieldKey: string, record: PriceListRecord) => {
    if (fieldKey === "label") return record.label;
    if (fieldKey === "code") return record.code ?? "";
    if (fieldKey === "status") return record.isActive ? "active" : "inactive";
    return "";
  };
  const renderCell = (fieldKey: string, record: PriceListRecord) => {
    if (fieldKey === "label") return record.label;
    if (fieldKey === "status") {
      return (
        <Badge className={record.isActive
          ? "border-[var(--erp-success)] bg-[var(--erp-success-soft)] text-[var(--erp-success)]"
          : "border-[var(--erp-border)] bg-[var(--erp-surface-soft)] text-[var(--erp-muted)]"}>
          {record.isActive ? "Active" : "Inactive"}
        </Badge>
      );
    }
    return "—";
  };

  return (
    <Page>
      <Section className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--erp-muted)]">Master Data / Price List</p>
            <h1 className="mt-1 text-2xl font-semibold text-[var(--erp-text)]">{priceListType}</h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Groups under this Price List Type. Open a group to manage its Contacts.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(priceListPath)}
          >
            Back to Price List Types
          </Button>
        </div>
        {savedMessage ? (
          <Card className="border-[var(--erp-success)] bg-[var(--erp-success-soft)]">
            <p className="text-sm text-[var(--erp-success)]" role="status">
              Group created successfully.
            </p>
          </Card>
        ) : null}
        <ReportGrid
          title={`${priceListType} Groups`}
          records={records}
          fields={REPORT_FIELDS}
          visibleFields={visibleFields}
          onVisibleFieldsChange={setVisibleFields}
          storageKey={`price-list-type-report-${organizationId}-${priceListType}`}
          rowIdSelector={(record) => record.id}
          selectedIds={[]}
          selectable={false}
          displayMode="cards"
          onRowClick={(recordId) => router.push(
            `${priceListPath}/type/${encodeURIComponent(priceListType)}/${encodeURIComponent(recordId)}`,
          )}
          onNewOrder={() => {
            setSavedMessage(false);
            setCreateDialogOpen(true);
          }}
          newActionLabel="+ Add Group"
          getSearchValue={getSearchValue}
          renderCell={renderCell}
        />
      </Section>
      {createDialogOpen ? (
        <PriceListContactCreateDialog
          open
          workspaceId={workspaceId}
          organizationId={organizationId}
          priceListType={priceListType}
          onClose={() => setCreateDialogOpen(false)}
          onCreated={() => {
            setCreateDialogOpen(false);
            setSavedMessage(true);
            router.refresh();
          }}
        />
      ) : null}
    </Page>
  );
}