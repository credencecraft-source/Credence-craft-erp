"use client";

import { useEffect, useMemo, useState } from "react";

import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Table from "@/components/ui/Table";

type MasterOption = {
  id: string;
  value_id: string;
  label: string;
  code?: string | null;
  fields: Record<string, unknown>;
};

type ArticleVariant = { id: string; color: string };
type ArticleOption = MasterOption & { variants: ArticleVariant[]; sizes: string[] };
type OrderLookups = {
  articles: ArticleOption[];
  entities: MasterOption[];
  buyers: MasterOption[];
  seasons: MasterOption[];
  sizeGroups: MasterOption[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMasterOptions(value: unknown): MasterOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.label !== "string") return [];
    return [{
      id: item.id,
      value_id: typeof item.value_id === "string" ? item.value_id : item.id,
      label: item.label,
      code: typeof item.code === "string" ? item.code : null,
      fields: isRecord(item.fields) ? item.fields : {},
    }];
  });
}

function parseOrderLookups(value: unknown): OrderLookups {
  const root = isRecord(value) ? value : {};
  const masterOptions = isRecord(root.masterOptions) ? root.masterOptions : {};
  const sizeGroups = parseMasterOptions(masterOptions["size-group"]);
  const articleOptions = parseMasterOptions(masterOptions.article).map((article): ArticleOption => {
    const rawVariants = article.fields.variants;
    const variants = Array.isArray(rawVariants)
      ? rawVariants.flatMap((variant) => isRecord(variant) && typeof variant.id === "string" && typeof variant.color === "string"
        ? [{ id: variant.id, color: variant.color }]
        : [])
      : [];
    const sizes = Array.isArray(article.fields.Sizes)
      ? article.fields.Sizes.filter((size): size is string => typeof size === "string" && size.trim() !== "")
      : [];
    return { ...article, variants, sizes };
  });
  return {
    articles: articleOptions,
    entities: parseMasterOptions(masterOptions.entity),
    buyers: parseMasterOptions(masterOptions.buyer),
    seasons: parseMasterOptions(masterOptions.season),
    sizeGroups,
  };
}

export default function ArticleBasedOrderDialog({
  open,
  organizationId,
  onClose,
  onCreated,
}: {
  open: boolean;
  organizationId: string;
  onClose: () => void;
  onCreated: (orderNumbers: string[]) => void;
}) {
  const [lookups, setLookups] = useState<OrderLookups | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, Record<string, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isLoading = open && !lookups && !error;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/order-lookups?includeInactive=false&limit=500`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to load Article order options.");
        }
        setLookups(parseOrderLookups(payload));
        setError("");
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load Article order options.");
      });
    return () => controller.abort();
  }, [open, organizationId]);

  const selectedArticle = useMemo(
    () => lookups?.articles.find((article) => article.value_id === selectedArticleId || article.id === selectedArticleId) ?? null,
    [lookups, selectedArticleId],
  );
  const articleSizeGroup = String(selectedArticle?.fields.Size_Group ?? "");
  const selectedSizeGroup = lookups?.sizeGroups.find((group) =>
    group.label === articleSizeGroup || group.id === articleSizeGroup || group.value_id === articleSizeGroup,
  );
  const brand = String(selectedSizeGroup?.fields.Brand1 ?? "");
  const selectedVariants = selectedArticle?.variants.filter((variant) => selectedVariantIds.includes(variant.id)) ?? [];

  const handleArticleChange = (value: string) => {
    setSelectedArticleId(value);
    setSelectedVariantIds([]);
    setQuantities({});
    setError("");
  };

  const handleVariantChange = (variantId: string, checked: boolean) => {
    setSelectedVariantIds((current) => checked
      ? [...current, variantId]
      : current.filter((id) => id !== variantId));
  };

  const handleQuantityChange = (variantId: string, size: string, value: string) => {
    setQuantities((current) => ({
      ...current,
      [variantId]: { ...current[variantId], [size]: value },
    }));
  };

  const handleSubmit = async () => {
    if (!selectedArticle || !entityId || !buyerId || !seasonId || !deliveryDate) {
      setError("Select an Article, Entity, Buyer, Season, and Delivery Date.");
      return;
    }
    if (selectedVariants.length === 0) {
      setError("Select at least one Article color.");
      return;
    }
    if (!brand || !articleSizeGroup || !selectedArticle.sizes.length) {
      setError("Complete this Article's Size Group, Brand, and available sizes before creating orders.");
      return;
    }

    let colors: Array<{ variantId: string; quantities: Array<{ size: string; quantity: number }> }>;
    try {
      colors = selectedVariants.map((variant) => {
        const colorQuantities = selectedArticle.sizes.flatMap((size) => {
          const rawQuantity = quantities[variant.id]?.[size]?.trim() ?? "";
          if (!rawQuantity) return [];
          const quantity = Number(rawQuantity);
          if (!Number.isSafeInteger(quantity) || quantity <= 0) {
            throw new Error(`Enter a positive whole-number quantity for ${variant.color} / ${size}.`);
          }
          return [{ size, quantity }];
        });
        if (colorQuantities.length === 0) {
          throw new Error(`Enter a quantity for at least one size of ${variant.color}.`);
        }
        return { variantId: variant.id, quantities: colorQuantities };
      });
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Check the entered quantities.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/from-article?organizationId=${encodeURIComponent(organizationId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: selectedArticle.value_id, entityId, buyerId, seasonId, deliveryDate, colors }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to create Article orders.");
      }
      const createdOrderNumbers = isRecord(payload) && Array.isArray(payload.orders)
        ? payload.orders.flatMap((order) => isRecord(order) && typeof order.orderNo === "string" ? [order.orderNo] : [])
        : [];
      onCreated(createdOrderNumbers);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create Article orders.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={isSubmitting ? () => undefined : onClose} ariaLabelledBy="article-order-dialog-title" size="xl" className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--erp-border)] pb-4">
        <div>
          <h2 id="article-order-dialog-title" className="text-lg font-semibold text-[var(--erp-text)]">Create Orders from Article</h2>
          <p className="mt-1 text-sm text-[var(--erp-text-muted)]">Each selected color creates a separate order with its own size quantities.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting} aria-label="Close Article order dialog">Close</Button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-[var(--erp-error-border)] bg-[var(--erp-error-bg)] px-3 py-2 text-sm text-[var(--erp-error-text)]">{error}</p>}
      {isLoading ? <p role="status" className="text-sm text-[var(--erp-text-muted)]">Loading active order masters...</p> : null}

      {!isLoading && lookups ? (
        <div className="space-y-5">
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Select
              label="Article"
              required
              value={selectedArticleId}
              onChange={(event) => handleArticleChange(event.target.value)}
              options={[
                { value: "", label: "Select Article" },
                ...lookups.articles.map((article) => ({ value: article.value_id, label: `${article.code ? `${article.code} · ` : ""}${article.label}` })),
              ]}
            />
            <Select
              label="Entity"
              required
              value={entityId}
              onChange={(event) => setEntityId(event.target.value)}
              options={[{ value: "", label: "Select Entity" }, ...lookups.entities.map((item) => ({ value: item.value_id, label: item.label }))]}
            />
            <Select
              label="Buyer"
              required
              value={buyerId}
              onChange={(event) => setBuyerId(event.target.value)}
              options={[{ value: "", label: "Select Buyer" }, ...lookups.buyers.map((item) => ({ value: item.value_id, label: item.label }))]}
            />
            <Select
              label="Season"
              required
              value={seasonId}
              onChange={(event) => setSeasonId(event.target.value)}
              options={[{ value: "", label: "Select Season" }, ...lookups.seasons.map((item) => ({ value: item.value_id, label: item.label }))]}
            />
            <Input label="Delivery Date" type="date" required value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
            <Input label="Brand (from Article Size Group)" value={brand} readOnly />
          </div>

          {selectedArticle ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <p><span className="font-semibold">Category:</span> {String(selectedArticle.fields.Category ?? "Not set")}</p>
                <p><span className="font-semibold">Subcategory:</span> {String(selectedArticle.fields.Subcategory ?? "Not set")}</p>
                <p><span className="font-semibold">Size Group:</span> {articleSizeGroup || "Not set"}</p>
              </div>
              {selectedArticle.variants.length === 0 || selectedArticle.sizes.length === 0 ? (
                <p className="rounded-lg border border-[var(--erp-warning-border)] bg-[var(--erp-warning-bg)] px-3 py-2 text-sm text-[var(--erp-warning-text)]">
                  Add active color variants and available sizes to this Article before creating an order.
                </p>
              ) : (
                <Table className="max-h-[45vh]" tableClassName="min-w-max">
                  <thead className="bg-[var(--erp-surface-soft)] text-xs font-semibold text-[var(--erp-text-muted)]">
                    <tr>
                      <th scope="col" className="sticky left-0 bg-[var(--erp-surface-soft)] p-3">Select</th>
                      <th scope="col" className="sticky left-16 bg-[var(--erp-surface-soft)] p-3">Color</th>
                      {selectedArticle.sizes.map((size) => <th key={size} scope="col" className="min-w-28 p-3 text-center">{size}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--erp-border)]">
                    {selectedArticle.variants.map((variant) => {
                      const checked = selectedVariantIds.includes(variant.id);
                      return (
                        <tr key={variant.id}>
                          <td className="sticky left-0 bg-[var(--erp-surface)] p-3">
                            <Checkbox aria-label={`Select ${variant.color}`} checked={checked} onChange={(event) => handleVariantChange(variant.id, event.target.checked)} />
                          </td>
                          <th scope="row" className="sticky left-16 bg-[var(--erp-surface)] p-3 text-left font-medium text-[var(--erp-text)]">{variant.color}</th>
                          {selectedArticle.sizes.map((size) => (
                            <td key={size} className="min-w-28 p-2">
                              <Input
                                aria-label={`${variant.color} ${size} quantity`}
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                placeholder="Qty"
                                disabled={!checked}
                                value={quantities[variant.id]?.[size] ?? ""}
                                onChange={(event) => handleQuantityChange(variant.id, size, event.target.value)}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--erp-border)] pt-4">
        <p className="text-xs text-[var(--erp-text-muted)]">{selectedVariants.length} color order{selectedVariants.length === 1 ? "" : "s"} will be created.</p>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="button" variant="primary" onClick={() => void handleSubmit()} disabled={isLoading || !lookups || isSubmitting}>
            {isSubmitting ? "Creating orders..." : "Create Color Orders"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
