"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Save, Settings2 } from "lucide-react";

import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Switch from "@/components/ui/Switch";
import Tabs from "@/components/ui/Tabs";
import { ReportGrid } from "@/components/reports/report-grid-display";
import { getContactRoleCombinationError } from "@/lib/services/master-data/contact-master-validation";
import type { ContactRoleSettingsValues } from "@/lib/services/master-data/contact-role-settings-service";

type RoleCode = "CUSTOMER" | "VENDOR" | "AGENT" | "DISTRIBUTOR" | "DEALER";
type AddressUsage = "BILLING" | "SHIPPING" | "BOTH";
type TabId = "contact" | "roles" | "gst" | "billing" | "shipping" | "bank";
type DistributorDealerRow = {
  id: string;
  mappingId: string;
  code: string;
  legalName: string;
  displayName: string | null;
  isActive: boolean;
  commissionPercentage?: string | null;
};

export type ContactData = {
  id: string;
  code: string;
  legal_name: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  roles: Array<{ role_code: string }>;
  tax_registrations: Array<{
    gstin: string;
    legal_name: string;
    registration_type: string;
    status: string;
  }>;
  addresses: Array<{
    id: string;
    tax_registration: { gstin: string } | null;
    label: string | null;
    usage: AddressUsage;
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    state_name: string;
    state_code: string | null;
    postal_code: string;
    country_code: string;
    is_default_billing: boolean;
    is_default_shipping: boolean;
  }>;
  bank_accounts?: Array<{
    id: string;
    account_holder_name?: string;
    account_number_masked: string;
    ifsc_code?: string;
    bank_name?: string;
    branch?: string | null;
    is_default?: boolean;
  }>;
};

type ContactForm = {
  code: string;
  legalName: string;
  displayName: string;
  email: string;
  phone: string;
  isActive: boolean;
  roles: string[];
  taxRegistrations: Array<{ gstin: string; legalName: string; registrationType: string; status: string }>;
  addresses: Array<{
    id?: string;
    taxRegistrationGstin: string;
    label: string;
    usage: AddressUsage;
    addressLine1: string;
    addressLine2: string;
    city: string;
    stateName: string;
    stateCode: string;
    postalCode: string;
    countryCode: string;
    isDefaultBilling: boolean;
    isDefaultShipping: boolean;
  }>;
  bankAccounts: Array<{
    id?: string;
    accountHolderName: string;
    accountNumber: string;
    accountNumberMasked?: string;
    ifscCode: string;
    bankName: string;
    branch: string;
    isDefault: boolean;
  }>;
};

const ROLE_OPTIONS: Array<{ code: RoleCode; label: string }> = [
  { code: "CUSTOMER", label: "Customer" },
  { code: "VENDOR", label: "Vendor" },
  { code: "AGENT", label: "Agent" },
  { code: "DISTRIBUTOR", label: "Distributor" },
  { code: "DEALER", label: "Dealer" },
];

const TABS: Array<{ value: TabId; label: string }> = [
  { value: "contact", label: "Contact" },
  { value: "roles", label: "Roles" },
  { value: "gst", label: "GST details" },
  { value: "billing", label: "Billing address" },
  { value: "shipping", label: "Shipping address" },
  { value: "bank", label: "Bank accounts" },
];

function emptyForm(): ContactForm {
  return {
    code: "",
    legalName: "",
    displayName: "",
    email: "",
    phone: "",
    isActive: true,
    roles: [],
    taxRegistrations: [],
    addresses: [],
    bankAccounts: [],
  };
}

function toForm(contact: ContactData): ContactForm {
  return {
    code: contact.code,
    legalName: contact.legal_name,
    displayName: contact.display_name ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    isActive: contact.is_active,
    roles: contact.roles.map((role) => role.role_code),
    taxRegistrations: contact.tax_registrations.map((registration) => ({
      gstin: registration.gstin,
      legalName: registration.legal_name,
      registrationType: registration.registration_type,
      status: registration.status,
    })),
    addresses: contact.addresses.map((address) => ({
      id: address.id,
      taxRegistrationGstin: address.tax_registration?.gstin ?? "",
      label: address.label ?? "",
      usage: address.usage,
      addressLine1: address.address_line_1,
      addressLine2: address.address_line_2 ?? "",
      city: address.city,
      stateName: address.state_name,
      stateCode: address.state_code ?? "",
      postalCode: address.postal_code,
      countryCode: address.country_code || "IN",
      isDefaultBilling: address.is_default_billing,
      isDefaultShipping: address.is_default_shipping,
    })),
    bankAccounts: (contact.bank_accounts ?? []).map((account) => ({
      id: account.id,
      accountHolderName: account.account_holder_name ?? "",
      accountNumber: "",
      accountNumberMasked: account.account_number_masked,
      ifscCode: account.ifsc_code ?? "",
      bankName: account.bank_name ?? "",
      branch: account.branch ?? "",
      isDefault: account.is_default ?? false,
    })),
  };
}

function addressText(address: ContactData["addresses"][number]) {
  return [
    address.address_line_1,
    address.address_line_2,
    address.city,
    address.state_name,
    address.postal_code,
    address.country_code,
  ].filter(Boolean).join(", ");
}

export default function ContactMasterRecordPage({
  organizationId,
  workspaceId,
  contactId,
  createMode = false,
  initialContact = null,
  initialCommonRoleSettings = {},
  roleSettingsError,
}: {
  organizationId: string;
  workspaceId: string;
  contactId?: string;
  createMode?: boolean;
  initialContact?: ContactData | null;
  initialCommonRoleSettings?: Record<string, boolean> | null;
  roleSettingsError?: string;
}) {
  const router = useRouter();
  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/contacts`;
  const [contact, setContact] = useState<ContactData | null>(initialContact);
  const [form, setForm] = useState<ContactForm>(() => initialContact ? toForm(initialContact) : emptyForm());
  const [activeTab, setActiveTab] = useState<TabId>("contact");
  const [activeRoleTab, setActiveRoleTab] = useState<RoleCode>("CUSTOMER");
  const mappedEntityLabel = activeRoleTab === "AGENT" ? "Customer" : "Contact";
  const [editing, setEditing] = useState(createMode);
  const [loading, setLoading] = useState(!createMode && !initialContact);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const roleLabels = useMemo(() => new Map<string, string>(ROLE_OPTIONS.map((role) => [role.code, role.label])), []);
  const [distributorDealerRows, setDistributorDealerRows] = useState<DistributorDealerRow[]>([]);
  const [distributorMappingConfirmed, setDistributorMappingConfirmed] = useState(false);
  const [dealerLookupQuery, setDealerLookupQuery] = useState("");
  const [dealerLookupRows, setDealerLookupRows] = useState<Array<{ id: string; code: string; label: string }>>([]);
  const [selectedDealerIds, setSelectedDealerIds] = useState<string[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [dealerModalOpen, setDealerModalOpen] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<{ id: string; code: string; label: string } | null>(null);
  const [roleMappingConfirmed, setRoleMappingConfirmed] = useState(false);
  const [roleMappedRows, setRoleMappedRows] = useState<DistributorDealerRow[]>([]);
  const [roleLookupQuery, setRoleLookupQuery] = useState("");
  const [roleLookupRows, setRoleLookupRows] = useState<Array<{ id: string; code: string; label: string }>>([]);
  const [selectedRoleContact, setSelectedRoleContact] = useState<{ id: string; code: string; label: string } | null>(null);
  const [roleMappedContactIds, setRoleMappedContactIds] = useState<string[]>([]);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [agentCommissionPercentage, setAgentCommissionPercentage] = useState("0");
  const [commonRoleSettings, setCommonRoleSettings] = useState<Record<string, boolean>>(initialCommonRoleSettings ?? {});
  const [commonRoleSettingsAvailable] = useState(initialCommonRoleSettings !== null);
  const [savingCommonRoleSettings, setSavingCommonRoleSettings] = useState<Record<string, boolean>>({});

  const setCommonRoleSetting = async (roleCode: RoleCode, checked: boolean) => {
    if (!contactId) return;
    setSavingCommonRoleSettings((current) => ({ ...current, [roleCode]: true }));
    setError("");
    try {
      const response = await fetch(
        `${endpoint}/${encodeURIComponent(contactId)}/role-settings/${encodeURIComponent(roleCode)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "common", useCommonSettings: checked }),
        },
      );
      const result = await response.json() as ContactRoleSettingsValues | { error?: string };
      if (!response.ok || typeof result !== "object" || result === null || !("useCommonSettings" in result)) {
        throw new Error(
          typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : "Unable to update common role settings.",
        );
      }
      setCommonRoleSettings((current) => ({ ...current, [roleCode]: result.useCommonSettings }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update common role settings.");
    } finally {
      setSavingCommonRoleSettings((current) => ({ ...current, [roleCode]: false }));
    }
  };

  useEffect(() => {
    if (!contactId || initialContact) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${endpoint}/${encodeURIComponent(contactId)}`);
        const result = await response.json() as ContactData | { error?: string };
        if (!response.ok || !("id" in result)) throw new Error("error" in result ? result.error ?? "Unable to load contact." : "Unable to load contact.");
        if (!cancelled) {
          setContact(result);
          setForm(toForm(result));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load contact.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contactId, endpoint, initialContact]);

  useEffect(() => {
    if (!contactId || activeTab !== "roles" || activeRoleTab !== "DISTRIBUTOR" || !distributorMappingConfirmed) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${endpoint}/${encodeURIComponent(contactId)}/dealers`);
        const result = await response.json() as DistributorDealerRow[] | { error?: string };
        if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error ?? "Unable to load mapped Dealers." : "Unable to load mapped Dealers.");
        setDistributorDealerRows(result);
        setSelectedDealerIds(result.map((row) => row.id));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load mapped Dealers.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeRoleTab, activeTab, contactId, distributorMappingConfirmed, endpoint]);

  useEffect(() => {
    if (!distributorMappingConfirmed || dealerLookupQuery.trim().length < 2) {
      setDealerLookupRows([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          activeOnly: "true",
          limit: "20",
          offset: "0",
          search: dealerLookupQuery.trim(),
          excludedDistributorId: contactId ?? "",
        });
        const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/contacts/lookup?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await response.json() as Array<{ id: string; code: string; label: string }> | { error?: string };
        if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error ?? "Unable to search Contacts." : "Unable to search Contacts.");
        setDealerLookupRows(result.filter((row) => row.id !== contactId && !selectedDealerIds.includes(row.id)));
      } catch (lookupError) {
        if (!(lookupError instanceof Error && lookupError.name === "AbortError")) {
          setError(lookupError instanceof Error ? lookupError.message : "Unable to search Contacts.");
        }
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [contactId, dealerLookupQuery, distributorMappingConfirmed, organizationId, selectedDealerIds]);

  useEffect(() => {
    if (activeRoleTab === "DISTRIBUTOR") {
      setDistributorMappingConfirmed(Boolean(contact?.roles.some((role) => role.role_code === "DISTRIBUTOR")));
    }
    if (activeRoleTab === "AGENT" || activeRoleTab === "DEALER") {
      setRoleMappingConfirmed(Boolean(contact?.roles.some((role) => role.role_code === activeRoleTab)));
    }
  }, [activeRoleTab, contact]);

  useEffect(() => {
    if (!contactId || !["AGENT", "DEALER"].includes(activeRoleTab) || !roleMappingConfirmed) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${endpoint}/${encodeURIComponent(contactId)}/role-mappings/${activeRoleTab}`);
        const result = await response.json() as DistributorDealerRow[] | { error?: string };
        if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error ?? "Unable to load mapped Contacts." : "Unable to load mapped Contacts.");
        setRoleMappedRows(result);
        setRoleMappedContactIds(result.map((row) => row.id));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load mapped Contacts.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeRoleTab, contactId, endpoint, roleMappingConfirmed]);

  useEffect(() => {
    if (!roleMappingConfirmed || !["AGENT", "DEALER"].includes(activeRoleTab) || roleLookupQuery.trim().length < 2) {
      setRoleLookupRows([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          activeOnly: "true",
          limit: "20",
          offset: "0",
          search: roleLookupQuery.trim(),
        });
        const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/contacts/lookup?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await response.json() as Array<{ id: string; code: string; label: string }> | { error?: string };
        if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error ?? "Unable to search Contacts." : "Unable to search Contacts.");
        setRoleLookupRows(result.filter((row) => row.id !== contactId && !roleMappedContactIds.includes(row.id)));
      } catch (lookupError) {
        if (!(lookupError instanceof Error && lookupError.name === "AbortError")) {
          setError(lookupError instanceof Error ? lookupError.message : "Unable to search Contacts.");
        }
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeRoleTab, contactId, organizationId, roleLookupQuery, roleMappingConfirmed, roleMappedContactIds]);

  const title = contact?.display_name || contact?.legal_name || (createMode ? "New contact" : "Contact");
  const detailHref = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/contacts`;
  const assignedRoleCodes = new Set((contact?.roles ?? []).map(({ role_code }) => role_code));
  const restrictedRoleCodes: RoleCode[] = ["AGENT", "DISTRIBUTOR", "DEALER"];
  const assignedRestrictedRoles = restrictedRoleCodes.filter((roleCode) => assignedRoleCodes.has(roleCode));
  const conflictingRestrictedRoles = assignedRestrictedRoles.filter((roleCode) => roleCode !== activeRoleTab);

  const saveContact = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(contactId ? `${endpoint}/${encodeURIComponent(contactId)}` : endpoint, {
        method: contactId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: form.legalName,
          displayName: form.displayName || null,
          email: form.email || null,
          phone: form.phone || null,
          isActive: form.isActive,
          roles: form.roles,
          taxRegistrations: form.taxRegistrations,
          addresses: form.addresses,
          bankAccounts: form.bankAccounts.map(({ id, accountHolderName, accountNumber, ifscCode, bankName, branch, isDefault }) => ({
            id,
            accountHolderName,
            accountNumber,
            ifscCode,
            bankName,
            branch,
            isDefault,
          })),
        }),
      });
      const result = await response.json() as ContactData | { error?: string };
      if (!response.ok || !("id" in result)) throw new Error("error" in result ? result.error ?? "Unable to save contact." : "Unable to save contact.");
      setContact(result);
      setForm(toForm(result));
      setEditing(false);
      setNotice(contactId ? "Contact updated." : "Contact created.");
      if (!contactId) router.replace(`${detailHref}/${encodeURIComponent(result.id)}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save contact.");
    } finally {
      setSaving(false);
    }
  };

  const openDealerModal = () => {
    setDealerLookupQuery("");
    setDealerLookupRows([]);
    setSelectedDealer(null);
    setDealerModalOpen(true);
  };

  const closeDealerModal = () => {
    setDealerModalOpen(false);
    setDealerLookupQuery("");
    setDealerLookupRows([]);
    setSelectedDealer(null);
  };

  const addDistributorDealer = async () => {
    if (!contactId || !selectedDealer) return;
    setMappingLoading(true);
    setError("");
    try {
      const dealerIds = [...new Set([...selectedDealerIds, selectedDealer.id])];
      const response = await fetch(`${endpoint}/${encodeURIComponent(contactId)}/dealers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealerIds }),
      });
      const result = await response.json() as DistributorDealerRow[] | { error?: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error ?? "Unable to add Dealer." : "Unable to add Dealer.");
      setDistributorDealerRows(result);
      setSelectedDealerIds(result.map((row) => row.id));
      setNotice("Dealer added to this Distributor.");
      closeDealerModal();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to add Dealer.");
    } finally {
      setMappingLoading(false);
    }
  };

  const confirmDistributor = () => {
    setDistributorMappingConfirmed(true);
    setSelectedDealerIds(distributorDealerRows.map((row) => row.id));
  };

  const confirmRoleMapping = () => {
    setRoleMappingConfirmed(true);
    setRoleMappedContactIds(roleMappedRows.map((row) => row.id));
  };

  const openRoleModal = () => {
    setRoleLookupQuery("");
    setRoleLookupRows([]);
    setSelectedRoleContact(null);
    setAgentCommissionPercentage("0");
    setRoleModalOpen(true);
  };

  const closeRoleModal = () => {
    setRoleModalOpen(false);
    setRoleLookupQuery("");
    setRoleLookupRows([]);
    setSelectedRoleContact(null);
    setAgentCommissionPercentage("0");
  };

  const addRoleMappedContact = async () => {
    if (!contactId || !selectedRoleContact || !["AGENT", "DEALER"].includes(activeRoleTab)) return;
    setMappingLoading(true);
    setError("");
    try {
      const contactIds = [...new Set([...roleMappedContactIds, selectedRoleContact.id])];
      const response = await fetch(`${endpoint}/${encodeURIComponent(contactId)}/role-mappings/${activeRoleTab}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds,
          ...(activeRoleTab === "AGENT" ? { commissionPercentage: agentCommissionPercentage } : {}),
        }),
      });
      const result = await response.json() as DistributorDealerRow[] | { error?: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error ?? `Unable to add ${mappedEntityLabel}.` : `Unable to add ${mappedEntityLabel}.`);
      setRoleMappedRows(result);
      setRoleMappedContactIds(result.map((row) => row.id));
      setNotice(`${mappedEntityLabel} added under ${roleLabels.get(activeRoleTab)}.`);
      closeRoleModal();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : `Unable to add ${mappedEntityLabel}.`);
    } finally {
      setMappingLoading(false);
    }
  };

  const cancelEdit = () => {
    if (createMode) {
      router.push(detailHref);
      return;
    }
    if (contact) setForm(toForm(contact));
    setError("");
    setEditing(false);
  };

  const updateRegistration = (index: number, key: keyof ContactForm["taxRegistrations"][number], value: string) => {
    setForm((current) => ({
      ...current,
      taxRegistrations: current.taxRegistrations.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row),
    }));
  };

  const updateAddress = (index: number, key: keyof ContactForm["addresses"][number], value: string | boolean) => {
    setForm((current) => ({
      ...current,
      addresses: current.addresses.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row),
    }));
  };

  const updateBankAccount = (index: number, key: keyof ContactForm["bankAccounts"][number], value: string | boolean) => {
    setForm((current) => ({
      ...current,
      bankAccounts: current.bankAccounts.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row),
    }));
  };

  const selectedAddressUsage = activeTab === "shipping" ? "SHIPPING" : "BILLING";
  const visibleFormAddresses = form.addresses
    .map((address, index) => ({ address, index }))
    .filter(({ address }) => address.usage === selectedAddressUsage || address.usage === "BOTH");

  if (loading) {
    return <Card><p className="text-center text-sm text-slate-500" role="status">Loading contact…</p></Card>;
  }
  if (!createMode && !contact) {
    return (
      <Card>
        <p className={error ? "text-center text-sm text-[var(--erp-danger)]" : "text-center text-sm text-slate-500"} role={error ? "alert" : undefined}>
          {error || "Contact not found."}
        </p>
      </Card>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      {!createMode && contact ? (
        <div className="flex min-h-24 w-full flex-col items-start justify-between gap-4 rounded-2xl border border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] px-5 py-4 shadow-[var(--erp-shadow)] md:flex-row md:items-center md:px-7">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href={detailHref}
              aria-label="Back to contacts"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] text-[var(--erp-brand)] shadow-sm transition hover:border-[var(--erp-brand)] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
            >
              <ArrowLeft aria-hidden="true" className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-full border border-[var(--erp-brand)] bg-[var(--erp-surface)] px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--erp-brand)]">
                  Contact profile
                </span>
              </div>
              <h1 className="break-words text-2xl font-bold leading-tight text-[var(--erp-text)] md:text-3xl">{title}</h1>
              <div aria-label="Current contact roles" className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[var(--erp-muted)]">Current roles</span>
                {contact.roles.length
                  ? contact.roles.map(({ role_code }) => (
                    <Badge key={role_code}>{roleLabels.get(role_code) ?? role_code}</Badge>
                  ))
                  : <Badge>None assigned</Badge>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5">
            <span className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3 py-2 text-sm font-bold text-[var(--erp-text)]">
              {contact.code}
            </span>
            <Badge>{(editing ? form.isActive : contact.is_active) ? "Active" : "Inactive"}</Badge>
            {editing && contactId ? (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3 py-1.5">
                <span className="text-sm font-semibold text-[var(--erp-text)]">{form.isActive ? "Active" : "Inactive"}</span>
                <Switch
                  checked={form.isActive}
                  label="Active contact"
                  onCheckedChange={(isActive) => setForm((current) => ({ ...current, isActive }))}
                />
              </div>
            ) : null}
            {!editing && contact ? <Button onClick={() => { setForm(toForm(contact)); setEditing(true); setActiveTab("contact"); }}>Edit contact</Button> : null}
          </div>
        </div>
      ) : (
        <div className="flex min-h-20 items-center rounded-2xl border border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] px-5 py-4 shadow-[var(--erp-shadow)]">
          <Link href={detailHref} className="mr-4 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] text-[var(--erp-brand)]">
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
          <div>
            <span className="rounded-full border border-[var(--erp-brand)] bg-[var(--erp-surface)] px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--erp-brand)]">Contact profile</span>
            <h1 className="mt-1 text-3xl font-bold text-[var(--erp-text)]">Create contact</h1>
          </div>
        </div>
      )}

      {error ? <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}
      {roleSettingsError ? <p className="rounded-xl border border-[var(--erp-warning)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-warning)]" role="alert">{roleSettingsError}</p> : null}
      {notice ? <p className="rounded-xl border border-[var(--erp-success)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-success)]" role="status">{notice}</p> : null}

      <Card className="w-full max-w-none space-y-5">
        <Tabs tabs={TABS} value={activeTab} onChange={setActiveTab} ariaLabel="Contact sections" scrollable />
        {!editing && contact ? (
          <div role="tabpanel" className="space-y-4">
            {activeTab === "contact" ? (
              <>
                <h2 className="text-base font-semibold text-[var(--erp-text)]">Contact information</h2>
                <dl className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Contact code", contact.code],
                    ["Legal name", contact.legal_name],
                    ["Display name", contact.display_name ?? "—"],
                    ["Email", contact.email ?? "—"],
                    ["Phone", contact.phone ?? "—"],
                  ].map(([label, value]) => <DetailField key={label} label={label} value={value} />)}
                </dl>
              </>
            ) : null}
            {activeTab === "roles" ? (
              <section className="space-y-4">
                <Tabs
                  tabs={ROLE_OPTIONS.map((role) => ({ value: role.code, label: role.label }))}
                  value={activeRoleTab}
                  onChange={setActiveRoleTab}
                  ariaLabel="Contact business roles"
                  scrollable
                  compact
                />
                <div role="tabpanel" className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-[var(--erp-text)]">{roleLabels.get(activeRoleTab)}</h2>
                  {contact.roles.some((role) => role.role_code === activeRoleTab)
                    ? <span className="rounded-full border border-[var(--erp-success)] px-2.5 py-1 text-xs font-semibold text-[var(--erp-success)]" role="status">Assigned role</span>
                    : <span className="rounded-full border border-[var(--erp-border)] px-2.5 py-1 text-xs font-medium text-[var(--erp-muted)]">Role not assigned</span>}
                  </div>
                  {contactId && commonRoleSettingsAvailable && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--erp-text)]">Common {roleLabels.get(activeRoleTab)} settings</p>
                        <p className="text-xs text-[var(--erp-muted)]">
                          {commonRoleSettings[activeRoleTab]
                            ? "Apply one settings profile to every mapped record."
                            : "Configure each mapped record independently."}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Switch
                          checked={Boolean(commonRoleSettings[activeRoleTab])}
                          label={`Use common ${roleLabels.get(activeRoleTab)} settings`}
                          onCheckedChange={(checked) => void setCommonRoleSetting(activeRoleTab, checked)}
                          disabled={Boolean(savingCommonRoleSettings[activeRoleTab])}
                        />
                        {commonRoleSettings[activeRoleTab] ? (
                          <Link
                            href={`${detailHref}/${encodeURIComponent(contactId)}/ROLE/${activeRoleTab.toLowerCase()}/common-settings/settings`}
                            aria-label={`Open common ${roleLabels.get(activeRoleTab)} settings`}
                            title={`Common ${roleLabels.get(activeRoleTab)} settings`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] text-[var(--erp-brand)] shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
                          >
                            <Settings2 className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  )}
                  {activeRoleTab === "DISTRIBUTOR" ? (
                    <div className="space-y-4">
                      {conflictingRestrictedRoles.length ? (
                        <p className="rounded-xl border border-[var(--erp-warning)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-warning)]" role="status">
                          This contact is already assigned as {conflictingRestrictedRoles.map((roleCode) => roleLabels.get(roleCode)).join(", ")}. Agent, Distributor, and Dealer roles must use separate contacts. Correct the contact roles before managing Distributor relationships.
                        </p>
                      ) : distributorMappingConfirmed ? (
                        <>
                          {assignedRoleCodes.has("DISTRIBUTOR") ? (
                            <p className="rounded-xl border border-[var(--erp-info)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-info)]" role="status">
                              Distributor is already assigned to this contact. Manage its linked Dealers below.
                            </p>
                          ) : null}
                          <ReportGrid
                            title="Mapped Dealers"
                            records={distributorDealerRows}
                            fields={[
                              { key: "code", label: "Dealer Code" },
                              { key: "name", label: "Dealer Name" },
                              { key: "status", label: "Status" },
                              { key: "actions", label: "Settings" },
                            ]}
                            visibleFields={["code", "name", "status", "actions"]}
                            onVisibleFieldsChange={() => undefined}
                            storageKey={`distributor-dealers-${organizationId}-${contactId}`}
                            rowIdSelector={(row) => row.id}
                            selectable={false}
                            selectedIds={[]}
                            displayMode="cards"
                            cardColumns={1}
                            cardBadge={() => "Dealer"}
                            onRowClick={(dealerId) => router.push(`${detailHref}/${encodeURIComponent(dealerId)}`)}
                            onNewOrder={openDealerModal}
                            newActionLabel="+ Add Dealer"
                            getSearchValue={(fieldKey, row) => fieldKey === "code"
                              ? row.code
                              : fieldKey === "name"
                                ? row.displayName || row.legalName
                                : row.isActive ? "Active" : "Inactive"}
                            renderCell={(fieldKey, row) => {
                              if (fieldKey === "code") return row.code;
                              if (fieldKey === "name") return row.displayName || row.legalName;
                              if (fieldKey === "actions" && commonRoleSettingsAvailable && !commonRoleSettings.DISTRIBUTOR && contactId) {
                                return (
                                  <div className="flex justify-end">
                                    <Link
                                      href={`${detailHref}/${encodeURIComponent(contactId)}/ROLE/distributor/individual-settings/${encodeURIComponent(row.id)}/settings`}
                                      aria-label={`Open settings for ${row.displayName || row.legalName}`}
                                      title="Individual Dealer settings"
                                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] text-[var(--erp-muted)] shadow-sm transition hover:border-[var(--erp-brand)] hover:bg-[var(--erp-brand-soft)] hover:text-[var(--erp-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
                                    >
                                      <Settings2 className="h-4 w-4" aria-hidden="true" />
                                    </Link>
                                  </div>
                                );
                              }
                              if (fieldKey === "actions") return null;
                              return row.isActive ? "Active" : "Inactive";
                            }}
                            emptyMessage="No Dealers are mapped to this Distributor."
                          />
                        </>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--erp-border)] p-4">
                          <p className="text-sm font-medium text-[var(--erp-text)]">Is this a Distributor?</p>
                          <Button type="button" onClick={confirmDistributor} disabled={mappingLoading}>Yes</Button>
                          <Button type="button" variant="secondary" onClick={() => setDistributorMappingConfirmed(false)}>No</Button>
                        </div>
                      )}
                    </div>
                  ) : null}
                  {activeRoleTab === "AGENT" || activeRoleTab === "DEALER" ? (
                    <div className="space-y-4">
                      {conflictingRestrictedRoles.length ? (
                        <p className="rounded-xl border border-[var(--erp-warning)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-warning)]" role="status">
                          This contact is already assigned as {conflictingRestrictedRoles.map((roleCode) => roleLabels.get(roleCode)).join(", ")}. Agent, Distributor, and Dealer roles must use separate contacts. Correct the contact roles before managing {roleLabels.get(activeRoleTab)} relationships.
                        </p>
                      ) : roleMappingConfirmed ? (
                        <>
                          {assignedRoleCodes.has(activeRoleTab) ? (
                            <p className="rounded-xl border border-[var(--erp-info)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-info)]" role="status">
                              {roleLabels.get(activeRoleTab)} is already assigned to this contact. Manage its mapped records below.
                            </p>
                          ) : null}
                          <ReportGrid
                            title={activeRoleTab === "AGENT" ? "Mapped Customers" : "Mapped Contacts"}
                            records={roleMappedRows}
                            fields={[
                              { key: "code", label: "Contact Code" },
                              { key: "name", label: activeRoleTab === "AGENT" ? "Customer Name" : "Contact Name" },
                              { key: "status", label: "Status" },
                              ...(activeRoleTab === "AGENT" ? [{ key: "commission", label: "Commission %" }] : []),
                              { key: "actions", label: "Settings" },
                            ]}
                            visibleFields={activeRoleTab === "AGENT" ? ["code", "name", "status", "commission", "actions"] : ["code", "name", "status", "actions"]}
                            onVisibleFieldsChange={() => undefined}
                            storageKey={`${activeRoleTab.toLowerCase()}-contacts-${organizationId}-${contactId}`}
                            rowIdSelector={(row) => row.id}
                            selectable={false}
                            selectedIds={[]}
                            displayMode="cards"
                            cardColumns={1}
                            cardBadge={() => roleLabels.get(activeRoleTab) ?? activeRoleTab}
                            onRowClick={(mappedContactId) => router.push(`${detailHref}/${encodeURIComponent(mappedContactId)}`)}
                            onNewOrder={openRoleModal}
                            newActionLabel={`+ Add ${mappedEntityLabel}`}
                            getSearchValue={(fieldKey, row) => fieldKey === "code"
                              ? row.code
                              : fieldKey === "name"
                                ? row.displayName || row.legalName
                                : row.isActive ? "Active" : "Inactive"}
                            renderCell={(fieldKey, row) => {
                              if (fieldKey === "code") return row.code;
                              if (fieldKey === "name") return row.displayName || row.legalName;
                              if (fieldKey === "actions" && commonRoleSettingsAvailable && !commonRoleSettings[activeRoleTab] && contactId) {
                                return (
                                  <div className="flex justify-end">
                                    <Link
                                      href={`${detailHref}/${encodeURIComponent(contactId)}/ROLE/${activeRoleTab.toLowerCase()}/individual-settings/${encodeURIComponent(row.id)}/settings`}
                                      aria-label={`Open ${roleLabels.get(activeRoleTab)} settings for ${row.displayName || row.legalName}`}
                                      title={`Individual ${roleLabels.get(activeRoleTab)} settings`}
                                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] text-[var(--erp-muted)] shadow-sm transition-colors hover:border-[var(--erp-brand)] hover:bg-[var(--erp-brand-soft)] hover:text-[var(--erp-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
                                    >
                                      <Settings2 className="h-4 w-4" aria-hidden="true" />
                                    </Link>
                                  </div>
                                );
                              }
                              if (fieldKey === "actions") return null;
                              return row.isActive ? "Active" : "Inactive";
                            }}
                            emptyMessage={`No ${activeRoleTab === "AGENT" ? "Customers" : "Contacts"} are mapped to this ${roleLabels.get(activeRoleTab)}.`}
                          />
                        </>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--erp-border)] p-4">
                          <p className="text-sm font-medium text-[var(--erp-text)]">Is this a {roleLabels.get(activeRoleTab)}?</p>
                          <Button type="button" onClick={confirmRoleMapping} disabled={mappingLoading}>Yes</Button>
                          <Button type="button" variant="secondary" onClick={() => setRoleMappingConfirmed(false)}>No</Button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
            {activeTab === "gst" ? (
              <section className="space-y-4">
                <h2 className="text-base font-semibold text-[var(--erp-text)]">GST details</h2>
                {contact.tax_registrations.length > 1 ? (
                  <p className="rounded-xl border border-[var(--erp-warning)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-warning)]" role="status">
                    This existing contact has multiple GSTINs. The updated rule allows one GSTIN per contact; remove the extras in Edit before saving.
                  </p>
                ) : null}
                {contact.tax_registrations.length ? contact.tax_registrations.map((registration) => (
                  <dl key={registration.gstin} className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--erp-border)] p-4 md:grid-cols-2 xl:grid-cols-4">
                    <DetailField label="GSTIN" value={registration.gstin} />
                    <DetailField label="Registered legal name" value={registration.legal_name} />
                    <DetailField label="Registration type" value={registration.registration_type.replaceAll("_", " ")} />
                    <DetailField label="Status" value={registration.status} />
                  </dl>
                )) : <EmptyDetail>No GSTIN is assigned to this contact.</EmptyDetail>}
              </section>
            ) : null}
            {activeTab === "billing" || activeTab === "shipping" ? (
              <section className="space-y-4">
                <h2 className="text-base font-semibold text-[var(--erp-text)]">
                  {activeTab === "billing" ? "Billing addresses" : "Shipping addresses"}
                </h2>
                {contact.addresses.filter((address) => address.usage === selectedAddressUsage || address.usage === "BOTH").length
                  ? contact.addresses
                    .filter((address) => address.usage === selectedAddressUsage || address.usage === "BOTH")
                    .map((address) => (
                  <div key={address.id} className="space-y-3 rounded-xl border border-[var(--erp-border)] p-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-[var(--erp-surface-soft)] px-3 py-1 text-xs font-semibold">{address.usage}</span>
                      {address.is_default_billing ? <span className="rounded-full bg-[var(--erp-brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--erp-brand)]">Default billing</span> : null}
                      {address.is_default_shipping ? <span className="rounded-full bg-[var(--erp-brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--erp-brand)]">Default shipping</span> : null}
                    </div>
                    <dl className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <DetailField label="Address label" value={address.label} />
                      <DetailField label="Linked GSTIN" value={address.tax_registration?.gstin} />
                      <DetailField label="Address" value={addressText(address)} />
                      <DetailField label="State code" value={address.state_code} />
                    </dl>
                  </div>
                  ))
                  : <EmptyDetail>{`No ${activeTab} addresses have been added.`}</EmptyDetail>}
              </section>
            ) : null}
            {activeTab === "bank" ? (
              <section className="space-y-4">
                <h2 className="text-base font-semibold text-[var(--erp-text)]">Bank accounts</h2>
                {contact.bank_accounts?.length ? contact.bank_accounts.map((account) => (
                  <dl key={account.id} className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--erp-border)] p-4 md:grid-cols-2 xl:grid-cols-4">
                    <DetailField label="Account holder" value={account.account_holder_name} />
                    <DetailField label="Account number" value={account.account_number_masked} />
                    <DetailField label="IFSC" value={account.ifsc_code} />
                    <DetailField label="Bank" value={account.bank_name} />
                    <DetailField label="Branch" value={account.branch} />
                    <DetailField label="Default account" value={account.is_default ? "Yes" : "No"} />
                  </dl>
                )) : <EmptyDetail>No bank accounts have been added.</EmptyDetail>}
              </section>
            ) : null}
          </div>
        ) : (
          <form onSubmit={saveContact} className="space-y-6" noValidate={false}>
            {activeTab === "contact" ? (
              <section className="space-y-4">
                <h2 className="text-base font-semibold text-[var(--erp-text)]">Contact information</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <Input
                      label="Contact code"
                      value={createMode ? "" : form.code}
                      placeholder={createMode ? "Auto-generated (CT1, CT2, …)" : undefined}
                      disabled
                      aria-describedby={createMode ? "contact-code-hint" : undefined}
                    />
                    {createMode ? <p id="contact-code-hint" className="mt-1 text-xs text-slate-500">Assigned automatically when saved.</p> : null}
                  </div>
                  <Input label="Legal name" maxLength={200} value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.currentTarget.value })} />
                  <Input label="Display name" maxLength={200} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.currentTarget.value })} />
                  <Input label="Email" type="email" maxLength={255} value={form.email} onChange={(event) => setForm({ ...form, email: event.currentTarget.value })} />
                  <Input label="Phone" type="tel" maxLength={40} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.currentTarget.value })} />
                </div>
              </section>
            ) : null}
            {activeTab === "roles" ? (
              <section className="space-y-4">
                <Tabs
                  tabs={ROLE_OPTIONS.map((role) => ({ value: role.code, label: role.label }))}
                  value={activeRoleTab}
                  onChange={setActiveRoleTab}
                  ariaLabel="Contact business roles"
                  scrollable
                  compact
                />
                {ROLE_OPTIONS.filter((role) => role.code === activeRoleTab).map((role) => (
                  <div key={role.code} className="rounded-xl border border-[var(--erp-border)] p-4">
                    <h2 className="mb-3 text-base font-semibold text-[var(--erp-text)]">{role.label}</h2>
                    <Checkbox
                      checked={form.roles.includes(role.code)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        const nextRoles = checked
                          ? [...form.roles.filter((item) => item !== role.code), role.code]
                          : form.roles.filter((item) => item !== role.code);
                        const roleCombinationError = getContactRoleCombinationError(nextRoles);
                        if (checked && roleCombinationError) {
                          setError(roleCombinationError);
                          return;
                        }
                        setError("");
                        setForm((current) => ({ ...current, roles: nextRoles }));
                      }}
                      label={`Assign ${role.label} role`}
                    />
                  </div>
                ))}
              </section>
            ) : null}
            {activeTab === "gst" ? (
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--erp-text)]">GST details</h2>
                    <p className="text-sm text-slate-500">A contact can have at most one GSTIN. Create a separate contact for another GSTIN.</p>
                  </div>
                  {form.taxRegistrations.length === 0 ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setForm({
                        ...form,
                        taxRegistrations: [{
                          gstin: "",
                          legalName: form.legalName,
                          registrationType: "REGULAR",
                          status: "ACTIVE",
                        }],
                      })}
                    >
                      <Plus aria-hidden="true" className="h-4 w-4" /> Add GSTIN
                    </Button>
                  ) : null}
                </div>
                {form.taxRegistrations.length > 1 ? (
                  <p className="rounded-xl border border-[var(--erp-warning)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-warning)]" role="alert">
                    This existing contact has multiple GSTINs. Remove all but one before saving.
                  </p>
                ) : null}
                {form.taxRegistrations.map((registration, index) => (
                  <div key={`${registration.gstin}-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--erp-border)] p-4 md:grid-cols-2 xl:grid-cols-4">
                    <Input label="GSTIN" maxLength={15} value={registration.gstin} onChange={(event) => updateRegistration(index, "gstin", event.currentTarget.value)} />
                    <div className="md:col-span-2"><Input label="Registered legal name" maxLength={200} value={registration.legalName} onChange={(event) => updateRegistration(index, "legalName", event.currentTarget.value)} /></div>
                    <Select label="Registration type" value={registration.registrationType} onChange={(event) => updateRegistration(index, "registrationType", event.currentTarget.value)}>{["REGULAR", "COMPOSITION", "SEZ_DEVELOPER", "SEZ_UNIT", "INPUT_SERVICE_DISTRIBUTOR", "TAX_DEDUCTOR", "TAX_COLLECTOR", "NON_RESIDENT", "OIDAR", "OTHER"].map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</Select>
                    <Select label="Status" value={registration.status} onChange={(event) => updateRegistration(index, "status", event.currentTarget.value)}>{["ACTIVE", "SUSPENDED", "CANCELLED"].map((status) => <option key={status} value={status}>{status}</option>)}</Select>
                    <div className="md:col-span-2 xl:col-span-4"><Button variant="destructive" size="sm" onClick={() => window.confirm("Remove this GST registration and its linked addresses?") && setForm({ ...form, taxRegistrations: form.taxRegistrations.filter((_, rowIndex) => rowIndex !== index), addresses: form.addresses.filter((address) => address.taxRegistrationGstin !== registration.gstin) })}>Remove GSTIN</Button></div>
                  </div>
                ))}
                {!form.taxRegistrations.length ? <EmptyDetail>No GSTIN is assigned to this contact.</EmptyDetail> : null}
              </section>
            ) : null}
            {activeTab === "billing" || activeTab === "shipping" ? (
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--erp-text)]">
                      {activeTab === "billing" ? "Billing addresses" : "Shipping addresses"}
                    </h2>
                    <p className="text-sm text-slate-500">Addresses are linked to this contact’s single GSTIN where applicable.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setForm({
                      ...form,
                      addresses: [...form.addresses, {
                        taxRegistrationGstin: "",
                        label: "",
                        usage: selectedAddressUsage,
                        addressLine1: "",
                        addressLine2: "",
                        city: "",
                        stateName: "",
                        stateCode: "",
                        postalCode: "",
                        countryCode: "IN",
                        isDefaultBilling: false,
                        isDefaultShipping: false,
                      }],
                    })}
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Add {activeTab === "billing" ? "billing" : "shipping"} address
                  </Button>
                </div>
                {visibleFormAddresses.map(({ address, index }) => (
                  <div key={`${address.id ?? address.label}-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--erp-border)] p-4 md:grid-cols-2 xl:grid-cols-4">
                    <Input label="Address label" value={address.label} onChange={(event) => updateAddress(index, "label", event.currentTarget.value)} />
                    <Select label="GSTIN" value={address.taxRegistrationGstin} onChange={(event) => updateAddress(index, "taxRegistrationGstin", event.currentTarget.value)}><option value="">No GST registration</option>{form.taxRegistrations.map((registration, rowIndex) => <option key={`${registration.gstin}-${rowIndex}`} value={registration.gstin}>{registration.gstin || "New GST registration"}</option>)}</Select>
                    <Select label="Use" value={address.usage} onChange={(event) => updateAddress(index, "usage", event.currentTarget.value as AddressUsage)}><option value="BOTH">Billing and Shipping</option><option value="BILLING">Billing</option><option value="SHIPPING">Shipping</option></Select>
                    <div className="md:col-span-2"><Input label="Address line 1" maxLength={200} value={address.addressLine1} onChange={(event) => updateAddress(index, "addressLine1", event.currentTarget.value)} /></div>
                    <div className="md:col-span-2"><Input label="Address line 2" maxLength={200} value={address.addressLine2} onChange={(event) => updateAddress(index, "addressLine2", event.currentTarget.value)} /></div>
                    <Input label="City" maxLength={100} value={address.city} onChange={(event) => updateAddress(index, "city", event.currentTarget.value)} />
                    <Input label="State" maxLength={100} value={address.stateName} onChange={(event) => updateAddress(index, "stateName", event.currentTarget.value)} />
                    <Input label="GST state code" maxLength={2} value={address.stateCode} onChange={(event) => updateAddress(index, "stateCode", event.currentTarget.value)} hint="Must match the linked GSTIN state code when provided." />
                    <Input label="PIN / postal code" maxLength={20} textCase="preserve" value={address.postalCode} onChange={(event) => updateAddress(index, "postalCode", event.currentTarget.value)} />
                    <Input label="Country code" maxLength={2} value={address.countryCode} onChange={(event) => updateAddress(index, "countryCode", event.currentTarget.value)} />
                    <div className="flex flex-wrap gap-4 md:col-span-2 xl:col-span-4"><Checkbox checked={address.isDefaultBilling} onChange={(event) => updateAddress(index, "isDefaultBilling", event.currentTarget.checked)} label="Default billing for this contact" /><Checkbox checked={address.isDefaultShipping} onChange={(event) => updateAddress(index, "isDefaultShipping", event.currentTarget.checked)} label="Default shipping for this contact" /></div>
                    <div className="md:col-span-2 xl:col-span-4"><Button variant="destructive" size="sm" onClick={() => window.confirm("Remove this address?") && setForm({ ...form, addresses: form.addresses.filter((_, rowIndex) => rowIndex !== index) })}>Remove address</Button></div>
                  </div>
                ))}
                {!visibleFormAddresses.length ? (
                  <EmptyDetail>{`Add a ${activeTab} destination for this contact.`}</EmptyDetail>
                ) : null}
              </section>
            ) : null}
            {activeTab === "bank" ? (
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h2 className="text-base font-semibold text-[var(--erp-text)]">Bank accounts</h2><p className="text-sm text-slate-500">Account numbers are encrypted at rest and masked after save.</p></div>
                  <Button size="sm" variant="secondary" onClick={() => setForm({ ...form, bankAccounts: [...form.bankAccounts, { accountHolderName: form.legalName, accountNumber: "", ifscCode: "", bankName: "", branch: "", isDefault: form.bankAccounts.length === 0 }] })}><Plus aria-hidden="true" className="h-4 w-4" /> Add bank account</Button>
                </div>
                {form.bankAccounts.map((account, index) => (
                  <div key={account.id ?? `new-bank-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--erp-border)] p-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="md:col-span-2"><Input label="Account holder name" maxLength={200} value={account.accountHolderName} onChange={(event) => updateBankAccount(index, "accountHolderName", event.currentTarget.value)} /></div>
                    <div className="md:col-span-2"><Input label={account.id ? `Account number (${account.accountNumberMasked}; blank keeps saved number)` : "Account number"} maxLength={34} textCase="preserve" value={account.accountNumber} onChange={(event) => updateBankAccount(index, "accountNumber", event.currentTarget.value)} /></div>
                    <Input label="IFSC code" maxLength={11} value={account.ifscCode} onChange={(event) => updateBankAccount(index, "ifscCode", event.currentTarget.value)} />
                    <Input label="Bank name" maxLength={120} value={account.bankName} onChange={(event) => updateBankAccount(index, "bankName", event.currentTarget.value)} />
                    <Input label="Branch" maxLength={120} value={account.branch} onChange={(event) => updateBankAccount(index, "branch", event.currentTarget.value)} />
                    <div className="self-end pb-2"><Checkbox checked={account.isDefault} onChange={(event) => updateBankAccount(index, "isDefault", event.currentTarget.checked)} label="Default account" /></div>
                    <div className="md:col-span-2 xl:col-span-4"><Button variant="destructive" size="sm" onClick={() => window.confirm("Remove this bank account?") && setForm({ ...form, bankAccounts: form.bankAccounts.filter((_, rowIndex) => rowIndex !== index) })}>Remove bank account</Button></div>
                  </div>
                ))}
                {!form.bankAccounts.length ? <EmptyDetail>Add a bank account for this contact.</EmptyDetail> : null}
              </section>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--erp-border)] pt-4">
              <span />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={cancelEdit} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}><Save aria-hidden="true" className="h-4 w-4" />{saving ? "Saving…" : createMode ? "Create contact" : "Save changes"}</Button>
              </div>
            </div>
          </form>
        )}
      </Card>
      <Modal
        open={dealerModalOpen}
        onClose={closeDealerModal}
        size="sm"
        ariaLabel="Add Dealer"
        closeOnBackdrop={!mappingLoading}
      >
        <div className="space-y-5 p-6">
          <div>
            <p className="erp-eyebrow">Distributor mapping</p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--erp-text)]">Add Dealer</h2>
          </div>
          <Input
            label="Dealer name"
            type="search"
            value={dealerLookupQuery}
            onChange={(event) => {
              setDealerLookupQuery(event.currentTarget.value);
              setSelectedDealer(null);
            }}
            placeholder="Search contact name or code"
            autoComplete="off"
          />
          {dealerLookupQuery.trim().length >= 2 ? (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--erp-border)]">
              {dealerLookupRows.length ? dealerLookupRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`w-full border-b border-[var(--erp-border)] px-4 py-3 text-left text-sm last:border-b-0 ${
                    selectedDealer?.id === row.id
                      ? "bg-[var(--erp-surface-soft)] font-semibold text-[var(--erp-text)]"
                      : "text-[var(--erp-text)] hover:bg-[var(--erp-surface-soft)]"
                  }`}
                  onClick={() => setSelectedDealer(row)}
                >
                  <span className="block">{row.label}</span>
                  <span className="block text-xs text-[var(--erp-muted)]">{row.code}</span>
                </button>
              )) : <p className="px-4 py-3 text-sm text-[var(--erp-muted)]">No matching Contacts found.</p>}
            </div>
          ) : <p className="text-sm text-[var(--erp-muted)]">Enter at least 2 characters to search Contacts.</p>}
          {activeRoleTab === "AGENT" ? (
            <Input
              label="Commission percentage"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={agentCommissionPercentage}
              onChange={(event) => setAgentCommissionPercentage(event.currentTarget.value)}
              placeholder="0.00"
              textCase="preserve"
            />
          ) : null}
          <div className="flex justify-end gap-2 border-t border-[var(--erp-border)] pt-4">
            <Button type="button" variant="secondary" onClick={closeDealerModal} disabled={mappingLoading}>Cancel</Button>
            <Button type="button" onClick={addDistributorDealer} disabled={mappingLoading || !selectedDealer}>
              {mappingLoading ? "Adding..." : "Add Dealer"}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={roleModalOpen}
        onClose={closeRoleModal}
        size="square"
        ariaLabel={`Add ${mappedEntityLabel} under ${roleLabels.get(activeRoleTab)}`}
        closeOnBackdrop={!mappingLoading}
      >
        <div className="space-y-5 p-6">
          <div>
            <p className="erp-eyebrow">{roleLabels.get(activeRoleTab)} mapping</p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--erp-text)]">Add {mappedEntityLabel}</h2>
          </div>
          <Input
            label={`${mappedEntityLabel} name`}
            type="search"
            value={roleLookupQuery}
            onChange={(event) => {
              setRoleLookupQuery(event.currentTarget.value);
              setSelectedRoleContact(null);
            }}
            placeholder="Search contact name or code"
            autoComplete="off"
          />
          {roleLookupQuery.trim().length >= 2 ? (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--erp-border)]">
              {roleLookupRows.length ? roleLookupRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`w-full border-b border-[var(--erp-border)] px-4 py-3 text-left text-sm last:border-b-0 ${
                    selectedRoleContact?.id === row.id
                      ? "bg-[var(--erp-surface-soft)] font-semibold text-[var(--erp-text)]"
                      : "text-[var(--erp-text)] hover:bg-[var(--erp-surface-soft)]"
                  }`}
                  onClick={() => setSelectedRoleContact(row)}
                >
                  <span className="block">{row.label}</span>
                  <span className="block text-xs text-[var(--erp-muted)]">{row.code}</span>
                </button>
              )) : <p className="px-4 py-3 text-sm text-[var(--erp-muted)]">No matching {mappedEntityLabel.toLowerCase()}s found.</p>}
            </div>
          ) : <p className="text-sm text-[var(--erp-muted)]">Enter at least 2 characters to search {mappedEntityLabel.toLowerCase()}s.</p>}
          <div className="flex justify-end gap-2 border-t border-[var(--erp-border)] pt-4">
            <Button type="button" variant="secondary" onClick={closeRoleModal} disabled={mappingLoading}>Cancel</Button>
            <Button type="button" onClick={addRoleMappedContact} disabled={mappingLoading || !selectedRoleContact}>
              {mappingLoading ? "Adding..." : `Add ${mappedEntityLabel}`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="min-w-0 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4"><dt className="text-xs font-semibold text-slate-600">{label}</dt><dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{value || "—"}</dd></div>;
}

function EmptyDetail({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed border-[var(--erp-border)] px-4 py-6 text-center text-sm text-slate-500">{children}</p>;
}
