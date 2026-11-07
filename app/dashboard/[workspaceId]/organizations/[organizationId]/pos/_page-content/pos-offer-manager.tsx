"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import {
  POS_OFFER_SCOPE_OPTIONS,
} from "@/lib/services/pos/pos-offer-contract";
import {
  POS_OFFER_STATUS_OPTIONS,
  POS_OFFER_TYPE_OPTIONS,
  type PosOfferScopeOption,
  type PosOfferTypeOption,
} from "@/lib/services/pos/pos-offer-contract";

type PosOfferRecord = {
  id: string;
  offerCode: string;
  name: string;
  description: string | null;
  offerType: string;
  scope: string;
  status: string;
  discountAmount: string | null;
  discountPercentage: string | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  getDiscountPercentage: string | null;
  comboPrice: string | null;
  startsAt: string;
  endsAt: string | null;
  targetLabels: string[];
  createdAt: string;
};

type TargetOption = { id: string; label: string };
type OfferFormValues = {
  offerCode: string;
  name: string;
  description: string;
  status: string;
  discountAmount: string;
  discountPercentage: string;
  buyQuantity: string;
  getQuantity: string;
  getDiscountPercentage: string;
  comboPrice: string;
  startsAt: string;
  endsAt: string;
};

const PAGE_SIZE = 50;
const LOOKUP_LIMIT = 50;
const REPORT_FIELDS: Array<{ key: keyof PosOfferRecord; label: string }> = [
  { key: "offerCode", label: "Offer Code" },
  { key: "name", label: "Offer Name" },
  { key: "targetLabels", label: "Targets" },
  { key: "offerType", label: "Offer Type" },
  { key: "scope", label: "Scope" },
  { key: "discountAmount", label: "Offer Value" },
  { key: "startsAt", label: "Starts" },
  { key: "endsAt", label: "Ends" },
  { key: "status", label: "Status" },
];

const EMPTY_FORM: OfferFormValues = {
  offerCode: "",
  name: "",
  description: "",
  status: "DRAFT",
  discountAmount: "",
  discountPercentage: "",
  buyQuantity: "",
  getQuantity: "",
  getDiscountPercentage: "100",
  comboPrice: "",
  startsAt: "",
  endsAt: "",
};

function offerValue(record: PosOfferRecord) {
  switch (record.offerType) {
    case "FLAT_AMOUNT":
      return new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" })
        .format(Number(record.discountAmount ?? 0));
    case "PERCENTAGE":
      return `${record.discountPercentage ?? "0"}%`;
    case "BUY_ONE_GET_ONE":
      return `Buy ${record.buyQuantity}, get ${record.getQuantity} at ${record.getDiscountPercentage}% off`;
    case "COMBO":
      return new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" })
        .format(Number(record.comboPrice ?? 0));
    default:
      return "-";
  }
}

function statusLabel(status: string) {
  return POS_OFFER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function typeLabel(value: string) {
  return POS_OFFER_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function scopeLabel(value: string) {
  const labels: Record<string, string> = {
    CATEGORY: "Category",
    COLOUR: "Colour",
    SIZE: "Size",
    ALL: "For All",
  };
  return labels[value] ?? value;
}

function scopePlural(value: PosOfferScopeOption["value"]) {
  return value === "CATEGORY" ? "categories" : value === "ALL" ? "items" : `${scopeLabel(value).toLowerCase()}s`;
}

export default function PosOfferManager({
  organizationId,
  offerType: fixedOfferType,
  scope: fixedScope,
  createOnly = false,
  offersPath,
}: {
  organizationId: string;
  offerType?: PosOfferTypeOption;
  scope?: PosOfferScopeOption;
  createOnly?: boolean;
  offersPath?: string;
}) {
  const router = useRouter();
  const apiPath = `/api/organizations/${encodeURIComponent(organizationId)}/pos/offers`;
  const [offerType, setOfferType] = useState<PosOfferTypeOption>(
    fixedOfferType ?? POS_OFFER_TYPE_OPTIONS[0],
  );
  const [scope, setScope] = useState<PosOfferScopeOption>(
    fixedScope ?? POS_OFFER_SCOPE_OPTIONS.find(({ value }) => value === "ALL")!,
  );
  const [records, setRecords] = useState<PosOfferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [visibleFields, setVisibleFields] = useState<Array<string | keyof PosOfferRecord>>(
    REPORT_FIELDS.map(({ key }) => key),
  );
  const [showForm, setShowForm] = useState(createOnly);
  const [form, setForm] = useState<OfferFormValues>(EMPTY_FORM);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [targetOptions, setTargetOptions] = useState<TargetOption[]>([]);
  const [targetSearch, setTargetSearch] = useState("");
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetsError, setTargetsError] = useState("");
  const [targetRetryVersion, setTargetRetryVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const requestController = useRef<AbortController | null>(null);
  const requestKey = useRef<string | null>(null);
  const selectedTargets = useMemo(() => new Set(selectedTargetIds), [selectedTargetIds]);

  const loadOffers = useCallback(async (cursor?: string | null, append = false) => {
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setLoadError("");

    try {
      const query = new URLSearchParams({
        offerType: offerType.slug,
        scope: scope.slug,
        limit: String(PAGE_SIZE),
      });
      if (search.trim()) query.set("search", search.trim());
      if (statusFilter !== "ALL") query.set("status", statusFilter);
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`${apiPath}?${query}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json() as {
        offers?: PosOfferRecord[];
        nextCursor?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Unable to load POS offers.");
      const offers = data.offers;
      if (!Array.isArray(offers)) throw new Error("The POS offer report response was invalid.");
      setRecords((current) => append ? [...current, ...offers] : offers);
      setNextCursor(data.nextCursor ?? null);
    } catch (error) {
      if (!controller.signal.aborted) {
        setLoadError(error instanceof Error ? error.message : "Unable to load POS offers.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [apiPath, offerType.slug, scope.slug, search, statusFilter]);

  useEffect(() => {
    if (createOnly) return;
    const timeoutId = window.setTimeout(() => {
      void loadOffers();
    }, search.trim() ? 200 : 0);
    return () => {
      window.clearTimeout(timeoutId);
      requestController.current?.abort();
    };
  }, [createOnly, loadOffers, refreshVersion, search]);

  useEffect(() => {
    if (scope.value === "ALL") return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setTargetsLoading(true);
      setTargetsError("");
      try {
        const query = new URLSearchParams({
          lookupScope: scope.slug,
          limit: String(LOOKUP_LIMIT),
        });
        if (targetSearch.trim()) query.set("search", targetSearch.trim());
        const response = await fetch(`${apiPath}?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json() as { options?: TargetOption[]; error?: string };
        if (!response.ok) throw new Error(data.error || `Unable to load ${scopePlural(scope.value)}.`);
        if (!Array.isArray(data.options)) throw new Error("The offer target response was invalid.");
        setTargetOptions((current) => {
          const merged = new Map(current.map((option) => [option.id, option]));
          data.options!.forEach((option) => merged.set(option.id, option));
          return [...merged.values()].slice(-LOOKUP_LIMIT * 2);
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          setTargetsError(error instanceof Error ? error.message : "Unable to load offer targets.");
        }
      } finally {
        if (!controller.signal.aborted) setTargetsLoading(false);
      }
    }, targetSearch.trim() ? 200 : 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [apiPath, scope.label, scope.slug, scope.value, targetSearch, targetRetryVersion]);

  const updateForm = (key: keyof OfferFormValues, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateOfferType = (value: string) => {
    const nextType = POS_OFFER_TYPE_OPTIONS.find((option) => option.value === value);
    if (!nextType) return;
    setOfferType(nextType);
    setForm((current) => ({
      ...current,
      discountAmount: "",
      discountPercentage: "",
      buyQuantity: "",
      getQuantity: "",
      getDiscountPercentage: "100",
      comboPrice: "",
    }));
    requestKey.current = null;
    setFormError("");
  };

  const updateScope = (value: string) => {
    const nextScope = POS_OFFER_SCOPE_OPTIONS.find((option) => option.value === value);
    if (!nextScope) return;
    setScope(nextScope);
    setSelectedTargetIds([]);
    setTargetOptions([]);
    setTargetSearch("");
    setTargetsError("");
    requestKey.current = null;
    setFormError("");
  };

  const toggleTarget = (id: string, checked: boolean) => {
    setSelectedTargetIds((current) => {
      if (checked) return current.includes(id) || current.length >= 100 ? current : [...current, id];
      return current.filter((targetId) => targetId !== id);
    });
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setSelectedTargetIds([]);
    setTargetSearch("");
    setFormError("");
    requestKey.current = null;
  };

  const submitOffer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError("");
    setSuccessMessage("");
    requestKey.current ??= crypto.randomUUID();

    try {
      const response = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: requestKey.current,
          offerCode: form.offerCode,
          name: form.name,
          description: form.description,
          offerType: offerType.slug,
          scope: scope.slug,
          status: form.status,
          discountAmount: form.discountAmount,
          discountPercentage: form.discountPercentage,
          buyQuantity: form.buyQuantity,
          getQuantity: form.getQuantity,
          getDiscountPercentage: form.getDiscountPercentage,
          comboPrice: form.comboPrice,
          startsAt: form.startsAt,
          endsAt: form.endsAt || null,
          targetIds: selectedTargetIds,
        }),
      });
      const data = await response.json() as { offer?: PosOfferRecord; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to create the POS offer.");
      if (!data.offer) throw new Error("The POS offer response was invalid.");
      const savedOffer = data.offer;
      if (createOnly && offersPath) {
        router.push(`${offersPath}?created=${encodeURIComponent(savedOffer.offerCode)}`);
        return;
      }
      setRecords((current) => [
        savedOffer,
        ...current.filter((record) => record.id !== savedOffer.id),
      ].slice(0, PAGE_SIZE));
      setSuccessMessage(`${data.offer.offerCode} was saved.`);
      resetForm();
      setShowForm(false);
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to create the POS offer.");
    } finally {
      setSaving(false);
    }
  };

  const renderCell = (fieldKey: string, record: PosOfferRecord) => {
    if (fieldKey === "offerCode") return <span className="font-semibold">{record.offerCode}</span>;
    if (fieldKey === "offerType") return typeLabel(record.offerType);
    if (fieldKey === "scope") return scopeLabel(record.scope);
    if (fieldKey === "targetLabels") return record.targetLabels.join(", ") || "All eligible items";
    if (fieldKey === "discountAmount") return offerValue(record);
    if (fieldKey === "startsAt" || fieldKey === "endsAt") return record[fieldKey as "startsAt" | "endsAt"] || "No end date";
    if (fieldKey === "status") return <Badge>{statusLabel(record.status)}</Badge>;
    return String(record[fieldKey as keyof PosOfferRecord] ?? "");
  };

  const formHeading = `New ${offerType.label} Offer`;
  const typeValueField = offerType.value === "FLAT_AMOUNT"
    ? <Input label="Discount amount (INR)" type="number" min="0.01" step="0.01" required value={form.discountAmount} onChange={(event) => updateForm("discountAmount", event.target.value)} />
    : offerType.value === "PERCENTAGE"
      ? <Input label="Discount percentage" type="number" min="0.01" max="100" step="0.01" required value={form.discountPercentage} onChange={(event) => updateForm("discountPercentage", event.target.value)} />
      : offerType.value === "BUY_ONE_GET_ONE"
        ? (
          <>
            <Input label="Buy quantity" type="number" min="1" step="1" required value={form.buyQuantity} onChange={(event) => updateForm("buyQuantity", event.target.value)} />
            <Input label="Get quantity" type="number" min="1" step="1" required value={form.getQuantity} onChange={(event) => updateForm("getQuantity", event.target.value)} />
            <Input label="Discount on get items (%)" type="number" min="0" max="100" step="0.01" required value={form.getDiscountPercentage} onChange={(event) => updateForm("getDiscountPercentage", event.target.value)} />
          </>
        )
        : <Input label="Combo price (INR)" type="number" min="0" step="0.01" required value={form.comboPrice} onChange={(event) => updateForm("comboPrice", event.target.value)} />;

  return (
    <Page as="div">
      <Section>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--erp-text)]">
              {createOnly ? "Create POS Offer" : `${offerType.label} - ${scope.label}`}
            </h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              {createOnly
                ? "Choose an offer type and scope, then complete the offer details."
                : "Create and manage offers for this offer type and scope."}
            </p>
          </div>
          {createOnly && offersPath ? (
            <Link href={offersPath}>
              <Button type="button" variant="secondary">Cancel</Button>
            </Link>
          ) : !showForm ? (
            <Button type="button" onClick={() => {
              resetForm();
              setShowForm(true);
              setSuccessMessage("");
            }}>
              New Offer
            </Button>
          ) : null}
        </div>

        {successMessage ? (
          <p role="status" className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-text)]">
            {successMessage}
          </p>
        ) : null}
        {loadError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--erp-danger)]">{loadError}</p>
            <Button type="button" variant="secondary" onClick={() => setRefreshVersion((current) => current + 1)}>
              Retry
            </Button>
          </div>
        ) : null}

        {showForm ? (
          <Card>
            <form className="space-y-6" onSubmit={submitOffer}>
              <div>
                <h2 className="text-xl font-semibold text-[var(--erp-text)]">{formHeading}</h2>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">
                  {createOnly
                    ? "Select the offer type and eligible item scope. Offer status starts as Draft."
                    : "Type and scope are fixed by this page. Offer status starts as Draft."}
                </p>
              </div>
              {formError ? <p role="alert" className="text-sm text-[var(--erp-danger)]">{formError}</p> : null}
              <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                {createOnly ? (
                  <>
                    <Select
                      label="Offer type"
                      value={offerType.value}
                      onChange={(event) => updateOfferType(event.target.value)}
                      options={POS_OFFER_TYPE_OPTIONS.map(({ value, label }) => ({ value, label }))}
                    />
                    <Select
                      label="Offer scope"
                      value={scope.value}
                      onChange={(event) => updateScope(event.target.value)}
                      options={POS_OFFER_SCOPE_OPTIONS.map(({ value, label }) => ({ value, label }))}
                    />
                  </>
                ) : null}
                <Input label="Offer code" required maxLength={60} value={form.offerCode} onChange={(event) => updateForm("offerCode", event.target.value)} />
                <Input label="Offer name" required maxLength={150} value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
                {typeValueField}
                <Select
                  label="Status"
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value)}
                  options={POS_OFFER_STATUS_OPTIONS.map(({ value, label }) => ({ value, label }))}
                />
                <Input label="Start date" type="date" required value={form.startsAt} onChange={(event) => updateForm("startsAt", event.target.value)} />
                <Input label="End date" type="date" min={form.startsAt || undefined} value={form.endsAt} onChange={(event) => updateForm("endsAt", event.target.value)} />
              </div>
              {scope.value !== "ALL" ? (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--erp-text)]">Eligible {scopePlural(scope.value)}</h3>
                    <p className="mt-1 text-xs text-[var(--erp-muted)]">Choose one or more active organization records. Up to 100 targets can be selected.</p>
                  </div>
                  <Input
                    label={`Search ${scopePlural(scope.value)}`}
                    type="search"
                    value={targetSearch}
                    onChange={(event) => setTargetSearch(event.target.value)}
                    placeholder={`Search ${scopePlural(scope.value)}`}
                  />
                  {targetsError ? (
                    <div role="alert" className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-[var(--erp-danger)]">{targetsError}</p>
                      <Button type="button" variant="secondary" onClick={() => setTargetRetryVersion((current) => current + 1)}>Retry lookup</Button>
                    </div>
                  ) : null}
                  {targetsLoading ? <p role="status" className="text-sm text-[var(--erp-muted)]">Loading {scopePlural(scope.value)}...</p> : null}
                  {!targetsLoading && !targetsError && targetOptions.length === 0 ? (
                    <p className="text-sm text-[var(--erp-muted)]">No active {scopePlural(scope.value)} found.</p>
                  ) : null}
                  <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {targetOptions.map((option) => (
                      <Checkbox
                        key={option.id}
                        label={option.label}
                        checked={selectedTargets.has(option.id)}
                        disabled={!selectedTargets.has(option.id) && selectedTargetIds.length >= 100}
                        onChange={(event) => toggleTarget(option.id, event.target.checked)}
                      />
                    ))}
                  </div>
                  {selectedTargetIds.length ? (
                    <p className="text-xs text-[var(--erp-muted)]">{selectedTargetIds.length} target(s) selected.</p>
                  ) : null}
                </div>
              ) : null}
              <Textarea label="Description" maxLength={500} value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
              <div className="flex flex-wrap justify-end gap-3">
                <Button type="button" variant="secondary" disabled={saving} onClick={() => {
                  if (createOnly && offersPath) {
                    router.push(offersPath);
                    return;
                  }
                  resetForm();
                  setShowForm(false);
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || targetsLoading}>
                  {saving ? "Saving offer..." : "Create Offer"}
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        {!createOnly ? <ReportGrid
          title={`${offerType.label} - ${scope.label} Offers`}
          records={records}
          fields={REPORT_FIELDS}
          visibleFields={visibleFields}
          onVisibleFieldsChange={setVisibleFields}
          storageKey={`report-grid:pos-offers:${organizationId}:${offerType.value}:${scope.value}`}
          rowIdSelector={(record) => record.id}
          selectedIds={[]}
          selectable={false}
          statusOptions={["ALL", ...POS_OFFER_STATUS_OPTIONS.map(({ value }) => value)]}
          selectedStatus={statusFilter}
          onStatusChange={(status) => {
            setRecords([]);
            setNextCursor(null);
            setLoading(true);
            setStatusFilter(status);
          }}
          onSearchQueryChange={(query) => {
            setRecords([]);
            setNextCursor(null);
            setLoading(true);
            setSearch(query);
          }}
          serverSideSearch
          searchMinLength={2}
          isLoading={loading}
          renderCell={renderCell}
          emptyMessage="No offers have been created for this type and scope."
        /> : null}
        {!createOnly && nextCursor ? (
          <div className="flex justify-center">
            <Button type="button" variant="secondary" disabled={loadingMore} onClick={() => void loadOffers(nextCursor, true)}>
              {loadingMore ? "Loading offers..." : "Load more offers"}
            </Button>
          </div>
        ) : null}
      </Section>
    </Page>
  );
}
