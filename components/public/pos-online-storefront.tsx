"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Minus, Plus, Share2, ShoppingBag, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import type { OnlineStorePresentation } from "@/lib/services/pos/public-online-store-service";
import styles from "./pos-online-storefront.module.css";

type StoreEntity = { id: string; name: string };
type Product = {
  id: string;
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
type CartLine = { product: Product; quantity: number };
type ShippingAddress = {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
};
type SavedBag = { cart?: unknown; entityId?: unknown };

const formatAmount = (value: number) => `₹${value.toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;
const SLIDESHOW_FONT_FAMILIES = {
  sans: "var(--font-geist-sans), sans-serif",
  serif: "Georgia, serif",
  rounded: "Trebuchet MS, sans-serif",
} as const;

function priceFor(product: Product) {
  const price = Number(product.sales_price ?? product.mrp ?? 0);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function productKey(product: Product) {
  return `${product.stock_type}:${product.id}`;
}

export default function PosOnlineStorefront({
  storeKey,
  storeName,
  presentation,
  view = "store",
  basePath,
}: {
  storeKey: string;
  storeName: string;
  presentation: OnlineStorePresentation;
  view?: "store" | "cart";
  basePath?: string;
}) {
  const [entities, setEntities] = useState<StoreEntity[]>([]);
  const [entityId, setEntityId] = useState("");
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [cartReady, setCartReady] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [address, setAddress] = useState<ShippingAddress>({
    recipientName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [copied, setCopied] = useState(false);
  const requestKey = useRef("");
  const stockRequest = useRef<AbortController | null>(null);
  const storageKey = `pos-online-store:${storeKey}:bag`;
  const storePath = basePath ?? `/store/${encodeURIComponent(storeKey)}`;
  const cartPath = storePath === "/" ? "/cart" : `${storePath}/cart`;
  const itemCount = cart.reduce((total, line) => total + line.quantity, 0);
  const subtotal = cart.reduce(
    (total, line) => total + (priceFor(line.product) ?? 0) * line.quantity,
    0,
  );
  const cartKeys = useMemo(() => new Set(cart.map(({ product }) => productKey(product))), [cart]);
  const slides = presentation.slides;
  const activeSlide = slides[activeSlideIndex] ?? slides[0] ?? null;

  const saveBag = (nextCart: CartLine[], nextEntityId: string) => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      const previous = saved ? JSON.parse(saved) as SavedBag : {};
      sessionStorage.setItem(storageKey, JSON.stringify({
        ...previous,
        cart: nextCart,
        entityId: nextEntityId,
      }));
      setCart(nextCart);
    } catch {
      setError("Your bag could not be saved in this browser session. Keep this page open while checking out.");
    }
  };

  const updateCart = (nextCart: CartLine[]) => saveBag(nextCart, entityId);

  const updateEntityId = (nextEntityId: string) => {
    setEntityId(nextEntityId);
    saveBag(cart, nextEntityId);
  };

  useEffect(() => {
    let active = true;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as SavedBag;
        if (!Array.isArray(parsed.cart)) throw new Error("The saved bag is invalid.");
        const restoredCart = parsed.cart.map((entry) => {
          if (!entry || typeof entry !== "object" || !("product" in entry) || !("quantity" in entry)) {
            throw new Error("The saved bag is invalid.");
          }
          const line = entry as { product: Product; quantity: number };
          if (
            !line.product
            || typeof line.product.id !== "string"
            || line.product.stock_type !== "SKU"
            || typeof line.product.style_name !== "string"
            || !Number.isInteger(line.quantity)
            || line.quantity < 1
          ) {
            throw new Error("The saved bag is invalid.");
          }
          return line;
        });
        queueMicrotask(() => {
          if (active) setCart(restoredCart);
        });
      }
    } catch {
      queueMicrotask(() => {
        if (active) setError("Your saved bag could not be restored. Please add your items again.");
      });
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        queueMicrotask(() => {
          if (active) setError("Your saved bag could not be cleared. Refresh the page to try again.");
        });
      }
    } finally {
      queueMicrotask(() => {
        if (active) setCartReady(true);
      });
    }
    return () => {
      active = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveSlideIndex((index) => (index + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/public/stores/${encodeURIComponent(storeKey)}/catalog`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { entities?: StoreEntity[]; error?: string };
        if (!response.ok || !Array.isArray(data.entities)) {
          throw new Error(data.error || "This storefront could not be loaded.");
        }
        return data.entities;
      })
      .then((loadedEntities) => {
        if (controller.signal.aborted) return;
        setEntities(loadedEntities);
        let savedEntityId = "";
        try {
          const saved = sessionStorage.getItem(storageKey);
          if (saved) {
            const parsed = JSON.parse(saved) as SavedBag;
            if (typeof parsed.entityId === "string") savedEntityId = parsed.entityId;
          }
        } catch {
          setError("Your saved shop location could not be restored. Please select a location again.");
        }
        setEntityId(
          loadedEntities.some((entity) => entity.id === savedEntityId)
            ? savedEntityId
            : loadedEntities.length === 1 ? loadedEntities[0].id : "",
        );
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "This storefront could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingEntities(false);
      });
    return () => controller.abort();
  }, [storageKey, storeKey]);

  const loadProducts = useCallback(async (signal: AbortSignal, offset = 0) => {
    if (view !== "store" || !entityId || search.trim().length === 1) return;
    if (offset > 0) setLoadingMore(true);
    else setLoadingProducts(true);
    setError("");
    try {
      const query = new URLSearchParams({
        entityId,
        limit: "24",
        offset: String(offset),
      });
      if (search.trim()) query.set("search", search.trim());
      const response = await fetch(
        `/api/public/stores/${encodeURIComponent(storeKey)}/catalog?${query}`,
        { signal },
      );
      const data = await response.json() as { records?: Product[]; hasMore?: boolean; error?: string };
      if (!response.ok || !Array.isArray(data.records)) {
        throw new Error(data.error || "The product collection could not be loaded.");
      }
      if (signal.aborted) return;
      setProducts((current) => offset > 0 ? [...current, ...data.records!] : data.records!);
      setHasMore(data.hasMore === true);
    } catch (loadError) {
      if (!signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "The product collection could not be loaded.");
        if (offset === 0) setProducts([]);
      }
    } finally {
      if (!signal.aborted) {
        setLoadingProducts(false);
        setLoadingMore(false);
      }
    }
  }, [entityId, search, storeKey, view]);

  useEffect(() => {
    stockRequest.current?.abort();
    if (view !== "store" || !entityId || search.trim().length === 1) return;
    const controller = new AbortController();
    stockRequest.current = controller;
    const timeout = window.setTimeout(() => void loadProducts(controller.signal), search.trim() ? 250 : 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      if (stockRequest.current === controller) stockRequest.current = null;
    };
  }, [entityId, loadProducts, search, view]);

  const addProduct = (product: Product) => {
    const available = Math.floor(Number(product.current_stock));
    if (!priceFor(product) || available < 1) return;
    setError("");
    setNotice("");
    const existing = cart.find((line) => productKey(line.product) === productKey(product));
    if (existing) {
      if (existing.quantity >= available) {
        setError(`Only ${available} units are currently available.`);
        return;
      }
      updateCart(cart.map((line) => productKey(line.product) === productKey(product)
        ? { ...line, quantity: line.quantity + 1 }
        : line));
      return;
    }
    updateCart([...cart, { product, quantity: 1 }]);
  };

  const setQuantity = (product: Product, quantity: number) => {
    if (quantity < 1) {
      updateCart(cart.filter((line) => productKey(line.product) !== productKey(product)));
      return;
    }
    const available = Math.floor(Number(product.current_stock));
    if (quantity > available) {
      setError(`Only ${available} units are currently available.`);
      return;
    }
    setError("");
    updateCart(cart.map((line) => productKey(line.product) === productKey(product)
      ? { ...line, quantity }
      : line));
  };

  const updateAddress = (field: keyof ShippingAddress, value: string) => {
    setAddress((current) => ({ ...current, [field]: value }));
  };

  const submitOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId || cart.length === 0 || submitting) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/public/stores/${encodeURIComponent(storeKey)}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId,
          requestKey: requestKey.current || (requestKey.current = crypto.randomUUID()),
          shippingAddress: address,
          lines: cart.map(({ product, quantity }) => ({
            stockId: product.id,
            quantity: String(quantity),
          })),
        }),
      });
      const data = await response.json() as { invoice?: { invoiceNo?: string }; error?: string };
      if (!response.ok || !data.invoice?.invoiceNo) {
        throw new Error(data.error || "Your order could not be placed.");
      }
      requestKey.current = "";
      updateCart([]);
      setInvoiceNumber(data.invoice.invoiceNo);
      setNotice("Thank you — your order is confirmed.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Your order could not be placed.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Unable to copy the store link. Copy it from your browser address bar.");
    }
  };

  const loadMore = () => {
    stockRequest.current?.abort();
    const controller = new AbortController();
    stockRequest.current = controller;
    void loadProducts(controller.signal, products.length);
  };

  return (
    <Page
      as="div"
      data-theme={presentation.themeId}
      className={`${styles.storefront} min-w-0 !m-0 !max-w-none !p-0`}
    >
      <Section className={`${styles.content} space-y-6`}>
        <nav aria-label="Store navigation" className={`${styles.header} flex min-w-0 flex-wrap items-end gap-3`}>
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <span className={`${styles.storeMark} flex size-11 shrink-0 items-center justify-center rounded-xl`}>
              <Store aria-hidden="true" size={22} />
            </span>
            <div className="min-w-0">
              <p className={`${styles.eyebrow} text-xs font-semibold uppercase tracking-wide`}>Official store</p>
              <p className={`${styles.storeName} truncate text-sm font-bold`}>{storeName}</p>
            </div>
          </div>

          {view === "store" ? <div className={`${styles.headerField} w-full sm:w-56`}>
            <Select
              label="Shop location"
              value={entityId}
              onChange={(event) => {
                stockRequest.current?.abort();
                setProducts([]);
                setHasMore(false);
                setLoadingProducts(false);
                setLoadingMore(false);
                updateEntityId(event.target.value);
              }}
              disabled={loadingEntities || entities.length === 0}
              required
              className={`${styles.headerControl} h-9 rounded-lg px-3 py-1.5`}
            >
              <option value="">{loadingEntities ? "Loading locations..." : "Select a location"}</option>
              {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
            </Select>
          </div> : null}

          {view === "store" ? <div className={`${styles.headerField} w-full sm:w-56`}>
            <Input
              label="Search the collection"
              type="search"
              value={search}
              onChange={(event) => {
                stockRequest.current?.abort();
                setProducts([]);
                setHasMore(false);
                setLoadingProducts(false);
                setLoadingMore(false);
                setSearch(event.target.value);
              }}
              placeholder="Style, brand, colour or size"
              disabled={!entityId}
              className={`${styles.headerControl} h-9 rounded-lg px-3 py-1.5`}
            />
          </div> : null}

          <Link
            href={cartPath}
            aria-label={`Your bag, ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
            className={`${styles.actionButton} inline-flex h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold`}
          >
            <ShoppingBag aria-hidden="true" size={18} />
            <span className="whitespace-nowrap">Your bag · {itemCount}</span>
          </Link>

          {view === "store" ? <Button type="button" variant="secondary" onClick={() => void copyLink()} className={styles.actionButton}>
            {copied ? <Check aria-hidden="true" size={16} /> : <Share2 aria-hidden="true" size={16} />}
            {copied ? "Link copied" : "Share store"}
          </Button> : null}
        </nav>

        {view === "store" && activeSlide ? (
          <section aria-label="Store slideshow" aria-roledescription="carousel" className={styles.hero}>
            <Image
              key={activeSlide.id}
              src={activeSlide.imageDataUrl}
              alt=""
              fill
              sizes="100vw"
              unoptimized
              className={styles.heroImage}
              style={{
                filter: presentation.blur ? `blur(${presentation.blur}px)` : undefined,
                transform: presentation.blur ? "scale(1.06)" : undefined,
              }}
            />
            <div className={styles.heroOverlay} />
            <div className={styles.heroContent}>
              <Badge className={styles.heroBadge}>The new collection</Badge>
              {activeSlide.headline ? (
                <h1 className={styles.heroTitle} style={{ fontFamily: SLIDESHOW_FONT_FAMILIES[presentation.fontFamily] }}>
                  {activeSlide.headline}
                </h1>
              ) : null}
              {activeSlide.caption ? (
                <p className={styles.heroCaption} style={{ fontFamily: SLIDESHOW_FONT_FAMILIES[presentation.fontFamily] }}>
                  {activeSlide.caption}
                </p>
              ) : null}
              <a href="#collection" className={styles.heroLink}>
                Explore the collection <ArrowRight aria-hidden="true" size={16} />
              </a>
            </div>
            {slides.length > 1 ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  aria-label="Previous slide"
                  className={`${styles.slideArrow} ${styles.slidePrevious}`}
                  onClick={() => setActiveSlideIndex((index) => (index - 1 + slides.length) % slides.length)}
                >
                  <ChevronLeft aria-hidden="true" size={20} />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  aria-label="Next slide"
                  className={`${styles.slideArrow} ${styles.slideNext}`}
                  onClick={() => setActiveSlideIndex((index) => (index + 1) % slides.length)}
                >
                  <ChevronRight aria-hidden="true" size={20} />
                </Button>
                <div className={styles.slideIndicators} aria-label="Choose slide">
                  {slides.map((slide, index) => (
                    <Button
                      type="button"
                      variant="ghost"
                      key={slide.id}
                      aria-label={`Show slide ${index + 1}`}
                      aria-current={index === activeSlideIndex}
                      className={`${styles.slideIndicator} ${index === activeSlideIndex ? styles.slideIndicatorActive : ""}`}
                      onClick={() => setActiveSlideIndex(index)}
                    >
                      <span className="sr-only">Slide {index + 1}</span>
                    </Button>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {notice ? (
          <Card className={`${styles.surfaceCard} flex flex-wrap items-center justify-between gap-3 border-[var(--erp-success-border)]`}>
            <p role="status" className="erp-status-success">{notice}{invoiceNumber ? ` Invoice ${invoiceNumber}.` : ""}</p>
            <Link href={storePath} className={styles.heroLink}>
              Continue shopping <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </Card>
        ) : null}
        {error ? <p role="alert" className={`${styles.error} erp-status-error`}>{error}</p> : null}

        {view === "cart" ? (
          <section aria-labelledby="cart-page-title" className="space-y-5">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className={`${styles.eyebrow} erp-eyebrow`}>Your selection</p>
                <h1 id="cart-page-title" className={`${styles.collectionTitle} erp-page-heading mt-1`}>Shopping bag</h1>
              </div>
              <Link href={storePath} className={`${styles.eyebrow} text-sm font-semibold`}>
                Continue shopping
              </Link>
            </header>

            {!cartReady || loadingEntities ? (
              <Card className={`${styles.surfaceCard} text-sm text-[var(--erp-muted)]`} role="status">
                Loading your shopping bag…
              </Card>
            ) : !cart.length ? (
              <Card className={`${styles.surfaceCard} space-y-3`}>
                <p className={`font-semibold ${styles.productName}`}>Your bag is empty.</p>
                <p className="text-sm text-[var(--erp-muted)]">Add items from the collection to continue to checkout.</p>
                <Link href={storePath} className={styles.heroLink}>
                  Explore the collection <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </Card>
            ) : (
              <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
                <Card className={`${styles.surfaceCard} space-y-5`}>
                  <div>
                    <p className={`${styles.eyebrow} erp-eyebrow`}>Checkout</p>
                    <h2 className={`mt-1 text-xl font-bold ${styles.productName}`}>Billing &amp; delivery address</h2>
                    <p className="mt-1 text-sm text-[var(--erp-muted)]">
                      This address will be added to your sales invoice. Delivery is currently available within India.
                    </p>
                  </div>
                  <form className="space-y-4" onSubmit={(event) => void submitOrder(event)}>
                    <Select
                      label="Shop location"
                      value={entityId}
                      onChange={(event) => updateEntityId(event.target.value)}
                      disabled={entities.length === 0}
                      required
                    >
                      <option value="">Select a location</option>
                      {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
                    </Select>
                    <Input label="Recipient name" value={address.recipientName} maxLength={200} required
                      onChange={(event) => updateAddress("recipientName", event.target.value)} />
                    <Input label="Phone" type="tel" value={address.phone} maxLength={40} required
                      onChange={(event) => updateAddress("phone", event.target.value)} />
                    <Input label="Address line 1" value={address.addressLine1} maxLength={200} required
                      onChange={(event) => updateAddress("addressLine1", event.target.value)} />
                    <Input label="Address line 2" value={address.addressLine2} maxLength={200}
                      onChange={(event) => updateAddress("addressLine2", event.target.value)} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input label="City" value={address.city} maxLength={100} required
                        onChange={(event) => updateAddress("city", event.target.value)} />
                      <Input label="State" value={address.state} maxLength={100} required
                        onChange={(event) => updateAddress("state", event.target.value)} />
                    </div>
                    <Input label="Postal code" value={address.postalCode} maxLength={20} required
                      onChange={(event) => updateAddress("postalCode", event.target.value)} />
                    <Button type="submit" className={`${styles.primaryButton} w-full`}
                      disabled={submitting || !cart.length || !entityId || !cartReady}>
                      {submitting ? "Placing your order…" : `Place order · ${formatAmount(subtotal)}`}
                    </Button>
                  </form>
                </Card>

                <Card className={`${styles.surfaceCard} space-y-4 lg:sticky lg:top-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`${styles.eyebrow} erp-eyebrow`}>Order summary</p>
                      <h2 className={`mt-1 text-xl font-bold ${styles.productName}`}>Your products</h2>
                    </div>
                    <Badge className={styles.badge}>{itemCount} {itemCount === 1 ? "item" : "items"}</Badge>
                  </div>
                  <ul className="divide-y divide-[var(--erp-border)]">
                    {cart.map(({ product, quantity }) => (
                      <li key={productKey(product)} className="flex items-start justify-between gap-3 py-4">
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-semibold ${styles.productName}`}>{product.style_name}</p>
                          <p className="mt-1 text-xs text-[var(--erp-muted)]">
                            {[product.brand, product.colour, product.size].filter(Boolean).join(" · ") || "Collection piece"}
                          </p>
                          <p className="mt-1 text-xs text-[var(--erp-muted)]">{formatAmount(priceFor(product) ?? 0)} each</p>
                          <div className="mt-3 flex items-center gap-2">
                            <Button type="button" size="sm" variant="secondary" className={styles.secondaryButton}
                              aria-label={`Decrease ${product.style_name}`}
                              onClick={() => setQuantity(product, quantity - 1)}>
                              <Minus aria-hidden="true" size={14} />
                            </Button>
                            <span aria-live="polite" className="min-w-5 text-center text-sm">{quantity}</span>
                            <Button type="button" size="sm" variant="secondary" className={styles.secondaryButton}
                              aria-label={`Increase ${product.style_name}`}
                              onClick={() => setQuantity(product, quantity + 1)}
                              disabled={quantity >= Math.floor(Number(product.current_stock))}>
                              <Plus aria-hidden="true" size={14} />
                            </Button>
                          </div>
                        </div>
                        <p className={`shrink-0 text-sm font-semibold ${styles.productPrice}`}>
                          {formatAmount((priceFor(product) ?? 0) * quantity)}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-2 border-t border-[var(--erp-border)] pt-4">
                    <div className={`flex justify-between gap-3 font-semibold ${styles.productName}`}>
                      <span>Subtotal</span><span>{formatAmount(subtotal)}</span>
                    </div>
                    <p className="text-xs text-[var(--erp-muted)]">Applicable GST is calculated and shown on the invoice.</p>
                  </div>
                </Card>
              </div>
            )}
          </section>
        ) : (
        <div
          id="collection"
          className="grid min-w-0 gap-6"
        >
          <section aria-labelledby="collection-title" className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className={`${styles.eyebrow} erp-eyebrow`}>The collection</p>
                <h2 id="collection-title" className={`${styles.collectionTitle} erp-page-heading mt-1`}>Find your next favourite</h2>
              </div>
              <p className={`text-sm ${styles.eyebrow}`}>
                {products.length ? `${products.length} items shown` : "Curated from available stock"}
              </p>
            </div>

            {loadingEntities ? <p role="status" className="text-sm text-[var(--erp-muted)]">Preparing the collection…</p> : null}
            {!loadingEntities && entities.length === 0 ? (
              <Card className={styles.surfaceCard}><p className="text-sm text-[var(--erp-muted)]">This store has no active shopping locations yet.</p></Card>
            ) : null}
            {search.trim().length === 1 ? (
              <p className="text-sm text-[var(--erp-muted)]">Enter at least two characters to search.</p>
            ) : null}
            {loadingProducts ? <p role="status" className="text-sm text-[var(--erp-muted)]">Finding available pieces…</p> : null}
            {!loadingProducts && entityId && !products.length && search.trim().length !== 1 ? (
              <Card className={`${styles.surfaceCard} text-center`}>
                <ShoppingBag aria-hidden="true" className={`mx-auto ${styles.eyebrow}`} size={24} />
                <p className={`mt-3 font-semibold ${styles.productName}`}>Nothing in this collection just yet</p>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">Try another location or search.</p>
              </Card>
            ) : null}
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => {
                const price = priceFor(product);
                const inCart = cartKeys.has(productKey(product));
                return (
                  <Card key={productKey(product)} className={`${styles.productCard} flex min-w-0 flex-col gap-4`}>
                    <div className={`${styles.productArtwork} flex aspect-[4/3] items-center justify-center rounded-lg border`}>
                      <Store aria-hidden="true" size={32} />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <h3 className={`${styles.productName} truncate font-semibold`}>{product.style_name}</h3>
                      <p className="truncate text-sm text-[var(--erp-muted)]">
                        {[product.brand, product.colour, product.size].filter(Boolean).join(" · ") || "Collection piece"}
                      </p>
                      <p className="text-xs text-[var(--erp-muted)]">{product.article_no || product.order_no}</p>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className={`${styles.productPrice} font-semibold`}>
                          {price === null ? "Price unavailable" : formatAmount(price)}
                        </p>
                        <p className="text-xs text-[var(--erp-muted)]">Before applicable GST</p>
                      </div>
                      <Badge className={styles.badge}>{Number(product.current_stock)} available</Badge>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" className={styles.secondaryButton} onClick={() => addProduct(product)} disabled={!price || !cartReady}>
                        {inCart ? "Add another" : "Add to bag"}
                      </Button>
                      <Link
                        href={cartPath}
                        onClick={(event) => {
                          if (!price || !cartReady || Math.floor(Number(product.current_stock)) < 1) {
                            event.preventDefault();
                            return;
                          }
                          updateCart([{ product, quantity: 1 }]);
                        }}
                        aria-disabled={!price || !cartReady || Math.floor(Number(product.current_stock)) < 1}
                        className={`${styles.primaryButton} inline-flex min-h-9 items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold ${!price || !cartReady || Math.floor(Number(product.current_stock)) < 1 ? "pointer-events-none opacity-50" : ""}`}
                      >
                        Buy now
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
            {hasMore ? (
              <Button type="button" variant="secondary" className={styles.secondaryButton} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Show more"}
                {!loadingMore ? <ChevronDown aria-hidden="true" size={16} /> : null}
              </Button>
            ) : null}
          </section>

        </div>
        )}

        <footer className={`${styles.footer} border-t border-[var(--erp-border)] pt-5 text-sm text-[var(--erp-muted)]`}>
          <p>{storeName} · Public online store</p>
        </footer>
      </Section>
    </Page>
  );
}
