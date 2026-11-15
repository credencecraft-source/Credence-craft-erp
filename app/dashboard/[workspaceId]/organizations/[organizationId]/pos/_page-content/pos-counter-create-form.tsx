"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

type LocationOption = {
  id: string;
  label: string;
};

const PAGE_SIZE = 50;

export default function PosCounterCreateForm({
  organizationId,
  saving,
  onSavingChange,
  onCancel,
  onCreated,
}: {
  organizationId: string;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [counterName, setCounterName] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [search, setSearch] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const submitInFlightRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const loadLocations = useCallback(async (cursor?: string | null, append = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (append) setLoadingMore(true);
    else {
      setLoadingLocations(true);
      setLoadingMore(false);
      setLocations([]);
      setNextCursor(null);
    }
    setLocationError("");

    try {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (search.trim()) query.set("search", search.trim());
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/counter/locations?${query}`,
        { cache: "no-store", signal: controller.signal },
      );
      const data = await response.json() as {
        locations?: LocationOption[];
        nextCursor?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Unable to load active Sub-sub-locations.");
      if (!Array.isArray(data.locations)) throw new Error("The Sub-sub-location response was invalid.");
      setLocations((current) => append ? [...current, ...data.locations!] : data.locations!);
      setNextCursor(data.nextCursor ?? null);
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setLocationError(loadError instanceof Error
          ? loadError.message
          : "Unable to load active Sub-sub-locations.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingLocations(false);
        setLoadingMore(false);
      }
    }
  }, [organizationId, search]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadLocations(), search.trim() ? 200 : 0);
    return () => {
      window.clearTimeout(timeoutId);
      controllerRef.current?.abort();
    };
  }, [loadLocations, search]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    if (submitInFlightRef.current) return;
    if (!counterName.trim()) {
      setSubmitError("Enter a counter name.");
      return;
    }
    if (!selectedLocationId) {
      setSubmitError("Select an active Sub-sub-location.");
      return;
    }

    submitInFlightRef.current = true;
    onSavingChange(true);
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/counter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            counterName,
            subSubLocationId: selectedLocationId,
          }),
        },
      );
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to save the counter.");
      onCreated();
    } catch (saveError) {
      setSubmitError(saveError instanceof Error ? saveError.message : "Unable to save the counter.");
    } finally {
      submitInFlightRef.current = false;
      onSavingChange(false);
    }
  }

  function handleLocationSearchChange(value: string) {
    setLocationSearch(value);
    setSelectedLocationId("");
    setSearch(value);
  }

  return (
    <div className="space-y-4 p-6">
      <header>
        <p className="erp-eyebrow">Point of Sale</p>
        <h2 id="pos-counter-create-title" className="mt-1 text-lg font-semibold text-[var(--erp-text)]">
          Add Counter
        </h2>
        <p className="mt-2 text-sm text-[var(--erp-text-muted)]">
          Enter the counter details and select its active Sub-sub-location.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError ? (
          <p role="alert" className="text-sm text-[var(--erp-danger)]">{submitError}</p>
        ) : null}
        <Input
          label="Counter name"
          name="counterName"
          required
          maxLength={150}
          autoComplete="off"
          disabled={saving}
          value={counterName}
          onChange={(event) => setCounterName(event.target.value)}
        />
        <Input
          label="Search Sub-sub-locations"
          name="locationSearch"
          value={locationSearch}
          disabled={saving}
          onChange={(event) => handleLocationSearchChange(event.target.value)}
          placeholder="Search by location, warehouse, or sub-store"
          autoComplete="off"
        />
        {locationError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--erp-danger)]">{locationError}</p>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => void loadLocations()}
            >
              Retry locations
            </Button>
          </div>
        ) : null}
        <Select
          label="Sub-sub-location"
          name="subSubLocationId"
          required
          value={selectedLocationId}
          disabled={saving || loadingLocations && locations.length === 0}
          onChange={(event) => setSelectedLocationId(event.target.value)}
          hint={loadingLocations && locations.length === 0
            ? "Loading active locations..."
            : "Only active Sub-sub-locations in this organization are available."}
        >
          <option value="">Select an active Sub-sub-location</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>{location.label}</option>
          ))}
        </Select>
        {!loadingLocations && !locationError && locations.length === 0 ? (
          <p role="status" className="text-sm text-[var(--erp-text-muted)]">
            No active Sub-sub-locations found. Configure an active location hierarchy, or try a different search.
          </p>
        ) : null}
        {nextCursor ? (
          <Button
            type="button"
            variant="secondary"
            disabled={saving || loadingMore}
            onClick={() => void loadLocations(nextCursor, true)}
          >
            {loadingMore ? "Loading..." : "Load more locations"}
          </Button>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || loadingLocations && locations.length === 0}>
            {saving ? "Saving..." : "Save Counter"}
          </Button>
        </div>
      </form>
    </div>
  );
}
