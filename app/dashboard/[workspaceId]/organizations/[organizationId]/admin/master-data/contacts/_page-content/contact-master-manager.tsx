"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, UserRound } from "lucide-react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Table from "@/components/ui/Table";
import ContactMasterExcelActions from "@/components/master-data/contact-master-excel-actions";
import type { ContactWorkbookRecord } from "@/lib/master-data/contact-records-workbook";

type ContactRecord = ContactWorkbookRecord;

const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: "Customer",
  VENDOR: "Vendor",
  AGENT: "Agent",
  DISTRIBUTOR: "Distributor",
  DEALER: "Dealer",
};

export default function ContactMasterManager({ organizationId, workspaceId }: { organizationId: string; workspaceId: string }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/contacts`;
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/contacts`;

  const loadContacts = useCallback(async (query: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}${query ? `?search=${encodeURIComponent(query)}` : ""}`);
      const data = await response.json() as ContactRecord[] | { error?: string };
      if (!response.ok) throw new Error(!Array.isArray(data) ? data.error ?? "Unable to load contacts." : "Unable to load contacts.");
      setContacts(data as ContactRecord[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load contacts.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContacts(search), 200);
    return () => window.clearTimeout(timer);
  }, [loadContacts, search]);

  const deactivateContact = async (contact: ContactRecord) => {
    if (!window.confirm(`Deactivate ${contact.display_name || contact.legal_name}?`)) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(contact.id)}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to deactivate contact.");
      setNotice("Contact deactivated. Existing documents are unchanged.");
      await loadContacts(search);
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : "Unable to deactivate contact.");
    }
  };

  const workbookContacts = contacts.map(({ roles, ...contact }) => ({
    ...contact,
    roles: roles.map((role) => ({ role_code: role.role_code })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/VENDORS`} className="text-sm font-semibold text-[var(--erp-brand)] underline-offset-4 hover:underline">
            Back to Vendors and Contacts
          </Link>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--erp-brand)]">Master data</p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--erp-text)]">Unified Contact Master</h1>
          <p className="mt-2 text-sm text-slate-600">One contact can hold multiple business roles, GST registrations, addresses, and bank accounts.</p>
        </div>
        <Button onClick={() => router.push(`${basePath}/new`)}><Plus aria-hidden="true" className="h-4 w-4" /> New contact</Button>
      </div>

      {error ? <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}
      {notice ? <p className="rounded-xl border border-[var(--erp-success)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-success)]" role="status">{notice}</p> : null}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Input
              label="Search contacts"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search by code, name, or GSTIN"
              aria-label="Search contacts by code, name, or GSTIN"
            />
          </div>
          <ContactMasterExcelActions
            contacts={workbookContacts}
            endpoint={endpoint}
          />
        </div>
        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500" role="status">Loading contacts…</p>
        ) : contacts.length === 0 ? (
          <div className="py-8 text-center">
            <UserRound aria-hidden="true" className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-[var(--erp-text)]">{search ? "No matching contacts." : "No contacts yet."}</p>
            {!search ? <p className="mt-1 text-sm text-slate-500">Create a contact to start assigning business roles and tax registrations.</p> : null}
          </div>
        ) : (
          <Table>
            <thead className="bg-[var(--erp-surface-soft)] text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Roles</th>
                <th className="px-4 py-3">GSTINs</th>
                <th className="px-4 py-3">Addresses / banks</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--erp-border)]">
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`${basePath}/${encodeURIComponent(contact.id)}`}
                      className="rounded font-semibold text-[var(--erp-text)] underline-offset-4 hover:text-[var(--erp-brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
                    >
                      {contact.display_name || contact.legal_name}
                      <span className="mt-1 block text-xs font-normal text-slate-500">{contact.code}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">{contact.roles.map(({ role_code }) => ROLE_LABELS[role_code] ?? role_code).join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-sm">{contact.tax_registrations.map(({ gstin }) => gstin).join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-sm">{contact.addresses.length} / {contact.bank_accounts.length}</td>
                  <td className="px-4 py-3">
                    <span className={contact.is_active ? "rounded-full border border-[var(--erp-success)] bg-[var(--erp-success-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--erp-success)]" : "rounded-full border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] px-2.5 py-1 text-xs font-semibold text-slate-600"}>
                      {contact.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => router.push(`${basePath}/${encodeURIComponent(contact.id)}`)}>Open</Button>
                      {contact.is_active ? <Button size="sm" variant="destructive" onClick={() => void deactivateContact(contact)}>Deactivate</Button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
