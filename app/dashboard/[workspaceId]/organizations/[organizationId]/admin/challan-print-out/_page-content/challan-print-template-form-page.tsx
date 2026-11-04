"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import Textarea from "@/components/ui/Textarea";
import ChallanPrintTemplatePreview from "./challan-print-template-preview";
import {
  DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
  type OrganizationPrintTemplateDesign,
} from "@/lib/services/distribution/organization-print-template-contract";

type DocumentType = "SALES_ORDER" | "QUOTATION";
type EditorSection = "PAGE" | "HEADER" | "PARTIES" | "TABLE" | "FOOTER" | "MARGIN";
type PrintTemplate = {
  id: string;
  documentType: DocumentType;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  designConfig: OrganizationPrintTemplateDesign;
};

const documentOptions = [
  { label: "Sales Order", value: "SALES_ORDER" },
  { label: "Quotation", value: "QUOTATION" },
];

const headerFields = [
  { key: "companyLogo", label: "Company logo" },
  { key: "companyName", label: "Company name and GST details" },
  { key: "documentNumber", label: "Sales Order / Quotation number" },
  { key: "documentDate", label: "Document date" },
  { key: "status", label: "Document status" },
] as const;

const partyFields = [
  { key: "billTo", label: "Bill To address" },
  { key: "shipTo", label: "Ship To address" },
] as const;

const itemFields = [
  { key: "description", label: "Item / Description" },
  { key: "booking", label: "Booking number" },
  { key: "order", label: "Order number" },
  { key: "sizeBreakdown", label: "Size breakdown" },
  { key: "quantity", label: "Quantity" },
  { key: "unitPrice", label: "Unit price" },
  { key: "beforeTax", label: "Before tax" },
  { key: "tax", label: "Tax" },
  { key: "amount", label: "Line amount" },
] as const;

const summaryFields = [
  { key: "totalQuantity", label: "Total quantity" },
  { key: "beforeTax", label: "Before tax" },
  { key: "deliveryCharge", label: "Delivery charge" },
  { key: "cgst", label: "CGST" },
  { key: "sgst", label: "SGST" },
  { key: "igst", label: "IGST" },
  { key: "vatSalesTax", label: "VAT / Sales tax" },
  { key: "totalTax", label: "Total tax" },
  { key: "grandTotal", label: "Grand total" },
  { key: "linkedQuotations", label: "Linked quotations (Sales Order)" },
] as const;

const editorSections = [
  { value: "PAGE", label: "PAGE" },
  { value: "HEADER", label: "HEADER" },
  { value: "PARTIES", label: "BILL TO & SHIP TO" },
  { value: "TABLE", label: "TABLE" },
  { value: "FOOTER", label: "FOOTER" },
  { value: "MARGIN", label: "MARGIN" },
] as const;

export default function ChallanPrintTemplateFormPage({
  workspaceId,
  organizationId,
  initialDocumentType,
  template,
}: {
  workspaceId: string;
  organizationId: string;
  initialDocumentType: DocumentType;
  template?: PrintTemplate;
}) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [documentType, setDocumentType] = useState<DocumentType>(
    template?.documentType ?? initialDocumentType,
  );
  const [design, setDesign] = useState<OrganizationPrintTemplateDesign>(
    template?.designConfig ?? DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
  );
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<EditorSection>("PAGE");

  const organizationPath = `/dashboard/${workspaceId}/organizations/${organizationId}`;
  const reportPath = `${organizationPath}/admin/challan-print-out`;
  const detailPath = template
    ? `${reportPath}/${encodeURIComponent(template.id)}`
    : reportPath;
  const updateDesign = <K extends keyof OrganizationPrintTemplateDesign>(
    key: K,
    value: OrganizationPrintTemplateDesign[K],
  ) => setDesign((current) => ({ ...current, [key]: value }));
  const updateSectionFields = (
    section: "headerFields" | "itemFields" | "summaryFields",
    key: string,
    checked: boolean,
  ) => setDesign((current) => ({
    ...current,
    sections: {
      ...current.sections,
      [section]: checked
        ? [...current.sections[section], key]
        : current.sections[section].filter((field) => field !== key),
    },
  }));
  const handleLogoFile = (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 250 * 1024) {
      setError("Choose a PNG or JPEG logo no larger than 250 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setError("Unable to read the selected logo image.");
        return;
      }
      updateDesign("logoDataUrl", reader.result);
      setError("");
    };
    reader.onerror = () => setError("Unable to read the selected logo image.");
    reader.readAsDataURL(file);
  };
  const updateMargin = (key: keyof OrganizationPrintTemplateDesign["margins"], value: string) => {
    const parsed = Number(value);
    setDesign((current) => ({
      ...current,
      margins: { ...current.margins, [key]: Number.isFinite(parsed) ? parsed : 4 },
    }));
  };

  async function saveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId, workspaceId });
      const response = await fetch(
        template
          ? `/api/organizations/print-templates/${encodeURIComponent(template.id)}?${query}`
          : `/api/organizations/print-templates?${query}`,
        {
          method: template ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            documentType,
            designConfig: design,
            isActive,
            isDefault: isActive && isDefault,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to save the print template.");

      if (template) {
        router.push(detailPath);
      } else {
        router.push(`${reportPath}?documentType=${documentType}&saved=${encodeURIComponent(name.trim().toUpperCase())}`);
      }
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the print template.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="min-w-0 space-y-4 p-3 md:p-4">
      <Tabs
        tabs={editorSections}
        value={activeSection}
        onChange={setActiveSection}
        ariaLabel="Print template editor section"
        compact
        scrollable
      />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--erp-text)]">
            {template ? "Edit Print Template" : "Create Print Template"}
          </h1>
          <p className="mt-1 text-sm text-[var(--erp-muted)]">
            Choose a section to configure and review the matching print preview as you edit.
          </p>
        </div>
        {isDefault ? <Badge>Default format</Badge> : null}
      </header>

      <form
        className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]"
        onSubmit={(event) => void saveTemplate(event)}
      >
        {error ? (
          <p className="rounded-lg border border-[var(--erp-danger)] p-3 text-sm text-[var(--erp-danger)] lg:col-span-2" role="alert">
            {error}
          </p>
        ) : null}

        <div className="min-w-0 space-y-3">
          {activeSection === "PAGE" ? (
          <Card className="space-y-4">
            <h2 className="text-base font-semibold text-[var(--erp-text)]">Page setup</h2>
            <Input
              label="Template name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              required
              minLength={2}
              maxLength={100}
              placeholder="STANDARD SALES ORDER"
            />
            <Select
              label="Document type"
              value={documentType}
              options={documentOptions}
              disabled={Boolean(template)}
              onChange={(event) => setDocumentType(event.currentTarget.value as DocumentType)}
              hint={template ? "Document type is fixed after a template is created." : "Choose Sales Order or Quotation."}
            />
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Select
                label="Paper size"
                value={design.pageSize}
                options={[{ label: "A4", value: "A4" }, { label: "Letter", value: "LETTER" }]}
                onChange={(event) => updateDesign("pageSize", event.currentTarget.value as "A4" | "LETTER")}
              />
              <Select
                label="Orientation"
                value={design.orientation}
                options={[{ label: "Portrait", value: "PORTRAIT" }, { label: "Landscape", value: "LANDSCAPE" }]}
                onChange={(event) => updateDesign("orientation", event.currentTarget.value as "PORTRAIT" | "LANDSCAPE")}
              />
              <Select
                label="Font family"
                value={design.fontFamily}
                options={[
                  { label: "Helvetica", value: "helvetica" },
                  { label: "Times", value: "times" },
                  { label: "Courier", value: "courier" },
                ]}
                onChange={(event) => updateDesign("fontFamily", event.currentTarget.value as OrganizationPrintTemplateDesign["fontFamily"])}
              />
              <Input label="Body size (pt)" type="number" min={6} max={14} value={design.bodyFontSize} onChange={(event) => updateDesign("bodyFontSize", Number(event.currentTarget.value))} />
              <Input label="Heading size (pt)" type="number" min={10} max={28} value={design.headingFontSize} onChange={(event) => updateDesign("headingFontSize", Number(event.currentTarget.value))} />
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Input label="Text color" type="color" value={design.textColor} onChange={(event) => updateDesign("textColor", event.currentTarget.value)} />
              <Input label="Heading/accent color" type="color" value={design.accentColor} onChange={(event) => updateDesign("accentColor", event.currentTarget.value)} />
            </div>
          </Card>
          ) : null}

          {activeSection === "HEADER" ? (
          <Card className="space-y-4">
            <h2 className="text-base font-semibold text-[var(--erp-text)]">1. Header</h2>
            <Input
              label="Company logo (PNG/JPEG, up to 250 KB)"
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => handleLogoFile(event.currentTarget.files?.[0])}
            />
            {design.logoDataUrl ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={design.logoDataUrl} alt="Selected company logo" className="h-12 max-w-32 object-contain" />
                <Button type="button" variant="secondary" size="sm" onClick={() => updateDesign("logoDataUrl", "")}>
                  Remove logo
                </Button>
              </div>
            ) : null}
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {headerFields.map(({ key, label }) => (
                <Input
                  key={key}
                  type="checkbox"
                  label={label}
                  checked={design.sections.headerFields.includes(key)}
                  disabled={key === "companyLogo" && !design.logoDataUrl}
                  onChange={(event) => updateSectionFields("headerFields", key, event.currentTarget.checked)}
                />
              ))}
            </div>
            <Textarea
              label="Additional header text"
              value={design.headerText}
              onChange={(event) => updateDesign("headerText", event.currentTarget.value)}
              maxLength={500}
              rows={2}
              hint="Optional line printed below the document header."
            />
          </Card>
          ) : null}

          {activeSection === "PARTIES" ? (
            <Card className="space-y-4">
              <h2 className="text-base font-semibold text-[var(--erp-text)]">Bill To and Ship To</h2>
              <p className="text-sm text-[var(--erp-muted)]">
                Choose which customer address blocks appear on the printed document.
              </p>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                {partyFields.map(({ key, label }) => (
                  <Input
                    key={key}
                    type="checkbox"
                    label={label}
                    checked={design.sections.headerFields.includes(key)}
                    onChange={(event) => updateSectionFields("headerFields", key, event.currentTarget.checked)}
                  />
                ))}
              </div>
            </Card>
          ) : null}

          {activeSection === "TABLE" ? (
          <Card className="space-y-4">
            <h2 className="text-base font-semibold text-[var(--erp-text)]">2. Item table</h2>
            <p className="text-sm text-[var(--erp-muted)]">Choose which item columns appear in the generated PDF.</p>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {itemFields.map(({ key, label }) => (
                <Input
                  key={key}
                  type="checkbox"
                  label={label}
                  checked={design.sections.itemFields.includes(key)}
                  disabled={design.sections.itemFields.includes(key) && design.sections.itemFields.length === 1}
                  onChange={(event) => updateSectionFields("itemFields", key, event.currentTarget.checked)}
                />
              ))}
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Input label="Table header color" type="color" value={design.tableHeaderColor} onChange={(event) => updateDesign("tableHeaderColor", event.currentTarget.value)} />
              <Input label="Table header text color" type="color" value={design.tableHeaderTextColor} onChange={(event) => updateDesign("tableHeaderTextColor", event.currentTarget.value)} />
            </div>
          </Card>
          ) : null}

          {activeSection === "FOOTER" ? (
            <>
          <Card className="space-y-4">
            <h2 className="text-base font-semibold text-[var(--erp-text)]">Totals and tax summary</h2>
            <p className="text-sm text-[var(--erp-muted)]">
              Choose which quantity, GST/tax, charges, and grand-total rows appear below the item table.
            </p>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {summaryFields
                .filter(({ key }) => key !== "linkedQuotations" || documentType === "SALES_ORDER")
                .map(({ key, label }) => (
                <Input
                  key={key}
                  type="checkbox"
                  label={label}
                  checked={design.sections.summaryFields.includes(key)}
                  onChange={(event) => updateSectionFields("summaryFields", key, event.currentTarget.checked)}
                />
              ))}
            </div>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-base font-semibold text-[var(--erp-text)]">Footer content</h2>
            <Input
              type="checkbox"
              label="Include payment terms"
              checked={design.sections.showPaymentTerms}
              onChange={(event) => setDesign((current) => ({
                ...current,
                sections: { ...current.sections, showPaymentTerms: event.currentTarget.checked },
              }))}
            />
            {design.sections.showPaymentTerms ? (
              <Textarea
                label="Payment terms"
                value={design.sections.paymentTermsText}
                onChange={(event) => setDesign((current) => ({
                  ...current,
                  sections: { ...current.sections, paymentTermsText: event.currentTarget.value },
                }))}
                maxLength={500}
                rows={2}
                hint="Printed with this template on every document."
              />
            ) : null}
            <Input
              type="checkbox"
              label="Include document special notes"
              checked={design.sections.showSpecialNotes}
              onChange={(event) => setDesign((current) => ({
                ...current,
                sections: { ...current.sections, showSpecialNotes: event.currentTarget.checked },
              }))}
            />
            <Textarea
              label="Additional footer note"
              value={design.footerText}
              onChange={(event) => updateDesign("footerText", event.currentTarget.value)}
              maxLength={500}
              rows={2}
              hint="Optional static note printed at the bottom of the document."
            />
            <Input
              type="checkbox"
              label="Show page numbers"
              checked={design.showPageNumbers}
              onChange={(event) => updateDesign("showPageNumbers", event.currentTarget.checked)}
            />
            <p className="text-sm text-[var(--erp-muted)]">
              These settings control the content printed after the totals.
            </p>
          </Card>

            </>
          ) : null}

          {activeSection === "MARGIN" ? (
            <Card className="space-y-4">
              <h2 className="text-base font-semibold text-[var(--erp-text)]">Page margins</h2>
              <p className="text-sm text-[var(--erp-muted)]">
                Set the printable content area in millimeters. The preview updates immediately.
              </p>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                {(["top", "right", "bottom", "left"] as const).map((side) => (
                  <Input
                    key={side}
                    label={`${side} margin (mm)`}
                    type="number"
                    min={4}
                    max={40}
                    value={design.margins[side]}
                    onChange={(event) => updateMargin(side, event.currentTarget.value)}
                  />
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--erp-text)]">Template settings</h2>
            <Input
              type="checkbox"
              label="Active and available for this document"
              checked={isActive}
              onChange={(event) => {
                setIsActive(event.currentTarget.checked);
                if (!event.currentTarget.checked) setIsDefault(false);
              }}
            />
            <Input
              type="checkbox"
              label="Make this the default print/PDF format"
              checked={isDefault}
              disabled={!isActive}
              onChange={(event) => setIsDefault(event.currentTarget.checked)}
            />
          </Card>

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => router.push(detailPath)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : template ? "Save Changes" : "Save Template"}
            </Button>
          </div>
        </div>

        <ChallanPrintTemplatePreview documentType={documentType} name={name} design={design} />
      </form>
    </section>
  );
}
