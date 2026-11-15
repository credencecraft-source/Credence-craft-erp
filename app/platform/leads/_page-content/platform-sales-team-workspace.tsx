"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type SalesManager = {
  id: string;
  full_name: string;
  email: string;
  mobile_number: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  _count: { assignedPlatformLeads: number };
};

export default function PlatformSalesTeamWorkspace({ managers }: { managers: SalesManager[] }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function createSalesManager(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/platform/leads/sales-managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, mobileNumber }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to create sales manager.");
      setFullName("");
      setEmail("");
      setMobileNumber("");
      setMessage(`${payload.manager.full_name} was added. They can sign in with their registered email OTP.`);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create sales manager.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex min-h-full min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/platform/leads"
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3.5 py-2 text-sm font-semibold text-[var(--erp-text)] shadow-sm hover:bg-[var(--erp-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Leads
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Sales team</h1>
            <p className="text-sm text-slate-600">Add and review Sales Manager accounts.</p>
          </div>
        </div>
      </header>

      <form onSubmit={createSalesManager} className="space-y-4 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--erp-text)]">
          <UserPlus className="h-4 w-4 text-[var(--erp-brand)]" aria-hidden="true" />
          Add Sales Manager
        </h2>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Input label="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={255} />
          <Input label="Email" type="email" textCase="preserve" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={255} />
          <Input label="Mobile number" type="tel" textCase="preserve" value={mobileNumber} onChange={(event) => setMobileNumber(event.target.value)} maxLength={20} />
        </div>
        {error && <p role="alert" className="text-sm text-[var(--erp-danger)]">{error}</p>}
        {message && <p role="status" className="text-sm text-[var(--erp-brand)]">{message}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Adding..." : "Add Sales Manager"}
          </Button>
        </div>
      </form>

      <section className="min-w-0 space-y-3">
        <h2 className="text-base font-semibold text-[var(--erp-text)]">Sales Managers ({managers.length})</h2>
        {managers.length === 0 ? (
          <p className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-6 text-sm text-slate-600">
            No Sales Managers have been added yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)]">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-[var(--erp-border)] bg-[var(--erp-surface-soft)] text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Sales Manager</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assigned leads</th>
                  <th className="px-4 py-3">Last sign-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--erp-border)]">
                {managers.map((manager) => (
                  <tr key={manager.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{manager.full_name}</p>
                      <p className="text-xs text-slate-500">{manager.email}</p>
                    </td>
                    <td className="px-4 py-3">{manager.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-4 py-3">{manager._count.assignedPlatformLeads}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {manager.last_login_at ? new Date(manager.last_login_at).toLocaleString() : "Not signed in"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
