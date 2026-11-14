"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import FinanceZohoSyncPanel from "./finance-zoho-sync-panel";

type Provider = "NONE" | "TALLY" | "ZOHO_BOOKS";

type Config = {
  activeProvider: Provider;
  autoSync: boolean;
  tallyServerUrl: string;
  tallyCompanyName: string;
  zohoApiRegion: string;
  zohoOrganizationId: string;
  hasZohoClientId: boolean;
  hasZohoClientSecret: boolean;
  hasZohoRefreshToken: boolean;
  ledgerMappings: unknown;
};

const EMPTY_CONFIG: Config = {
  activeProvider: "NONE",
  autoSync: false,
  tallyServerUrl: "",
  tallyCompanyName: "",
  zohoApiRegion: "IN",
  zohoOrganizationId: "",
  hasZohoClientId: false,
  hasZohoClientSecret: false,
  hasZohoRefreshToken: false,
  ledgerMappings: {},
};

export default function FinanceIntegrationSettingsPage({
  workspaceId,
  organizationId,
  pageTitle,
  backHref,
  backLabel,
  showZohoSyncPanel = false,
}: {
  workspaceId: string;
  organizationId: string;
  pageTitle?: string;
  backHref?: string;
  backLabel?: string;
  showZohoSyncPanel?: boolean;
}) {
  const [config, setConfig] = useState<Config>(EMPTY_CONFIG);
  const [zohoClientId, setZohoClientId] = useState("");
  const [zohoClientSecret, setZohoClientSecret] = useState("");
  const [zohoRefreshToken, setZohoRefreshToken] = useState("");
  const [ledgerMappings, setLedgerMappings] = useState("{}");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const endpoint = useMemo(
    () => `/api/organizations/${encodeURIComponent(organizationId)}/finance/integration-config`,
    [organizationId],
  );
  const financeHome = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management`;

  useEffect(() => {
    let active = true;
    fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as Config & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Unable to load integration settings.");
        if (!active) return;
        setConfig(result);
        setLedgerMappings(JSON.stringify(result.ledgerMappings ?? {}, null, 2));
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load integration settings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  async function saveConfiguration(): Promise<boolean> {
    setSaving(true);
    setError(null);
    setNotice(null);
    let mappings: unknown;
    try {
      mappings = JSON.parse(ledgerMappings);
      if (typeof mappings !== "object" || mappings === null || Array.isArray(mappings)) {
        throw new Error("Ledger mappings must be a JSON object.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ledger mappings must be valid JSON.");
      setSaving(false);
      return false;
    }

    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeProvider: config.activeProvider,
          autoSync: config.autoSync,
          tallyServerUrl: config.tallyServerUrl,
          tallyCompanyName: config.tallyCompanyName,
          zohoApiRegion: config.zohoApiRegion,
          zohoOrganizationId: config.zohoOrganizationId,
          zohoClientId,
          zohoClientSecret,
          zohoRefreshToken,
          ledgerMappings: mappings,
        }),
      });
      const result = await response.json() as Config & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save integration settings.");
      setConfig(result);
      setZohoClientId("");
      setZohoClientSecret("");
      setZohoRefreshToken("");
      setNotice("Integration settings saved. Credentials remain masked.");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save integration settings.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveConfiguration();
  }

  async function testConnectionAndSave() {
    setTesting(true);
    setError(null);
    setNotice(null);
    const saved = await saveConfiguration();
    if (!saved) {
      setTesting(false);
      return;
    }

    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-connection" }),
      });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Connection test failed.");
      setNotice(result.message ?? "Connection test succeeded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <Page as="div">
        <Section><p role="status" className="text-sm text-[var(--erp-text-muted)]">Loading integration settings…</p></Section>
      </Page>
    );
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--erp-brand)]">Finance Management</p>
            <h1 className="mt-1 text-2xl font-semibold">{pageTitle ?? "Accounting integrations"}</h1>
            <p className="mt-2 text-sm text-[var(--erp-text-muted)]">Configure tenant-scoped provider credentials and ledger mappings.</p>
          </div>
          <Link href={backHref ?? financeHome}><Button variant="outline">{backLabel ?? "Back to Finance"}</Button></Link>
        </header>

        {error && <p role="alert" className="text-sm font-medium text-[var(--erp-danger)]">{error}</p>}
        {notice && <p role="status" className="text-sm font-medium text-[var(--erp-success)]">{notice}</p>}

        <form className="space-y-6" onSubmit={save}>
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Provider</h2>
              <Badge>{config.activeProvider.replaceAll("_", " ")}</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Active provider"
                value={config.activeProvider}
                onChange={(event) => setConfig((current) => ({ ...current, activeProvider: event.target.value as Provider }))}
                options={[
                  { value: "NONE", label: "Not configured" },
                  { value: "TALLY", label: "Tally Prime" },
                  { value: "ZOHO_BOOKS", label: "Zoho Books" },
                ]}
              />
              <Select
                label="Automatic sync"
                value={config.autoSync ? "true" : "false"}
                onChange={(event) => setConfig((current) => ({ ...current, autoSync: event.target.value === "true" }))}
                options={[
                  { value: "false", label: "Off" },
                  { value: "true", label: "On" },
                ]}
                disabled={config.activeProvider === "NONE"}
              />
            </div>
          </Card>

          {config.activeProvider === "TALLY" && (
            <Card className="space-y-4">
              <h2 className="text-lg font-semibold">Tally Prime</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Tally HTTP server URL"
                  placeholder="http://192.168.1.10:9000"
                  value={config.tallyServerUrl}
                  onChange={(event) => setConfig((current) => ({ ...current, tallyServerUrl: event.target.value }))}
                  textCase="preserve"
                  required
                />
                <Input
                  label="Company name"
                  value={config.tallyCompanyName}
                  onChange={(event) => setConfig((current) => ({ ...current, tallyCompanyName: event.target.value }))}
                  required
                />
              </div>
              <p className="text-sm text-[var(--erp-text-muted)]">For SSRF protection, Tally URLs must use localhost or a private network IP address.</p>
            </Card>
          )}

          {config.activeProvider === "ZOHO_BOOKS" && (
            <Card className="space-y-4">
              <h2 className="text-lg font-semibold">Zoho Books</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Select
                  label="Data-center region"
                  value={config.zohoApiRegion}
                  onChange={(event) => setConfig((current) => ({ ...current, zohoApiRegion: event.target.value }))}
                  options={[
                    { value: "IN", label: "India" },
                    { value: "US", label: "United States" },
                    { value: "EU", label: "Europe" },
                    { value: "AU", label: "Australia" },
                    { value: "CA", label: "Canada" },
                    { value: "JP", label: "Japan" },
                    { value: "SA", label: "Saudi Arabia" },
                  ]}
                />
                <Input
                  label="Zoho organization ID"
                  value={config.zohoOrganizationId}
                  onChange={(event) => setConfig((current) => ({ ...current, zohoOrganizationId: event.target.value }))}
                  textCase="preserve"
                  required
                />
                <Input
                  label="OAuth client ID"
                  type="password"
                  autoComplete="new-password"
                  placeholder={config.hasZohoClientId ? "Saved; leave blank to keep" : "Enter client ID"}
                  value={zohoClientId}
                  onChange={(event) => setZohoClientId(event.target.value)}
                  textCase="preserve"
                />
                <Input
                  label="OAuth client secret"
                  type="password"
                  autoComplete="new-password"
                  placeholder={config.hasZohoClientSecret ? "Saved; leave blank to keep" : "Enter client secret"}
                  value={zohoClientSecret}
                  onChange={(event) => setZohoClientSecret(event.target.value)}
                  textCase="preserve"
                />
                <Input
                  label="OAuth refresh token"
                  type="password"
                  autoComplete="new-password"
                  placeholder={config.hasZohoRefreshToken ? "Saved; leave blank to keep" : "Enter refresh token"}
                  value={zohoRefreshToken}
                  onChange={(event) => setZohoRefreshToken(event.target.value)}
                  textCase="preserve"
                />
              </div>
              <p className="text-sm text-[var(--erp-text-muted)]">Secret values are encrypted at rest and never returned to the browser.</p>
            </Card>
          )}

          <Card className="space-y-4">
            <h2 className="text-lg font-semibold">Ledger and item mappings</h2>
            <Textarea
              label="Mapping rules (JSON)"
              hint="Use provider-specific Tally ledger names and Zoho Books party/item/tax IDs."
              value={ledgerMappings}
              onChange={(event) => setLedgerMappings(event.target.value)}
              rows={12}
              textCase="preserve"
              spellCheck={false}
            />
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save configuration"}</Button>
            <Button type="button" variant="outline" onClick={testConnectionAndSave} disabled={saving || testing || config.activeProvider === "NONE"}>
              {saving || testing ? "Saving and testing…" : "Test Connection & Save"}
            </Button>
          </div>
        </form>

        {showZohoSyncPanel && (
          <FinanceZohoSyncPanel
            workspaceId={workspaceId}
            organizationId={organizationId}
            enabled={config.activeProvider === "ZOHO_BOOKS"}
          />
        )}
      </Section>
    </Page>
  );
}
