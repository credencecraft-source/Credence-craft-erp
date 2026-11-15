"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import {
  POS_OFFER_STATUS_OPTIONS,
  POS_OFFER_TYPE_OPTIONS,
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
  targetIds: string[];
  createdAt: string;
};

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

function toFormValues(offer: PosOfferRecord): OfferFormValues {
  return {
    offerCode: offer.offerCode,
    name: offer.name,
    description: offer.description ?? "",
    status: offer.status,
    discountAmount: offer.discountAmount ?? "",
    discountPercentage: offer.discountPercentage ?? "",
    buyQuantity: offer.buyQuantity?.toString() ?? "",
    getQuantity: offer.getQuantity?.toString() ?? "",
    getDiscountPercentage: offer.getDiscountPercentage ?? "",
    comboPrice: offer.comboPrice ?? "",
    startsAt: offer.startsAt,
    endsAt: offer.endsAt ?? "",
  };
}

function offerTypeLabel(value: string) {
  return POS_OFFER_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function scopeLabel(value: string) {
  return {
    CATEGORY: "Category",
    COLOUR: "Colour",
    SIZE: "Size",
    ALL: "For All",
  }[value] ?? value;
}

function formatValue(offer: PosOfferRecord) {
  if (offer.discountAmount !== null) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" }).format(Number(offer.discountAmount));
  }
  if (offer.discountPercentage !== null) return `${offer.discountPercentage}%`;
  if (offer.buyQuantity !== null && offer.getQuantity !== null) {
    return `Buy ${offer.buyQuantity}, get ${offer.getQuantity} at ${offer.getDiscountPercentage}% off`;
  }
  if (offer.comboPrice !== null) {
    return `${new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" }).format(Number(offer.comboPrice))} combo price`;
  }
  return "-";
}

function formatDate(value: string | null) {
  if (!value) return "No end date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}

export default function PosOfferRecordPage({
  organizationId,
  offersPath,
  offerId,
}: {
  organizationId: string;
  offersPath: string;
  offerId: string;
}) {
  const [offer, setOffer] = useState<PosOfferRecord | null>(null);
  const [form, setForm] = useState<OfferFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const apiPath = `/api/organizations/${encodeURIComponent(organizationId)}/pos/offers/${encodeURIComponent(offerId)}`;

  const loadOffer = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(apiPath, { cache: "no-store", signal });
    const data = await response.json() as { offer?: PosOfferRecord; error?: string };
    if (!response.ok) throw new Error(data.error || "Unable to load POS offer.");
    if (!data.offer) throw new Error("The POS offer response was invalid.");
    setOffer(data.offer);
  }, [apiPath]);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void loadOffer(controller.signal)
        .catch((loadError: unknown) => {
          if (!controller.signal.aborted) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load POS offer.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadOffer]);

  const updateForm = (key: keyof OfferFormValues, value: string) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const cancelEdit = () => {
    if (offer) setForm(toFormValues(offer));
    setEditing(false);
    setError("");
  };

  const saveOffer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!offer || !form || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          offerType: POS_OFFER_TYPE_OPTIONS.find(({ value }) => value === offer.offerType)?.slug,
          scope: offer.scope.toLowerCase(),
          targetIds: offer.targetIds,
        }),
      });
      const data = await response.json() as { offer?: PosOfferRecord; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to update POS offer.");
      if (!data.offer) throw new Error("The POS offer update response was invalid.");
      setOffer(data.offer);
      setForm(toFormValues(data.offer));
      setEditing(false);
      setMessage(`${data.offer.offerCode} was saved.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update POS offer.");
    } finally {
      setSaving(false);
    }
  };

  const typeValueField = offer?.offerType === "FLAT_AMOUNT"
    ? <Input label="Discount amount (INR)" type="number" min="0.01" step="0.01" required value={form?.discountAmount ?? ""} onChange={(event) => updateForm("discountAmount", event.target.value)} />
    : offer?.offerType === "PERCENTAGE"
      ? <Input label="Discount percentage" type="number" min="0.01" max="100" step="0.01" required value={form?.discountPercentage ?? ""} onChange={(event) => updateForm("discountPercentage", event.target.value)} />
      : offer?.offerType === "BUY_ONE_GET_ONE"
        ? (
          <>
            <Input label="Buy quantity" type="number" min="1" step="1" required value={form?.buyQuantity ?? ""} onChange={(event) => updateForm("buyQuantity", event.target.value)} />
            <Input label="Get quantity" type="number" min="1" step="1" required value={form?.getQuantity ?? ""} onChange={(event) => updateForm("getQuantity", event.target.value)} />
            <Input label="Discount on get items (%)" type="number" min="0" max="100" step="0.01" required value={form?.getDiscountPercentage ?? ""} onChange={(event) => updateForm("getDiscountPercentage", event.target.value)} />
          </>
        )
        : <Input label="Combo price (INR)" type="number" min="0" step="0.01" required value={form?.comboPrice ?? ""} onChange={(event) => updateForm("comboPrice", event.target.value)} />;

  return (
    <Page as="div">
      <Section className="space-y-5">
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--erp-muted)]">POS Offer</p>
            <h1 className="text-3xl font-bold text-[var(--erp-text)]">
              {offer?.offerCode ?? "Offer details"}
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={offersPath}>
              <Button type="button" variant="secondary">Back to offers</Button>
            </Link>
            {offer && !editing ? (
              <Button type="button" onClick={() => {
                setForm(toFormValues(offer));
                setEditing(true);
                setError("");
                setMessage("");
              }}>
                Edit
              </Button>
            ) : null}
          </div>
        </header>

        {loading ? <p role="status" className="text-sm text-[var(--erp-muted)]">Loading offer details...</p> : null}
        {error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--erp-danger)]">{error}</p>
            {!offer ? <Button type="button" variant="secondary" onClick={() => {
              setLoading(true);
              void loadOffer()
                .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Unable to load POS offer."))
                .finally(() => setLoading(false));
            }}>Retry</Button> : null}
          </div>
        ) : null}
        {message ? (
          <p role="status" className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-text)]">
            {message}
          </p>
        ) : null}

        {offer && editing && form ? (
          <Card>
            <form className="space-y-6" onSubmit={saveOffer}>
              <div>
                <h2 className="text-xl font-semibold text-[var(--erp-text)]">Edit offer</h2>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">
                  Offer type, scope, and eligible targets remain unchanged.
                </p>
              </div>
              {error ? <p role="alert" className="text-sm text-[var(--erp-danger)]">{error}</p> : null}
              <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
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
              <Textarea label="Description" maxLength={500} value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
              <div className="flex flex-wrap justify-end gap-3">
                <Button type="button" variant="secondary" disabled={saving} onClick={cancelEdit}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving offer..." : "Save changes"}</Button>
              </div>
            </form>
          </Card>
        ) : null}

        {offer && !editing ? (
          <Card className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-[var(--erp-text)]">{offer.name}</h2>
              <Badge>{POS_OFFER_STATUS_OPTIONS.find(({ value }) => value === offer.status)?.label ?? offer.status}</Badge>
            </div>
            <dl className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div><dt className="text-xs font-semibold uppercase text-[var(--erp-muted)]">Offer type</dt><dd className="mt-1 text-sm text-[var(--erp-text)]">{offerTypeLabel(offer.offerType)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-[var(--erp-muted)]">Scope</dt><dd className="mt-1 text-sm text-[var(--erp-text)]">{scopeLabel(offer.scope)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-[var(--erp-muted)]">Offer value</dt><dd className="mt-1 text-sm text-[var(--erp-text)]">{formatValue(offer)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-[var(--erp-muted)]">Starts</dt><dd className="mt-1 text-sm text-[var(--erp-text)]">{formatDate(offer.startsAt)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-[var(--erp-muted)]">Ends</dt><dd className="mt-1 text-sm text-[var(--erp-text)]">{formatDate(offer.endsAt)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-[var(--erp-muted)]">Targets</dt><dd className="mt-1 text-sm text-[var(--erp-text)]">{offer.targetLabels.join(", ") || "All eligible items"}</dd></div>
              <div className="sm:col-span-2 xl:col-span-3"><dt className="text-xs font-semibold uppercase text-[var(--erp-muted)]">Description</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-[var(--erp-text)]">{offer.description || "-"}</dd></div>
            </dl>
          </Card>
        ) : null}
      </Section>
    </Page>
  );
}
