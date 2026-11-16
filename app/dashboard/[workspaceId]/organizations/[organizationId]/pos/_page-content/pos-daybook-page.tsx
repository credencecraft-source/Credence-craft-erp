"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Clock3, MapPin, Store } from "lucide-react";
import Link from "next/link";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type CounterRecord = {
  id: string;
  counterName: string;
  routeKey: string;
  subSubLocationId: string;
  subSubLocationPath: string;
  createdAt: string;
};

const PAGE_SIZE = 100;

export default function PosDayBookPage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const [counters, setCounters] = useState<CounterRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  const fetchCounterPage = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) query.set("cursor", cursor);
    const response = await fetch(
      `/api/organizations/${encodeURIComponent(organizationId)}/pos/counter?${query}`,
      { cache: "no-store", signal },
    );
    const data = await response.json() as {
      counters?: CounterRecord[];
      nextCursor?: string | null;
      error?: string;
    };
    const pageCounters = data.counters;
    if (!response.ok || !Array.isArray(pageCounters)) {
      throw new Error(data.error || "Unable to load POS counters.");
    }
    return {
      counters: pageCounters,
      nextCursor: data.nextCursor ?? null,
    };
  }, [organizationId]);

  const loadCounters = useCallback(async (cursor?: string | null, append = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError("");
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setCounters([]);
      setNextCursor(null);
    }

    try {
      const page = await fetchCounterPage(cursor ?? null, controller.signal);
      setCounters((current) => append ? [...current, ...page.counters] : page.counters);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load POS counters.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [fetchCounterPage]);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    void fetchCounterPage(null, controller.signal)
      .then((page) => {
        setCounters(page.counters);
        setNextCursor(page.nextCursor);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load POS counters.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fetchCounterPage]);

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="erp-page-header">
          <div>
            <p className="erp-eyebrow flex items-center gap-2">
              <Store aria-hidden="true" size={16} /> POINT OF SALE
            </p>
            <h1 className="erp-page-heading mt-1">Day Book</h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Select a counter to open its day-book details.
            </p>
          </div>
        </header>

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3" role="alert">
            <p className="text-sm text-[var(--erp-danger)]">{error}</p>
            <Button type="button" variant="secondary" onClick={() => void loadCounters()}>
              Retry
            </Button>
          </div>
        ) : null}

        {loading ? (
          <Card role="status" aria-busy="true">
            <p className="text-sm text-[var(--erp-muted)]">Loading counters...</p>
          </Card>
        ) : null}

        {!loading && !error && counters.length === 0 ? (
          <Card className="space-y-2">
            <h2 className="erp-card-title">No counters found</h2>
            <p className="text-sm text-[var(--erp-muted)]">
              Create a POS counter first. Your counters will appear here.
            </p>
          </Card>
        ) : null}

        {counters.length > 0 ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {counters.map((counter) => (
              <Link
                key={counter.id}
                href={`/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/pos/daybook/COUNTER/${encodeURIComponent(counter.routeKey)}`}
                className="group block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
                aria-label={`Open ${counter.counterName} day book`}
              >
                <Card className="flex h-full flex-col gap-4 transition-colors group-hover:border-[var(--erp-brand)] group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="erp-eyebrow">COUNTER</p>
                      <h2 className="erp-card-title mt-1 break-words">{counter.counterName}</h2>
                    </div>
                    <Badge>POS</Badge>
                  </div>
                  <div className="flex min-w-0 items-start gap-2 text-sm text-[var(--erp-muted)]">
                    <MapPin aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
                    <span className="break-words">{counter.subSubLocationPath}</span>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--erp-border)] pt-4 text-xs text-[var(--erp-muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 aria-hidden="true" size={14} />
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(counter.createdAt))}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-[var(--erp-brand)]">
                      Open day book <ArrowRight aria-hidden="true" size={15} />
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : null}

        {nextCursor ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="secondary"
              disabled={loadingMore}
              onClick={() => void loadCounters(nextCursor, true)}
            >
              {loadingMore ? "Loading..." : "Load more counters"}
            </Button>
          </div>
        ) : null}
      </Section>
    </Page>
  );
}
