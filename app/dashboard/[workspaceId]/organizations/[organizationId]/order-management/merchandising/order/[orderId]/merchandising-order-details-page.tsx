"use client";

import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getMasterDefinition, type MasterFieldDefinition } from "@/lib/master-data/master-data-registry";
import { calculateFinishedGoodsRows } from "@/lib/services/orders/order-quantity-calculations";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Skeleton from "@/components/ui/Skeleton";
import Tabs from "@/components/ui/Tabs";
import OrderDetailsTab from "./components/OrderDetailsTab";
import { getProcessRows } from "./components/process-tab-state";
import { getMissingRequiredOrderField } from "./components/order-form-validation";
import type { OrderFormState } from "./components/order-form-types";
import { buildOrderSavePayload, type OrderSection } from "./components/order-save-payload";

const FinishedGoodsTab = React.lazy(() => import("./components/FinishedGoodsTab"));
const BomTab = React.lazy(() => import("./components/BomTab"));
const CostingTab = React.lazy(() => import("./components/costing"));
const TecPackTab = React.lazy(() => import("./components/Tecpack"));
const MeasurementsTab = React.lazy(() => import("./components/MeasurementsTab"));
const ProcessTab = React.lazy(() => import("./components/ProcessTab"));
const AttachmentsTab = React.lazy(() => import("./components/Attachments"));

type TabType = "details" | "finishedGoods" | "bom" | "costing" | "techPack" | "measurements" | "process" | "attachments";
type MasterDataOption = {
  id?: string;
  label: string;
  value_id?: string;
  name?: string;
  code?: string | null;
  is_active?: boolean;
  parent_id?: string | null;
  parentValueId?: string | null;
  parent_label?: string;
  fields?: Record<string, unknown>;
  sizes?: unknown[];
};

type OrderLookupDefinition = {
  key: string;
  lookupModuleKey?: string;
  dependsOn?: string;
};

const LOOKUP_KEYS_BY_TAB: Record<TabType, string[]> = {
  details: ["article", "entity", "category", "sub-category", "season", "color", "buyer", "brand", "size-group"],
  finishedGoods: ["size-group", "size"],
  bom: ["raw-material-type", "raw-material-category", "raw-material-sub-category", "raw-material"],
  costing: [],
  techPack: [],
  measurements: [],
  process: [],
  attachments: [],
};

const ORDER_SECTIONS_BY_TAB: Partial<Record<TabType, OrderSection>> = {
  finishedGoods: "finishedGoods",
  bom: "bom",
  process: "process",
};
const ORDER_LOOKUP_KEYS = new Set(Object.values(LOOKUP_KEYS_BY_TAB).flat());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getOptionalString = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === "string" ? record[key] : undefined;

const getOptionalNullableString = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === "string" || record[key] === null ? record[key] : undefined;

const parseMasterDataOption = (value: unknown): MasterDataOption | null => {
  if (!isRecord(value) || typeof value.label !== "string") return null;

  return {
    id: getOptionalString(value, "id"),
    label: value.label,
    value_id: getOptionalString(value, "value_id"),
    name: getOptionalString(value, "name"),
    code: getOptionalNullableString(value, "code"),
    is_active: typeof value.is_active === "boolean" ? value.is_active : undefined,
    parent_id: getOptionalNullableString(value, "parent_id"),
    parentValueId: getOptionalNullableString(value, "parentValueId"),
    parent_label: getOptionalString(value, "parent_label"),
    fields: isRecord(value.fields) ? value.fields : undefined,
    sizes: Array.isArray(value.sizes) ? value.sizes : undefined,
  };
};

const parseMasterOptions = (value: unknown): Record<string, MasterDataOption[]> => {
  if (!isRecord(value)) return {};

  const result: Record<string, MasterDataOption[]> = {};
  for (const [key, options] of Object.entries(value)) {
    result[key] = Array.isArray(options)
      ? options.flatMap((option) => {
          const parsedOption = parseMasterDataOption(option);
          return parsedOption ? [parsedOption] : [];
        })
      : [];
  }
  return result;
};

const parseOrderLookups = (value: unknown): OrderLookupDefinition[] => {
  const candidates = Array.isArray(value)
    ? value
    : isRecord(value)
      ? value.orderLookups ?? value.items
      : [];
  if (!Array.isArray(candidates)) return [];

  return candidates.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.key !== "string") return [];
    return [{
      key: candidate.key,
      ...(typeof candidate.lookupModuleKey === "string" ? { lookupModuleKey: candidate.lookupModuleKey } : {}),
      ...(typeof candidate.dependsOn === "string" ? { dependsOn: candidate.dependsOn } : {}),
    }];
  });
};

const parseOrderProcessRows = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((stepValue) => {
    if (!isRecord(stepValue)) return [];
    const process = isRecord(stepValue.process) ? stepValue.process : {};
    const operations = Array.isArray(stepValue.operations)
      ? stepValue.operations.flatMap((operationValue) => {
          if (!isRecord(operationValue)) return [];
          return [{
            id: getOptionalString(operationValue, "id"),
            sourceOperationId: getOptionalString(operationValue, "source_operation_template_step_id"),
            operation: getOptionalString(operationValue, "operation"),
            slNo: typeof operationValue.sl_no === "number" ? operationValue.sl_no : undefined,
            price: operationValue.price === null || operationValue.price === undefined
              ? 0
              : Number(operationValue.price),
          }];
        })
      : [];

    return [{
      id: getOptionalString(stepValue, "id"),
      processId: getOptionalString(stepValue, "process_id") ?? getOptionalString(process, "id"),
      processName: getOptionalString(stepValue, "process_name") ?? getOptionalString(process, "process_name"),
      operation: getOptionalString(stepValue, "process_name") ?? getOptionalString(process, "process_name"),
      slNo: typeof stepValue.sl_no === "number" ? stepValue.sl_no : undefined,
      operations,
    }];
  });
};

type QuickMasterParent = {
  masterKey: string;
  fields: Record<string, unknown>;
  lookupOptions: Record<string, MasterDataOption[]>;
  returnFieldKey: string;
};

export default function MerchandisingOrderDetailsPage() {
  const params = useParams<{
    workspaceId: string;
    organizationId: string;
    orderId?: string;
  }>();

  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = params?.orderId && params.orderId !== "create" ? params.orderId : undefined;
  const isEditing = !orderId || searchParams.get("mode") === "edit";
  const detailPath = orderId
    ? `/dashboard/${params.workspaceId}/organizations/${params.organizationId}/order-management/merchandising/order/${encodeURIComponent(orderId)}`
    : "";
  const variantFrom = searchParams.get("variantFrom");
  const variantDataParam = searchParams.get("variantData");
  const variantConfig = useMemo(() => {
    if (!variantDataParam) return null;
    try {
      const parsed = JSON.parse(variantDataParam) as {
        styleName?: string;
        colors?: string;
        rows?: Array<{ size?: string; qty?: number | string }>;
      };
      return parsed;
    } catch {
      return null;
    }
  }, [variantDataParam]);
  const variantStyleName = variantConfig?.styleName ?? "";
  const variantColors = variantConfig?.colors ?? "";
  const variantRowsLookup = useMemo(() => variantConfig?.rows ?? [], [variantConfig]);
  const workspaceId = params?.workspaceId;
  const organizationId = params?.organizationId;

  const [activeTab, setActiveTab] = useState<TabType>("details");
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const originalFormRef = useRef<OrderFormState | null>(null);
  const [completedOrderLoadKey, setCompletedOrderLoadKey] = useState<string | null>(null);
  const orderLoadKey = orderId || variantFrom
    ? `${organizationId ?? ""}:${orderId || variantFrom}`
    : null;
  const isOrderLoading = Boolean(orderLoadKey && completedOrderLoadKey !== orderLoadKey);
  const [newMasterKey, setNewMasterKey] = useState<string | null>(null);
  const [quickMasterFields, setQuickMasterFields] = useState<Record<string, unknown>>({});
  const [quickMasterLookupOptions, setQuickMasterLookupOptions] = useState<Record<string, MasterDataOption[]>>({});
  const [quickMasterStack, setQuickMasterStack] = useState<QuickMasterParent[]>([]);
  const [isCreatingMaster, setIsCreatingMaster] = useState(false);
  const [masterCreateError, setMasterCreateError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Master Data & Lookups State
  const [masterOptionsByOrganization, setMasterOptionsByOrganization] = useState<Record<string, Record<string, MasterDataOption[]>>>({});
  const [orderLookups, setOrderLookups] = useState<OrderLookupDefinition[]>([]);
  const [lookupStatusByOrganization, setLookupStatusByOrganization] = useState<Record<string, { loading: boolean; errors: Record<string, string> }>>({});
  const lookupCacheRef = useRef(new Map<string, Map<string, { options: MasterDataOption[]; loadedAt: number }>>());
  const lookupRequestsRef = useRef(new Map<string, Promise<void>>());
  const masterOptions = masterOptionsByOrganization[organizationId ?? ""] ?? {};
  const [orderSectionStatus, setOrderSectionStatus] = useState<Record<string, { loading: boolean; error: string }>>({});
  const loadedOrderSectionsRef = useRef(new Set<string>());
  const orderSectionRequestsRef = useRef(new Map<string, Promise<void>>());
  const currentOrderKeyRef = useRef("");
  currentOrderKeyRef.current = `${organizationId ?? ""}:${orderId ?? ""}`;

  const [form, setForm] = useState<OrderFormState>({
    rows: [],
    bomRows: [],
    costingRows: [],
    techPackRows: [],
    measurementRows: [],
    processRows: [],
    processTemplateId: "",
    attachmentRows: [],
    orderQty: 1,
    sellingPricePerPcs: 0,
    orderNo: "",
    sourceStatus: "DIRECT",
    article: "",
    entityName: "",
    category: "",
    subCategory: "",
    season: "",
    styleName: "",
    colors: "",
    buyer: "",
    brand: "",
    sizeGroup: "",
    haveSizeRatio: false,
    ratioOrderQty: "",
    deliveryDate: "",
    finalStatus: "Draft",
    processStatus: "Draft",
  });

  const fetchMasterData = useCallback(async (orgId: string, requestedKeys: string[], forceRefresh = false) => {
    const cache = lookupCacheRef.current.get(orgId) ?? new Map<string, { options: MasterDataOption[]; loadedAt: number }>();
    lookupCacheRef.current.set(orgId, cache);
    const now = Date.now();
    const keys = [...new Set(requestedKeys)];
    const staleKeys = keys.filter((key) => {
      const entry = cache.get(key);
      return forceRefresh || !entry || now - entry.loadedAt >= 60000;
    });

    if (staleKeys.length === 0) return true;

    const newKeys = staleKeys.filter((key) => !lookupRequestsRef.current.has(`${orgId}:${key}`));
    const requestPromises = new Set<Promise<void>>();
    const requestKeys = new Set(newKeys);
    let newRequestPromise: Promise<void> | undefined;

    for (const key of staleKeys) {
      const pendingRequest = lookupRequestsRef.current.get(`${orgId}:${key}`);
      if (pendingRequest) requestPromises.add(pendingRequest);
    }

    if (newKeys.length > 0) {
      setLookupStatusByOrganization((current) => ({
        ...current,
        [orgId]: {
          loading: true,
          errors: Object.fromEntries(
            Object.entries(current[orgId]?.errors ?? {}).filter(([key]) => !newKeys.includes(key)),
          ),
        },
      }));
      const query = new URLSearchParams({
        shape: "compact",
        keys: newKeys.join(","),
        includeArticleDetails: "false",
      });
      newRequestPromise = (async () => {
        const response = await fetch(
          `/api/organizations/${encodeURIComponent(orgId)}/master-data/order-lookups?${query.toString()}`,
          { cache: "no-store" },
        );
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const errorMessage = isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Unable to load order lookups.";
          throw new Error(errorMessage);
        }
        if (!isRecord(data) || !isRecord(data.masterOptions) || !Array.isArray(data.orderLookups)) {
          throw new Error("The order lookup response was invalid.");
        }

        const options = parseMasterOptions(data.masterOptions);
        for (const key of newKeys) {
          cache.set(key, { options: options[key] ?? [], loadedAt: Date.now() });
        }
        setMasterOptionsByOrganization((current) => ({
          ...current,
          [orgId]: { ...(current[orgId] ?? {}), ...options },
        }));
        setOrderLookups(parseOrderLookups(data));
      })();
      for (const key of newKeys) {
        lookupRequestsRef.current.set(`${orgId}:${key}`, newRequestPromise);
      }
      requestPromises.add(newRequestPromise);
    }

    try {
      await Promise.all(requestPromises);
      setLookupStatusByOrganization((current) => ({
        ...current,
        [orgId]: {
          loading: false,
          errors: Object.fromEntries(
            Object.entries(current[orgId]?.errors ?? {}).filter(([key]) => !staleKeys.includes(key)),
          ),
        },
      }));
      return true;
    } catch (error) {
      console.error("Error fetching order lookups:", error);
      const message = error instanceof Error ? error.message : "Unable to load order lookups.";
      setLookupStatusByOrganization((current) => ({
        ...current,
        [orgId]: {
          loading: false,
          errors: {
            ...(current[orgId]?.errors ?? {}),
            ...Object.fromEntries(staleKeys.map((key) => [key, message])),
          },
        },
      }));
      return false;
    } finally {
      for (const key of requestKeys) {
        if (lookupRequestsRef.current.get(`${orgId}:${key}`) === newRequestPromise) {
          lookupRequestsRef.current.delete(`${orgId}:${key}`);
        }
      }
      const loading = [...lookupRequestsRef.current.keys()].some((key) => key.startsWith(`${orgId}:`));
      setLookupStatusByOrganization((current) => ({
        ...current,
        [orgId]: { ...(current[orgId] ?? { errors: {} }), loading },
      }));
    }
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    void fetchMasterData(organizationId, LOOKUP_KEYS_BY_TAB[activeTab]);
  }, [activeTab, fetchMasterData, organizationId]);

  useEffect(() => {
    const existingOrderId = orderId || variantFrom;
    if (!existingOrderId || !organizationId) {
      return;
    }
    const sourceOrderId = existingOrderId;

    let isMounted = true;
    async function loadOrder() {
      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(sourceOrderId)}?organizationId=${encodeURIComponent(organizationId)}${variantFrom ? "" : "&view=core"}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Unable to load order.");
        }

        const order = data.order;
        if (!isMounted || !order) return;

        const variantRows = (order.finishedGoods ?? []).map((row: Record<string, unknown>) => {
          const rowSize = String(row.size ?? row.buyerSize ?? "").trim();
          const matchingVariantRow = variantRowsLookup.find((candidate) => String(candidate.size ?? "").trim() === rowSize);
          const rowQty = matchingVariantRow?.qty !== undefined && matchingVariantRow?.qty !== null ? Number(matchingVariantRow.qty) : "";

          return {
            ...row,
            buyerSize: row.buyerSize ?? "",
            size: row.size ?? row.buyerSize ?? "",
            beforeExcessQty: rowQty,
            excess: "",
            excessQty: "",
            totalQty: rowQty,
            buyerPoPrice: row.buyerPoPrice ?? "",
            exchangePrice: row.exchangePrice ?? "",
            priceInInr: row.priceInInr ?? "",
          };
        });

        setForm((current) => {
          const nextForm = {
          ...current,
          ...order,
          ...(!variantFrom
            ? {
                rows: [],
                bomRows: [],
                processRows: [],
              }
            : {}),
          ...(variantFrom
            ? {
                orderNo: "",
                article: "",
                styleName: variantStyleName || order.styleName || "",
                colors: variantColors || order.colors || "",
                orderQty: calculateFinishedGoodsRows(variantRows).orderQty,
                ratioOrderQty: "",
                finalStatus: "Draft",
                processStatus: "Draft",
                processTemplateId: "",
                processRows: [],
                rows: variantRows,
              }
            : {}),
          deliveryDate: order.deliveryDate ? String(order.deliveryDate).slice(0, 10) : "",
          ratioOrderQty: variantFrom ? "" : order.ratioOrderQty ?? "",
          orderQty: variantFrom ? calculateFinishedGoodsRows(variantRows).orderQty : (order.orderQty ?? ""),
          rows: variantFrom
            ? variantRows
            : (order.finishedGoods ?? []).map((row: Record<string, unknown>) => ({
                ...row,
                beforeExcessQty: row.beforeExcessQty ?? "",
                excess: row.excess ?? "",
                excessQty: row.excessQty ?? "",
                totalQty: row.totalQty ?? "",
                buyerPoPrice: row.buyerPoPrice ?? "",
                exchangePrice: row.exchangePrice ?? "",
                priceInInr: row.priceInInr ?? "",
              })),
          bomRows: order.bomItems ?? [],
          processTemplateId: variantFrom ? "" : order.processTemplate?.id ?? order.process_template_id ?? "",
          processRows: variantFrom
            ? []
            : (order.processSteps ?? []).map((step: {
                id?: string;
                process_id?: string;
                process?: { id?: string; process_name?: string };
                process_name?: string;
                sl_no?: number;
                operations?: Array<{
                  id?: string;
                  source_operation_template_step_id?: string;
                  operation?: string;
                  sl_no?: number;
                  price?: number | string | null;
                }>;
              }) => ({
                id: step.id,
                processId: step.process_id ?? step.process?.id,
                processName: step.process_name ?? step.process?.process_name,
                operation: step.process_name ?? step.process?.process_name,
                slNo: step.sl_no,
                operations: (step.operations ?? []).map((operation) => ({
                  id: operation.id,
                  sourceOperationId: operation.source_operation_template_step_id,
                  operation: operation.operation,
                  slNo: operation.sl_no,
                  price: operation.price !== null && operation.price !== undefined ? Number(operation.price) : 0,
                })),
              })),
          };
          originalFormRef.current = nextForm;
          return nextForm;
        });
      } catch (error) {
        if (isMounted) {
          alert(error instanceof Error ? error.message : "Unable to load order.");
        }
      } finally {
        if (isMounted) setCompletedOrderLoadKey(`${organizationId}:${sourceOrderId}`);
      }
    }

    loadOrder();
    return () => {
      isMounted = false;
    };
  }, [variantFrom, variantColors, variantRowsLookup, variantStyleName, orderId, organizationId]);

  const loadOrderSection = useCallback(async (section: OrderSection, forceRefresh = false) => {
    if (!orderId || !organizationId) return;
    const requestOrderKey = `${organizationId}:${orderId}`;
    const sectionKey = `${requestOrderKey}:${section}`;
    if (!forceRefresh && loadedOrderSectionsRef.current.has(sectionKey)) return;
    const pendingRequest = orderSectionRequestsRef.current.get(sectionKey);
    if (pendingRequest) return pendingRequest;

    setOrderSectionStatus((current) => ({
      ...current,
      [sectionKey]: { loading: true, error: "" },
    }));
    const requestPromise = (async () => {
      const query = new URLSearchParams({
        organizationId,
        section,
      });
      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}?${query.toString()}`,
        { cache: "no-store" },
      );
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(data) || !isRecord(data.order)) {
        const errorMessage = isRecord(data) && typeof data.error === "string"
          ? data.error
          : `Unable to load ${section} order data.`;
        throw new Error(errorMessage);
      }
      if (currentOrderKeyRef.current !== requestOrderKey) return;

      const order = data.order;
      const sectionField = section === "finishedGoods"
        ? "finishedGoods"
        : section === "bom"
          ? "bomItems"
          : "processSteps";
      if (!Array.isArray(order[sectionField])) {
        throw new Error(`The ${section} order response was invalid.`);
      }
      const sectionFormData: Partial<OrderFormState> = section === "finishedGoods"
        ? {
            rows: Array.isArray(order.finishedGoods)
              ? order.finishedGoods.map((row) => ({
                  ...row,
                  beforeExcessQty: row.beforeExcessQty ?? "",
                  excess: row.excess ?? "",
                  excessQty: row.excessQty ?? "",
                  totalQty: row.totalQty ?? "",
                  buyerPoPrice: row.buyerPoPrice ?? "",
                  exchangePrice: row.exchangePrice ?? "",
                  priceInInr: row.priceInInr ?? "",
                }))
              : [],
          }
        : section === "bom"
          ? { bomRows: Array.isArray(order.bomItems) ? order.bomItems : [] }
          : {
              processTemplateId: typeof order.process_template_id === "string"
                ? order.process_template_id
                : "",
              processRows: parseOrderProcessRows(order.processSteps),
            };

      setForm((current) => {
        const updatedForm = { ...current, ...sectionFormData };
        if (originalFormRef.current) {
          originalFormRef.current = { ...originalFormRef.current, ...sectionFormData };
        }
        return updatedForm;
      });
      loadedOrderSectionsRef.current.add(sectionKey);
    })();

    orderSectionRequestsRef.current.set(sectionKey, requestPromise);
    try {
      await requestPromise;
      if (currentOrderKeyRef.current === requestOrderKey) {
        setOrderSectionStatus((current) => ({
          ...current,
          [sectionKey]: { loading: false, error: "" },
        }));
      }
    } catch (error) {
      console.error(`Error fetching order ${section} section:`, error);
      if (currentOrderKeyRef.current === requestOrderKey) {
        setOrderSectionStatus((current) => ({
          ...current,
          [sectionKey]: {
            loading: false,
            error: error instanceof Error ? error.message : `Unable to load ${section} order data.`,
          },
        }));
      }
    } finally {
      if (orderSectionRequestsRef.current.get(sectionKey) === requestPromise) {
        orderSectionRequestsRef.current.delete(sectionKey);
      }
    }
  }, [orderId, organizationId]);

  useEffect(() => {
    const section = ORDER_SECTIONS_BY_TAB[activeTab];
    if (!section || !orderId || isOrderLoading) return;
    void loadOrderSection(section);
  }, [activeTab, isOrderLoading, loadOrderSection, orderId]);

  // Handler to open/redirect to create master view using the `+ New` button
  const handleOpenCreateMaster = async (masterKey: string, returnFieldKey?: string) => {
    const definition = getMasterDefinition(masterKey);
    if (!definition) return;

    if (newMasterKey && returnFieldKey) {
      setQuickMasterStack((current) => [
        ...current,
        { masterKey: newMasterKey, fields: quickMasterFields, lookupOptions: quickMasterLookupOptions, returnFieldKey },
      ]);
    }
    setNewMasterKey(masterKey);
    setQuickMasterFields(Object.fromEntries(definition.fields.map((field) => [field.key, field.type === "checkbox" ? false : field.multiple ? [] : ""])));
    setMasterCreateError("");

    const lookupKeys = [...new Set(definition.fields.filter((field) => field.type === "lookup" && field.lookupModuleKey).map((field) => field.lookupModuleKey as string))];
    const lookupResults = await Promise.all(lookupKeys.map(async (lookupKey) => {
      try {
        const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/${encodeURIComponent(lookupKey)}`, { cache: "no-store" });
        const data = response.ok ? await response.json() : [];
        return [lookupKey, Array.isArray(data) ? data : data.items ?? []] as const;
      } catch {
        return [lookupKey, []] as const;
      }
    }));
    setQuickMasterLookupOptions(Object.fromEntries(lookupResults));
  };

  const handleCreateMaster = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !newMasterKey) return;

    const definition = getMasterDefinition(newMasterKey);
    const labelKey = definition?.labelField ?? definition?.fields[0]?.key;
    const label = labelKey ? String(quickMasterFields[labelKey] ?? "").trim() : "";
    if (!definition || !label) return;

    try {
      setIsCreatingMaster(true);
      setMasterCreateError("");
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/${encodeURIComponent(newMasterKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          fields: quickMasterFields,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Unable to create master value.");
      }

      if (ORDER_LOOKUP_KEYS.has(newMasterKey)) {
        await fetchMasterData(organizationId, [newMasterKey], true);
      }

      const formFieldByMasterKey: Record<string, string> = {
        article: "article",
        entity: "entityName",
        category: "category",
        "sub-category": "subCategory",
        season: "season",
        color: "colors",
        buyer: "buyer",
        brand: "brand",
        "size-group": "sizeGroup",
      };
      const formField = formFieldByMasterKey[newMasterKey];
      const previousMaster = quickMasterStack.at(-1);
      if (previousMaster) {
        const previousDefinition = getMasterDefinition(previousMaster.masterKey);
        const previousField = previousDefinition?.fields.find((field) => field.key === previousMaster.returnFieldKey);
        const lookupKey = previousField?.lookupModuleKey;
        const restoredLookupOptions = { ...previousMaster.lookupOptions };
        if (lookupKey) {
          restoredLookupOptions[lookupKey] = [
            ...(restoredLookupOptions[lookupKey] ?? []).filter((option) => option.label !== label),
            { id: data?.id ?? data?.value_id ?? label, label },
          ];
        }
        setQuickMasterFields({ ...previousMaster.fields, [previousMaster.returnFieldKey]: label });
        setQuickMasterLookupOptions(restoredLookupOptions);
        setQuickMasterStack((current) => current.slice(0, -1));
        setNewMasterKey(previousMaster.masterKey);
        setMasterCreateError("");
      } else if (formField) {
        setForm((current) => ({ ...current, [formField]: label }));
        setNewMasterKey(null);
      } else {
        setNewMasterKey(null);
      }
    } catch (error) {
      setMasterCreateError(error instanceof Error ? error.message : "Unable to create master value.");
    } finally {
      setIsCreatingMaster(false);
    }
  };

  const closeQuickMaster = () => {
    setNewMasterKey(null);
    setQuickMasterStack([]);
    setMasterCreateError("");
  };

  const handleSizeGroupChange = (sizeGroup: string) => {
    const selectedGroup = (masterOptions["size-group"] ?? []).find((group) => group.label === sizeGroup || group.id === sizeGroup || group.value_id === sizeGroup);
    const mappedSizes = Array.isArray(selectedGroup?.sizes) ? selectedGroup.sizes : [];
    setForm((current) => ({
      ...current,
      sizeGroup,
      rows: mappedSizes.length > 0
        ? mappedSizes.map((size) => {
            const sizeValue = typeof size === "object" && size !== null
              ? (size as Record<string, unknown>).label ?? (size as Record<string, unknown>).name ?? ""
              : size;
            return {
            buyerSize: "",
            size: String(sizeValue).trim(),
            beforeExcessQty: "",
            excess: "",
            excessQty: "",
            totalQty: "",
            buyerPoPrice: "",
            exchangePrice: "",
            priceInInr: "",
            };
          }).filter((row) => row.size)
        : [],
    }));
    if (orderId && organizationId) {
      loadedOrderSectionsRef.current.add(`${organizationId}:${orderId}:finishedGoods`);
    }
  };

  const renderBomMasterSelect = (
    value: string,
    onChange: (value: string) => void,
    masterKey: string,
    placeholder: string,
    parentValue?: string,
  ) => {
    let options: MasterDataOption[] = masterOptions[masterKey] ?? [];
    if (parentValue) {
      const parentOption = (masterOptions["raw-material-category"] ?? []).find((option) => option.label === parentValue);
      if (parentOption) {
        options = options.filter((option) => option.parent_id === parentOption.id || option.parentValueId === parentOption.id);
      }
    }
    if (value && !options.some((option) => option.label === value)) {
      options = [{ id: "legacy-bom-value", label: value, is_active: true }, ...options];
    }
    return (
      <Select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-700 shadow-sm"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id ?? option.label} value={option.label}>
            {option.label}{option.is_active === false ? " (Not approved)" : ""}
          </option>
        ))}
      </Select>
    );
  };

  const renderQuickMasterField = (field: MasterFieldDefinition) => {
    const hiddenArticleQuickCreateFields = new Set([
      "running_order_variants",
      "running_order_qty",
      "designed_date",
      "design_by",
      "article_code",
    ]);
    if (newMasterKey === "article" && hiddenArticleQuickCreateFields.has(field.key)) return null;

    const value = quickMasterFields[field.key];
    const setValue = (nextValue: unknown) => setQuickMasterFields((current) => ({ ...current, [field.key]: nextValue }));

    if (field.type === "checkbox") {
      return (
        <label key={field.key} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Checkbox checked={value === true} onChange={(event) => setValue(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
          {field.label}
        </label>
      );
    }

    if (field.type === "picklist" || field.type === "lookup") {
      let options: MasterDataOption[] = field.type === "lookup" ? quickMasterLookupOptions[field.lookupModuleKey ?? ""] ?? [] : (field.options ?? []).map((option) => ({ id: option, label: option }));
      if (field.dependsOn) {
        const parentValue = String(quickMasterFields[field.dependsOn] ?? "");
        const currentDefinition = newMasterKey ? getMasterDefinition(newMasterKey) : null;
        const parentField = currentDefinition?.fields.find((candidate) => candidate.key === field.dependsOn);
        const parentOptions = quickMasterLookupOptions[parentField?.lookupModuleKey ?? ""] ?? [];
        const parentOption = parentOptions.find((option) => option.label === parentValue);
        if (parentOption) {
          const parentIds = new Set(
            [parentOption.id, parentOption.value_id]
              .filter(Boolean)
              .map((value) => String(value)),
          );
          options = options.filter((option) => {
            const optionParentIds = [option.parent_id, option.parentValueId]
              .filter(Boolean)
              .map((value) => String(value));
            return optionParentIds.some((value) => parentIds.has(value))
              || option.parent_label === parentOption.label;
          });
        } else if (parentValue) {
          options = [];
        }
      }
      if (field.type === "lookup" && field.multiple) {
        const selectedValues = Array.isArray(value) ? value.map(String) : [];
        return (
          <div key={field.key} className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>{field.label}{field.required ? " *" : ""}</span>
              <span className="font-normal text-slate-500">{selectedValues.length} selected</span>
            </div>
            <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
              {options.length === 0 ? (
                <p className="px-2 py-1 text-xs font-normal text-slate-500">No Size records available.</p>
              ) : (
                options.map((option) => {
                  const optionValue = String(option.label);
                  const checked = selectedValues.includes(optionValue);
                  return (
                    <div key={option.id ?? option.label} className="rounded px-2 py-1.5 text-xs font-normal hover:bg-emerald-50">
                      <Checkbox
                        label={String(option.label)}
                        checked={checked}
                        onChange={() => setValue(checked ? selectedValues.filter((item) => item !== optionValue) : [...selectedValues, optionValue])}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      }
      return (
        <div key={field.key} className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          <div className="flex items-center justify-between">
            <label htmlFor={`quick-master-${field.key}`}>{field.label}{field.required ? " *" : ""}</label>
            {field.type === "lookup" && field.lookupModuleKey && (
              <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenCreateMaster(field.lookupModuleKey as string, field.key)} className="px-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700">
                + New
              </Button>
            )}
          </div>
          <Select id={`quick-master-${field.key}`} required={field.required} multiple={field.multiple} value={field.multiple ? (Array.isArray(value) ? value.map(String) : []) : String(value ?? "")} onChange={(event) => {
            const nextValue = field.multiple ? Array.from(event.target.selectedOptions, (option) => option.value) : event.target.value;
            setValue(nextValue);
            const currentDefinition = newMasterKey ? getMasterDefinition(newMasterKey) : null;
            for (const dependentField of currentDefinition?.fields.filter((candidate) => candidate.dependsOn === field.key) ?? []) {
              setQuickMasterFields((current) => ({ ...current, [dependentField.key]: dependentField.multiple ? [] : "" }));
            }
          }} className={`rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal focus:border-emerald-500 focus:outline-none${field.multiple ? " min-h-28" : ""}`}>
            {!field.multiple && <option value="">Select {field.label}</option>}
            {options.map((option) => <option key={option.id ?? option.label} value={option.label}>{option.label}</option>)}
          </Select>
        </div>
      );
    }

    return (
      <div key={field.key} className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
        <label htmlFor={`quick-master-${field.key}`}>{field.label}{field.required ? " *" : ""}</label>
        <Input id={`quick-master-${field.key}`} required={field.required} type={field.type === "number" || field.type === "percentage" || field.type === "decimal" ? "number" : field.type === "url" ? "url" : "text"} step={field.type === "percentage" || field.type === "decimal" ? "0.01" : undefined} value={String(value ?? "")} onChange={(event) => setValue(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 font-normal focus:border-emerald-500 focus:outline-none" />
      </div>
    );
  };

  const goBack = () => {
    router.back();
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const missingField = getMissingRequiredOrderField(
        form,
        orderId ? form.sourceStatus : "DIRECT",
      );
      if (missingField) {
        throw new Error(`Blocking Field Missing: '${missingField}' is required.`);
      }
      if (!Number.isFinite(Number(form.orderQty)) || Number(form.orderQty) <= 0) {
        throw new Error("Blocking Field Missing: 'Order Qty' must be greater than 0.");
      }
      if (form.haveSizeRatio && (!Number.isFinite(Number(form.ratioOrderQty)) || Number(form.ratioOrderQty) <= 0)) {
        throw new Error("Blocking Field Missing: 'Ratio Order Qty' must be greater than 0.");
      }
      const endpoint = orderId
        ? `/api/orders/${encodeURIComponent(orderId)}?organizationId=${encodeURIComponent(organizationId)}`
        : `/api/orders?organizationId=${encodeURIComponent(organizationId)}`;
      const method = orderId ? "PUT" : "POST";
      const sectionKey = `${organizationId}:${orderId}`;
      const loadedSections = new Set<OrderSection>(
        (["finishedGoods", "bom", "process"] as const).filter((section) =>
          loadedOrderSectionsRef.current.has(`${sectionKey}:${section}`),
        ),
      );
      const payload = buildOrderSavePayload(form, organizationId, orderId, loadedSections);

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const serverMessage = errorData?.message || errorData?.error || `Server responded with status ${response.status}`;
        throw new Error(`Blocking Error: ${serverMessage}`);
      }

      if (orderId) {
        originalFormRef.current = form;
        setSaveNotice("Order updated successfully.");
        router.replace(detailPath);
      } else {
        router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order`);
      }
    } catch (error) {
      console.error("Error saving order:", error);
      alert(error instanceof Error ? error.message : "Failed to save order. Please check your inputs and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const openShareDialog = () => setShareOpen(true);

  const cancelEditing = () => {
    if (originalFormRef.current) setForm(originalFormRef.current);
    setSaveNotice("");
    router.replace(detailPath);
  };

  const handleShare = async () => {
    if (!orderId) return;
    try {
      setIsSharing(true);
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceOrganizationId: organizationId }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to share order.");
      setShareOpen(false);
      alert("Order shared with the buyer. The buyer workspace has been notified.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to share order.");
    } finally {
      setIsSharing(false);
    }
  };

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "details", label: "General Details" },
    { id: "finishedGoods", label: "Finished Goods", count: form.rows.length },
    { id: "bom", label: "Bill of Materials", count: form.bomRows.length },
    { id: "costing", label: "Costing", count: form.costingRows?.length ?? 0 },
    { id: "techPack", label: "Tech Pack", count: form.techPackRows?.length ?? 0 },
    { id: "measurements", label: "Measurements", count: form.measurementRows?.length ?? 0 },
    { id: "process", label: "Process", count: form.processRows?.length ?? 0 },
    { id: "attachments", label: "Attachments", count: form.attachmentRows?.length ?? 0 },
  ];

  const tabContentFallback = (
    <Card className="min-h-64 space-y-4" role="status" aria-label="Loading order section">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-32 w-full" />
    </Card>
  );

  const renderActiveTabContent = () => {
    if (orderId && isOrderLoading) return tabContentFallback;
    const orderSection = ORDER_SECTIONS_BY_TAB[activeTab];
    if (orderId && orderSection) {
      const sectionKey = `${organizationId}:${orderId}:${orderSection}`;
      if (!loadedOrderSectionsRef.current.has(sectionKey)) return null;
    }

    if (activeTab === "details") {
      return (
        <OrderDetailsTab
          form={form}
          setForm={setForm}
          masterOptions={masterOptions}
          orderLookups={orderLookups}
          onOpenCreateMaster={handleOpenCreateMaster}
          onSizeGroupChange={handleSizeGroupChange}
          isCreateMode={!orderId}
        />
      );
    }

    return (
      <Suspense fallback={tabContentFallback}>
        {activeTab === "finishedGoods" && <FinishedGoodsTab form={form} setForm={setForm} masterOptions={masterOptions} onOpenCreateMaster={handleOpenCreateMaster} isVariantMode={Boolean(variantFrom)} />}
        {activeTab === "bom" && <BomTab form={form} setForm={setForm} renderMasterSelect={renderBomMasterSelect} onOpenCreateMaster={handleOpenCreateMaster} masterOptions={masterOptions} />}
        {activeTab === "costing" && <CostingTab form={form} setForm={setForm} />}
        {activeTab === "techPack" && <TecPackTab form={form} setForm={setForm} />}
        {activeTab === "measurements" && <MeasurementsTab form={form} setForm={setForm} />}
        {activeTab === "process" && <ProcessTab form={form} setForm={(update) => setForm((current) => ({ ...current, ...update({ processTemplateId: current.processTemplateId, processRows: getProcessRows(current.processRows) }) }))} organizationId={organizationId} isOrderLoading={isOrderLoading} />}
        {activeTab === "attachments" && <AttachmentsTab form={form} setForm={setForm} />}
      </Suspense>
    );
  };
  const activeLookupKeys = LOOKUP_KEYS_BY_TAB[activeTab];
  const activeLookupError = organizationId
    ? activeLookupKeys.map((key) => lookupStatusByOrganization[organizationId]?.errors[key]).find(Boolean)
    : undefined;

  return (
    <div className={`space-y-4 p-4 text-xs${orderId ? "" : " pb-20"}`}>
      {/* Header and Tab Navigation Block */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={goBack}
              className="rounded-lg px-3 py-1.5 font-semibold"
            >
              ← Back
            </Button>
            <h2 className="text-lg font-bold text-slate-900">
              {orderId ? isEditing ? "Edit Order" : "Order Details" : "Create New Order"}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {orderId && <Button type="button" variant="secondary" onClick={openShareDialog} className="px-4 py-2">Share with Buyer</Button>}
            {orderId && !isEditing && <Button type="button" onClick={() => router.push(`${detailPath}?mode=edit`)}>Edit</Button>}
            {orderId && isEditing && <Button type="button" variant="secondary" onClick={cancelEditing} disabled={isSaving}>Cancel</Button>}
            {orderId && isEditing && <Button type="button" onClick={handleSave} disabled={isSaving} className="px-4 py-2">{isSaving ? "Saving..." : "Save Order"}</Button>}
          </div>
        </div>

        {shareOpen && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center justify-between"><div><h3 className="font-bold text-emerald-950">Share with Buyer</h3><p className="mt-1 text-emerald-800">The buyer configured for this order will receive a workspace notification.</p><p className="mt-1 text-xs text-emerald-700">Internal consumption and internal price are never shared with the buyer.</p></div><Button type="button" variant="ghost" onClick={() => setShareOpen(false)} className="text-sm font-semibold">Close</Button></div><div className="mt-3 flex gap-2"><Button type="button" onClick={() => void handleShare()} disabled={isSharing} className="rounded-md px-4 py-2 font-semibold">{isSharing ? "Sharing..." : "Confirm and share"}</Button></div></div>}
        {/* Scrollable Tab Navigation */}
        <Tabs
          tabs={tabs.map((tab) => ({ value: tab.id, label: `${tab.label}${tab.count !== undefined && tab.count > 0 ? ` (${tab.count})` : ""}`, panelId: "merchandising-order-tab-panel" }))}
          value={activeTab}
          onChange={(value) => setActiveTab(value as TabType)}
          ariaLabel="Merchandising order sections"
        />
      </div>

      {/* Tab Content Area */}
      <div id="merchandising-order-tab-panel" className="pt-2" role="tabpanel">
        {saveNotice && <p role="status" className="mb-3 rounded-md border border-[var(--erp-border)] bg-[var(--erp-brand-soft)] px-3 py-2 text-sm text-[var(--erp-brand)]">{saveNotice}</p>}
        {organizationId && activeLookupKeys.length > 0 && lookupStatusByOrganization[organizationId]?.loading && (
          <p role="status" className="mb-3 text-sm text-slate-600">Loading order lookups…</p>
        )}
        {organizationId && activeLookupError && (
          <Card className="mb-3 space-y-3" role="alert">
            <p>{activeLookupError}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void fetchMasterData(organizationId, LOOKUP_KEYS_BY_TAB[activeTab], true)}
            >
              Retry lookup loading
            </Button>
          </Card>
        )}
        {orderId && ORDER_SECTIONS_BY_TAB[activeTab] && (() => {
          const section = ORDER_SECTIONS_BY_TAB[activeTab] as OrderSection;
          const sectionKey = `${organizationId}:${orderId}:${section}`;
          const sectionStatus = orderSectionStatus[sectionKey];
          if (loadedOrderSectionsRef.current.has(sectionKey)) return null;
          if (sectionStatus?.loading) {
            return <div className="mb-3">{tabContentFallback}</div>;
          }
          if (sectionStatus?.error) {
            return (
              <Card className="mb-3 space-y-3" role="alert">
                <p>{sectionStatus.error}</p>
                <Button type="button" variant="secondary" onClick={() => void loadOrderSection(section, true)}>
                  Retry section loading
                </Button>
              </Card>
            );
          }
          return null;
        })()}
        <fieldset disabled={Boolean(orderId) && !isEditing} className="min-w-0 border-0 p-0">
          {renderActiveTabContent()}
        </fieldset>
      </div>

      {!orderId && (
        <div
          role="region"
          aria-label="Order actions"
          className="fixed bottom-0 right-0 z-30 border-t border-slate-200 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(15,23,42,0.08)] backdrop-blur"
          style={{ left: "var(--organization-sidebar-width, 0px)" }}
        >
          <div className="flex justify-end px-6 py-2 sm:px-8">
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="min-w-28">
            {isSaving ? "Saving..." : "Save Order"}
            </Button>
          </div>
        </div>
      )}

      {newMasterKey && getMasterDefinition(newMasterKey) && (
        <Modal open onClose={closeQuickMaster} ariaLabelledBy="quick-master-title" size="md" className="p-5">
          <form onSubmit={handleCreateMaster} className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Quick create</p>
                <h3 id="quick-master-title" className="text-base font-bold text-slate-900">
                  New {getMasterDefinition(newMasterKey)?.label}
                </h3>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={closeQuickMaster} aria-label="Close">
                X
              </Button>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {getMasterDefinition(newMasterKey)?.fields.map(renderQuickMasterField)}
            </div>

            {masterCreateError && <p className="text-xs text-red-600">{masterCreateError}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button type="button" variant="secondary" size="sm" onClick={closeQuickMaster}>
                Cancel
              </Button>
              <Button type="submit" disabled={isCreatingMaster} size="sm">
                {isCreatingMaster ? "Creating..." : "Create and select"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
