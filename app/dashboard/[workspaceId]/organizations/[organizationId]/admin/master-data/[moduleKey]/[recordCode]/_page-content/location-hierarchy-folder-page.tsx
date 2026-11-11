"use client";

import Link from "next/link";
import { Folder } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type FolderLevel = "locations" | "sub-locations" | "sub-sub-locations";

type FolderRecord = {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
};

function responseError(payload: unknown, fallback: string) {
  return typeof payload === "object" && payload !== null && "error" in payload
    ? String(payload.error)
    : fallback;
}

export default function LocationHierarchyFolderPage({
  workspaceId,
  organizationId,
  entityId,
  entityName,
  divisionId,
  divisionName,
  level,
  locationId,
  locationName,
  subLocationId,
  subLocationName,
}: {
  workspaceId: string;
  organizationId: string;
  entityId: string;
  entityName: string;
  divisionId: string;
  divisionName: string;
  level: FolderLevel;
  locationId?: string;
  locationName?: string;
  subLocationId?: string;
  subLocationName?: string;
}) {
  const [records, setRecords] = useState<FolderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const routeBase = useMemo(() => (
    `/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/master-data/entity/${encodeURIComponent(entityId)}/divisions/${encodeURIComponent(divisionId)}`
  ), [divisionId, entityId, organizationId, workspaceId]);
  const apiBase = useMemo(() => (
    `/api/organizations/${encodeURIComponent(organizationId)}/entities/${encodeURIComponent(entityId)}/divisions/${encodeURIComponent(divisionId)}`
  ), [divisionId, entityId, organizationId]);
  const listUrl = level === "locations"
    ? `${apiBase}/locations`
    : level === "sub-locations"
      ? `${apiBase}/locations/${encodeURIComponent(locationId ?? "")}/sub-locations`
      : `${apiBase}/locations/${encodeURIComponent(locationId ?? "")}/sub-locations/${encodeURIComponent(subLocationId ?? "")}/sub-sub-locations`;
  const title = level === "locations"
    ? "Locations"
    : level === "sub-locations"
      ? "Sub-locations"
      : "Sub-sub-locations";
  const singular = level === "locations"
    ? "Location"
    : level === "sub-locations"
      ? "Sub-location"
      : "Sub-sub-location";

  const loadRecords = useCallback(async () => {
    const response = await fetch(listUrl, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(responseError(payload, `Unable to load ${title.toLowerCase()}.`));
    const values = level === "locations"
      ? payload.locations
      : level === "sub-locations"
        ? payload.subLocations
        : payload.subSubLocations;
    if (!Array.isArray(values)) throw new Error(`The ${title.toLowerCase()} response is invalid.`);
    return values.map((item: Record<string, unknown>) => ({
      id: String(item.id),
      name: String(item.location_name ?? item.node_name ?? ""),
      code: typeof item.node_code === "string" ? item.node_code : null,
      is_active: item.is_active === true,
    }));
  }, [level, listUrl, title]);

  useEffect(() => {
    let active = true;
    void loadRecords()
      .then((loadedRecords) => {
        if (active) {
          setRecords(loadedRecords);
          setError("");
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : `Unable to load ${title.toLowerCase()}.`);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadRecords, title]);

  async function retryLoadRecords() {
    setLoading(true);
    setError("");
    try {
      setRecords(await loadRecords());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : `Unable to load ${title.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(listUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(level === "locations" ? { locationName: name } : { name, code }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(responseError(payload, `Unable to create ${singular}.`));
      setName("");
      setCode("");
      setCreating(false);
      setLoading(true);
      try {
        setRecords(await loadRecords());
        setNotice(`${singular} created.`);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : `Unable to load ${title.toLowerCase()}.`);
        setNotice(`${singular} created, but the list could not be refreshed.`);
      } finally {
        setLoading(false);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : `Unable to create ${singular}.`);
    } finally {
      setSaving(false);
    }
  }

  function folderHref(recordId: string) {
    if (level === "locations") return `${routeBase}/locations/${encodeURIComponent(recordId)}`;
    if (level === "sub-locations") {
      return `${routeBase}/locations/${encodeURIComponent(locationId ?? "")}/sub-locations/${encodeURIComponent(recordId)}`;
    }
    return null;
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        <nav aria-label="Hierarchy breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-[var(--erp-muted)]">
          <Link className="font-semibold text-[var(--erp-brand)] hover:underline" href={`/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/master-data/entity/${encodeURIComponent(entityId)}/divisions`}>
            {entityName}
          </Link>
          <span aria-hidden="true">/</span>
          <Link className="font-semibold text-[var(--erp-brand)] hover:underline" href={routeBase}>
            {divisionName}
          </Link>
          {locationName ? (
            <>
              <span aria-hidden="true">/</span>
              {level === "sub-locations" ? (
                <span className="font-semibold text-[var(--erp-text)]">{locationName}</span>
              ) : (
                <Link
                  className="font-semibold text-[var(--erp-brand)] hover:underline"
                  href={`${routeBase}/locations/${encodeURIComponent(locationId ?? "")}`}
                >
                  {locationName}
                </Link>
              )}
            </>
          ) : null}
          {subLocationName ? (
            <>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-[var(--erp-text)]">{subLocationName}</span>
            </>
          ) : null}
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--erp-muted)]">{divisionName}</p>
            <h1 className="text-2xl font-semibold text-[var(--erp-text)]">{title}</h1>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">
              {locationName ?? divisionName}{subLocationName ? ` / ${subLocationName}` : ""}
            </p>
          </div>
          {!creating ? <Button onClick={() => { setCreating(true); setError(""); setNotice(""); }}>Create {singular}</Button> : null}
        </div>

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface-soft)] p-3 text-sm text-[var(--erp-danger)]" role="alert">
            <span>{error}</span>
            {!creating ? (
              <Button variant="secondary" size="sm" onClick={() => void retryLoadRecords()}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        {notice ? <p className="rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-3 text-sm text-[var(--erp-text)]" role="status">{notice}</p> : null}
        {loading ? <p role="status" className="text-sm text-[var(--erp-muted)]">Loading {title.toLowerCase()}...</p> : null}

        {creating ? (
          <Card className="space-y-4 p-6">
            <h2 className="text-lg font-semibold text-[var(--erp-text)]">New {singular}</h2>
            <form onSubmit={createFolder} className="grid gap-4 sm:grid-cols-2">
              <Input
                label={`${singular} Name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={255}
              />
              {level !== "locations" ? (
                <Input
                  label={`${singular} Code`}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                  maxLength={100}
                />
              ) : null}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={saving}>{saving ? "Creating..." : `Create ${singular}`}</Button>
                <Button variant="secondary" disabled={saving} onClick={() => { setCreating(false); setName(""); setCode(""); }}>Cancel</Button>
              </div>
            </form>
          </Card>
        ) : null}

        {!creating && !loading && !error && records.length === 0 ? (
          <Card className="p-6 text-sm text-[var(--erp-muted)]">No {title.toLowerCase()} yet. Create one to continue this hierarchy.</Card>
        ) : null}
        {!creating && records.length > 0 ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {records.map((record) => {
              const href = folderHref(record.id);
              const content = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Folder aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--erp-brand)]" />
                      <h2 className="truncate font-semibold text-[var(--erp-text)]">{record.name}</h2>
                    </div>
                    <Badge>{record.is_active ? "Active" : "Inactive"}</Badge>
                  </div>
                  {record.code ? <p className="text-sm text-[var(--erp-muted)]">Code: {record.code}</p> : null}
                  <p className="text-xs font-medium text-[var(--erp-brand)]">
                    {level === "locations" ? "Open sub-locations" : level === "sub-locations" ? "Open sub-sub-locations" : singular}
                  </p>
                </>
              );
              return href ? (
                <Link key={record.id} href={href} className="group block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2">
                  <Card className="space-y-3 p-5 transition group-hover:border-[var(--erp-brand)]">{content}</Card>
                </Link>
              ) : (
                <Card key={record.id} className="space-y-3 p-5">{content}</Card>
              );
            })}
          </div>
        ) : null}
      </Section>
    </Page>
  );
}
