"use client";

import { Printer, ScanLine, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";

type StockRecord = {
  id: string;
  entity_id: string;
  stock_type: "SKU" | "GENERAL_GRN";
  style_name: string;
  order_no: string;
  article_no: string;
  brand: string | null;
  size: string | null;
  colour: string | null;
  product_category: string | null;
  sub_product_category: string | null;
  added_time: string;
  added_user: string;
  source: string;
  qty_in: string | number;
  qty_out: string | number;
  current_stock: string | number;
  gst_rate: string | number | null;
  hsn_code: string | null;
  purchase_price: string | number | null;
  sales_price: string | number | null;
  mrp: string | number | null;
};

type BillLine = {
  record: StockRecord;
  quantity: number;
  rate: number;
  gstRate: number;
  hsnCode: string;
  discountPercent: number;
  selectedOfferId: string;
};

type PosOfferOption = {
  id: string;
  offerCode: string;
  name: string;
  offerType: "FLAT_AMOUNT" | "PERCENTAGE" | "BUY_ONE_GET_ONE" | "COMBO";
  scope: "CATEGORY" | "COLOUR" | "SIZE" | "ALL";
  discountAmount: string | null;
  discountPercentage: string | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  getDiscountPercentage: string | null;
  comboPrice: string | null;
  targetLabels: string[];
};

function stockRecordKey(record: Pick<StockRecord, "id" | "stock_type">) {
  return `${record.stock_type}:${record.id}`;
}

function stockAgeInDays(addedTime: string) {
  const addedTimeMilliseconds = Date.parse(addedTime);
  if (!Number.isFinite(addedTimeMilliseconds)) return null;
  return Math.max(0, Math.floor((Date.now() - addedTimeMilliseconds) / 86_400_000));
}

function offerDiscountForLine(line: BillLine, offers: PosOfferOption[]) {
  const offer = offers.find((candidate) => candidate.id === line.selectedOfferId);
  if (!offer) return 0;
  const amountAfterManualDiscount = line.quantity * line.rate * (1 - line.discountPercent / 100);
  let discount = 0;
  switch (offer.offerType) {
    case "FLAT_AMOUNT":
      discount = line.quantity * Number(offer.discountAmount ?? 0);
      break;
    case "PERCENTAGE":
      discount = amountAfterManualDiscount * Number(offer.discountPercentage ?? 0) / 100;
      break;
    case "BUY_ONE_GET_ONE": {
      const packQuantity = (offer.buyQuantity ?? 0) + (offer.getQuantity ?? 0);
      const discountedQuantity = packQuantity > 0
        ? Math.floor(line.quantity / packQuantity) * (offer.getQuantity ?? 0)
        : 0;
      discount = line.quantity > 0
        ? amountAfterManualDiscount * discountedQuantity / line.quantity
          * Number(offer.getDiscountPercentage ?? 0) / 100
        : 0;
      break;
    }
    case "COMBO":
      return 0;
  }
  return Math.min(amountAfterManualDiscount, discount);
}

function lineTaxableAmount(line: BillLine, offers: PosOfferOption[]) {
  return Math.max(
    0,
    line.quantity * line.rate * (1 - line.discountPercent / 100)
      - offerDiscountForLine(line, offers),
  );
}

function offerLabel(offer: PosOfferOption) {
  switch (offer.offerType) {
    case "FLAT_AMOUNT":
      return `${offer.offerCode} — Rs ${offer.discountAmount} off per unit`;
    case "PERCENTAGE":
      return `${offer.offerCode} — ${offer.discountPercentage}% off`;
    case "BUY_ONE_GET_ONE":
      return `${offer.offerCode} — Buy ${offer.buyQuantity}, get ${offer.getQuantity} at ${offer.getDiscountPercentage}% off`;
    case "COMBO":
      return `${offer.offerCode} — Combo price Rs ${offer.comboPrice} (cart-level)`;
  }
}

type GstOption = {
  id: string;
  label: string;
  fields?: Record<string, unknown>;
};
type CustomerContactOption = {
  id: string;
  legal_name: string;
  display_name: string | null;
  phone: string | null;
};
type ReturnCreditOption = {
  id: string;
  returnNumber: string;
  returnDate: string;
  invoiceNumber: string;
  availableAmount: string;
};
type EntityOption = { id: string; label: string };
type HierarchyOption = { id: string; label: string; isActive: boolean };
type HierarchyLevel = "entities" | "divisions" | "locations" | "subLocations" | "subSubLocations";
type StoredFinanceDocument = {
  id: string;
  documentType: string;
  documentNumber: string;
  sourceModule: string;
  sourceRecordId: string;
  date: string;
  party: string;
  amount: number;
  tax: number;
  net: number;
  status: string;
  paymentStatus: string;
  archivedYear: number;
};
export default function PosBarcodeBillingPage({
  workspaceId,
  organizationId,
  salespersonName,
}: {
  workspaceId: string;
  organizationId: string;
  salespersonName: string;
}) {
  const router = useRouter();
  const scannerRef = useRef<HTMLInputElement>(null);
  const saleRequestKey = useRef("");
  const [scanValue, setScanValue] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [records, setRecords] = useState<StockRecord[]>([]);
  const [stockSearchLoading, setStockSearchLoading] = useState(false);
  const [stockSearchError, setStockSearchError] = useState("");
  const [hasMoreStockResults, setHasMoreStockResults] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<StockRecord | null>(
    null,
  );
  const [billLines, setBillLines] = useState<BillLine[]>([]);
  const [offersByStock, setOffersByStock] = useState<Record<string, PosOfferOption[]>>({});
  const [offerLookupLoading, setOfferLookupLoading] = useState(false);
  const [offerLookupError, setOfferLookupError] = useState("");
  const [offerLookupErrorKey, setOfferLookupErrorKey] = useState("");
  const [offersLoadedForKey, setOffersLoadedForKey] = useState("");
  const [offerLimitReached, setOfferLimitReached] = useState(false);
  const [offerLookupRetry, setOfferLookupRetry] = useState(0);
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [divisions, setDivisions] = useState<HierarchyOption[]>([]);
  const [locations, setLocations] = useState<HierarchyOption[]>([]);
  const [subLocations, setSubLocations] = useState<HierarchyOption[]>([]);
  const [subSubLocations, setSubSubLocations] = useState<HierarchyOption[]>([]);
  const [entityId, setEntityId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [subLocationId, setSubLocationId] = useState("");
  const [subSubLocationId, setSubSubLocationId] = useState("");
  const [hierarchyLoading, setHierarchyLoading] = useState<Record<HierarchyLevel, boolean>>({
    entities: true,
    divisions: false,
    locations: false,
    subLocations: false,
    subSubLocations: false,
  });
  const [hierarchyErrors, setHierarchyErrors] = useState<Record<HierarchyLevel, string>>({
    entities: "",
    divisions: "",
    locations: "",
    subLocations: "",
    subSubLocations: "",
  });
  const [hierarchyRetry, setHierarchyRetry] = useState(0);
  const [customerContactId, setCustomerContactId] = useState("");
  const [customerDisplayName, setCustomerDisplayName] = useState("");
  const [returnCredits, setReturnCredits] = useState<ReturnCreditOption[]>([]);
  const [returnCreditError, setReturnCreditError] = useState("");
  const [returnCreditLoadedFor, setReturnCreditLoadedFor] = useState("");
  const selectCustomer = (contactId: string) => {
    setReturnCredits([]);
    setReturnCreditError("");
    setReturnCreditLoadedFor("");
    setCustomerContactId(contactId);
  };
  const [couponCode, setCouponCode] = useState("");
  const [purchaseRewardCheck, setPurchaseRewardCheck] = useState<{
    key: string;
    status: "available" | "unavailable" | "error";
  } | null>(null);
  const [invoiceDate, setInvoiceDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [taxMode] = useState<"LOCAL" | "INTERSTATE">("LOCAL");
  const otherCharges = "0";
  const [gstOptions, setGstOptions] = useState<GstOption[]>([]);
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerLookupStatus, setCustomerLookupStatus] = useState<
    "idle" | "loading" | "matched" | "error"
  >("idle");
  const [customerLookupMessage, setCustomerLookupMessage] = useState("");
  const [customerRegistrationOpen, setCustomerRegistrationOpen] = useState(false);
  const [customerRegistrationName, setCustomerRegistrationName] = useState("");
  const [customerRegistrationError, setCustomerRegistrationError] = useState("");
  const [customerSubmitting, setCustomerSubmitting] = useState(false);
  const customerLookupKeyRef = useRef("");
  const customerLookupControllerRef = useRef<AbortController | null>(null);
  const customerNameInputRef = useRef<HTMLInputElement>(null);
  const customerRegistrationMobile = useRef("");
  const [taxProfile, setTaxProfile] = useState<{
    cgstRate?: number | null;
    sgstRate?: number | null;
    igstRate?: number | null;
  } | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [error, setError] = useState("");
  const billLineKeys = useMemo(
    () => billLines.map((line) => stockRecordKey(line.record)).join("|"),
    [billLines],
  );
  const offerLookupKey = `${organizationId}|${entityId}|${invoiceDate}|${billLineKeys}`;
  const visibleOffersByStock = useMemo(
    () => offersLoadedForKey === offerLookupKey ? offersByStock : {},
    [offersByStock, offersLoadedForKey, offerLookupKey],
  );
  const visibleOfferLookupLoading = offerLookupLoading
    || Boolean(entityId && billLineKeys && offersLoadedForKey !== offerLookupKey && offerLookupErrorKey !== offerLookupKey);
  const visibleOfferLookupError = offerLookupErrorKey === offerLookupKey ? offerLookupError : "";
  const visibleOfferLimitReached = offersLoadedForKey === offerLookupKey && offerLimitReached;
  const stockHierarchyComplete = Boolean(
    entityId && divisionId && locationId && subLocationId && subSubLocationId,
  );
  const resetStockAndCart = () => {
    setSelectedRecord(null);
    setRecords([]);
    setBillLines([]);
    setOffersByStock({});
    setOffersLoadedForKey("");
    setOfferLookupError("");
    setOfferLookupErrorKey("");
    setOfferLookupLoading(false);
    setHasMoreStockResults(false);
    setStockSearch("");
    setStockSearchError("");
    setStockSearchLoading(false);
    setScanValue("");
    setError("");
  };

  useEffect(() => {
    scannerRef.current?.focus();
    const controller = new AbortController();
    Promise.all([
      fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/master-data/gst?includeInactive=false`,
        { cache: "no-store", signal: controller.signal },
      ).then((response) => response.json()),
      fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/tax-rules`,
        { cache: "no-store", signal: controller.signal },
      ).then((response) => response.json()),
      fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/master-data/entity?includeInactive=false&limit=200`,
        { cache: "no-store", signal: controller.signal },
      ).then(async (response) => {
        const data: unknown = await response.json();
        if (!response.ok || !Array.isArray(data)) {
          throw new Error("Unable to load active organization Entities.");
        }
        return data.filter((value): value is EntityOption =>
          typeof value === "object" && value !== null
          && "id" in value && typeof value.id === "string"
          && "label" in value && typeof value.label === "string",
        );
      }),
    ])
      .then(([gstData, taxData, entityData]) => {
        if (controller.signal.aborted) return;
        setGstOptions(Array.isArray(gstData) ? gstData : []);
        setTaxProfile(taxData.profile ?? null);
        setEntities(entityData);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        const message = loadError instanceof Error ? loadError.message : "Unable to load active organization Entities.";
        setHierarchyErrors((current) => ({ ...current, entities: message }));
        setError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setHierarchyLoading((current) => ({ ...current, entities: false }));
        }
      });
    return () => controller.abort();
  }, [hierarchyRetry, organizationId]);

  useEffect(() => {
    if (!entityId) return;
    const controller = new AbortController();
    void fetch(`/api/organizations/${encodeURIComponent(organizationId)}/entities/${encodeURIComponent(entityId)}/divisions`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as { error?: string; divisions?: Array<Record<string, unknown>> };
        if (!response.ok || !Array.isArray(data.divisions)) throw new Error(data.error || "Unable to load active Divisions.");
        return data.divisions
          .filter((item) => item.is_active === true && typeof item.id === "string" && typeof item.division_name === "string")
          .map((item) => ({ id: item.id as string, label: item.division_name as string, isActive: true }));
      })
      .then((options) => { if (!controller.signal.aborted) setDivisions(options); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setHierarchyErrors((current) => ({
          ...current,
          divisions: cause instanceof Error ? cause.message : "Unable to load active Divisions.",
        }));
      })
      .finally(() => {
        if (!controller.signal.aborted) setHierarchyLoading((current) => ({ ...current, divisions: false }));
      });
    return () => controller.abort();
  }, [entityId, hierarchyRetry, organizationId]);

  useEffect(() => {
    if (!entityId || !divisionId) return;
    const controller = new AbortController();
    void fetch(`/api/organizations/${encodeURIComponent(organizationId)}/entities/${encodeURIComponent(entityId)}/divisions/${encodeURIComponent(divisionId)}/locations`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as { error?: string; locations?: Array<Record<string, unknown>> };
        if (!response.ok || !Array.isArray(data.locations)) throw new Error(data.error || "Unable to load active Locations.");
        return data.locations
          .filter((item) => item.is_active === true && typeof item.id === "string" && typeof item.location_name === "string")
          .map((item) => ({ id: item.id as string, label: item.location_name as string, isActive: true }));
      })
      .then((options) => { if (!controller.signal.aborted) setLocations(options); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setHierarchyErrors((current) => ({
          ...current,
          locations: cause instanceof Error ? cause.message : "Unable to load active Locations.",
        }));
      })
      .finally(() => {
        if (!controller.signal.aborted) setHierarchyLoading((current) => ({ ...current, locations: false }));
      });
    return () => controller.abort();
  }, [divisionId, entityId, hierarchyRetry, organizationId]);

  useEffect(() => {
    if (!entityId || !divisionId || !locationId) return;
    const controller = new AbortController();
    void fetch(`/api/organizations/${encodeURIComponent(organizationId)}/entities/${encodeURIComponent(entityId)}/divisions/${encodeURIComponent(divisionId)}/locations/${encodeURIComponent(locationId)}/sub-locations`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as { error?: string; subLocations?: Array<Record<string, unknown>> };
        if (!response.ok || !Array.isArray(data.subLocations)) throw new Error(data.error || "Unable to load active Sub-locations.");
        return data.subLocations
          .filter((item) => item.is_active === true && typeof item.id === "string" && typeof item.node_name === "string")
          .map((item) => ({ id: item.id as string, label: item.node_name as string, isActive: true }));
      })
      .then((options) => { if (!controller.signal.aborted) setSubLocations(options); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setHierarchyErrors((current) => ({
          ...current,
          subLocations: cause instanceof Error ? cause.message : "Unable to load active Sub-locations.",
        }));
      })
      .finally(() => {
        if (!controller.signal.aborted) setHierarchyLoading((current) => ({ ...current, subLocations: false }));
      });
    return () => controller.abort();
  }, [divisionId, entityId, hierarchyRetry, locationId, organizationId]);

  useEffect(() => {
    if (!entityId || !divisionId || !locationId || !subLocationId) return;
    const controller = new AbortController();
    void fetch(`/api/organizations/${encodeURIComponent(organizationId)}/entities/${encodeURIComponent(entityId)}/divisions/${encodeURIComponent(divisionId)}/locations/${encodeURIComponent(locationId)}/sub-locations/${encodeURIComponent(subLocationId)}/sub-sub-locations`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as { error?: string; subSubLocations?: Array<Record<string, unknown>> };
        if (!response.ok || !Array.isArray(data.subSubLocations)) throw new Error(data.error || "Unable to load active Sub-sub-locations.");
        return data.subSubLocations
          .filter((item) => item.is_active === true && typeof item.id === "string" && typeof item.node_name === "string")
          .map((item) => ({ id: item.id as string, label: item.node_name as string, isActive: true }));
      })
      .then((options) => { if (!controller.signal.aborted) setSubSubLocations(options); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setHierarchyErrors((current) => ({
          ...current,
          subSubLocations: cause instanceof Error ? cause.message : "Unable to load active Sub-sub-locations.",
        }));
      })
      .finally(() => {
        if (!controller.signal.aborted) setHierarchyLoading((current) => ({ ...current, subSubLocations: false }));
      });
    return () => controller.abort();
  }, [divisionId, entityId, hierarchyRetry, locationId, organizationId, subLocationId]);

  useEffect(() => {
    if (!customerContactId) return;
    const controller = new AbortController();
    void fetch(
      `/api/organizations/${encodeURIComponent(organizationId)}/pos/sales/return-credits?customerContactId=${encodeURIComponent(customerContactId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json() as { error?: string; credits?: ReturnCreditOption[] };
        if (!response.ok || !Array.isArray(data.credits)) {
          throw new Error(data.error || "Unable to load sales-return credits.");
        }
        if (controller.signal.aborted) return;
        setReturnCredits(data.credits);
        setReturnCreditLoadedFor(customerContactId);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setReturnCreditError(cause instanceof Error ? cause.message : "Unable to load sales-return credits.");
        }
      });
    return () => controller.abort();
  }, [customerContactId, organizationId]);

  useEffect(() => {
    if (!entityId || !billLineKeys) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      eligibleStock: "true",
      entityId,
      invoiceDate,
    });
    billLineKeys.split("|").forEach((key) => query.append("stock", key));
    const lookupOffers = async () => {
      setOfferLookupLoading(true);
      setOfferLookupError("");
      setOfferLookupErrorKey("");
      try {
        const response = await fetch(
          `/api/organizations/${encodeURIComponent(organizationId)}/pos/offers?${query.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json() as {
          error?: string;
          offersByStock?: Record<string, PosOfferOption[]>;
          offerLimitReached?: boolean;
        };
        if (!response.ok || !data.offersByStock) {
          throw new Error(data.error || "Unable to load eligible offers for invoice items.");
        }
        if (controller.signal.aborted) return;
        setOffersByStock(data.offersByStock ?? {});
        setOfferLimitReached(data.offerLimitReached === true);
        setOffersLoadedForKey(offerLookupKey);
        setBillLines((current) => current.map((line) => {
          if (!line.selectedOfferId) return line;
          const eligible = data.offersByStock?.[stockRecordKey(line.record)] ?? [];
          return eligible.some((offer) => offer.id === line.selectedOfferId)
            ? line
            : { ...line, selectedOfferId: "" };
        }));
      } catch (lookupError: unknown) {
        if (!controller.signal.aborted) {
          setOfferLookupError(
            lookupError instanceof Error
              ? lookupError.message
              : "Unable to load eligible offers for invoice items.",
          );
          setOfferLookupErrorKey(offerLookupKey);
        }
      } finally {
        if (!controller.signal.aborted) setOfferLookupLoading(false);
      }
    };
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return lookupOffers();
      return undefined;
    });
    return () => controller.abort();
  }, [billLineKeys, entityId, invoiceDate, offerLookupKey, offerLookupRetry, organizationId]);

  useEffect(() => {
    if (!stockHierarchyComplete) return;
    const search = stockSearch.trim();
    if (search.length === 1) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setStockSearchLoading(true);
      setStockSearchError("");
      try {
        const query = new URLSearchParams({
          entityId,
          divisionId,
          locationId,
          subLocationId,
          subSubLocationId,
        });
        if (search) query.set("search", search);
        const response = await fetch(
          `/api/organizations/${encodeURIComponent(organizationId)}/pos/general-stock?${query.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = (await response.json()) as {
          error?: string;
          records?: StockRecord[];
          hasMore?: boolean;
        };
        if (!response.ok) throw new Error(data.error || "Unable to search General stock.");
        if (!controller.signal.aborted) {
          setRecords(Array.isArray(data.records) ? data.records : []);
          setHasMoreStockResults(data.hasMore === true);
        }
      } catch (searchError) {
        if (!controller.signal.aborted) {
          setStockSearchError(searchError instanceof Error ? searchError.message : "Unable to search General stock.");
          setRecords([]);
          setHasMoreStockResults(false);
        }
      } finally {
        if (!controller.signal.aborted) setStockSearchLoading(false);
      }
    }, search ? 250 : 0);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [divisionId, entityId, locationId, organizationId, stockHierarchyComplete, stockSearch, subLocationId, subSubLocationId]);

  const lookupCustomerByMobile = async () => {
    const mobile = customerMobile;
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      customerLookupControllerRef.current?.abort();
      customerLookupKeyRef.current = "";
      selectCustomer("");
      setCustomerDisplayName("");
      setCustomerLookupStatus("error");
      setCustomerLookupMessage("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (customerLookupKeyRef.current === mobile) return;
    customerLookupKeyRef.current = mobile;
    customerLookupControllerRef.current?.abort();
    const controller = new AbortController();
    customerLookupControllerRef.current = controller;
    setCustomerMobile(mobile);
    customerRegistrationMobile.current = mobile;
    selectCustomer("");
    setCustomerDisplayName("");
    setCustomerLookupMessage("");
    setCustomerLookupStatus("loading");
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/contacts?mobile=${encodeURIComponent(mobile)}`,
        { cache: "no-store", signal: controller.signal },
      );
      const data = await response.json() as {
        error?: string;
        records?: CustomerContactOption[];
      };
      if (!response.ok || !Array.isArray(data.records)) {
        throw new Error(data.error || "Unable to look up this customer.");
      }
      if (controller.signal.aborted) return;
      if (data.records.length > 1) {
        customerLookupKeyRef.current = "";
        setCustomerLookupStatus("error");
        setCustomerLookupMessage("More than one customer account uses this mobile number. Resolve the duplicate in Customer Master.");
        return;
      }
      const contact = data.records[0];
      if (contact) {
        selectCustomer(contact.id);
        setCustomerDisplayName(contact.display_name || contact.legal_name);
        setCustomerLookupStatus("matched");
        return;
      }
      setCustomerRegistrationName("");
      setCustomerRegistrationError("");
      setCustomerLookupStatus("idle");
      setCustomerRegistrationOpen(true);
    } catch (lookupError) {
      if (controller.signal.aborted) return;
      customerLookupKeyRef.current = "";
      setCustomerLookupStatus("error");
      setCustomerLookupMessage(
        lookupError instanceof Error ? lookupError.message : "Unable to look up this customer.",
      );
    }
  };

  const createCustomer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = customerRegistrationName.trim();
    const mobile = customerRegistrationMobile.current;
    if (!name || customerSubmitting) return;
    setCustomerSubmitting(true);
    setCustomerRegistrationError("");
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/contacts`,
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: name,
          displayName: name,
          phone: mobile,
          isActive: true,
          roles: ["CUSTOMER"],
          taxRegistrations: [],
          addresses: [],
          bankAccounts: [],
        }),
        },
      );
      const data = (await response.json()) as {
        error?: string;
        id?: string;
        legal_name?: string;
        display_name?: string | null;
        phone?: string | null;
      };
      if (!response.ok || !data.id || !data.legal_name) {
        throw new Error(data.error || "Unable to create customer contact.");
      }
      const createdContact: CustomerContactOption = {
        id: data.id,
        legal_name: data.legal_name,
        display_name: data.display_name ?? null,
        phone: data.phone ?? mobile,
      };
      selectCustomer(createdContact.id);
      setCustomerDisplayName(createdContact.display_name || createdContact.legal_name);
      customerLookupKeyRef.current = mobile;
      setCustomerLookupStatus("matched");
      setCustomerLookupMessage("");
      setCustomerRegistrationOpen(false);
    } catch (createError) {
      setCustomerRegistrationError(
        createError instanceof Error
          ? createError.message
          : "Unable to create customer contact.",
      );
    } finally {
      setCustomerSubmitting(false);
    }
  };

  const lookupRecord = async (event: React.FormEvent) => {
    event.preventDefault();
    const barcode = scanValue.trim();
    if (!barcode || loading) return;
    if (!stockHierarchyComplete) {
      setError("Select the complete stock hierarchy through a Sub-sub-location before scanning or finding stock.");
      return;
    }
    const [referenceType, referenceId] = barcode.split(":", 2);
    const stockType = referenceType === "SKU" || referenceType === "GENERAL_GRN"
      ? referenceType
      : null;
    const stockId = stockType ? referenceId : barcode;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        entityId,
        divisionId,
        locationId,
        subLocationId,
        subSubLocationId,
        stockId,
      });
      if (stockType) query.set("stockType", stockType);
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/general-stock?${query.toString()}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as {
        error?: string;
        records?: StockRecord[];
      };
      if (!response.ok)
        throw new Error(data?.error || "Unable to find this stock barcode.");
      const record = data.records?.[0];
      if (!record) throw new Error("Unable to find this General stock record.");
      setSelectedRecord(record);
      setScanValue("");
    } catch (lookupError) {
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : "Unable to find this stock barcode.",
      );
    } finally {
      setLoading(false);
      scannerRef.current?.focus();
    }
  };

  const chooseRecord = (value: string) => {
    const record = records.find((item) => stockRecordKey(item) === value);
    if (record) setSelectedRecord(record);
  };

  const addToBill = () => {
    if (!selectedRecord) return;
    const available = Math.max(0, Number(selectedRecord.current_stock));
    if (available < 1) {
    setError("This General stock record has no available units.");
      setSelectedRecord(null);
      return;
    }
    setBillLines((current) => {
      const existing = current.find(
        (line) => stockRecordKey(line.record) === stockRecordKey(selectedRecord),
      );
      if (existing)
        return current.map((line) =>
          stockRecordKey(line.record) === stockRecordKey(selectedRecord)
            ? { ...line, quantity: Math.min(line.quantity + 1, available) }
            : line,
        );
      return [
        ...current,
        {
          record: selectedRecord,
          quantity: 1,
          rate: Number(selectedRecord.sales_price ?? selectedRecord.mrp ?? 0),
          gstRate: Number(selectedRecord.gst_rate ?? 0),
          hsnCode: String(selectedRecord.hsn_code ?? ""),
          discountPercent: 0,
          selectedOfferId: "",
        },
      ];
    });
    setSelectedRecord(null);
    scannerRef.current?.focus();
  };

  const updateLine = (
    id: string,
    key: "quantity" | "rate" | "gstRate" | "hsnCode" | "discountPercent" | "selectedOfferId",
    value: string,
  ) => {
    setBillLines((current) =>
      current.map((line) => {
        if (stockRecordKey(line.record) !== id) return line;

        if (key === "quantity") {
          const quantity = Math.min(
            Math.max(0, Number(value) || 0),
            Math.max(0, Number(line.record.current_stock)),
          );
          const selectedOffer = visibleOffersByStock[id]?.find((offer) => offer.id === line.selectedOfferId);
          return {
            ...line,
            quantity,
            ...(selectedOffer?.offerType === "BUY_ONE_GET_ONE"
              && quantity < (selectedOffer.buyQuantity ?? 0) + (selectedOffer.getQuantity ?? 0)
              ? { selectedOfferId: "" }
              : {}),
          };
        }

        if (key === "selectedOfferId") {
          return { ...line, selectedOfferId: value };
        }

        if (key === "rate") {
          return {
            ...line,
            rate: Math.max(0, Number(value) || 0),
          };
        }

        if (key === "gstRate") {
          return {
            ...line,
            gstRate: Math.max(0, Number(value) || 0),
          };
        }

        if (key === "discountPercent") {
          return {
            ...line,
            discountPercent: Math.min(Math.max(0, Number(value) || 0), 100),
          };
        }

        return {
          ...line,
          hsnCode: value,
        };
      }),
    );
  };

  const { subtotal, taxBreakdown, taxAmount, charges, grandTotal } = useMemo(() => {
    const totals = billLines.reduce(
      (summary, line) => {
        const master = gstOptions.find(
          (option) =>
            Number(option.fields?.Gst ?? option.fields?.gst) === line.gstRate,
        );
        const totalRate =
          line.gstRate ||
          Number(taxProfile?.cgstRate ?? 0) + Number(taxProfile?.sgstRate ?? 0);
        const cgstRate = Number(
          master?.fields?.Cgst_Rate ??
            master?.fields?.cgst_rate ??
            taxProfile?.cgstRate ??
            totalRate / 2,
        );
        const sgstRate = Number(
          master?.fields?.Sgst_Rate ??
            master?.fields?.sgst_rate ??
            taxProfile?.sgstRate ??
            totalRate / 2,
        );
        const igstRate = Number(
          master?.fields?.Igst_Rate ??
            master?.fields?.igst_rate ??
            taxProfile?.igstRate ??
            totalRate,
        );
        const taxable = lineTaxableAmount(line, visibleOffersByStock[stockRecordKey(line.record)] ?? []);
        summary.subtotal += taxable;
        if (taxMode === "INTERSTATE") summary.igst += (taxable * igstRate) / 100;
        else {
          summary.cgst += (taxable * cgstRate) / 100;
          summary.sgst += (taxable * sgstRate) / 100;
        }
        return summary;
      },
      { subtotal: 0, cgst: 0, sgst: 0, igst: 0 },
    );
    const taxAmount = totals.cgst + totals.sgst + totals.igst;
    const charges = Math.max(0, Number(otherCharges) || 0);
    return {
      subtotal: totals.subtotal,
      taxBreakdown: { cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst },
      taxAmount,
      charges,
      grandTotal: totals.subtotal + taxAmount + charges,
    };
  }, [billLines, gstOptions, otherCharges, taxMode, taxProfile, visibleOffersByStock]);
  const creditApplicationResult = returnCredits.reduce<{
    applications: Array<{ returnId: string; amount: string }>;
    remainingCents: number;
  }>((result, credit) => {
    if (result.remainingCents <= 0) return result;
    const availableCents = Math.round(Number(credit.availableAmount) * 100);
    if (!Number.isSafeInteger(availableCents) || availableCents <= 0) return result;
    const amountCents = Math.min(availableCents, result.remainingCents);
    return {
      applications: [...result.applications, {
        returnId: credit.id,
        amount: (amountCents / 100).toFixed(2),
      }],
      remainingCents: result.remainingCents - amountCents,
    };
  }, { applications: [], remainingCents: Math.round(grandTotal * 100) });
  const selectedReturnCreditApplications = creditApplicationResult.applications;
  const storeCreditAppliedCents = selectedReturnCreditApplications.reduce(
    (total, application) => total + Math.round(Number(application.amount) * 100),
    0,
  );
  const storeCreditAvailableAmount = returnCredits.reduce((total, credit) => {
    const availableCents = Math.round(Number(credit.availableAmount) * 100);
    return total + (Number.isSafeInteger(availableCents) && availableCents > 0 ? availableCents : 0);
  }, 0) / 100;
  const amountDue = Math.max(0, Math.round(grandTotal * 100) - storeCreditAppliedCents) / 100;
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/pos`;
  const customerName = customerDisplayName;
  const returnCreditLoading = Boolean(
    customerContactId && returnCreditLoadedFor !== customerContactId && !returnCreditError,
  );
  const purchaseRewardCheckKey = [
    organizationId,
    invoiceDate,
    subtotal.toFixed(2),
    couponCode.trim(),
  ].join("|");
  const purchaseRewardStatus = purchaseRewardCheck?.key === purchaseRewardCheckKey
    ? purchaseRewardCheck.status
    : null;

  useEffect(() => {
    if (billLines.length === 0 || subtotal <= 0 || couponCode.trim()) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const query = new URLSearchParams({
        rewardEligibility: "true",
        invoiceDate,
        subtotal: subtotal.toFixed(2),
      });
      void fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/sales?${query.toString()}`,
        { cache: "no-store", signal: controller.signal },
      )
        .then(async (response) => {
          const result = await response.json() as { error?: string; available?: boolean };
          if (!response.ok || typeof result.available !== "boolean") {
            throw new Error(result.error || "Unable to check purchase-reward availability.");
          }
          return result.available;
        })
        .then((available) => setPurchaseRewardCheck({
          key: purchaseRewardCheckKey,
          status: available ? "available" : "unavailable",
        }))
        .catch(() => {
          if (controller.signal.aborted) return;
          console.error("POS purchase-reward availability check failed", { organizationId });
          setPurchaseRewardCheck({ key: purchaseRewardCheckKey, status: "error" });
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    billLines.length,
    couponCode,
    invoiceDate,
    organizationId,
    purchaseRewardCheckKey,
    subtotal,
  ]);

  const saveInvoice = async () => {
    if (!stockHierarchyComplete) {
      setError("Select the complete stock hierarchy through a Sub-sub-location before posting.");
      return;
    }
    setSavingInvoice(true);
    setError("");
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/pos/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceDate,
          customerContactId: customerContactId || null,
          taxMode,
          requestKey: saleRequestKey.current || (saleRequestKey.current = crypto.randomUUID()),
          entityId,
          stockHierarchy: { entityId, divisionId, locationId, subLocationId, subSubLocationId },
          couponCode: couponCode.trim() || null,
          returnCreditApplications: selectedReturnCreditApplications,
          lines: billLines.map((line) => ({
            stockId: line.record.id,
            stockType: line.record.stock_type,
            quantity: String(line.quantity),
            rate: String(line.rate),
            gstRate: String(line.gstRate),
            discountPercent: String(line.discountPercent),
            hsnCode: line.hsnCode,
            offerId: line.selectedOfferId || null,
          })),
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        invoice?: {
          id?: string;
          invoiceNo?: string;
          subtotal?: string;
          taxAmount?: string;
          totalAmount?: string;
          appliedCouponCode?: string | null;
          issuedCouponCode?: string | null;
          storeCreditAppliedAmount?: string;
          amountDue?: string;
        };
      };
      if (!response.ok || !data.invoice?.invoiceNo) {
        throw new Error(data.error || "Unable to post POS invoice.");
      }
      saleRequestKey.current = "";
      try {
        const financeRecords = JSON.parse(
          window.localStorage.getItem(`finance-documents-${organizationId}`) ?? "[]",
        ) as StoredFinanceDocument[];
        const financeRecord: StoredFinanceDocument = {
          id: `pos-${data.invoice.id}`,
          documentType: "Sales Invoice",
          documentNumber: data.invoice.invoiceNo,
          sourceModule: "POS",
          sourceRecordId: data.invoice.id ?? "",
          date: invoiceDate,
          party: customerName || "Customer not linked",
          amount: Number(data.invoice.subtotal ?? subtotal),
          tax: Number(data.invoice.taxAmount ?? taxAmount),
          net: Number(data.invoice.totalAmount ?? grandTotal),
          status: "Posted",
          paymentStatus: "Pending",
          archivedYear: new Date(invoiceDate).getFullYear(),
        };
        const withoutExistingFinanceRecord = financeRecords.filter(
          (item) => item.documentNumber !== data.invoice?.invoiceNo || item.sourceModule !== "POS",
        );
        window.localStorage.setItem(
          `finance-documents-${organizationId}`,
          JSON.stringify([financeRecord, ...withoutExistingFinanceRecord]),
        );
      } catch {
        setError("Invoice posted and stock deducted, but the local finance cache could not be updated.");
      }
      setInvoiceNumber(data.invoice.invoiceNo);
      router.push(
        data.invoice.appliedCouponCode || data.invoice.issuedCouponCode
          ? `${base}/invoice/${encodeURIComponent(data.invoice.invoiceNo)}`
          : `${base}/invoice`,
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to post POS invoice.");
    } finally {
      setSavingInvoice(false);
    }
  };

  return (
    <Page as="div" className="min-w-0 max-w-[1600px] pt-4 lg:pt-0">
      <div className="print:hidden">
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:h-8 xl:grid-cols-5">
          <Select
            aria-label="Entity"
            className="h-8 px-2 py-1 text-xs"
            value={entityId}
            onChange={(event) => {
              resetStockAndCart();
              setEntityId(event.target.value);
              setDivisionId("");
              setLocationId("");
              setSubLocationId("");
              setSubSubLocationId("");
              setDivisions([]);
              setLocations([]);
              setSubLocations([]);
              setSubSubLocations([]);
              setHierarchyLoading((current) => ({
                ...current,
                divisions: Boolean(event.target.value),
                locations: false,
                subLocations: false,
                subSubLocations: false,
              }));
              setHierarchyErrors((current) => ({ ...current, divisions: "", locations: "", subLocations: "", subSubLocations: "" }));
            }}
            disabled={hierarchyLoading.entities || billLines.length > 0}
            required
            options={[
              { value: "", label: hierarchyLoading.entities ? "Loading Entities…" : entities.length ? "Select Entity" : "No active Entities" },
              ...entities.map((entity) => ({ value: entity.id, label: entity.label })),
            ]}
          />
          <Select
            aria-label="Division"
            className="h-8 px-2 py-1 text-xs"
            value={divisionId}
            onChange={(event) => {
              resetStockAndCart();
              setDivisionId(event.target.value);
              setLocationId("");
              setSubLocationId("");
              setSubSubLocationId("");
              setLocations([]);
              setSubLocations([]);
              setSubSubLocations([]);
              setHierarchyLoading((current) => ({
                ...current,
                locations: Boolean(event.target.value),
                subLocations: false,
                subSubLocations: false,
              }));
              setHierarchyErrors((current) => ({ ...current, locations: "", subLocations: "", subSubLocations: "" }));
            }}
            disabled={!entityId || hierarchyLoading.divisions || billLines.length > 0}
            required
            options={[
              { value: "", label: hierarchyLoading.divisions ? "Loading Divisions…" : !entityId ? "Select Entity first" : divisions.length ? "Select Division" : "No active Divisions" },
              ...divisions.map((option) => ({ value: option.id, label: option.label })),
            ]}
          />
          <Select
            aria-label="Location"
            className="h-8 px-2 py-1 text-xs"
            value={locationId}
            onChange={(event) => {
              resetStockAndCart();
              setLocationId(event.target.value);
              setSubLocationId("");
              setSubSubLocationId("");
              setSubLocations([]);
              setSubSubLocations([]);
              setHierarchyLoading((current) => ({
                ...current,
                subLocations: Boolean(event.target.value),
                subSubLocations: false,
              }));
              setHierarchyErrors((current) => ({ ...current, subLocations: "", subSubLocations: "" }));
            }}
            disabled={!divisionId || hierarchyLoading.locations || billLines.length > 0}
            required
            options={[
              { value: "", label: hierarchyLoading.locations ? "Loading Locations…" : !divisionId ? "Select Division first" : locations.length ? "Select Location" : "No active Locations" },
              ...locations.map((option) => ({ value: option.id, label: option.label })),
            ]}
          />
          <Select
            aria-label="Sub-location"
            className="h-8 px-2 py-1 text-xs"
            value={subLocationId}
            onChange={(event) => {
              resetStockAndCart();
              setSubLocationId(event.target.value);
              setSubSubLocationId("");
              setSubSubLocations([]);
              setHierarchyLoading((current) => ({ ...current, subSubLocations: Boolean(event.target.value) }));
              setHierarchyErrors((current) => ({ ...current, subSubLocations: "" }));
            }}
            disabled={!locationId || hierarchyLoading.subLocations || billLines.length > 0}
            required
            options={[
              { value: "", label: hierarchyLoading.subLocations ? "Loading Sub-locations…" : !locationId ? "Select Location first" : subLocations.length ? "Select Sub-location" : "No active Sub-locations" },
              ...subLocations.map((option) => ({ value: option.id, label: option.label })),
            ]}
          />
          <Select
            aria-label="Sub-sub-location (issue)"
            className="h-8 px-2 py-1 text-xs"
            value={subSubLocationId}
            onChange={(event) => {
              resetStockAndCart();
              setSubSubLocationId(event.target.value);
            }}
            disabled={!subLocationId || hierarchyLoading.subSubLocations || billLines.length > 0}
            required
            options={[
              { value: "", label: hierarchyLoading.subSubLocations ? "Loading Sub-sub-locations…" : !subLocationId ? "Select Sub-location first" : subSubLocations.length ? "Select issue location" : "No active Sub-sub-locations" },
              ...subSubLocations.map((option) => ({ value: option.id, label: option.label })),
            ]}
          />
        </div>
        <Section className="grid min-w-0 items-start gap-x-4 gap-y-4 space-y-0 xl:gap-y-0 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,0.8fr)]">
          <div className="sticky top-0 z-20 flex flex-wrap items-center border-b border-[var(--erp-border)] bg-[var(--erp-surface)]/95 pb-0 backdrop-blur xl:col-span-2">
            <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 xl:flex-nowrap">
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 sm:grid-cols-4 xl:grid-cols-8">
                <SummaryAmount label="Taxable value" value={subtotal} compact />
                <SummaryAmount label="CGST" value={taxBreakdown.cgst} compact />
                <SummaryAmount label="SGST" value={taxBreakdown.sgst} compact />
                <SummaryAmount label="IGST" value={taxBreakdown.igst} compact />
                <SummaryAmount label="Other charges" value={charges} compact />
                <SummaryAmount label="Store credit" value={storeCreditAvailableAmount} compact />
                <SummaryAmount label="Grand total" value={grandTotal} strong compact />
                <SummaryAmount label="Amount due" value={amountDue} compact />
              </div>
            </div>
          </div>
          <div className="contents xl:col-start-2 xl:row-start-2 xl:flex xl:min-w-0 xl:flex-col xl:gap-4 xl:self-stretch">
          <Card className="order-1 space-y-4 xl:order-none">
            <div>
              <h2 className="text-sm font-semibold text-[var(--erp-text)]">Invoice details</h2>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_minmax(9rem,0.7fr)_minmax(12rem,1fr)]">
              <Input
                id="customer-mobile"
                label="Customer mobile number"
                type="tel"
                value={customerMobile}
                onChange={(event) => {
                  customerLookupControllerRef.current?.abort();
                  customerLookupKeyRef.current = "";
                  setCustomerMobile(event.target.value.replace(/\D/g, "").slice(0, 10));
                  selectCustomer("");
                  setCustomerDisplayName("");
                  setCustomerLookupStatus("idle");
                  setCustomerLookupMessage("");
                }}
                onBlur={() => {
                  if (customerMobile.trim()) void lookupCustomerByMobile();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void lookupCustomerByMobile();
                  }
                }}
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                placeholder="Enter mobile number"
                required
              />
              <Input
                id="invoice-date"
                label="Invoice date"
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
              />
              <Input
                id="invoice-coupon-code"
                label="Coupon code (optional)"
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value)}
                textCase="preserve"
                placeholder="Enter coupon code"
                maxLength={60}
              />
            </div>
            {customerLookupStatus === "loading" ? (
              <p role="status" className="text-sm text-[var(--erp-muted)]">Checking customer mobile…</p>
            ) : customerLookupStatus === "matched" ? (
              <p role="status" className="text-sm text-[var(--erp-muted)]">
                Customer account: <span className="font-semibold text-[var(--erp-text)]">{customerDisplayName}</span>
              </p>
            ) : customerLookupStatus === "error" ? (
              <p role="alert" className="text-sm text-[var(--erp-danger)]">
                {customerLookupMessage}
                <Button type="button" variant="secondary" size="sm" onClick={() => void lookupCustomerByMobile()} className="ml-2">
                  Retry
                </Button>
              </p>
            ) : null}
            {billLines.length > 0 && (
              <p className="text-xs text-[var(--erp-muted)]">
                Remove all bill items to change the Entity / Store.
              </p>
            )}
          </Card>
          <Card className="order-4 space-y-4 xl:order-none">
            <div>
              <h2 className="text-sm font-semibold text-[var(--erp-text)]">Checkout</h2>
            </div>
            <div className="space-y-3 rounded-xl border border-[var(--erp-border)] p-4">
              <div>
                <p className="erp-eyebrow">Payment mode</p>
                <Badge role="status">Not collected</Badge>
                <p className="mt-2 text-xs text-[var(--erp-muted)]">
                  Payment collection is not available in Quick Invoice yet. Invoices are posted as pending.
                </p>
              </div>
              <div className="border-t border-[var(--erp-border)] pt-3">
                <p className="erp-eyebrow">Salesperson</p>
                <p className="mt-1 text-sm font-semibold text-[var(--erp-text)]">{salespersonName}</p>
                <p className="mt-1 text-xs text-[var(--erp-muted)]">Logged-in user</p>
              </div>
            </div>
          </Card>
          <Button
            type="button"
            onClick={() => void saveInvoice()}
            disabled={
              billLines.length === 0
              || !stockHierarchyComplete
              || !customerContactId
              || billLines.some((line) => line.quantity < 1)
              || savingInvoice
              || visibleOfferLookupLoading
              || Boolean(visibleOfferLookupError)
              || returnCreditLoading
              || Boolean(returnCreditError)
            }
            className="order-5 w-full rounded-lg px-4 py-2 text-sm font-semibold xl:order-none"
          >
            {savingInvoice ? "Posting..." : "Post Invoice"}
          </Button>
          </div>
          <div className="contents xl:col-start-1 xl:row-start-2 xl:flex xl:min-w-0 xl:flex-col xl:gap-2 xl:self-stretch">
          <div className="order-2 min-w-0 xl:order-none">
            {(Object.keys(hierarchyErrors) as HierarchyLevel[]).map((level) => hierarchyErrors[level] ? (
              <p key={level} role="alert" className="mb-2 text-xs font-medium text-[var(--erp-danger)]">
                {hierarchyErrors[level]}{" "}
                <Button type="button" variant="secondary" size="sm" onClick={() => {
                  setHierarchyLoading({
                    entities: true,
                    divisions: Boolean(entityId),
                    locations: Boolean(entityId && divisionId),
                    subLocations: Boolean(entityId && divisionId && locationId),
                    subSubLocations: Boolean(entityId && divisionId && locationId && subLocationId),
                  });
                  setHierarchyErrors({ entities: "", divisions: "", locations: "", subLocations: "", subSubLocations: "" });
                  setHierarchyRetry((value) => value + 1);
                }}>
                  Retry
                </Button>
              </p>
            ) : null)}
            <div className="grid min-w-0 gap-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(24rem,1fr)]">
              <form
                onSubmit={lookupRecord}
                className="erp-surface-soft min-w-0 p-2"
              >
              <label
                className="erp-eyebrow"
                htmlFor="barcode-input"
              >
                Scan stock barcode
              </label>
              <div className="mt-2 flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <ScanLine className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-[var(--erp-brand)]" />
                  <Input
                    ref={scannerRef}
                    id="barcode-input"
                    value={scanValue}
                    onChange={(event) => setScanValue(event.target.value)}
                    textCase="preserve"
                    className="h-8 py-1 pl-8 pr-2 text-sm"
                    placeholder="Scan or enter a stock record ID"
                    autoComplete="off"
                    disabled={!stockHierarchyComplete || loading}
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={loading || !scanValue.trim() || !stockHierarchyComplete}
                  className="shrink-0"
                >
                  <Search className="h-4 w-4" />
                  {loading ? "Finding..." : "Find"}
                </Button>
              </div>
              {error && (
                <p className="mt-2 text-sm font-medium text-red-700">{error}</p>
              )}
              </form>
              <div className="erp-surface min-w-0 p-2">
              <label
                className="erp-eyebrow block"
                htmlFor="stock-search-input"
              >
                Find stock by item
              </label>
              <Input
                id="stock-search-input"
                value={stockSearch}
                onChange={(event) => {
                  setStockSearch(event.target.value);
                  setRecords([]);
                  setHasMoreStockResults(false);
                  setStockSearchError("");
                  setStockSearchLoading(false);
                }}
                className="mt-1 h-8 py-1 text-xs"
                placeholder="Search style, order, article, or brand"
                autoComplete="off"
                aria-label="Search General stock"
                disabled={!stockHierarchyComplete}
              />
              <Select
                id="stock-record-select"
                aria-label="Select stock record manually"
                value=""
                onChange={(event) => chooseRecord(event.target.value)}
                disabled={stockSearchLoading || !stockHierarchyComplete}
                className="mt-1 h-8 rounded-lg px-2 py-1 text-xs text-slate-800"
              >
                <option value="">
                  {!entityId
                    ? "Select an Entity before searching stock"
                    : stockSearchLoading
                    ? "Searching..."
                    : stockSearch.trim().length < 2
                      ? stockSearch.trim()
                        ? "Enter at least 2 characters to search"
                        : records.length
                          ? "Select from the first 10 items (A-Z)"
                          : "No General stock items available"
                      : records.length
                        ? "Select matching General stock"
                        : "No matching General stock"}
                </option>
                {records.map((record) => (
                  <option key={stockRecordKey(record)} value={stockRecordKey(record)}>
                    [{record.stock_type === "SKU" ? "SKU" : "GRN"}] {record.style_name} | {record.order_no} | {record.size || "-"}{" "}
                    | Age: {stockAgeInDays(record.added_time) ?? "Unavailable"} days | ID: {record.id}
                  </option>
                ))}
              </Select>
              {stockSearchError && <p className="mt-2 text-xs font-medium text-red-700" role="alert">{stockSearchError}</p>}
              {hasMoreStockResults && <p className="mt-2 text-xs text-slate-500">Showing the first 10 matches in alphabetical order. Refine your search to narrow the results.</p>}
              </div>
            </div>
          </div>
          <div className="order-3 min-w-0 xl:flex-1 xl:order-none">
            <Card className="flex h-full w-full min-w-0 flex-col p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-[var(--erp-muted)]">
                  {billLines.length} {billLines.length === 1 ? "item" : "items"}
                </span>
                {purchaseRewardStatus === "error" && (
                  <p className="text-xs text-[var(--erp-danger-text)]" role="status">
                    Could not check coupon availability. The sale will still be validated when posted.
                  </p>
                )}
              </div>
              <div className="mt-2 min-h-0 overflow-x-hidden overflow-y-auto rounded-xl border border-[var(--erp-border)]">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="erp-eyebrow">
                    Invoice lines
                  </p>
                </div>
                {billLines.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-sm font-semibold text-[var(--erp-text)]">
                      Scan or search for stock to start billing
                    </p>
                    <p className="mt-1 text-xs text-[var(--erp-muted)]">
                      You can scan the stock record ID or find an item by style, order, article, or brand.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {billLines.map((line) => (
                      <div
                        key={stockRecordKey(line.record)}
                        className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.7fr)_5.5rem_7rem_7.5rem_6.5rem_7rem_5.5rem] md:items-end"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">
                            {line.record.style_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {line.record.order_no} | {line.record.article_no} |{" "}
                            {line.record.size || "-"}
                          </p>
                          <p className="mt-1 text-xs text-[var(--erp-muted)]">
                            Age (days): {stockAgeInDays(line.record.added_time) ?? "Unavailable"}
                          </p>
                          {purchaseRewardStatus === "available" && (
                            <div className="mt-1">
                              <Badge role="status" aria-live="polite">Coupon eligible</Badge>
                            </div>
                          )}
                          <div className="mt-2">
                            <label
                              className="block text-[11px] font-medium text-slate-500"
                              htmlFor={`offer-${line.record.stock_type}-${line.record.id}`}
                            >
                              Eligible offer
                            </label>
                            <Select
                              id={`offer-${line.record.stock_type}-${line.record.id}`}
                              aria-label={`${line.record.style_name} eligible offer`}
                              value={line.selectedOfferId}
                              onChange={(event) => updateLine(
                                stockRecordKey(line.record),
                                "selectedOfferId",
                                event.target.value,
                              )}
                              disabled={visibleOfferLookupLoading || !visibleOffersByStock[stockRecordKey(line.record)]?.length}
                              className="mt-1 w-full rounded border-slate-300 px-2 py-1 text-sm"
                            >
                              <option value="">
                                {visibleOfferLookupLoading
                                  ? "Loading eligible offers..."
                                  : visibleOffersByStock[stockRecordKey(line.record)]?.length
                                    ? "No offer selected"
                                    : "No eligible offers"}
                              </option>
                              {(visibleOffersByStock[stockRecordKey(line.record)] ?? []).map((offer) => {
                                const requiredQuantity = (offer.buyQuantity ?? 0) + (offer.getQuantity ?? 0);
                                const quantityUnavailable = offer.offerType === "BUY_ONE_GET_ONE"
                                  && line.quantity < requiredQuantity;
                                const comboUnavailable = offer.offerType === "COMBO";
                                return (
                                  <option
                                    key={offer.id}
                                    value={offer.id}
                                    disabled={quantityUnavailable || comboUnavailable}
                                  >
                                    {offerLabel(offer)}
                                    {quantityUnavailable ? ` (requires ${requiredQuantity} units)` : ""}
                                    {comboUnavailable ? " — select a bundle at cart level" : ""}
                                  </option>
                                );
                              })}
                            </Select>
                            {visibleOfferLookupError && (
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <p className="text-xs text-[var(--erp-danger-text)]" role="alert">
                                  {visibleOfferLookupError}
                                </p>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="px-2 py-1 text-xs"
                                  onClick={() => setOfferLookupRetry((current) => current + 1)}
                                >
                                  Retry offers
                                </Button>
                              </div>
                            )}
                            {visibleOfferLimitReached && (
                              <p className="mt-1 text-xs text-[var(--erp-muted)]">
                                Offer list is capped at 100. Refine the active offer catalog if one is missing.
                              </p>
                            )}
                            {(visibleOffersByStock[stockRecordKey(line.record)] ?? []).some((offer) =>
                              offer.offerType === "COMBO",
                            ) && (
                              <p className="mt-1 text-xs text-[var(--erp-muted)]">
                                Combo offers need bundle rules before they can be applied to a single item.
                              </p>
                            )}
                          </div>
                        </div>
                        <label className="block text-[11px] font-medium text-slate-500">
                          Qty
                          <Input
                            type="number"
                            aria-label={`${line.record.style_name} quantity`}
                            min="1"
                            value={line.quantity}
                            onChange={(event) =>
                              updateLine(
                                stockRecordKey(line.record),
                                "quantity",
                                event.target.value,
                              )
                            }
                            className="mt-1 rounded border-slate-300 px-2 py-1 text-right text-sm"
                          />
                        </label>
                        <label className="block text-[11px] font-medium text-slate-500">
                          Price
                          <Input
                            type="number"
                            aria-label={`${line.record.style_name} price`}
                            min="0"
                            step="0.01"
                            value={line.rate}
                            onChange={(event) =>
                              updateLine(
                                stockRecordKey(line.record),
                                "rate",
                                event.target.value,
                              )
                            }
                            className="mt-1 rounded border-slate-300 px-2 py-1 text-right text-sm"
                          />
                        </label>
                        <label className="block text-[11px] font-medium text-slate-500">
                          GST %
                          <Select
                            aria-label={`${line.record.style_name} GST rate`}
                            value={String(line.gstRate)}
                            onChange={(event) =>
                              updateLine(
                                stockRecordKey(line.record),
                                "gstRate",
                                event.target.value,
                              )
                            }
                            className="mt-1 rounded border-slate-300 px-2 py-1 text-right text-sm"
                          >
                            {gstOptions.length === 0 ? (
                              <option value="0">0</option>
                            ) : (
                              gstOptions.map((option) => {
                                const value = Number(
                                  option.fields?.Gst ?? option.fields?.gst ?? 0,
                                );
                                return (
                                  <option key={option.id} value={String(value)}>
                                    {value}%
                                  </option>
                                );
                              })
                            )}
                          </Select>
                        </label>
                        <label className="block text-[11px] font-medium text-slate-500">
                          Disc %
                          <Input
                            type="number"
                            aria-label={`${line.record.style_name} discount percentage`}
                            min="0"
                            max="100"
                            step="0.01"
                            value={line.discountPercent}
                            onChange={(event) =>
                              updateLine(
                                stockRecordKey(line.record),
                                "discountPercent",
                                event.target.value,
                              )
                            }
                            className="mt-1 rounded border-slate-300 px-2 py-1 text-right text-sm"
                          />
                        </label>
                        <label className="block text-[11px] font-medium text-slate-500">
                          HSN
                          <Input
                            aria-label={`${line.record.style_name} HSN code`}
                            value={line.hsnCode}
                            onChange={(event) =>
                              updateLine(
                                stockRecordKey(line.record),
                                "hsnCode",
                                event.target.value,
                              )
                            }
                            className="mt-1 rounded border-slate-300 px-2 py-1 text-right text-sm"
                            placeholder="HSN"
                          />
                        </label>
                        <p className="text-right text-sm font-bold text-slate-900">
                          Rs {lineTaxableAmount(
                            line,
                            visibleOffersByStock[stockRecordKey(line.record)] ?? [],
                          ).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
          </div>
        </Section>
      </div>
      {invoiceNumber && (
        <SalesInvoicePrint
          invoiceNumber={invoiceNumber}
          invoiceDate={invoiceDate}
          customer={customerName}
          lines={billLines}
          subtotal={subtotal}
          onPrint={() => window.print()}
        />
      )}
      {selectedRecord && (
        <StockDetailsDialog
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onAdd={addToBill}
        />
      )}
      <Modal
        open={customerRegistrationOpen}
        onClose={() => {
          if (!customerSubmitting) {
            customerLookupKeyRef.current = "";
            setCustomerLookupStatus("idle");
            setCustomerRegistrationOpen(false);
          }
        }}
        ariaLabelledBy="pos-customer-registration-title"
        size="square"
        closeOnBackdrop={!customerSubmitting}
        initialFocusRef={customerNameInputRef}
        className="flex flex-col overflow-hidden p-0"
      >
        <form onSubmit={(event) => void createCustomer(event)} className="flex min-h-0 flex-col">
          <div className="border-b border-[var(--erp-border)] px-6 py-5">
            <p className="erp-eyebrow">Customer account</p>
            <h2 id="pos-customer-registration-title" className="erp-card-title mt-1">
              Register customer
            </h2>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              No customer account was found for mobile number {customerMobile}.
            </p>
          </div>
          <div className="space-y-4 p-6">
            <Input
              ref={customerNameInputRef}
              label="Customer name"
              value={customerRegistrationName}
              onChange={(event) => setCustomerRegistrationName(event.target.value)}
              required
              maxLength={200}
              autoComplete="name"
            />
            {customerRegistrationError ? (
              <p role="alert" className="text-sm font-medium text-red-700">{customerRegistrationError}</p>
            ) : null}
          </div>
          <div className="flex justify-end gap-3 border-t border-[var(--erp-border)] px-6 py-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                customerLookupKeyRef.current = "";
                setCustomerLookupStatus("idle");
                setCustomerRegistrationOpen(false);
              }}
              disabled={customerSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={customerSubmitting}>
              {customerSubmitting ? "Creating account..." : "Create customer"}
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}

function SummaryAmount({
  label,
  value,
  strong = false,
  compact = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border ${compact ? "px-2 py-1.5" : "px-3 py-2.5"} ${strong ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)]" : "border-[var(--erp-border)] bg-[var(--erp-surface)]"}`}
    >
      <p
        className="truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--erp-muted)]"
      >
        {label}
      </p>
      <p
        className={`${compact ? "mt-0.5 text-xs" : "mt-1 text-sm"} truncate ${strong ? "font-bold text-[var(--erp-brand)]" : "font-semibold text-[var(--erp-text)]"}`}
      >
        Rs {value.toFixed(2)}
      </p>
    </div>
  );
}

function SalesInvoicePrint({
  invoiceNumber,
  invoiceDate,
  customer,
  lines,
  subtotal,
  onPrint,
}: {
  invoiceNumber: string;
  invoiceDate: string;
  customer: string;
  lines: BillLine[];
  subtotal: number;
  onPrint: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            Invoice saved
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            Sales invoice ready
          </h2>
        </div>
        <Button
          type="button"
          onClick={onPrint}
          variant="secondary"
          className="rounded-lg px-4 py-2 text-sm font-semibold"
        >
          <Printer className="h-4 w-4" />
          Print / Download PDF
        </Button>
      </div>
      <article className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="flex items-start justify-between gap-4 border-b-2 border-emerald-700 pb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
              Point of Sale
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">
              Sales Invoice
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Barcode billing receipt
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-bold text-slate-900">{invoiceNumber}</p>
            <p className="mt-1 text-slate-500">Date: {invoiceDate}</p>
          </div>
        </div>
        <div className="grid gap-3 border-b border-slate-200 py-5 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Bill To
            </p>
            <p className="mt-1 font-semibold text-slate-900">
              {customer || "Customer not linked"}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Payment Status
            </p>
            <p className="mt-1 font-semibold text-emerald-700">Pending</p>
          </div>
        </div>
        <div className="mt-6 min-w-0 max-w-full overflow-x-auto print:overflow-visible">
          <table className="w-full text-left text-sm">
          <thead className="border-b-2 border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="pb-3">Item / Style</th>
              <th className="pb-3">Order / Barcode</th>
              <th className="pb-3 text-right">Qty</th>
              <th className="pb-3 text-right">Rate</th>
              <th className="pb-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line) => (
              <tr key={stockRecordKey(line.record)}>
                <td className="py-3">
                  <p className="font-bold text-slate-900">
                    {line.record.style_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {line.record.article_no} | {line.record.size || "-"} |{" "}
                    {line.record.colour || "-"}
                  </p>
                </td>
                <td className="py-3 text-xs text-slate-600">
                  <p>{line.record.order_no}</p>
                  <p className="break-all">{line.record.id}</p>
                </td>
                <td className="py-3 text-right">{line.quantity}</td>
                <td className="py-3 text-right">Rs {line.rate.toFixed(2)}</td>
                <td className="py-3 text-right font-semibold">
                  Rs {(line.quantity * line.rate).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
        <div className="mt-6 flex justify-end border-t-2 border-slate-900 pt-4">
          <div className="w-64 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>Rs {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-black text-slate-950">
              <span>Total</span>
              <span>Rs {subtotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div className="mt-12 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <p>Thank you for your purchase.</p>
          <p className="mt-1">
            This invoice was generated from Finished Goods SKU Stock barcode
            billing.
          </p>
        </div>
      </article>
    </div>
  );
}

function StockDetailsDialog({
  record,
  onClose,
  onAdd,
}: {
  record: StockRecord;
  onClose: () => void;
  onAdd: () => void;
}) {
  const details: Array<[string, string | number | null]> = [
    ["Record ID / Barcode", record.id],
    ["Style Name", record.style_name],
    ["Order No", record.order_no],
    ["Article No", record.article_no],
    ["Brand", record.brand],
    ["Size", record.size],
    ["Colour", record.colour],
    ["Product Category", record.product_category],
    ["Sub Product Category", record.sub_product_category],
    ["GST %", record.gst_rate],
    ["HSN Code", record.hsn_code],
    ["Purchase Price", record.purchase_price],
    ["Sales Price", record.sales_price],
    ["MRP", record.mrp],
    ["Source", record.source.replaceAll("_", " ")],
    ["Added User", record.added_user],
    ["Added Time", new Date(record.added_time).toLocaleString()],
    ["Age (days)", stockAgeInDays(record.added_time) ?? "Unavailable"],
    ["Qty In", record.qty_in],
    ["Qty Out", record.qty_out],
    ["Current Stock", record.current_stock],
  ];
  return (
    <Modal
      open
      onClose={onClose}
      ariaLabelledBy="stock-details-title"
      closeOnBackdrop={false}
      size="rectangle"
      className="flex flex-col overflow-hidden p-0"
    >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
              Finished Goods SKU Stock
            </p>
            <h2
              id="stock-details-title"
              className="mt-1 text-xl font-bold text-slate-950"
            >
              {record.style_name}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Barcode is this stock record ID: {record.id}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close stock details"
            className="min-h-0 rounded-md p-1"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="min-h-0 overflow-x-hidden overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {details.map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-900">
                  {value || "-"}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onAdd}
            className="rounded-md px-4 py-2 text-xs font-bold"
          >
            Add to bill
          </Button>
        </div>
    </Modal>
  );
}
