"use client";

import Link from "next/link";
import { ArrowLeft, Building2, Save, Users } from "lucide-react";
import { useState } from "react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Switch from "@/components/ui/Switch";
import type { ContactRoleSettingsValues } from "@/lib/services/master-data/contact-role-settings-service";

export default function RoleSettingsPage({
  backHref,
  organizationId,
  contactId,
  roleName,
  scope,
  recordId,
  initialSettings,
}: {
  backHref: string;
  organizationId: string;
  contactId: string;
  roleName: string;
  scope: "common" | "individual";
  recordId?: string;
  initialSettings: ContactRoleSettingsValues;
}) {
  const roleLabel = roleName.charAt(0).toUpperCase() + roleName.slice(1).toLowerCase();
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/contacts/${encodeURIComponent(contactId)}/role-settings/${encodeURIComponent(roleName)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope,
            ...(scope === "individual" && recordId ? { mappedContactId: recordId } : {}),
            settings: {
              enabled: settings.enabled,
              notifications: settings.notifications,
              blockBilling: settings.blockBilling,
              alwaysBillToDistributor: settings.alwaysBillToDistributor,
              allowOrders: settings.allowOrders,
              note: settings.note,
              commissionType: settings.commissionType,
            },
          }),
        },
      );
      const result = await response.json() as ContactRoleSettingsValues | { error?: string };
      if (!response.ok || !("enabled" in result)) {
        throw new Error("error" in result ? result.error ?? "Unable to save role settings." : "Unable to save role settings.");
      }
      setSettings(result);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save role settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--erp-brand)] hover:underline">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to contact
        </Link>
        <Button onClick={() => void save()} disabled={saving}>
          <Save aria-hidden="true" className="h-4 w-4" /> {saving ? "Saving..." : "Save settings"}
        </Button>
      </div>

      <div className="rounded-2xl border border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] px-5 py-5 shadow-[var(--erp-shadow)]">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--erp-brand)] bg-[var(--erp-surface)] text-[var(--erp-brand)]">
            {scope === "common" ? <Users aria-hidden="true" className="h-6 w-6" /> : <Building2 aria-hidden="true" className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--erp-brand)]">
              {scope === "common" ? "Common role settings" : "Individual role settings"}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--erp-text)] md:text-3xl">{roleLabel} settings</h1>
          </div>
        </div>
      </div>

      <Card>
        {roleName === "AGENT" ? (
          <Select
            label="Commission type"
            value={settings.commissionType}
            onChange={(event) => setSettings((current) => ({ ...current, commissionType: event.currentTarget.value as ContactRoleSettingsValues["commissionType"] }))}
            options={[
              { value: "PERCENTAGE", label: "Percentage" },
              { value: "FLAT_PER_PIECE", label: "Flat price per piece" },
            ]}
          />
        ) : roleName === "DISTRIBUTOR" ? (
          <div className="flex items-center justify-between rounded-xl border border-[var(--erp-border)] px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-[var(--erp-text)]">Always Bill To Distributer</p>
              <p className="text-xs text-[var(--erp-muted)]">
                Use the Distributor as the bill-to party for this contact.
              </p>
            </div>
            <Switch
              checked={settings.alwaysBillToDistributor}
              label="Always Bill To Distributer"
              onCheckedChange={(checked) => setSettings((current) => ({ ...current, alwaysBillToDistributor: checked }))}
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border border-[var(--erp-border)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--erp-text)]">Settings enabled</p>
              <p className="text-xs text-[var(--erp-muted)]">
                {scope === "common" ? `Apply to all mapped ${roleLabel} records.` : "Use this settings profile for this record only."}
              </p>
            </div>
            <Switch checked={settings.enabled} label="Enable role settings" onCheckedChange={(checked) => setSettings((current) => ({ ...current, enabled: checked }))} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-[var(--erp-border)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--erp-text)]">Activity notifications</p>
              <p className="text-xs text-[var(--erp-muted)]">Include role activity updates.</p>
            </div>
            <Switch checked={settings.notifications} label="Enable activity notifications" onCheckedChange={(checked) => setSettings((current) => ({ ...current, notifications: checked }))} />
          </div>
          {roleName === "DISTRIBUTOR" ? (
            <>
              <div className="flex items-center justify-between rounded-xl border border-[var(--erp-danger)]/40 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--erp-text)]">
                    {scope === "common" ? "Block Dealer billing" : "Block this Dealer billing"}
                  </p>
                  <p className="text-xs text-[var(--erp-muted)]">
                    {scope === "common"
                      ? "Prevent billing for every Dealer mapped to this Distributor."
                      : "Prevent billing for this mapped Dealer only."}
                  </p>
                </div>
                <Switch checked={settings.blockBilling} label="Block Dealer billing" onCheckedChange={(checked) => setSettings((current) => ({ ...current, blockBilling: checked }))} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--erp-border)] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--erp-text)]">Always Bill To Distributer</p>
                  <p className="text-xs text-[var(--erp-muted)]">
                    {scope === "common"
                      ? "Use the Distributor as the bill-to party for common settings."
                      : "Use this Distributor as the bill-to party for the mapped record."}
                  </p>
                </div>
                <Switch checked={settings.alwaysBillToDistributor} label="Always Bill To Distributer" onCheckedChange={(checked) => setSettings((current) => ({ ...current, alwaysBillToDistributor: checked }))} />
              </div>
            </>
          ) : null}
          <div className="flex items-center justify-between rounded-xl border border-[var(--erp-border)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--erp-text)]">Allow new orders</p>
              <p className="text-xs text-[var(--erp-muted)]">
                {scope === "common" ? "Control order creation for all mapped records." : "Control order creation for this mapped record."}
              </p>
            </div>
            <Switch checked={settings.allowOrders} label="Allow new orders" onCheckedChange={(checked) => setSettings((current) => ({ ...current, allowOrders: checked }))} />
          </div>
          <div className="md:col-span-2">
            <Input
              label="Configuration note"
              value={settings.note}
              onChange={(event) => setSettings((current) => ({ ...current, note: event.target.value }))}
              placeholder="Optional note for this settings profile"
            />
          </div>
          </div>
        )}
      </Card>

      {error ? <p role="alert" className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-danger)]">{error}</p> : null}
      {saved ? <p role="status" className="rounded-xl border border-[var(--erp-success)] bg-[var(--erp-surface)] px-4 py-3 text-sm font-semibold text-[var(--erp-success)]">Settings saved.</p> : null}
    </div>
  );
}
