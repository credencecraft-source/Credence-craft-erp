"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";

type ArticleOption = {
  id: string;
  value_id: string;
  label: string;
  parent_id: string | null;
  fields: Record<string, unknown>;
};
type ArticleVariant = {
  id?: string;
  color: string;
  variant_code: string;
  sku: string;
  price_override: string;
};
type ArticleSizePrice = { size: string; price: string | null };
type ArticleRecord = {
  value_id: string;
  code: string;
  label: string;
  fields: Record<string, unknown>;
};
type ArticleFormAction = (formData: FormData) => void | Promise<void>;
type ArticleTab = "general" | "colour" | "size";

const TABS: Array<{ id: string; panelId: string; value: ArticleTab; label: string }> = [
  { id: "article-general-tab", panelId: "article-general-panel", value: "general", label: "General" },
  { id: "article-colour-tab", panelId: "article-colour-panel", value: "colour", label: "Colour" },
  { id: "article-size-tab", panelId: "article-size-panel", value: "size", label: "Size" },
];

function normalizePrice(value: string) {
  const [integer, fraction = ""] = value.split(".");
  const whole = integer.replace(/^0+(?=\d)/, "");
  const decimal = fraction.replace(/0+$/, "");
  return decimal ? `${whole}.${decimal}` : whole;
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Saving..." : editing ? "Save changes" : "Create Article"}
    </Button>
  );
}

function asText(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

export default function ArticleRecordEditor({
  workspaceId,
  organizationId,
  record,
  lookupOptions,
  sizeGroupSizes,
  createAction,
  updateAction,
  error,
  saved,
}: {
  workspaceId: string;
  organizationId: string;
  record: ArticleRecord | null;
  lookupOptions: Record<string, ArticleOption[]>;
  sizeGroupSizes: Record<string, string[]>;
  createAction: ArticleFormAction;
  updateAction: ArticleFormAction;
  error?: string;
  saved?: string;
}) {
  const editing = record !== null;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ArticleTab>("general");
  const [fields, setFields] = useState(() => ({
    article: asText(record?.fields.article ?? record?.label),
    article_code: asText(record?.fields.article_code ?? record?.code),
    Brand: asText(record?.fields.Brand),
    Product_Master: asText(record?.fields.Product_Master),
    Category: asText(record?.fields.Category),
    Subcategory: asText(record?.fields.Subcategory),
    default_price: asText(record?.fields.default_price),
    Size_Group: asText(record?.fields.Size_Group),
    Sizes: Array.isArray(record?.fields.Sizes) ? record.fields.Sizes.map(String) : [],
    design_by: asText(record?.fields.design_by),
    designed_date: asText(record?.fields.designed_date).slice(0, 10),
  }));
  const [variants, setVariants] = useState<ArticleVariant[]>(() => (
    Array.isArray(record?.fields.variants)
      ? record.fields.variants.map((entry) => {
          const variant = entry as Record<string, unknown>;
          return {
            ...(typeof variant.id === "string" ? { id: variant.id } : {}),
            color: asText(variant.color),
            variant_code: asText(variant.variant_code),
            sku: asText(variant.sku),
            price_override: asText(variant.price_override),
          };
        })
      : []
  ));
  const [sizePrices, setSizePrices] = useState<Record<string, string>>(() => {
    const initial = Array.isArray(record?.fields.Size_Prices) ? record.fields.Size_Prices : [];
    return Object.fromEntries(initial.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const price = entry as Record<string, unknown>;
      return typeof price.size === "string"
        ? [[price.size.toLocaleLowerCase(), asText(price.price)]]
        : [];
    }));
  });

  const setField = (key: string, value: string | string[]) => {
    setFields((current) => ({ ...current, [key]: value }));
  };
  const sizeGroup = lookupOptions["size-group"]?.find((option) => option.label === fields.Size_Group);
  const availableSizes = sizeGroup ? sizeGroupSizes[sizeGroup.id] ?? [] : [];
  const categoryOptions = (lookupOptions.category ?? []).filter((option) =>
    !fields.Product_Master || asText(option.fields.Product_Master) === fields.Product_Master);
  const subcategoryOptions = (lookupOptions["sub-category"] ?? []).filter((option) =>
    !fields.Category || asText(option.fields.category) === fields.Category);
  const sizePriceRows: ArticleSizePrice[] = fields.Sizes.map((size) => ({
    size,
    price: sizePrices[size.toLocaleLowerCase()]?.trim() || null,
  }));
  const hasSizePrices = sizePriceRows.some((entry) => entry.price !== null);

  const setSizes = (selected: string[]) => {
    setField("Sizes", selected);
    const retainedPrices = Object.fromEntries(selected.flatMap((size) => {
      const price = sizePrices[size.toLocaleLowerCase()];
      return price ? [[size.toLocaleLowerCase(), price]] : [];
    }));
    setSizePrices(retainedPrices);
    const enteredPrices = selected.map((size) => retainedPrices[size.toLocaleLowerCase()] ?? "").filter(Boolean);
    if (enteredPrices.length > 0) {
      const normalized = enteredPrices.map(normalizePrice);
      setField("default_price", selected.length > 0
        && enteredPrices.length === selected.length
        && normalized.every((price) => price === normalized[0])
        ? enteredPrices[0]
        : "");
    }
  };

  const setSizePrice = (size: string, price: string) => {
    const nextPrices = { ...sizePrices, [size.toLocaleLowerCase()]: price };
    setSizePrices(nextPrices);
    const selectedPrices = fields.Sizes.map((selectedSize) => nextPrices[selectedSize.toLocaleLowerCase()]?.trim() ?? "");
    const enteredPrices = selectedPrices.filter(Boolean);
    const normalized = enteredPrices.map(normalizePrice);
    setField("default_price", selectedPrices.length > 0
      && enteredPrices.length > 0
      && selectedPrices.every(Boolean)
      && normalized.every((value) => value === normalized[0])
      ? enteredPrices[0]
      : "");
  };

  const articlePath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/article`;
  const formAction = editing ? updateAction : createAction;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <Button type="button" variant="ghost" onClick={() => router.push(articlePath)} className="w-fit px-0">
          Back to Articles
        </Button>
        <div>
          <p className="erp-eyebrow">Article master</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--erp-text)]">
            {editing ? `Edit ${record.label}` : "Create Article"}
          </h1>
          <p className="mt-1 text-sm text-[var(--erp-muted)]">
            Manage article details, color variants, and size-wise pricing in one page.
          </p>
        </div>
        {error ? <p role="alert" className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{error}</p> : null}
        {saved ? <p role="status" className="rounded-xl border border-[var(--erp-success)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-success)]">Article saved successfully.</p> : null}

        <form action={formAction}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="moduleKey" value="article" />
          <input type="hidden" name="returnToArticleDetail" value="true" />
          {editing ? <input type="hidden" name="valueId" value={record.value_id} /> : null}
          <input type="hidden" name="field_variants" value={JSON.stringify(variants)} />
          <input type="hidden" name="articleSizePrices" value={JSON.stringify(sizePriceRows)} />
          <input type="hidden" name="field_Sizes" value="" />

          <Card className="space-y-6 p-6">
            <Tabs tabs={TABS} value={activeTab} onChange={setActiveTab} ariaLabel="Article details" />

            <div id="article-general-panel" role="tabpanel" aria-labelledby="article-general-tab" hidden={activeTab !== "general"} className={activeTab === "general" ? "grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2" : "hidden"}>
              <Input
                label="Article Name"
                name="field_article"
                required
                value={fields.article}
                onChange={(event) => setField("article", event.target.value)}
              />
              {editing ? (
                <>
                  <Input label="Article Code" name="field_article_code" value={fields.article_code} readOnly />
                  <input type="hidden" name="code" value={fields.article_code} />
                </>
              ) : null}
              <Select
                label="Brand"
                name="field_Brand"
                required
                value={fields.Brand}
                onChange={(event) => setField("Brand", event.target.value)}
                options={[
                  { value: "", label: "Select Brand" },
                  ...(lookupOptions.brand ?? []).map(({ label }) => ({ value: label, label })),
                ]}
              />
              <Select
                label="Finished Goods Type"
                name="field_Product_Master"
                value={fields.Product_Master}
                onChange={(event) => {
                  setField("Product_Master", event.target.value);
                  setField("Category", "");
                  setField("Subcategory", "");
                }}
                options={[
                  { value: "", label: "Select Finished Goods Type" },
                  ...(lookupOptions["product-master"] ?? []).map(({ label }) => ({ value: label, label })),
                ]}
              />
              <Select
                label="Finished Goods Category"
                name="field_Category"
                value={fields.Category}
                onChange={(event) => {
                  setField("Category", event.target.value);
                  setField("Subcategory", "");
                }}
                options={[
                  { value: "", label: "Select Category" },
                  ...categoryOptions.map(({ label }) => ({ value: label, label })),
                ]}
              />
              <Select
                label="Finished Goods Subcategory"
                name="field_Subcategory"
                value={fields.Subcategory}
                onChange={(event) => setField("Subcategory", event.target.value)}
                options={[
                  { value: "", label: "Select Subcategory" },
                  ...subcategoryOptions.map(({ label }) => ({ value: label, label })),
                ]}
              />
              <Input
                label="Design By"
                name="field_design_by"
                value={fields.design_by}
                onChange={(event) => setField("design_by", event.target.value)}
              />
              <Input
                label="Designed Date"
                name="field_designed_date"
                type="date"
                value={fields.designed_date}
                onChange={(event) => setField("designed_date", event.target.value)}
              />
            </div>

            <div id="article-colour-panel" role="tabpanel" aria-labelledby="article-colour-tab" hidden={activeTab !== "colour"} className={activeTab === "colour" ? "space-y-4" : "hidden"}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[var(--erp-text)]">Color variants</h2>
                  <p className="mt-1 text-sm text-[var(--erp-muted)]">Assign a color, SKU, and optional price override.</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setVariants((current) => [...current, {
                    color: "",
                    variant_code: "",
                    sku: "",
                    price_override: "",
                  }])}
                >
                  Add color
                </Button>
              </div>
              {variants.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--erp-border)] p-6 text-center text-sm text-[var(--erp-muted)]">
                  No color variants added yet.
                </p>
              ) : variants.map((variant, index) => (
                <div key={variant.id ?? `variant-${index}`} className="grid min-w-0 gap-4 rounded-xl border border-[var(--erp-border)] p-4 md:grid-cols-2 xl:grid-cols-4">
                  <Select
                    label="Color"
                    required
                    value={variant.color}
                    onChange={(event) => setVariants((current) => current.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, color: event.target.value } : row))}
                    options={[
                      { value: "", label: "Select Color" },
                      ...(lookupOptions.color ?? []).map(({ label }) => ({ value: label, label })),
                    ]}
                  />
                  <Input label="Variant Code" value={variant.variant_code} onChange={(event) => setVariants((current) => current.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, variant_code: event.target.value } : row))} />
                  <Input label="SKU" value={variant.sku} onChange={(event) => setVariants((current) => current.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, sku: event.target.value } : row))} />
                  <Input label="Price Override" type="number" step="0.0001" min="0" value={variant.price_override} onChange={(event) => setVariants((current) => current.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, price_override: event.target.value } : row))} />
                  <div className="md:col-span-2 xl:col-span-4">
                    <Button type="button" variant="destructive" size="sm" onClick={() => {
                      if (window.confirm("Remove this color variant?")) {
                        setVariants((current) => current.filter((_, rowIndex) => rowIndex !== index));
                      }
                    }}>
                      Remove color
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div id="article-size-panel" role="tabpanel" aria-labelledby="article-size-tab" hidden={activeTab !== "size"} className={activeTab === "size" ? "space-y-5" : "hidden"}>
              <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                <Select
                  label="Size Group"
                  name="field_Size_Group"
                  value={fields.Size_Group}
                  onChange={(event) => {
                    setField("Size_Group", event.target.value);
                    const nextGroup = lookupOptions["size-group"]?.find((option) => option.label === event.target.value);
                    const nextSizes = new Set(nextGroup ? sizeGroupSizes[nextGroup.id] ?? [] : []);
                    setSizes(fields.Sizes.filter((size) => nextSizes.has(size)));
                  }}
                  options={[
                    { value: "", label: "Select Size Group" },
                    ...(lookupOptions["size-group"] ?? []).map(({ label }) => ({ value: label, label })),
                  ]}
                />
                <Input
                  label="Default Price"
                  name="field_default_price"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={fields.default_price}
                  readOnly={hasSizePrices}
                  hint={hasSizePrices ? "Calculated from size-wise prices." : undefined}
                  onChange={(event) => setField("default_price", event.target.value)}
                />
              </div>
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-[var(--erp-text)]">Available sizes</h2>
                {availableSizes.length ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                    {availableSizes.map((size) => (
                      <Checkbox
                        key={size}
                        label={size}
                        name="field_Sizes"
                        value={size}
                        checked={fields.Sizes.includes(size)}
                        onChange={(event) => setSizes(event.target.checked
                          ? [...fields.Sizes, size]
                          : fields.Sizes.filter((selected) => selected !== size))}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--erp-muted)]">Choose a Size Group to select available sizes.</p>
                )}
              </div>
              {fields.Sizes.length > 0 ? (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-[var(--erp-text)]">Size-wise prices</h2>
                  <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {fields.Sizes.map((size) => (
                      <Input
                        key={size}
                        label={`${size} price`}
                        type="number"
                        step="0.0001"
                        min="0"
                        value={sizePrices[size.toLocaleLowerCase()] ?? ""}
                        onChange={(event) => setSizePrice(size, event.target.value)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--erp-border)] pt-4">
              <Button type="button" variant="secondary" onClick={() => router.push(articlePath)}>Cancel</Button>
              <SubmitButton editing={editing} />
            </div>
          </Card>
        </form>
      </Section>
    </Page>
  );
}
