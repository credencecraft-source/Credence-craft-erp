"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { ReportGrid } from "@/components/reports/report-grid-display";
import { validateMasterQuotationChildSelection } from "@/lib/services/distribution/quotation-selection-service";
import type { DistributionQuotationSummary } from "./quotation-types";

type VendorOption = { id: string; label: string };
type ContactOption = { id: string; code: string; label: string };

type QuotationField = keyof Pick<
  DistributionQuotationSummary,
  "quotationNo" | "orderNo" | "customer" | "contactRole" | "mode" | "status" | "totalQuantity" | "subtotal" | "createdAt"
>;

const fields: Array<{ key: QuotationField; label: string }> = [
  { key: "quotationNo", label: "Quotation No" },
  { key: "orderNo", label: "Order No" },
  { key: "customer", label: "Customer / Contact" },
  { key: "contactRole", label: "Contact Role" },
  { key: "mode", label: "Type" },
  { key: "status", label: "Status" },
  { key: "totalQuantity", label: "Total Qty" },
  { key: "subtotal", label: "Subtotal" },
  { key: "createdAt", label: "Created Date" },
];

function getQuotationRowId(quotation: DistributionQuotationSummary) {
  return quotation.id;
}

function renderQuotationCell(fieldKey: string, quotation: DistributionQuotationSummary) {
  if (fieldKey === "createdAt") return quotation.createdAt.slice(0, 10);
  const value = quotation[fieldKey as keyof DistributionQuotationSummary];
  return value === null || value === undefined ? "" : String(value);
}

export default function QuotationListPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params.organizationId;
  const [quotations, setQuotations] = useState<DistributionQuotationSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleFields, setVisibleFields] = useState<QuotationField[]>(fields.map(({ key }) => key));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingSalesOrder, setIsCreatingSalesOrder] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [selectedCounterparty, setSelectedCounterparty] = useState("");
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [allContacts, setAllContacts] = useState<ContactOption[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [isLoadingAllContacts, setIsLoadingAllContacts] = useState(false);
  const [allContactsError, setAllContactsError] = useState("");
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [vendorError, setVendorError] = useState("");
  const [isSalesOrderModalOpen, setIsSalesOrderModalOpen] = useState(false);

  const loadQuotations = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId });
      const response = await fetch(`/api/distribution/quotations?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.quotations)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load quotations.");
      }
      setQuotations(data.quotations as DistributionQuotationSummary[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load quotations.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void Promise.resolve().then(loadQuotations);
  }, [loadQuotations]);

  useEffect(() => {
    const controller = new AbortController();
    const loadVendors = async () => {
      setIsLoadingVendors(true);
      setVendorError("");
      try {
        const response = await fetch(
          `/api/organizations/${encodeURIComponent(organizationId)}/master-data/vendor?includeInactive=false&includeDummyData=true`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data)) {
          throw new Error(typeof data?.error === "string" ? data.error : "Unable to load Vendor Master.");
        }
        const options = data
          .filter((value: { id?: string; label?: string }) =>
            typeof value?.id === "string" && typeof value?.label === "string" && value.label.trim(),
          )
          .map((value: { id: string; label: string }) => ({ id: value.id, label: value.label.trim() }))
          .sort((left: VendorOption, right: VendorOption) => left.label.localeCompare(right.label));
        setVendors(options);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setVendorError(loadError instanceof Error ? loadError.message : "Unable to load Vendor Master.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingVendors(false);
      }
    };
    void Promise.resolve().then(loadVendors);
    return () => controller.abort();
  }, [organizationId]);

  const loadAllContacts = useCallback(async (search: string, signal?: AbortSignal) => {
    setIsLoadingAllContacts(true);
    setAllContactsError("");
    try {
      const query = new URLSearchParams({ limit: "100" });
      if (search.trim()) query.set("search", search.trim());
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/contacts/lookup?${query}`,
        { cache: "no-store", signal },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load Contact Master.");
      }
      if (data.some((contact) =>
        !contact ||
        typeof contact.id !== "string" ||
        typeof contact.code !== "string" ||
        typeof contact.label !== "string"
      )) {
        throw new Error("The contact list returned an invalid response. Refresh and try again.");
      }
      setAllContacts(data as ContactOption[]);
    } catch (loadError) {
      if (!signal?.aborted) {
        setAllContactsError(loadError instanceof Error ? loadError.message : "Unable to load Contact Master.");
      }
    } finally {
      if (!signal?.aborted) setIsLoadingAllContacts(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isSalesOrderModalOpen || !showAllContacts) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void loadAllContacts(contactSearch, controller.signal);
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [contactSearch, isSalesOrderModalOpen, loadAllContacts, showAllContacts]);

  const regularQuotations = useMemo(
    () => quotations.filter((quotation) => quotation.mode !== "MASTER" && !quotation.parentQuotationId),
    [quotations],
  );
  const validationQuotes = useMemo(
    () => regularQuotations.map((quotation) => ({
      quoteId: quotation.id,
      parentQuoteId: quotation.parentQuotationId ?? undefined,
    })),
    [regularQuotations],
  );
  const selectionError = validateMasterQuotationChildSelection(selectedIds, validationQuotes);

  async function createSalesOrder() {
    const isContactSelection = selectedCounterparty.startsWith("contact:");
    const counterpartyId = selectedCounterparty.slice(selectedCounterparty.indexOf(":") + 1);
    if (!counterpartyId) {
      setError("Select a Vendor or Contact for the sales order.");
      return;
    }
    setIsCreatingSalesOrder(true);
    setError("");
    try {
      const response = await fetch("/api/distribution/master-quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          quotationIds: selectedIds,
          vendorId: isContactSelection ? null : counterpartyId,
          contactId: isContactSelection ? counterpartyId : null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (
        !response.ok ||
        !Array.isArray(data?.quotations) ||
        data.quotations.length === 0 ||
        data.quotations.some((quotation: { id?: unknown }) => typeof quotation?.id !== "string")
      ) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to create sales order.");
      }
      setIsSalesOrderModalOpen(false);
      setSelectedIds([]);
      if (data.quotations.length === 1) {
        router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/advance-booking/sales-order/${encodeURIComponent(data.quotations[0].id)}`);
      } else {
        setNotice(
          `Created ${data.quotations.length} Sales Orders according to the selected Dealers' Distributor billing settings. Review them in Sales Orders.`,
        );
        await loadQuotations();
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create sales order.");
    } finally {
      setIsCreatingSalesOrder(false);
    }
  }

  function requestBulkDelete() {
    const selectedQuotations = regularQuotations.filter((quotation) => selectedIds.includes(quotation.id));
    if (selectedQuotations.length !== selectedIds.length) {
      setError("One or more selected quotations are no longer in this report. Refresh and select them again.");
      return;
    }
    if (selectedQuotations.some((quotation) => quotation.status !== "DRAFT")) {
      setError("Only draft quotations can be deleted. Remove issued quotations from the selection.");
      return;
    }
    setError("");
    setNotice("");
    setIsBulkDeleteDialogOpen(true);
  }

  async function deleteSelectedQuotations() {
    if (isBulkDeleting || selectedIds.length === 0) return;
    setIsBulkDeleting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/distribution/quotations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, quotationIds: selectedIds }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.deleted) || data.deleted.length !== selectedIds.length) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to delete the selected quotations.");
      }
      const deletedCount = data.deleted.length;
      const reopenedOrderFormCount = data.deleted.reduce(
        (total: number, item: { reopenedOrderFormCount?: unknown }) =>
          total + (typeof item.reopenedOrderFormCount === "number" ? item.reopenedOrderFormCount : 0),
        0,
      );
      setSelectedIds([]);
      setIsBulkDeleteDialogOpen(false);
      const reopenedNotice = reopenedOrderFormCount > 0
        ? ` Reopened ${reopenedOrderFormCount} Order Form${reopenedOrderFormCount === 1 ? "" : "s"} for quotation creation.`
        : "";
      setNotice(`Deleted ${deletedCount} quotation${deletedCount === 1 ? "" : "s"}.${reopenedNotice} Source bookings were not deleted.`);
      await loadQuotations();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete the selected quotations.");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  function openQuotation(id: string) {
    router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/advance-booking/quotation/${encodeURIComponent(id)}`);
  }

  return (
    <div className="w-full min-w-0 space-y-4 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="erp-eyebrow">Advance Booking / Quotation</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Quotations</h1>
          <p className="mt-2 text-sm text-slate-600">Database-backed quotation headers and booking-derived detail lines.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/advance-booking/sales-order`)}>
            Sales Orders
          </Button>
          <Button type="button" variant="secondary" onClick={() => void loadQuotations()} disabled={isLoading}>
            Refresh
          </Button>
        </div>
      </header>
      {vendorError || error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {vendorError || error}
        </p>
      ) : null}
      {notice ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
      <Card className="p-2 shadow-none">
        <ReportGrid
          title="Quotation Register"
          records={regularQuotations}
          isLoading={isLoading}
          fields={fields}
          visibleFields={visibleFields}
          onVisibleFieldsChange={(next) => setVisibleFields(next as QuotationField[])}
          storageKey={`distribution-quotation-report-columns-v2:${organizationId}`}
          legacyStorageKey={`distribution-quotation-report-columns:${organizationId}`}
          legacyFieldsToAdd={["contactRole"]}
          rowIdSelector={getQuotationRowId}
          selectedIds={selectedIds}
          onToggleSelectAll={(checked) => setSelectedIds(checked ? regularQuotations.map((quotation) => quotation.id) : [])}
          onToggleRowSelection={(id, checked) => setSelectedIds((current) =>
            checked ? current.includes(id) ? current : [...current, id] : current.filter((value) => value !== id),
          )}
          rowSelectable={(quotation) => quotation.status === "DRAFT"}
          onRowClick={(id) => openQuotation(id)}
          onRowAction={(id) => openQuotation(id)}
          rowActionLabel="Open Quotation"
          onBulkDeleteSelected={requestBulkDelete}
          bulkDeleteSelectedLabel="Delete Quotations"
          toolbarActions={(
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={Boolean(selectionError) || isLoading || isCreatingSalesOrder}
              title={selectionError || undefined}
              onClick={() => {
                setError("");
                setIsSalesOrderModalOpen(true);
              }}
            >
              {`Create Sales Order${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
            </Button>
          )}
          emptyMessage={isLoading ? "Loading quotations..." : "No ungrouped regular quotations are available. Create one from selected advance bookings."}
          renderCell={renderQuotationCell}
        />
      </Card>
      <Modal
          open={isBulkDeleteDialogOpen}
          onClose={() => {
            if (!isBulkDeleting) setIsBulkDeleteDialogOpen(false);
          }}
          ariaLabelledBy="bulk-delete-quotations-title"
          size="square"
          variant="danger"
          closeOnBackdrop={!isBulkDeleting}
        >
          <div className="space-y-4 p-6">
            <div>
              <h2 id="bulk-delete-quotations-title" className="text-lg font-semibold text-slate-900">Delete selected quotations?</h2>
              <p className="mt-2 text-sm text-slate-600">
                {selectedIds.length} draft quotation{selectedIds.length === 1 ? "" : "s"} will be deleted. Their source bookings will remain.
              </p>
            </div>
            {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsBulkDeleteDialogOpen(false)} disabled={isBulkDeleting}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={() => void deleteSelectedQuotations()} disabled={isBulkDeleting}>
                {isBulkDeleting ? "Deleting..." : `Delete ${selectedIds.length} Quotation${selectedIds.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </Modal>
        <Modal
        open={isSalesOrderModalOpen}
        onClose={() => {
          if (!isCreatingSalesOrder) setIsSalesOrderModalOpen(false);
        }}
        ariaLabelledBy="sales-order-counterparty-title"
        size="sm"
        closeOnBackdrop={!isCreatingSalesOrder}
      >
        <form
          className="space-y-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void createSalesOrder();
          }}
        >
          <div>
            <h2 id="sales-order-counterparty-title" className="text-lg font-semibold text-slate-900">Create Sales Order</h2>
            <p className="mt-1 text-sm text-slate-600">Choose a Vendor or enable LIST ALL to select any Contact Master contact.</p>
          </div>
          <Checkbox
            label="LIST ALL"
            checked={showAllContacts}
            onChange={(event) => {
              const checked = event.target.checked;
              setShowAllContacts(checked);
              setSelectedCounterparty("");
              setError("");
              setAllContacts([]);
              setAllContactsError("");
            }}
            disabled={isCreatingSalesOrder}
          />
          {showAllContacts ? (
          <>
            <Input
              label="Search Contact Master"
              value={contactSearch}
              onChange={(event) => {
                setContactSearch(event.target.value);
                setAllContacts([]);
                setSelectedCounterparty("");
              }}
              placeholder="Search name or code"
              disabled={isCreatingSalesOrder}
            />
            <p className="text-xs text-slate-600">Showing up to 100 matches. Refine your search if the contact is not listed.</p>
          </>
          ) : null}
          <Select
            label="Vendor / Contact"
            required
            value={selectedCounterparty}
            onChange={(event) => setSelectedCounterparty(event.target.value)}
            disabled={(showAllContacts ? isLoadingAllContacts : isLoadingVendors) || isCreatingSalesOrder}
          >
            <option value="">
              {showAllContacts
                ? isLoadingAllContacts ? "Searching contacts..." : "Select a Contact"
                : isLoadingVendors ? "Loading vendors..." : "Select a Vendor"}
            </option>
            {showAllContacts
              ? allContacts.map((contact) => (
                  <option key={contact.id} value={`contact:${contact.id}`}>{contact.label}</option>
                ))
              : vendors.map((vendor) => (
                  <option key={vendor.id} value={`vendor:${vendor.id}`}>{vendor.label}</option>
                ))}
          </Select>
          {showAllContacts && allContactsError ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">
              <span>{allContactsError}</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => void loadAllContacts(contactSearch)} disabled={isLoadingAllContacts}>
                Retry All Contacts
              </Button>
            </div>
          ) : null}
          {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setIsSalesOrderModalOpen(false)} disabled={isCreatingSalesOrder}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={
                !selectedCounterparty ||
                (showAllContacts ? isLoadingAllContacts : isLoadingVendors) ||
                isCreatingSalesOrder
              }
            >
              {isCreatingSalesOrder ? "Creating..." : "Create Sales Order"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
