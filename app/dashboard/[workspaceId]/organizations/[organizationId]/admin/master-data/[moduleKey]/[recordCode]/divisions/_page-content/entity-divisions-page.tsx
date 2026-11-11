"use client";

import Link from "next/link";
import { Folder } from "lucide-react";
import { useState, type FormEvent } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type DivisionRecord = {
  id: string;
  entity_id: string;
  division_name: string;
  division_code: string;
  description: string | null;
  is_active: boolean;
};

function responseError(payload: unknown, fallback: string) {
  return typeof payload === "object" && payload !== null && "error" in payload
    ? String(payload.error)
    : fallback;
}

function isDivisionRecord(value: unknown): value is DivisionRecord {
  if (typeof value !== "object" || value === null) return false;
  return "id" in value
    && typeof value.id === "string"
    && "entity_id" in value
    && typeof value.entity_id === "string"
    && "division_name" in value
    && typeof value.division_name === "string"
    && "division_code" in value
    && typeof value.division_code === "string"
    && "description" in value
    && (value.description === null || typeof value.description === "string")
    && "is_active" in value
    && typeof value.is_active === "boolean";
}

export default function EntityDivisionsPage({
  workspaceId,
  organizationId,
  entityId,
  entityName,
  initialDivisions,
  profileSaved,
}: {
  workspaceId: string;
  organizationId: string;
  entityId: string;
  entityName: string;
  initialDivisions: DivisionRecord[];
  profileSaved: boolean;
}) {
  const [divisions, setDivisions] = useState(initialDivisions);
  const [creating, setCreating] = useState(false);
  const [divisionName, setDivisionName] = useState("");
  const [divisionCode, setDivisionCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const entityRoute = `/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/master-data/entity/${encodeURIComponent(entityId)}`;
  const divisionsEndpoint = `/api/organizations/${encodeURIComponent(organizationId)}/entities/${encodeURIComponent(entityId)}/divisions`;

  async function createDivision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(divisionsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionName, divisionCode }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(payload, "Unable to create the Division."));
      if (
        typeof payload !== "object"
        || payload === null
        || !("division" in payload)
        || !isDivisionRecord(payload.division)
      ) {
        throw new Error("The Division response is invalid. Refresh and check whether it was created.");
      }
      const division = payload.division;
      setDivisions((current) => [...current, division]
        .sort((left, right) => left.division_name.localeCompare(right.division_name)));
      setDivisionName("");
      setDivisionCode("");
      setCreating(false);
      setNotice("Division created.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create the Division.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--erp-muted)]">{entityName}</p>
            <h1 className="text-2xl font-semibold text-[var(--erp-text)]">Divisions</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`${entityRoute}?mode=edit`}>
              <Button variant="secondary">Edit Entity</Button>
            </Link>
            {!creating ? <Button onClick={() => { setCreating(true); setError(""); setNotice(""); }}>Create Division</Button> : null}
          </div>
        </div>

        {profileSaved ? (
          <p className="rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-3 text-sm text-[var(--erp-text)]" role="status">
            Entity details saved.
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-3 text-sm text-[var(--erp-text)]" role="status">
            {notice}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface-soft)] p-3 text-sm text-[var(--erp-danger)]" role="alert">
            {error}
          </p>
        ) : null}

        {creating ? (
          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-[var(--erp-text)]">New Division</h2>
            <form onSubmit={createDivision} className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Division Name"
                value={divisionName}
                onChange={(event) => setDivisionName(event.target.value)}
                required
                maxLength={255}
              />
              <Input
                label="Division Code"
                value={divisionCode}
                onChange={(event) => setDivisionCode(event.target.value)}
                required
                maxLength={100}
              />
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create Division"}</Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => { setCreating(false); setError(""); setNotice(""); }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        {divisions.length ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {divisions.map((division) => (
              <Link
                key={division.id}
                href={`${entityRoute}/divisions/${encodeURIComponent(division.id)}`}
                className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
                aria-label={`Open ${division.division_name}`}
              >
                <Card className="flex h-full min-h-32 items-start justify-between gap-4 transition-colors group-hover:border-[var(--erp-brand)]">
                  <div className="flex min-w-0 items-start gap-3">
                    <Folder aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--erp-brand)]" />
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold text-[var(--erp-text)] group-hover:text-[var(--erp-brand)]">
                        {division.division_name}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--erp-muted)]">Code: {division.division_code}</p>
                    </div>
                  </div>
                  <Badge>{division.is_active ? "Active" : "Inactive"}</Badge>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="text-sm text-[var(--erp-muted)]">
            No Divisions yet. Create a Division to start organizing this Entity.
          </Card>
        )}
      </Section>
    </Page>
  );
}
