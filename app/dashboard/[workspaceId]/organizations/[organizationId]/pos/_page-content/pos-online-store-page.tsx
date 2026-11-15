"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ShoppingBag, Store, Trash2 } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";

type StoreStockRecord = {
  id: string;
  entity_id: string;
  stock_type: "SKU";
  style_name: string;
  order_no: string;
  article_no: string;
  brand: string | null;
  size: string | null;
  colour: string | null;
  current_stock: number | string;
  gst_rate: number | string | null;
  hsn_code: string | null;
  sales_price: number | string | null;
  mrp: number | string | null;
};

type StoreCartLine = {
  record: StoreStockRecord;
  quantity: number;
};

type StoreEntity = { id: string; label: string };
type ShippingAddress = {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
};

const formatAmount = (value: number) => `₹${value.toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

function catalogPrice(record: StoreStockRecord) {
  const value = Number(record.sales_price ?? record.mrp ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function keyFor(record: StoreStockRecord) {
  return `${record.stock_type}:${record.id}`;
}

export default function PosOnlineStorePage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const [entities, setEntities] = useState<StoreEntity[]>([]);
  const [entityId, setEntityId] = useState("");
  const [entitiesLoading, setEntitiesLoading] = useState(true);
  const [entitiesError, setEntitiesError] = useState("");
  const [records, setRecords] = useState<StoreStockRecord[]>([]);
  const [search, setSearch] = useState("");
  const [stockLoading, setStockLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [stockError, setStockError] = useState("");
  const [cart, setCart] = useState<StoreCartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const requestKey = useRef("");
  const [address, setAddress] = useState<ShippingAddress>({
    recipientName: "",
    phone: "",
    addressLine1: "",
    addressLine2: null,
    city: "",
    state: "",
    postalCode: "",
    countryCode: "IN",
  });
  const cleanSearch = search.trim();
  const cartCount = cart.reduce((total, line) => total + line.quantity, 0);
  const total = cart.reduce(
    (amount, line) => amount + (catalogPrice(line.record) ?? 0) * line.quantity,
    0,
  );
  const cartKeys = useMemo(() => new Set(cart.map((line) => keyFor(line.record))), [cart]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/entity?includeInactive=false&limit=200`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data: unknown = await response.json();
        if (!response.ok || !Array.isArray(data)) {
          throw new Error("Unable to load active organization stores.");
        }
        return data.filter((value): value is StoreEntity =>
          typeof value === "object" && value !== null
          && "id" in value && typeof value.id === "string"
          && "label" in value && typeof value.label === "string",
        );
      })
      .then((loadedEntities) => {
        setEntities(loadedEntities);
        if (loadedEntities.length === 1) setEntityId(loadedEntities[0].id);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setEntitiesError(loadError instanceof Error ? loadError.message : "Unable to load active organization stores.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setEntitiesLoading(false);
      });
    return () => controller.abort();
  }, [organizationId]);

  const activeStockRequest = useRef<AbortController | null>(null);
  const loadStock = useCallback((signal: AbortSignal, offset = 0) => {
    if (!entityId || cleanSearch.length === 1) {
      setRecords([]);
      setStockLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      return;
    }
    if (offset > 0) setLoadingMore(true);
    else setStockLoading(true);
    setStockError("");
    const query = new URLSearchParams({
      entityId,
      stockType: "SKU",
      limit: "50",
      offset: String(offset),
    });
    if (cleanSearch) query.set("search", cleanSearch);
    fetch(`/api/organizations/${encodeURIComponent(organizationId)}/pos/general-stock?${query}`, {
      cache: "no-store",
      signal,
    })
      .then(async (response) => {
      const data = await response.json() as { error?: string; records?: StoreStockRecord[]; hasMore?: boolean };
        if (!response.ok || !Array.isArray(data.records)) {
          throw new Error(data.error || "Unable to load available store stock.");
        }
      return data;
      })
    .then((data) => {
      if (!signal.aborted) {
        setRecords((current) => offset > 0 ? [...current, ...data.records!] : data.records!);
        setHasMore(data.hasMore === true);
      }
    })
    .catch((loadError) => {
      if (!signal.aborted) {
        setStockError(loadError instanceof Error ? loadError.message : "Unable to load available store stock.");
        if (offset === 0) setRecords([]);
      }
    })
    .finally(() => {
      if (!signal.aborted) {
        setStockLoading(false);
        setLoadingMore(false);
      }
    });
  }, [cleanSearch, entityId, organizationId]);

  useEffect(() => {
    activeStockRequest.current?.abort();
    if (!entityId || cleanSearch.length === 1) {
      return;
    }
    const controller = new AbortController();
    activeStockRequest.current = controller;
    const timeoutId = window.setTimeout(() => loadStock(controller.signal), cleanSearch ? 250 : 0);
    return () => {
      window.clearTimeout(timeoutId);
      activeStockRequest.current?.abort();
      activeStockRequest.current = null;
    };
  }, [cleanSearch, entityId, loadStock]);

  const loadMoreStock = () => {
    activeStockRequest.current?.abort();
    const controller = new AbortController();
    activeStockRequest.current = controller;
    loadStock(controller.signal, records.length);
  };

  const addToCart = (record: StoreStockRecord, buyNow = false) => {
    setError("");
    setConfirmation("");
    const available = Math.floor(Number(record.current_stock));
    const lineKey = keyFor(record);
    if (!catalogPrice(record)) {
      setError(`${record.style_name} does not have a catalog sales price.`);
      return;
    }
    if (buyNow) {
      setCart([{ record, quantity: 1 }]);
      setCheckoutOpen(true);
      return;
    }
    setCart((current) => {
      const existing = current.find((line) => keyFor(line.record) === lineKey);
      if (existing && existing.quantity >= available) {
        setError(`Only ${available} units of ${record.style_name} are available.`);
        return current;
      }
      if (existing) {
        return current.map((line) => keyFor(line.record) === lineKey
          ? { ...line, quantity: line.quantity + 1 }
          : line);
      }
      return [...current, { record, quantity: 1 }];
    });
  };

  const changeQuantity = (record: StoreStockRecord, quantity: number) => {
    const maximum = Math.floor(Number(record.current_stock));
    if (quantity < 1) {
      setCart((current) => current.filter((line) => keyFor(line.record) !== keyFor(record)));
      return;
    }
    if (quantity > maximum) {
      setError(`Only ${maximum} units of ${record.style_name} are available.`);
      return;
    }
    setError("");
    setCart((current) => current.map((line) => keyFor(line.record) === keyFor(record)
      ? { ...line, quantity }
      : line));
  };

  const submitOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId || cart.length === 0 || submitting) return;
    setSubmitting(true);
    setError("");
    setConfirmation("");
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/pos/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesChannel: "ONLINE_STORE",
          requestKey: requestKey.current || (requestKey.current = crypto.randomUUID()),
          entityId,
          invoiceDate: new Date().toISOString().slice(0, 10),
          customer: address.recipientName,
          taxMode: "LOCAL",
          shippingAddress: address,
          lines: cart.map(({ record, quantity }) => ({
            stockId: record.id,
            stockType: "SKU",
            quantity: String(quantity),
            rate: String(catalogPrice(record) ?? 0),
            gstRate: String(record.gst_rate ?? 0),
            discountPercent: "0",
            hsnCode: record.hsn_code,
          })),
        }),
      });
      const data = await response.json() as {
        error?: string;
        invoice?: { invoiceNo?: string };
      };
      if (!response.ok || !data.invoice?.invoiceNo) {
        throw new Error(data.error || "Unable to confirm this online-store order.");
      }
      requestKey.current = "";
      setCart([]);
      setCheckoutOpen(false);
      setInvoiceNumber(data.invoice.invoiceNo);
      setConfirmation(`Order confirmed. POS Sales Invoice ${data.invoice.invoiceNo} was posted.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to confirm this online-store order.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateAddress = (field: keyof ShippingAddress, value: string) => {
    setAddress((current) => ({ ...current, [field]: value }));
  };

  return (
    <Page as="div" className="min-w-0">
      <Section className="space-y-6">
        <header className="erp-page-header">
          <div>
            <p className="erp-eyebrow flex items-center gap-2"><Store aria-hidden="true" size={16} /> POS Online Store</p>
            <h1 className="erp-page-heading mt-1">Storefront</h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Browse available POS items, add them to your cart, and complete shipping checkout.
            </p>
          </div>
          <Badge>{cartCount} {cartCount === 1 ? "item" : "items"} in cart</Badge>
        </header>

        {confirmation ? (
          <p role="status" className="erp-status-success">
            {confirmation}{" "}
            {invoiceNumber ? (
              <Link
                className="font-semibold underline"
                href={`/dashboard/${workspaceId}/organizations/${organizationId}/pos/invoice/${encodeURIComponent(invoiceNumber)}`}
              >
                View invoice
              </Link>
            ) : null}
          </p>
        ) : null}
        {error ? <p role="alert" className="erp-status-error">{error}</p> : null}

        <Card className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Entity / Store"
              value={entityId}
              onChange={(event) => {
                activeStockRequest.current?.abort();
                setEntityId(event.target.value);
                setCart([]);
                setRecords([]);
                setHasMore(false);
                setError("");
              }}
              disabled={entitiesLoading || entities.length === 0}
              required
            >
              <option value="">{entitiesLoading ? "Loading stores..." : "Select a store"}</option>
              {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.label}</option>)}
            </Select>
            <Input
              label="Search available POS stock"
              type="search"
              value={search}
              onChange={(event) => {
                activeStockRequest.current?.abort();
                setRecords([]);
                setHasMore(false);
                setStockError("");
                setStockLoading(false);
                setLoadingMore(false);
                setSearch(event.target.value);
              }}
              placeholder="Style, article, colour, or size"
              disabled={!entityId}
            />
          </div>
          {entitiesError ? <p role="alert" className="erp-status-error">{entitiesError}</p> : null}
          {!entitiesLoading && entities.length === 0 && !entitiesError
            ? <p className="text-sm text-[var(--erp-muted)]">No active stores are available for this organization.</p>
            : null}
          {cleanSearch.length === 1
            ? <p className="text-sm text-[var(--erp-muted)]">Enter at least two characters to search.</p>
            : null}
          {stockLoading ? <p role="status">Loading available stock...</p> : null}
          {stockError ? <p role="alert" className="erp-status-error">{stockError}</p> : null}
          {!entityId && !entitiesLoading
            ? <p className="text-sm text-[var(--erp-muted)]">Choose a store to browse eligible in-stock POS items.</p>
            : null}
          {entityId && !stockLoading && !stockError && cleanSearch.length !== 1 && records.length === 0
            ? <p className="text-sm text-[var(--erp-muted)]">No eligible in-stock items were found.</p>
            : null}
          {records.length > 0 ? (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {records.map((record) => {
                const price = catalogPrice(record);
                const available = Math.floor(Number(record.current_stock));
                const inCart = cartKeys.has(keyFor(record));
                return (
                  <Card key={keyFor(record)} className="space-y-4">
                    <div className="space-y-1">
                      <h2 className="erp-card-title">{record.style_name}</h2>
                      <p className="text-sm text-[var(--erp-muted)]">
                        {[record.brand, record.colour, record.size].filter(Boolean).join(" · ") || "POS item"}
                      </p>
                      <p className="text-xs text-[var(--erp-muted)]">
                        {[record.article_no, record.order_no].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-lg font-semibold text-[var(--erp-text)]">
                        {price === null ? "Price not set" : formatAmount(price)}
                      </p>
                      <Badge>{available} in stock</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => addToCart(record)}
                        disabled={!price || available < 1}
                      >
                        <ShoppingBag aria-hidden="true" size={16} />
                        {inCart ? "Add one more" : "Add to cart"}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => addToCart(record, true)}
                        disabled={!price || available < 1}
                      >
                        Buy Now
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="erp-card-title">Cart</h2>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">{cartCount} units · {formatAmount(total)}</p>
            </div>
            <Button
              type="button"
              onClick={() => {
                setCheckoutOpen(true);
                setError("");
              }}
              disabled={cart.length === 0 || !entityId}
            >
              Continue to shipping
            </Button>
          </div>
          {cart.length === 0
            ? <p className="text-sm text-[var(--erp-muted)]">Your cart is empty. Add an available POS item to begin.</p>
            : (
              <ul className="divide-y divide-[var(--erp-border)]">
                {cart.map(({ record, quantity }) => (
                  <li key={keyFor(record)} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--erp-text)]">{record.style_name}</p>
                      <p className="text-sm text-[var(--erp-muted)]">
                        {formatAmount(catalogPrice(record) ?? 0)} each · {quantity} selected
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        aria-label={`Decrease ${record.style_name} quantity`}
                        onClick={() => changeQuantity(record, quantity - 1)}
                      >−</Button>
                      <span aria-live="polite" className="min-w-6 text-center">{quantity}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        aria-label={`Increase ${record.style_name} quantity`}
                        onClick={() => changeQuantity(record, quantity + 1)}
                        disabled={quantity >= Math.floor(Number(record.current_stock))}
                      >+</Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${record.style_name} from cart`}
                        onClick={() => changeQuantity(record, 0)}
                      ><Trash2 aria-hidden="true" size={16} /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </Card>

        {checkoutOpen ? (
          <Card className="space-y-4">
            <div>
              <h2 className="erp-card-title">Shipping and checkout</h2>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">
                Confirming posts a POS Sales Invoice and deducts available stock.
              </p>
            </div>
            <form className="space-y-4" onSubmit={(event) => void submitOrder(event)}>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Input label="Recipient name" value={address.recipientName}
                  onChange={(event) => updateAddress("recipientName", event.target.value)} required maxLength={200} />
                <Input label="Phone" type="tel" value={address.phone}
                  onChange={(event) => updateAddress("phone", event.target.value)} required maxLength={40} />
                <Input label="Address line 1" value={address.addressLine1}
                  onChange={(event) => updateAddress("addressLine1", event.target.value)} required maxLength={200} />
                <Input label="Address line 2" value={address.addressLine2 ?? ""}
                  onChange={(event) => updateAddress("addressLine2", event.target.value)} maxLength={200} />
                <Input label="City" value={address.city}
                  onChange={(event) => updateAddress("city", event.target.value)} required maxLength={100} />
                <Input label="State" value={address.state}
                  onChange={(event) => updateAddress("state", event.target.value)} required maxLength={100} />
                <Input label="Postal code" value={address.postalCode}
                  onChange={(event) => updateAddress("postalCode", event.target.value)} required maxLength={20} />
                <Input label="Country code" value="IN" readOnly />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={submitting || cart.length === 0 || !entityId}>
                  {submitting ? "Confirming..." : `Confirm and post invoice · ${formatAmount(total)}`}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setCheckoutOpen(false)} disabled={submitting}>
                  Cancel
                </Button>
              </div>
            </form>
            {hasMore ? (
              <Button type="button" variant="secondary" onClick={loadMoreStock} disabled={loadingMore}>
                {loadingMore ? "Loading more stock..." : "Load more stock"}
              </Button>
            ) : null}
          </Card>
        ) : null}
      </Section>
    </Page>
  );
}
