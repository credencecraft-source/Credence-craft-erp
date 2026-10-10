"use client";

import { useRef, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import type { OrganizationKycProfile } from "@prisma/client";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import {
  ORGANIZATION_KYC_BUSINESS_ROLES,
  ORGANIZATION_KYC_CHALLENGES,
  ORGANIZATION_KYC_FINANCE_SOFTWARE,
  ORGANIZATION_KYC_MARKET_COVERAGE,
  ORGANIZATION_KYC_MSME_STATUSES,
  ORGANIZATION_KYC_PRODUCTS,
  ORGANIZATION_KYC_YES_NO,
  ORGANIZATION_KYC_WHITE_LABEL_WORK_TYPES,
  readOrganizationKycDetails,
} from "@/lib/services/organizations/organization-kyc-types";

type OrganizationKycAction = (
  formData: FormData,
) => Promise<{ error: string | null }>;

type OrganizationKycResetAction = () => Promise<{ error: string | null }>;

type OrganizationKycFormProps = {
  initialProfile: OrganizationKycProfile | null;
  progressStorageKey: string;
  saveDraftAction: OrganizationKycAction;
  submitAction: OrganizationKycAction;
  resetDraftAction: OrganizationKycResetAction;
  registrationSnapshot: {
    gst_number: string;
    name: string;
    address: string;
    createdAt: string;
  };
};

const STEPS = [
  { title: "Company", description: "Registration profile" },
  { title: "Founder & team", description: "Leadership and workforce" },
  { title: "Business", description: "Products and operations" },
  { title: "Business role", description: "Brand, factory, or trading business" },
  { title: "Brands", description: "Your brand or customer brands" },
  { title: "Markets & work", description: "Export reach and white-label work" },
  { title: "Migration", description: "Current software and team responsibilities" },
  { title: "Financials", description: "Turnover, MSME and priorities" },
] as const;

const BUSINESS_ROLE_PRESENTATION = {
  BRAND_OWNER_OUTSOURCED: {
    label: "I am a brand owner, but I don't have a factory",
    description: "I get my brand's products made in another factory.",
  },
  WHITE_LABEL_PRODUCER: {
    label: "I don't have a brand; I produce for other brands",
    description: "I manufacture products for brands owned by other businesses.",
  },
  BRAND_OWNER: {
    label: "I have my own brand",
    description: "I own the brand and product identity.",
  },
  FACTORY_OWNER: {
    label: "I have my own factory",
    description: "I own or operate a manufacturing facility.",
  },
  BRAND_AND_FACTORY_OWNER: {
    label: "I have my own brand and factory",
    description: "I produce in my factory and can also use other factories.",
  },
  DISTRIBUTION_WHOLESALE_RETAIL: {
    label: "I don't own a factory or brand",
    description: "I run an advance booking, wholesale, or retail business.",
  },
} satisfies Record<
  (typeof ORGANIZATION_KYC_BUSINESS_ROLES)[number],
  { label: string; description: string }
>;

function statusLabel(status: string | undefined) {
  if (!status) return "Not started";
  return status.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function detailLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function formatRupees(value: number | null) {
  return value === null ? "" : String(value);
}

function toBrandNameValues(value: string | null) {
  const names = value?.split(/\r?\n/).map((name) => name.trim()).filter(Boolean) ?? [];
  return names.length > 0 ? names : [""];
}

function brandModelForBusinessRole(role: string) {
  if (role === "BRAND_OWNER_OUTSOURCED" || role === "BRAND_OWNER") return "OWN_BRAND";
  if (role === "WHITE_LABEL_PRODUCER" || role === "FACTORY_OWNER") return "WHITE_LABEL";
  if (role === "BRAND_AND_FACTORY_OWNER") return "BOTH";
  return "";
}

function validateKycStep(formData: FormData, step: number) {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const allFilled = (...names: string[]) => names.every((name) => text(name) !== "");
  const wholeNumberFilled = (name: string) => /^\d+$/.test(text(name));

  switch (step) {
    case 0: {
      const year = Number(text("businessStartedYear"));
      return Number.isSafeInteger(year) && year >= 1800 && year <= new Date().getFullYear()
        ? null
        : "Enter a valid year the business started before continuing.";
    }
    case 1:
      return allFilled("founderName", "founderDesignation")
        && wholeNumberFilled("teamMemberCount")
        && wholeNumberFilled("staffCount")
        && wholeNumberFilled("topManagementCount")
        ? null
        : "Complete the founder details, team size, worker count, and top management count before continuing.";
    case 2: {
      const products = formData.getAll("products");
      return products.length > 0 && (!products.includes("Other") || text("otherProduct"))
        ? null
        : products.length === 0
          ? "Select at least one product before continuing."
          : "Describe the other product before continuing.";
    }
    case 3:
      return text("businessRole")
        ? null
        : "Choose the option that best describes your business before continuing.";
    case 4: {
      const role = text("businessRole");
      const ownBrandRequired = ["BRAND_OWNER_OUTSOURCED", "BRAND_OWNER", "BRAND_AND_FACTORY_OWNER"].includes(role);
      const customerBrandsRequired = [
        "WHITE_LABEL_PRODUCER",
        "FACTORY_OWNER",
        "BRAND_AND_FACTORY_OWNER",
        "DISTRIBUTION_WHOLESALE_RETAIL",
      ].includes(role);
      if (ownBrandRequired && !formData.getAll("ownBrandNames").some((value) => typeof value === "string" && value.trim())) {
        return "Enter at least one of your brand names before continuing.";
      }
      if (customerBrandsRequired && !formData.getAll("whiteLabelBrands").some((value) => typeof value === "string" && value.trim())) {
        return role === "DISTRIBUTION_WHOLESALE_RETAIL"
          ? "Enter at least one customer brand before continuing."
          : "Enter at least one customer brand you work with before continuing.";
      }
      return null;
    }
    case 5: {
      if (!text("marketCoverage")) return "Choose which markets you serve before continuing.";
      const role = text("businessRole");
      const brandModel = text("brandModel");
      const doesWhiteLabelWork = [
        "WHITE_LABEL_PRODUCER",
        "FACTORY_OWNER",
        "BRAND_AND_FACTORY_OWNER",
      ].includes(role) || brandModel === "WHITE_LABEL" || brandModel === "BOTH";
      return doesWhiteLabelWork && formData.getAll("whiteLabelWorkTypes").length === 0
        ? "Choose FOB, Job Work, or Both before continuing."
        : null;
    }
    case 6: {
      if (!text("usesSoftware")) return "Choose whether you currently use software.";
      if (text("usesSoftware") === "YES" && !text("softwareUsed")) {
        return "Enter the name of the software you currently use.";
      }
      const financeSoftware = formData.getAll("financeSoftware");
      if (financeSoftware.length === 0) return "Choose a finance software integration.";
      if (financeSoftware.includes("OTHER") && !text("financeSoftwareOther")) {
        return "Enter the name of the other finance software.";
      }
      return allFilled(
        "hasMerchandisers",
        "hasDedicatedStoreIncharge",
        "hasProductionManager",
        "hasSeparateDispatchAccounts",
      ) ? null : "Answer all team responsibility questions before continuing.";
    }
    case 7: {
      if (!wholeNumberFilled("lastYearTurnover")) return "Enter last financial year's turnover, or enter 0.";
      if (!text("msmeStatus")) return "Choose your MSME registration status.";
      const challenges = formData.getAll("majorChallenges");
      if (challenges.length === 0) return "Choose at least one business challenge.";
      if (challenges.length > 3) return "Choose no more than three business challenges.";
      return challenges.includes("Other") && !text("majorChallengeOther")
        ? "Describe the other business challenge."
        : null;
    }
    default:
      return "Complete this step before continuing.";
  }
}

function BrandNameFields({
  label,
  name,
  values,
  onChange,
  maxEntries,
  disabled,
}: {
  label: string;
  name: string;
  values: string[];
  onChange: (values: string[]) => void;
  maxEntries: number;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="text-sm font-semibold text-[var(--erp-text)]">{label}</legend>
      <div className="space-y-3">
        {values.map((value, index) => (
          <div key={`${name}-${index}`} className="flex items-end gap-2">
            <Input
              label={`Brand name ${index + 1}`}
              name={name}
              value={value}
              onChange={(event) => onChange(values.map((current, currentIndex) =>
                currentIndex === index ? event.currentTarget.value : current,
              ))}
              placeholder="Enter a brand name"
              className="px-4 py-3 text-base"
            />
            {values.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove brand name ${index + 1}`}
                onClick={() => onChange(values.filter((_, currentIndex) => currentIndex !== index))}
              >
                Remove
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      <p className="text-xs text-[var(--erp-muted)]">Enter one name per field. You can add multiple names.</p>
      {values.length < maxEntries ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...values, ""])}
        >
          Add another brand
        </Button>
      ) : null}
    </fieldset>
  );
}

export default function OrganizationKycForm({
  initialProfile,
  progressStorageKey,
  saveDraftAction,
  submitAction,
  resetDraftAction,
  registrationSnapshot,
}: OrganizationKycFormProps) {
  const [open, setOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const details = readOrganizationKycDetails(initialProfile?.kyc_details);
  const legacyActivities = initialProfile?.business_activities ?? [];
  const [businessRole, setBusinessRole] = useState(details.businessRole ?? "");
  const [brandModel, setBrandModel] = useState(
    details.brandModel
      ?? (legacyActivities.includes("Own brands") && legacyActivities.includes("Manufacture for other brands")
        ? "BOTH"
        : legacyActivities.includes("Own brands")
          ? "OWN_BRAND"
          : legacyActivities.includes("Manufacture for other brands")
            ? "WHITE_LABEL"
            : brandModelForBusinessRole(details.businessRole ?? "")),
  );
  const [businessChannel, setBusinessChannel] = useState(
    details.businessChannel
      ?? (details.businessRole === "DISTRIBUTION_WHOLESALE_RETAIL" ? "DISTRIBUTION" : "MANUFACTURING"),
  );
  const [selectedProducts, setSelectedProducts] = useState(details.products);
  const [otherProduct, setOtherProduct] = useState(details.otherProduct ?? "");
  const [ownBrandNames, setOwnBrandNames] = useState(() => toBrandNameValues(details.ownBrandNames));
  const [whiteLabelBrands, setWhiteLabelBrands] = useState(() =>
    toBrandNameValues(details.whiteLabelBrands ?? initialProfile?.brands_worked_with ?? null),
  );
  const [marketCoverage, setMarketCoverage] = useState(details.marketCoverage ?? "");
  const [whiteLabelWorkTypes, setWhiteLabelWorkTypes] = useState(details.whiteLabelWorkTypes);
  const [usesSoftware, setUsesSoftware] = useState(
    details.usesSoftware
      ?? (initialProfile?.software_used
        ? initialProfile.software_used === "None" ? "NO" : "YES"
        : details.softwareModules.length > 0 && !details.softwareModules.includes("None") ? "YES" : ""),
  );
  const [financeSoftware, setFinanceSoftware] = useState(details.financeSoftware);
  const [financeSoftwareOther, setFinanceSoftwareOther] = useState(details.financeSoftwareOther ?? "");
  const locked = initialProfile?.status === "SUBMITTED" || initialProfile?.status === "APPROVED";

  function persistResumeStep(resumeStep: number) {
    try {
      window.localStorage.setItem(progressStorageKey, String(resumeStep));
    } catch {
      setError("Your draft was saved, but this browser could not remember where to resume. Check your browser storage settings.");
    }
  }

  function runAction(action: OrganizationKycAction, submitting: boolean) {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (!submitting) {
          const currentStepIsComplete = validateKycStep(formData, step) === null;
          const resumeStep = currentStepIsComplete && step < STEPS.length - 1 ? step + 1 : step;
          persistResumeStep(resumeStep);
        }
        setSuccess(submitting ? "KYC details submitted for platform review." : "KYC draft saved.");
      } catch {
        setError("Unable to save KYC details. Please retry, and contact support if this continues.");
      }
    });
  }

  function saveStepAndContinue() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    const stepError = validateKycStep(formData, step);
    setError(stepError);
    setSuccess(null);
    if (stepError) return;

    startTransition(async () => {
      try {
        const result = await saveDraftAction(formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        const nextStep = step + 1;
        setStep(nextStep);
        persistResumeStep(nextStep);
      } catch {
        setError("Unable to save this step. Please retry before continuing.");
      }
    });
  }

  function confirmReset() {
    setResetError(null);
    startTransition(async () => {
      try {
        const result = await resetDraftAction();
        if (result.error) {
          setResetError(result.error);
          return;
        }
        window.localStorage.removeItem(progressStorageKey);
        window.location.reload();
      } catch {
        setResetError("Unable to clear the KYC draft. Please retry, and contact support if this continues.");
      }
    });
  }

  const inputDisabled = locked || pending;
  const status = initialProfile?.status;
  const isDistributionWholesaleRetail = businessRole === "DISTRIBUTION_WHOLESALE_RETAIL";
  const hasOwnBrand = businessRole
    ? ["BRAND_OWNER_OUTSOURCED", "BRAND_OWNER", "BRAND_AND_FACTORY_OWNER"].includes(businessRole)
    : brandModel === "OWN_BRAND" || brandModel === "BOTH";
  const hasWhiteLabel = businessRole
    ? ["WHITE_LABEL_PRODUCER", "FACTORY_OWNER", "BRAND_AND_FACTORY_OWNER"].includes(businessRole)
    : brandModel === "WHITE_LABEL" || brandModel === "BOTH";
  const hasCustomerBrands = hasWhiteLabel || isDistributionWholesaleRetail;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{statusLabel(status)}</Badge>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? "organization-kyc-title" : undefined}
          onClick={() => {
            setError(null);
            setSuccess(null);
            try {
              const savedStep = window.localStorage.getItem(progressStorageKey);
              if (savedStep !== null && /^\d+$/.test(savedStep)) {
                const parsedStep = Number(savedStep);
                if (parsedStep >= 0 && parsedStep < STEPS.length) {
                  setStep(parsedStep);
                }
              }
            } catch {
              setError("Your saved step could not be restored from browser storage.");
            }
            setOpen(true);
          }}
        >
          {status === "SUBMITTED" || status === "APPROVED" ? "View KYC" : status ? "Edit KYC" : "Start KYC"}
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabelledBy="organization-kyc-title"
        size="xl"
        className="max-w-7xl p-0"
      >
        <form ref={formRef} onSubmit={(event) => event.preventDefault()} className="min-w-0">
          <header className="space-y-5 bg-[var(--erp-brand-hover)] px-6 py-6 text-white sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">Organization verification</p>
                <h2 id="organization-kyc-title" className="mt-1 text-2xl font-bold tracking-tight">KYC profile</h2>
                <p className="mt-2 text-sm text-white/80">
                  Step {step + 1} of {STEPS.length}: {STEPS[step].description}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge>{statusLabel(status)}</Badge>
                {!locked ? (
                  <Button
                    type="button"
                    size="md"
                    variant="destructive"
                    onClick={() => {
                      setResetError(null);
                      setResetOpen(true);
                    }}
                    disabled={pending}
                    className="px-5 py-3 text-base"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Clear and start from step 1
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="md"
                  variant="secondary"
                  aria-haspopup="dialog"
                  aria-expanded={whyOpen}
                  aria-controls={whyOpen ? "organization-kyc-why-title" : undefined}
                  onClick={() => setWhyOpen(true)}
                  className="px-5 py-3 text-base"
                >
                  Why do we ask?
                </Button>
              </div>
            </div>
            <nav aria-label="KYC steps" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-7">
              {STEPS.map(({ title }, index) => (
                <Button
                  key={title}
                  type="button"
                  size="sm"
                  variant={step === index ? "primary" : "secondary"}
                  aria-current={step === index ? "step" : undefined}
                  disabled={!locked && index > step}
                  aria-label={`Step ${index + 1}: ${title}`}
                  onClick={() => {
                    setStep(index);
                    setError(null);
                    setSuccess(null);
                  }}
                  className="h-full min-h-9 w-full justify-start whitespace-normal px-2 py-1 text-left"
                >
                  <span className="mr-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[10px]">
                    {index + 1}
                  </span>
                  {title}
                </Button>
              ))}
            </nav>
          </header>

          <div className="space-y-5 px-6 py-6 sm:px-8">
            {initialProfile?.status === "REJECTED" && initialProfile.review_note ? (
              <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]" role="status">
                Reviewer feedback: {initialProfile.review_note}
              </p>
            ) : null}

            <section className={step === 0 ? "space-y-4" : "hidden"} aria-label="Company registration">
              <p className="text-sm text-[var(--erp-muted)]">
                These identity and registration details are pulled from your organization profile.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Company name", value: registrationSnapshot.name },
                  { label: "GSTIN", value: registrationSnapshot.gst_number },
                  { label: "Registered address", value: registrationSnapshot.address || "No address on profile" },
                  { label: "Organization profile created", value: registrationSnapshot.createdAt },
                ].map(({ label, value }) => (
                  <dl key={label} className="min-w-0 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-muted)]">{label}</dt>
                    <dd className="mt-2 break-words text-sm font-medium text-[var(--erp-text)]">{value}</dd>
                  </dl>
                ))}
              </div>
              <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4">
                <Input
                  label="Year the business started"
                  name="businessStartedYear"
                  type="number"
                  min="1800"
                  max={new Date().getFullYear()}
                  step="1"
                  defaultValue={initialProfile?.business_started_year ?? ""}
                  disabled={inputDisabled}
                />
              </div>
            </section>

            <section className={step === 1 ? "space-y-4" : "hidden"} aria-label="Founder and team">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Founder name" name="founderName" defaultValue={details.founderName ?? ""} disabled={inputDisabled} />
                <Input label="Founder designation" name="founderDesignation" placeholder="Founder, Managing Director..." defaultValue={details.founderDesignation ?? ""} disabled={inputDisabled} />
                <Input label="Total team members" name="teamMemberCount" type="number" min="0" step="1" defaultValue={details.teamMemberCount ?? ""} disabled={inputDisabled} />
                <Input label="Total workers / labour" name="staffCount" type="number" min="0" step="1" defaultValue={initialProfile?.staff_count ?? ""} disabled={inputDisabled} />
                <Input label="Top management team members" name="topManagementCount" type="number" min="0" step="1" defaultValue={details.topManagementCount ?? ""} disabled={inputDisabled} />
              </div>
            </section>

            <section className={step === 2 ? "space-y-5" : "hidden"} aria-label="Products handled">
              <fieldset disabled={inputDisabled} className="space-y-3">
                <legend className="text-sm font-semibold text-[var(--erp-text)]">What products do you deal with? (select all that apply)</legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {ORGANIZATION_KYC_PRODUCTS.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="md"
                      variant="card"
                      aria-pressed={selectedProducts.includes(value)}
                      onClick={() => setSelectedProducts((current) =>
                        current.includes(value)
                          ? current.filter((product) => product !== value)
                          : [...current, value],
                      )}
                      className={`min-h-20 items-start justify-center p-4 ${selectedProducts.includes(value)
                        ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] ring-2 ring-[var(--erp-brand)]/15"
                        : ""}`}
                    >
                      <span className="text-left text-sm font-semibold">{value}</span>
                      <span className="text-left text-xs font-normal text-[var(--erp-muted)]">
                        {value === "Other" ? "Add a product not listed" : "Select this product category"}
                      </span>
                    </Button>
                  ))}
                </div>
                {selectedProducts.map((value) => (
                  <input key={value} type="hidden" name="products" value={value} />
                ))}
                {selectedProducts.includes("Other") ? (
                  <Input
                    label="What other products do you deal with?"
                    name="otherProduct"
                    value={otherProduct}
                    onChange={(event) => setOtherProduct(event.currentTarget.value)}
                    placeholder="Enter your product category"
                    disabled={inputDisabled}
                    className="px-4 py-3 text-base"
                  />
                ) : null}
              </fieldset>
            </section>

            <section className={step === 3 ? "space-y-5" : "hidden"} aria-label="Business ownership">
              <fieldset disabled={inputDisabled} className="space-y-3">
                <legend className="text-sm font-semibold text-[var(--erp-text)]">Which best describes your business?</legend>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {ORGANIZATION_KYC_BUSINESS_ROLES
                    .filter((value) => value !== "BRAND_OWNER" && value !== "FACTORY_OWNER")
                    .map((value) => {
                    const option = BUSINESS_ROLE_PRESENTATION[value];
                    return (
                    <Button
                      key={value}
                      type="button"
                      size="md"
                      variant="card"
                      aria-pressed={businessRole === value}
                      onClick={() => {
                        setBusinessRole(value);
                        if (value === "DISTRIBUTION_WHOLESALE_RETAIL") {
                          setBusinessChannel((current) =>
                            current === "DISTRIBUTION" || current === "WHOLESALE" || current === "RETAIL"
                              ? current
                              : "DISTRIBUTION",
                          );
                          setBrandModel("");
                        } else {
                          setBusinessChannel("MANUFACTURING");
                          setBrandModel(brandModelForBusinessRole(value));
                        }
                      }}
                      className={`min-h-28 items-start justify-center p-5 ${businessRole === value
                        ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] ring-2 ring-[var(--erp-brand)]/15"
                        : ""}`}
                    >
                      <span className="text-left text-sm font-semibold">{option.label}</span>
                      <span className="text-left text-xs font-normal text-[var(--erp-muted)]">{option.description}</span>
                    </Button>
                    );
                  })}
                </div>
                <input type="hidden" name="businessRole" value={businessRole} />
              </fieldset>
            </section>

            <section className={step === 4 ? "space-y-5" : "hidden"} aria-label="Brand names">
              <input type="hidden" name="businessChannel" value={businessChannel} />
              <input type="hidden" name="brandModel" value={brandModel} />
              <div className={`grid gap-4 ${hasOwnBrand && hasCustomerBrands ? "lg:grid-cols-2" : "grid-cols-1"}`}>
                {hasOwnBrand ? (
                  <div className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-5">
                    <BrandNameFields
                      label="Your brand name(s)"
                      name="ownBrandNames"
                      values={ownBrandNames}
                      onChange={setOwnBrandNames}
                      maxEntries={20}
                      disabled={inputDisabled}
                    />
                  </div>
                ) : null}
                {hasCustomerBrands ? (
                  <div className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-5">
                    <BrandNameFields
                      label={isDistributionWholesaleRetail ? "Your customer brand(s)" : "Customer brand(s) you work with"}
                      name="whiteLabelBrands"
                      values={whiteLabelBrands}
                      onChange={setWhiteLabelBrands}
                      maxEntries={5}
                      disabled={inputDisabled}
                    />
                  </div>
                ) : null}
              </div>
            </section>

            <section className={step === 5 ? "space-y-5" : "hidden"} aria-label="Market coverage and white-label work">
              <fieldset disabled={inputDisabled} className="space-y-3">
                <legend className="text-sm font-semibold text-[var(--erp-text)]">Which markets do you serve?</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {ORGANIZATION_KYC_MARKET_COVERAGE.map((value) => {
                    const label = value === "EXPORT"
                      ? "Export"
                      : value === "DOMESTIC_ONLY"
                        ? "Domestic only"
                        : "Both";
                    return (
                      <Button
                        key={value}
                        type="button"
                        size="md"
                        variant="card"
                        aria-pressed={marketCoverage === value}
                        onClick={() => setMarketCoverage(value)}
                        className={`min-h-24 items-start justify-center p-5 ${marketCoverage === value
                          ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] ring-2 ring-[var(--erp-brand)]/15"
                          : ""}`}
                      >
                        <span className="text-sm font-semibold">{label}</span>
                        <span className="text-left text-xs font-normal text-[var(--erp-muted)]">
                          {value === "EXPORT" ? "You serve customers outside India."
                            : value === "DOMESTIC_ONLY" ? "You serve customers within India."
                              : "You serve customers in India and internationally."}
                        </span>
                      </Button>
                    );
                  })}
                </div>
                <input type="hidden" name="marketCoverage" value={marketCoverage} />
              </fieldset>
              <fieldset
                disabled={inputDisabled || !hasWhiteLabel || businessChannel !== "MANUFACTURING"}
                className={`${hasWhiteLabel && businessChannel === "MANUFACTURING" ? "space-y-3 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4" : "hidden"}`}
              >
                <legend className="text-sm font-semibold text-[var(--erp-text)]">What type of work do you handle?</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {([
                    { value: "FOB", label: "FOB", description: "You manage materials, production, and delivery." },
                    { value: "JOB_WORK", label: "Job Work", description: "You complete production tasks for the buyer." },
                    { value: "BOTH", label: "Both", description: "You handle both FOB and Job Work." },
                  ] as const).map(({ value, label, description }) => {
                    const selected = value === "BOTH"
                      ? whiteLabelWorkTypes.length === ORGANIZATION_KYC_WHITE_LABEL_WORK_TYPES.length
                      : whiteLabelWorkTypes.length === 1 && whiteLabelWorkTypes.includes(value);
                    return (
                    <Button
                      key={value}
                      type="button"
                      size="md"
                      variant="card"
                      aria-pressed={selected}
                      onClick={() => setWhiteLabelWorkTypes(
                        value === "BOTH"
                          ? [...ORGANIZATION_KYC_WHITE_LABEL_WORK_TYPES]
                          : [value],
                      )}
                      className={`min-h-24 items-start justify-center p-5 ${selected
                        ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] ring-2 ring-[var(--erp-brand)]/15"
                        : ""}`}
                    >
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-left text-xs font-normal text-[var(--erp-muted)]">{description}</span>
                    </Button>
                    );
                  })}
                </div>
                {hasWhiteLabel && businessChannel === "MANUFACTURING"
                  ? whiteLabelWorkTypes.map((value) => (
                    <input key={value} type="hidden" name="whiteLabelWorkTypes" value={value} />
                  ))
                  : null}
              </fieldset>
            </section>

            <section className={step === 6 ? "space-y-5" : "hidden"} aria-label="Migration and team responsibilities">
              <fieldset disabled={inputDisabled} className="space-y-3">
                <legend className="text-sm font-semibold text-[var(--erp-text)]">Are you using any software?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {ORGANIZATION_KYC_YES_NO.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="md"
                      variant="card"
                      aria-pressed={usesSoftware === value}
                      onClick={() => setUsesSoftware(value)}
                      className={`min-h-16 justify-center p-4 ${usesSoftware === value
                        ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] ring-2 ring-[var(--erp-brand)]/15"
                        : ""}`}
                    >
                      {value === "YES" ? "Yes, we use software" : "No, not currently"}
                    </Button>
                  ))}
                </div>
                <input type="hidden" name="usesSoftware" value={usesSoftware} />
                {usesSoftware === "YES" ? (
                  <Input
                    label="Software name(s)"
                    name="softwareUsed"
                    placeholder="Enter the software your business currently uses"
                    defaultValue={initialProfile?.software_used === "None" ? "" : initialProfile?.software_used ?? ""}
                    disabled={inputDisabled}
                  />
                ) : null}
              </fieldset>

              <fieldset disabled={inputDisabled} className="space-y-3 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4">
                <legend className="px-1 text-sm font-semibold text-[var(--erp-text)]">Which finance software would you like to integrate with?</legend>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {ORGANIZATION_KYC_FINANCE_SOFTWARE.map((value) => (
                    <div key={value} className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3">
                      <Checkbox
                        name="financeSoftware"
                        value={value}
                        checked={financeSoftware.includes(value)}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setFinanceSoftware((current) =>
                            checked
                              ? [...current, value]
                              : current.filter((selected) => selected !== value),
                          );
                        }}
                        label={value === "ZOHO_BOOKS" ? "Zoho Books" : detailLabel(value)}
                      />
                    </div>
                  ))}
                </div>
                {financeSoftware.includes("OTHER") ? (
                  <Input
                    label="Other finance software"
                    name="financeSoftwareOther"
                    value={financeSoftwareOther}
                    onChange={(event) => setFinanceSoftwareOther(event.currentTarget.value)}
                    placeholder="Enter the finance software name"
                    disabled={inputDisabled}
                  />
                ) : null}
              </fieldset>

              <fieldset disabled={inputDisabled} className="grid gap-4 sm:grid-cols-2">
                {([
                  { name: "hasMerchandisers", label: "Do you have merchandisers to handle orders?", value: details.hasMerchandisers },
                  { name: "hasDedicatedStoreIncharge", label: "Do you have a dedicated store in-charge?", value: details.hasDedicatedStoreIncharge },
                  { name: "hasProductionManager", label: "Do you have a production manager or supervisor?", value: details.hasProductionManager },
                  { name: "hasSeparateDispatchAccounts", label: "Do you have a separate dispatch team to handle invoices and shipments apart from the accounts team?", value: details.hasSeparateDispatchAccounts },
                ] as const).map(({ name, label, value }) => (
                  <Select
                    key={name}
                    label={label}
                    name={name}
                    defaultValue={value ?? ""}
                    options={[
                      { value: "", label: "Choose an answer" },
                      { value: "YES", label: "Yes" },
                      { value: "NO", label: "No" },
                    ]}
                  />
                ))}
              </fieldset>
            </section>

            <section className={step === 7 ? "space-y-5" : "hidden"} aria-label="Financial profile and business priorities">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Last financial year turnover (₹)"
                  name="lastYearTurnover"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={formatRupees(details.lastYearTurnover)}
                  disabled={inputDisabled}
                />
                <Select
                  label="MSME registration status"
                  name="msmeStatus"
                  defaultValue={details.msmeStatus ?? ""}
                  disabled={inputDisabled}
                  options={[
                    { value: "", label: "Choose an option" },
                    ...ORGANIZATION_KYC_MSME_STATUSES.map((value) => ({ value, label: detailLabel(value) })),
                  ]}
                />
              </div>
              <fieldset disabled={inputDisabled} className="space-y-3 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-brand-soft)] p-4">
                <legend className="px-1 text-sm font-semibold text-[var(--erp-text)]">Your top business challenges (choose up to three)</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ORGANIZATION_KYC_CHALLENGES.map((value) => (
                    <div key={value} className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3">
                      <Checkbox name="majorChallenges" value={value} defaultChecked={initialProfile?.major_challenges.includes(value)} label={value} />
                    </div>
                  ))}
                </div>
                <Input label="Other challenge" name="majorChallengeOther" placeholder="Describe another challenge" defaultValue={initialProfile?.major_challenge_other ?? ""} disabled={inputDisabled} />
              </fieldset>
            </section>

            {error ? <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}
            {success ? <p className="rounded-xl border border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] p-3 text-sm text-[var(--erp-brand)]" role="status" aria-live="polite">{success}</p> : null}
          </div>

          <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--erp-border)] bg-[var(--erp-surface)] px-6 py-4 sm:px-8">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Close
            </Button>
            <div className="flex flex-wrap gap-2">
              {step > 0 ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setStep(step - 1)} disabled={pending}>
                  Previous
                </Button>
              ) : null}
              {step < STEPS.length - 1 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={saveStepAndContinue}
                  disabled={pending}
                >
                  {pending ? "Saving..." : "Next"}
                </Button>
              ) : null}
              {!locked ? (
                <>
                  <Button type="button" variant="secondary" size="sm" onClick={() => runAction(saveDraftAction, false)} disabled={pending}>
                    {pending ? "Saving..." : "Save draft"}
                  </Button>
                  {step === STEPS.length - 1 ? (
                    <Button type="button" size="sm" onClick={() => runAction(submitAction, true)} disabled={pending}>
                      {pending ? "Submitting..." : "Submit for review"}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          </footer>
        </form>
      </Modal>
      <Modal
        open={resetOpen}
        onClose={() => {
          if (!pending) setResetOpen(false);
        }}
        ariaLabelledBy="organization-kyc-reset-title"
        ariaDescribedBy="organization-kyc-reset-description"
        variant="danger"
        size="sm"
        closeOnBackdrop={!pending}
      >
        <div className="space-y-5 p-6">
          <div>
            <h2 id="organization-kyc-reset-title" className="text-lg font-semibold text-[var(--erp-text)]">
              Clear this KYC draft?
            </h2>
            <p id="organization-kyc-reset-description" className="mt-2 text-sm leading-6 text-[var(--erp-muted)]">
              This permanently clears the saved KYC answers and reviewer feedback, then returns the form to step 1. Organization registration details will remain unchanged.
            </p>
          </div>
          {resetError ? <p className="text-sm text-[var(--erp-danger)]" role="alert">{resetError}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setResetOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmReset}
              disabled={pending}
            >
              {pending ? "Clearing..." : "Clear and restart"}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={whyOpen}
        onClose={() => setWhyOpen(false)}
        ariaLabelledBy="organization-kyc-why-title"
        size="xl"
        className="max-w-4xl p-0"
      >
        <div className="space-y-7 p-8 sm:p-10">
          <div>
            <Badge className="px-4 py-2 text-sm">Why we ask</Badge>
            <h2 id="organization-kyc-why-title" className="mt-4 text-3xl font-semibold tracking-tight text-[var(--erp-text)]">
              Your business is unique
            </h2>
            <p className="mt-4 text-lg leading-8 text-[var(--erp-muted)]">
              Apparel brands and factories each have their own way of working. We ask these questions to understand your needs.
            </p>
          </div>
          <ul className="list-inside list-disc space-y-4 text-lg leading-8 text-[var(--erp-text)]">
            <li>Help our team understand how your business works.</li>
            <li>See whether our software fits your requirements.</li>
            <li>Tailor or customize the software when needed, so it adapts to your workflow—not the other way around.</li>
          </ul>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setWhyOpen(false)}>Got it</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
