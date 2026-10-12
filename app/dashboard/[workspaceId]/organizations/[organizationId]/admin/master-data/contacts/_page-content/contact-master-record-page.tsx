"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Save } from "lucide-react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";

type RoleCode = "CUSTOMER" | "VENDOR" | "AGENT" | "DISTRIBUTOR" | "DEALER";
type AddressUsage = "BILLING" | "SHIPPING" | "BOTH";
type TabId = "contact" | "gst" | "addresses" | "bank";

type ContactData = {
  id: string;
  code: string;
  legal_name: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  roles: Array<{ role_code: RoleCode }>;
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
  bank_accounts: Array<{
    id: string;
    account_holder_name: string;
    account_number_masked: string;
    ifsc_code: string;
    bank_name: string;
    branch: string | null;
    is_default: boolean;
  }>;
};

type ContactForm = {
  code: string;
  legalName: string;
  displayName: string;
  email: string;
  phone: string;
  isActive: boolean;
  roles: RoleCode[];
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
  { value: "contact", label: "Contact & roles" },
  { value: "gst", label: "GST registrations" },
  { value: "addresses", label: "Addresses" },
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
    bankAccounts: contact.bank_accounts.map((account) => ({
      id: account.id,
      accountHolderName: account.account_holder_name,
      accountNumber: "",
      accountNumberMasked: account.account_number_masked,
      ifscCode: account.ifsc_code,
      bankName: account.bank_name,
      branch: account.branch ?? "",
      isDefault: account.is_default,
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
}: {
  organizationId: string;
  workspaceId: string;
  contactId?: string;
  createMode?: boolean;
}) {
  const router = useRouter();
  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/contacts`;
  const [contact, setContact] = useState<ContactData | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [activeTab, setActiveTab] = useState<TabId>("contact");
  const [editing, setEditing] = useState(createMode);
  const [loading, setLoading] = useState(!createMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const roleLabels = useMemo(() => new Map(ROLE_OPTIONS.map((role) => [role.code, role.label])), []);

  useEffect(() => {
    if (!contactId) return;
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
  }, [contactId, endpoint]);

  const title = contact?.display_name || contact?.legal_name || (createMode ? "New contact" : "Contact");
  const detailHref = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/contacts`;

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
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={detailHref} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--erp-brand)] underline-offset-4 hover:underline">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to contacts
          </Link>
          <p className="erp-eyebrow mt-4">Unified Contact Master</p>
          <h1 className="mt-2 break-words text-2xl font-bold text-[var(--erp-text)]">{editing ? (createMode ? "Create contact" : "Edit contact") : title}</h1>
          {!createMode && contact ? <p className="mt-1 text-sm text-slate-600">{contact.code} · {contact.is_active ? "Active" : "Inactive"}</p> : null}
        </div>
        {!editing && contact ? <Button onClick={() => { setForm(toForm(contact)); setEditing(true); setActiveTab("contact"); }}>Edit contact</Button> : null}
      </div>

      {error ? <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}
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
                    ["Business roles", contact.roles.map((role) => roleLabels.get(role.role_code) ?? role.role_code).join(", ")],
                  ].map(([label, value]) => <DetailField key={label} label={label} value={value} />)}
                </dl>
              </>
            ) : null}
            {activeTab === "gst" ? (
              <section className="space-y-4">
                <h2 className="text-base font-semibold text-[var(--erp-text)]">GST registrations</h2>
                {contact.tax_registrations.length ? contact.tax_registrations.map((registration) => (
                  <dl key={registration.gstin} className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--erp-border)] p-4 md:grid-cols-2 xl:grid-cols-4">
                    <DetailField label="GSTIN" value={registration.gstin} />
                    <DetailField label="Registered legal name" value={registration.legal_name} />
                    <DetailField label="Registration type" value={registration.registration_type.replaceAll("_", " ")} />
                    <DetailField label="Status" value={registration.status} />
                  </dl>
                )) : <EmptyDetail>No GST registrations have been added.</EmptyDetail>}
              </section>
            ) : null}
            {activeTab === "addresses" ? (
              <section className="space-y-4">
                <h2 className="text-base font-semibold text-[var(--erp-text)]">Billing and shipping addresses</h2>
                {contact.addresses.length ? contact.addresses.map((address) => (
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
                )) : <EmptyDetail>No billing or shipping addresses have been added.</EmptyDetail>}
              </section>
            ) : null}
            {activeTab === "bank" ? (
              <section className="space-y-4">
                <h2 className="text-base font-semibold text-[var(--erp-text)]">Bank accounts</h2>
                {contact.bank_accounts.length ? contact.bank_accounts.map((account) => (
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
                <h2 className="text-base font-semibold text-[var(--erp-text)]">Contact information and business roles</h2>
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
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-[var(--erp-text)]">Business roles</p>
                  <div className="flex flex-wrap gap-3">{ROLE_OPTIONS.map((role) => <div key={role.code} className="rounded-xl border border-[var(--erp-border)] px-3 py-2"><Checkbox checked={form.roles.includes(role.code)} onChange={(event) => setForm({ ...form, roles: event.currentTarget.checked ? [...form.roles, role.code] : form.roles.filter((item) => item !== role.code) })} label={role.label} /></div>)}</div>
                </div>
              </section>
            ) : null}
            {activeTab === "gst" ? (
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h2 className="text-base font-semibold text-[var(--erp-text)]">GST registrations</h2><p className="text-sm text-slate-500">Each GSTIN is a separate registration.</p></div>
                  <Button size="sm" variant="secondary" onClick={() => setForm({ ...form, taxRegistrations: [...form.taxRegistrations, { gstin: "", legalName: form.legalName, registrationType: "REGULAR", status: "ACTIVE" }] })}><Plus aria-hidden="true" className="h-4 w-4" /> Add GSTIN</Button>
                </div>
                {form.taxRegistrations.map((registration, index) => (
                  <div key={`${registration.gstin}-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--erp-border)] p-4 md:grid-cols-2 xl:grid-cols-4">
                    <Input label="GSTIN" maxLength={15} value={registration.gstin} onChange={(event) => updateRegistration(index, "gstin", event.currentTarget.value)} />
                    <div className="md:col-span-2"><Input label="Registered legal name" maxLength={200} value={registration.legalName} onChange={(event) => updateRegistration(index, "legalName", event.currentTarget.value)} /></div>
                    <Select label="Registration type" value={registration.registrationType} onChange={(event) => updateRegistration(index, "registrationType", event.currentTarget.value)}>{["REGULAR", "COMPOSITION", "SEZ_DEVELOPER", "SEZ_UNIT", "INPUT_SERVICE_DISTRIBUTOR", "TAX_DEDUCTOR", "TAX_COLLECTOR", "NON_RESIDENT", "OIDAR", "OTHER"].map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</Select>
                    <Select label="Status" value={registration.status} onChange={(event) => updateRegistration(index, "status", event.currentTarget.value)}>{["ACTIVE", "SUSPENDED", "CANCELLED"].map((status) => <option key={status} value={status}>{status}</option>)}</Select>
                    <div className="md:col-span-2 xl:col-span-4"><Button variant="destructive" size="sm" onClick={() => window.confirm("Remove this GST registration and its linked addresses?") && setForm({ ...form, taxRegistrations: form.taxRegistrations.filter((_, rowIndex) => rowIndex !== index), addresses: form.addresses.filter((address) => address.taxRegistrationGstin !== registration.gstin) })}>Remove GSTIN</Button></div>
                  </div>
                ))}
                {!form.taxRegistrations.length ? <EmptyDetail>Add GST registrations for this contact.</EmptyDetail> : null}
              </section>
            ) : null}
            {activeTab === "addresses" ? (
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h2 className="text-base font-semibold text-[var(--erp-text)]">Billing and shipping addresses</h2><p className="text-sm text-slate-500">Set billing and shipping defaults separately for each GSTIN.</p></div>
                  <Button size="sm" variant="secondary" onClick={() => setForm({ ...form, addresses: [...form.addresses, { taxRegistrationGstin: "", label: "", usage: "BOTH", addressLine1: "", addressLine2: "", city: "", stateName: "", stateCode: "", postalCode: "", countryCode: "IN", isDefaultBilling: false, isDefaultShipping: false }] })}><Plus aria-hidden="true" className="h-4 w-4" /> Add address</Button>
                </div>
                {form.addresses.map((address, index) => (
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
                    <div className="flex flex-wrap gap-4 md:col-span-2 xl:col-span-4"><Checkbox checked={address.isDefaultBilling} onChange={(event) => updateAddress(index, "isDefaultBilling", event.currentTarget.checked)} label="Default billing for this GSTIN" /><Checkbox checked={address.isDefaultShipping} onChange={(event) => updateAddress(index, "isDefaultShipping", event.currentTarget.checked)} label="Default shipping for this GSTIN" /></div>
                    <div className="md:col-span-2 xl:col-span-4"><Button variant="destructive" size="sm" onClick={() => window.confirm("Remove this address?") && setForm({ ...form, addresses: form.addresses.filter((_, rowIndex) => rowIndex !== index) })}>Remove address</Button></div>
                  </div>
                ))}
                {!form.addresses.length ? <EmptyDetail>Add billing and shipping destinations for this contact.</EmptyDetail> : null}
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
              {contactId ? <Checkbox checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.currentTarget.checked })} label="Active contact" /> : <span />}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={cancelEdit} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}><Save aria-hidden="true" className="h-4 w-4" />{saving ? "Saving…" : createMode ? "Create contact" : "Save changes"}</Button>
              </div>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="min-w-0 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4"><dt className="text-xs font-semibold text-slate-600">{label}</dt><dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{value || "—"}</dd></div>;
}

function EmptyDetail({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed border-[var(--erp-border)] px-4 py-6 text-center text-sm text-slate-500">{children}</p>;
}
