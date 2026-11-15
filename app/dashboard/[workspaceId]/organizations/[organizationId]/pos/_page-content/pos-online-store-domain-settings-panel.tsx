"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Globe2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

type DnsRecord = {
  type: "TXT" | "CNAME" | "A";
  name: string;
  value: string;
  purpose: string;
};
type StoreDomain = {
  id: string;
  hostname: string;
  provider: "MANUAL" | "VERCEL";
  status: "PENDING_VERIFICATION" | "VERIFIED";
  isPrimary: boolean;
  verifiedAt: string | null;
  ownershipRecord: DnsRecord;
  providerDnsRecords: DnsRecord[];
};
type DomainSettings = {
  domains?: StoreDomain[];
  integrations?: { vercel?: { configured?: boolean; automaticHttps?: boolean } };
  error?: string;
};

export default function PosOnlineStoreDomainSettingsPanel({
  organizationId,
  storeEnabled,
}: {
  organizationId: string;
  storeEnabled: boolean;
}) {
  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/pos/online-store/domains`;
  const [domains, setDomains] = useState<StoreDomain[]>([]);
  const [vercelConfigured, setVercelConfigured] = useState(false);
  const [provider, setProvider] = useState<"MANUAL" | "VERCEL">("MANUAL");
  const [hostname, setHostname] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyDomainId, setBusyDomainId] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadDomains = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { cache: "no-store", signal });
    const data = await response.json() as DomainSettings;
    if (!response.ok || !Array.isArray(data.domains)) {
      throw new Error(data.error || "Unable to load custom-domain settings.");
    }
    setDomains(data.domains);
    setVercelConfigured(data.integrations?.vercel?.configured === true);
    setLoadFailed(false);
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => loadDomains(controller.signal))
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setLoadFailed(true);
          setError(loadError instanceof Error ? loadError.message : "Unable to load custom-domain settings.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadDomains]);

  const retryLoad = async () => {
    setLoading(true);
    setError("");
    try {
      await loadDomains();
    } catch (loadError) {
      setLoadFailed(true);
      setError(loadError instanceof Error ? loadError.message : "Unable to load custom-domain settings.");
    } finally {
      setLoading(false);
    }
  };

  const submitDomain = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !hostname.trim()) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname, provider }),
      });
      const data = await response.json() as { domain?: StoreDomain; error?: string };
      if (!response.ok || !data.domain) throw new Error(data.error || "Unable to add this domain.");
      setDomains((current) => [data.domain!, ...current]);
      setHostname("");
      setNotice(`${data.domain.hostname} was added. Configure the DNS records below, then verify ownership.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to add this domain.");
    } finally {
      setSaving(false);
    }
  };

  const runDomainAction = async (domain: StoreDomain, action: "verify" | "make-primary") => {
    setBusyDomainId(domain.id);
    setError("");
    setNotice("");
    try {
      const response = action === "verify"
        ? await fetch(`${endpoint}/${encodeURIComponent(domain.id)}/verify`, { method: "POST" })
        : await fetch(`${endpoint}/${encodeURIComponent(domain.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          });
      const data = await response.json() as { domain?: StoreDomain; error?: string };
      if (!response.ok || !data.domain) throw new Error(data.error || "Unable to update this domain.");
      if (action === "make-primary") {
        setDomains((current) => current.map((item) => ({
          ...item,
          isPrimary: item.id === data.domain?.id,
        })));
        setNotice(`${domain.hostname} is now the primary storefront domain.`);
      } else {
        setDomains((current) => current.map((item) => item.id === data.domain?.id ? data.domain! : item));
        setNotice(`${domain.hostname} ownership is verified. Once its DNS and hosting are configured, it can serve your storefront.`);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update this domain.");
    } finally {
      setBusyDomainId("");
    }
  };

  const removeDomain = async (domain: StoreDomain) => {
    setBusyDomainId(domain.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(domain.id)}`, { method: "DELETE" });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to remove this domain.");
      setDomains((current) => current.filter((item) => item.id !== domain.id));
      setConfirmRemoveId("");
      setNotice(`${domain.hostname} was disconnected.`);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove this domain.");
    } finally {
      setBusyDomainId("");
    }
  };

  return (
    <div className="space-y-6">
      {notice ? <p role="status" className="erp-status-success">{notice}</p> : null}
      {error ? <p role="alert" className="erp-status-error">{error}</p> : null}
      {!storeEnabled ? (
        <Card className="text-sm text-[var(--erp-muted)]">
          The online store is unpublished. Connected domains will serve the store after you publish it in General settings.
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <Globe2 aria-hidden="true" className="mt-1 shrink-0 text-[var(--erp-brand)]" size={20} />
          <div className="space-y-1">
            <h2 className="erp-card-title">Connect your own domain</h2>
            <p className="text-sm text-[var(--erp-muted)]">
              Use a domain you own, such as shop.example.com. Your existing private store link continues to work.
            </p>
          </div>
        </div>
        <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(14rem,0.55fr)_auto] md:items-end" onSubmit={(event) => void submitDomain(event)}>
          <Input
            label="Store domain"
            value={hostname}
            onChange={(event) => setHostname(event.target.value)}
            placeholder="shop.example.com"
            maxLength={220}
            required
          />
          <Select
            label="Hosting integration"
            value={provider}
            onChange={(event) => setProvider(event.target.value as "MANUAL" | "VERCEL")}
          >
            <option value="MANUAL">Manual DNS setup</option>
            <option value="VERCEL" disabled={!vercelConfigured}>Vercel project integration</option>
          </Select>
          <Button type="submit" disabled={saving || loading || (provider === "VERCEL" && !vercelConfigured)}>
            {saving ? "Connecting..." : "Add domain"}
          </Button>
        </form>
        <div className="rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Vercel hosting &amp; HTTPS</h3>
            <Badge>{vercelConfigured ? "Integration connected" : "Platform setup required"}</Badge>
          </div>
          <p className="mt-2 text-sm text-[var(--erp-muted)]">
            {vercelConfigured
              ? "Vercel can register domains to the configured project and provide its current DNS targets. TLS certificates are issued automatically after DNS is valid."
              : "Automatic project registration is available when the platform administrator configures VERCEL_API_TOKEN and VERCEL_PROJECT_ID (and VERCEL_TEAM_ID when applicable) on the server. Until then, choose Manual DNS and have the hosting administrator add the domain to the application project. Never put provider tokens in this form."}
          </p>
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex text-sm font-semibold text-[var(--erp-brand)]"
          >
            Open Vercel domain settings
          </a>
        </div>
        <p className="text-xs text-[var(--erp-muted)]">
          DNS changes are made at your domain registrar. Keep existing mail and verification records unchanged. DNS and certificate activation can take time after records are saved.
        </p>
      </Card>

      {loading ? (
        <Card role="status" className="text-sm text-[var(--erp-muted)]">Loading connected domains...</Card>
      ) : loadFailed ? (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--erp-muted)]">Your current domains could not be loaded.</p>
          <Button type="button" variant="secondary" onClick={() => void retryLoad()}>Retry</Button>
        </Card>
      ) : domains.length === 0 ? (
        <Card className="space-y-2">
          <h2 className="erp-card-title">No custom domains connected</h2>
          <p className="text-sm text-[var(--erp-muted)]">Add a domain above to get its ownership verification record and setup instructions.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {domains.map((domain) => (
            <Card key={domain.id} className="space-y-4">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="erp-card-title">{domain.hostname}</h2>
                    <Badge>{domain.status === "VERIFIED" ? "Ownership verified" : "Verification pending"}</Badge>
                    {domain.isPrimary ? <Badge>Primary domain</Badge> : null}
                  </div>
                  <p className="text-sm text-[var(--erp-muted)]">
                    {domain.provider === "VERCEL" ? "Connected to the Vercel project integration." : "Managed through your DNS provider."}
                    {domain.verifiedAt ? ` Verified ${new Date(domain.verifiedAt).toLocaleString()}.` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {domain.status === "VERIFIED" ? (
                    <a
                      href={`https://${domain.hostname}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3.5 py-2 text-sm font-semibold text-[var(--erp-text)] shadow-sm transition-colors hover:bg-[var(--erp-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
                    >
                      <ExternalLink aria-hidden="true" size={16} />
                      Open store
                    </a>
                  ) : null}
                  {domain.status === "PENDING_VERIFICATION" ? (
                    <Button type="button" variant="secondary" disabled={busyDomainId === domain.id}
                      onClick={() => void runDomainAction(domain, "verify")}>
                      <RefreshCw aria-hidden="true" size={16} />
                      {busyDomainId === domain.id ? "Checking..." : "Check DNS"}
                    </Button>
                  ) : null}
                  {domain.status === "VERIFIED" && !domain.isPrimary ? (
                    <Button type="button" variant="secondary" disabled={busyDomainId === domain.id}
                      onClick={() => void runDomainAction(domain, "make-primary")}>
                      <CheckCircle2 aria-hidden="true" size={16} />
                      Make primary
                    </Button>
                  ) : null}
                  <Button type="button" variant="destructive" disabled={busyDomainId === domain.id}
                    onClick={() => setConfirmRemoveId(confirmRemoveId === domain.id ? "" : domain.id)}>
                    <Trash2 aria-hidden="true" size={16} />
                    Disconnect
                  </Button>
                </div>
              </header>

              {confirmRemoveId === domain.id ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--erp-danger)] p-4">
                  <p className="text-sm">Disconnect {domain.hostname}? Its custom URL will stop opening this store.</p>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => setConfirmRemoveId("")}>Keep domain</Button>
                    <Button type="button" variant="destructive" disabled={busyDomainId === domain.id}
                      onClick={() => void removeDomain(domain)}>
                      Confirm disconnect
                    </Button>
                  </div>
                </div>
              ) : null}

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="text-[var(--erp-brand)]" size={18} />
                  <h3 className="text-sm font-semibold">DNS records</h3>
                </div>
                <div className="overflow-x-auto rounded-lg border border-[var(--erp-border)]">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[var(--erp-surface-soft)]">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Name / host</th>
                        <th className="px-3 py-2 font-semibold">Value</th>
                        <th className="px-3 py-2 font-semibold">Purpose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[domain.ownershipRecord, ...domain.providerDnsRecords].map((record, index) => (
                        <tr key={`${record.type}-${record.name}-${index}`} className="border-t border-[var(--erp-border)] align-top">
                          <td className="px-3 py-2 font-medium">{record.type}</td>
                          <td className="px-3 py-2 break-all">{record.name}</td>
                          <td className="px-3 py-2 break-all font-mono text-xs">{record.value}</td>
                          <td className="px-3 py-2 text-[var(--erp-muted)]">{record.purpose}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-[var(--erp-muted)]">
                  Add the TXT ownership record exactly as shown. For Vercel, use the CNAME for a subdomain or A record for an apex domain, following Vercel&apos;s current recommendation; do not add conflicting alternatives. Your registrar may ask for the host portion or @ for the apex. For Manual DNS, your hosting administrator must point this host to the deployed storefront. Then select Check DNS.
                </p>
              </section>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
