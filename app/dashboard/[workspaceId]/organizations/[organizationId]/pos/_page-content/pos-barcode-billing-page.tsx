"use client";

import { Printer, ScanLine, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";

type StockRecord = {
  id: string;
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
};
type GstOption = {
  id: string;
  label: string;
  fields?: Record<string, unknown>;
};
type MasterLookupOption = {
  id: string;
  value_id?: string;
  label: string;
};
type MasterStateOption = {
  id?: string;
  value_id?: string;
  label?: string | null;
};
type MasterVendorOption = {
  label?: string | null;
};
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
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const router = useRouter();
  const scannerRef = useRef<HTMLInputElement>(null);
  const saleRequestKey = useRef("");
  const [scanValue, setScanValue] = useState("");
  const [records, setRecords] = useState<StockRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<StockRecord | null>(
    null,
  );
  const [billLines, setBillLines] = useState<BillLine[]>([]);
  const [customer, setCustomer] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [taxMode] = useState<"LOCAL" | "INTERSTATE">("LOCAL");
  const otherCharges = "0";
  const [gstOptions, setGstOptions] = useState<GstOption[]>([]);
  const [vendorOptions, setVendorOptions] = useState<string[]>([]);
  const [vendorQuickCreate, setVendorQuickCreate] = useState("");
  const [stateOptions, setStateOptions] = useState<MasterLookupOption[]>([]);
  const [vendorState, setVendorState] = useState("");
  const [vendorSubmitting, setVendorSubmitting] = useState(false);
  const [taxProfile, setTaxProfile] = useState<{
    cgstRate?: number | null;
    sgstRate?: number | null;
    igstRate?: number | null;
  } | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    scannerRef.current?.focus();
    Promise.all([
      fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/general-stock`,
        { cache: "no-store" },
      ).then((response) => response.json()),
      fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/master-data/gst?includeInactive=false`,
        { cache: "no-store" },
      ).then((response) => response.json()),
      fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/tax-rules`,
        { cache: "no-store" },
      ).then((response) => response.json()),
      fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/master-data/vendor?includeInactive=false`,
        { cache: "no-store" },
      ).then((response) => response.json()),
      fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/master-data/state?includeInactive=false`,
        { cache: "no-store" },
      ).then((response) => response.json()),
    ])
      .then(
        ([
          stockData,
          gstData,
          taxData,
          vendorData,
          stateData,
        ]: [
          { records?: StockRecord[]; error?: string },
          GstOption[],
          {
            profile?: {
              cgstRate?: number | null;
              sgstRate?: number | null;
              igstRate?: number | null;
            } | null;
          },
          MasterVendorOption[],
          MasterStateOption[],
        ]) => {
          if (stockData.error) throw new Error(stockData.error);
          setRecords(Array.isArray(stockData.records) ? stockData.records : []);
          setGstOptions(Array.isArray(gstData) ? gstData : []);
          setTaxProfile(taxData.profile ?? null);
          setVendorOptions(
            Array.isArray(vendorData)
              ? Array.from(
                  new Set(
                    vendorData
                      .map((item) => String(item.label ?? "").trim())
                      .filter(Boolean),
                  ),
                ).sort((left, right) => left.localeCompare(right))
              : [],
          );
          setStateOptions(
            Array.isArray(stateData)
              ? stateData
                  .map((item) => ({
                    id: String(item.id ?? item.value_id ?? ""),
                    value_id: item.value_id,
                    label: String(item.label ?? "").trim(),
                  }))
                  .filter((item) => item.id && item.label)
                  .sort((left, right) => left.label.localeCompare(right.label))
              : [],
          );
        },
      )
      .catch((loadError: unknown) => setError(
        loadError instanceof Error ? loadError.message : "Unable to load General finished-goods stock.",
      ));
  }, [organizationId]);

  const createVendor = async () => {
    const name = vendorQuickCreate.trim();
    if (!name || !vendorState || vendorSubmitting) return;
    setVendorSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          moduleKey: "vendor",
          label: name,
          fields: { vendor: name, Registered_State: vendorState },
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        value?: { label?: string | null };
      };
      if (!response.ok) {
        throw new Error(data?.error || "Unable to create vendor.");
      }
      const createdName = String(data?.value?.label ?? name).trim();
      setVendorOptions((current) =>
        Array.from(new Set([...current, createdName])).sort((left, right) =>
          left.localeCompare(right),
        ),
      );
      setCustomer(createdName);
      setVendorQuickCreate("");
      setVendorState("");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create vendor.",
      );
    } finally {
      setVendorSubmitting(false);
    }
  };

  const lookupRecord = async (event: React.FormEvent) => {
    event.preventDefault();
    const barcode = scanValue.trim();
    if (!barcode || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/general-stock?stockId=${encodeURIComponent(barcode)}`,
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
    const record = records.find((item) => item.id === value);
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
        (line) => line.record.id === selectedRecord.id,
      );
      if (existing)
        return current.map((line) =>
          line.record.id === selectedRecord.id
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
        },
      ];
    });
    setSelectedRecord(null);
    scannerRef.current?.focus();
  };

  const updateLine = (
    id: string,
    key: "quantity" | "rate" | "gstRate" | "hsnCode" | "discountPercent",
    value: string,
  ) => {
    setBillLines((current) =>
      current.map((line) => {
        if (line.record.id !== id) return line;

        if (key === "quantity") {
          return {
            ...line,
            quantity: Math.min(
              Math.max(0, Number(value) || 0),
              Math.max(0, Number(line.record.current_stock)),
            ),
          };
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

  const subtotal = billLines.reduce(
    (total, line) =>
      total + line.quantity * line.rate * (1 - line.discountPercent / 100),
    0,
  );
  const taxBreakdown = billLines.reduce(
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
      const taxable =
        line.quantity * line.rate * (1 - line.discountPercent / 100);
      if (taxMode === "INTERSTATE") summary.igst += (taxable * igstRate) / 100;
      else {
        summary.cgst += (taxable * cgstRate) / 100;
        summary.sgst += (taxable * sgstRate) / 100;
      }
      return summary;
    },
    { cgst: 0, sgst: 0, igst: 0 },
  );
  const taxAmount = taxBreakdown.cgst + taxBreakdown.sgst + taxBreakdown.igst;
  const charges = Math.max(0, Number(otherCharges) || 0);
  const grandTotal = subtotal + taxAmount + charges;
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/pos`;
  const saveInvoice = async () => {
    setSavingInvoice(true);
    setError("");
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/pos/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceDate,
          customer,
          taxMode,
          requestKey: saleRequestKey.current || (saleRequestKey.current = crypto.randomUUID()),
          lines: billLines.map((line) => ({
            stockId: line.record.id,
            quantity: String(line.quantity),
            rate: String(line.rate),
            gstRate: String(line.gstRate),
            discountPercent: String(line.discountPercent),
            hsnCode: line.hsnCode,
          })),
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        invoice?: { id?: string; invoiceNo?: string; subtotal?: string; taxAmount?: string; totalAmount?: string };
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
          party: customer || "Walk-in customer",
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
      router.push(`${base}/invoice`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to post POS invoice.");
    } finally {
      setSavingInvoice(false);
    }
  };

  return (
    <Page as="div" className="min-w-0 max-w-[1600px]">
      <div className="print:hidden">
        <Section className="flex min-h-[calc(100vh-2rem)] flex-col gap-4">
          <div className="sticky top-0 z-20 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 bg-white/95 pb-4 backdrop-blur">
            <div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                <SummaryAmount label="Taxable value" value={subtotal} compact />
                <SummaryAmount label="CGST" value={taxBreakdown.cgst} compact />
                <SummaryAmount label="SGST" value={taxBreakdown.sgst} compact />
                <SummaryAmount label="IGST" value={taxBreakdown.igst} compact />
                <SummaryAmount label="Other charges" value={charges} compact />
                <SummaryAmount
                  label="Grand total"
                  value={grandTotal}
                  strong
                  compact
                />
              </div>
              <Button
                type="button"
                onClick={() => void saveInvoice()}
                disabled={billLines.length === 0 || billLines.some((line) => line.quantity < 1) || savingInvoice}
                className="rounded-lg px-4 py-2 text-sm font-semibold"
              >
                  {savingInvoice ? "Posting..." : "Post Invoice"}
              </Button>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(24rem,1fr)]">
            <form
              onSubmit={lookupRecord}
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"
            >
              <label
                className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800"
                htmlFor="barcode-input"
              >
                General Stock Record ID
              </label>
              <div className="mt-2 flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <ScanLine className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-emerald-600" />
                  <Input
                    ref={scannerRef}
                    id="barcode-input"
                    value={scanValue}
                    onChange={(event) => setScanValue(event.target.value)}
                    className="rounded-lg border-emerald-300 bg-white py-3 pl-10 pr-3 text-base outline-none focus:border-emerald-600 focus:ring-emerald-200"
                    placeholder="Scan or enter a General stock record ID"
                    autoComplete="off"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading || !scanValue.trim()}
                  className="rounded-lg px-5 py-3 text-sm font-bold"
                >
                  <Search className="h-4 w-4" />
                  {loading ? "Finding..." : "Find"}
                </Button>
              </div>
              {error && (
                <p className="mt-2 text-sm font-medium text-red-700">{error}</p>
              )}
            </form>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <label
                className="block text-xs font-bold uppercase tracking-[0.16em] text-slate-600"
                htmlFor="stock-record-select"
              >
                Select General stock manually
              </label>
              <Select
                id="stock-record-select"
                aria-label="Select stock record manually"
                value=""
                onChange={(event) => chooseRecord(event.target.value)}
                className="mt-2 rounded-lg px-3 py-2 text-sm text-slate-800"
              >
                <option value="">Select style, order, or General stock</option>
                {records.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.style_name} | {record.order_no} | {record.size || "-"}{" "}
                    | ID: {record.id}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex min-h-[32rem] flex-1">
            <Card className="flex h-full w-full flex-col border-slate-200 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="text-sm font-medium text-slate-700">
                  <label htmlFor="customer-select">Customer</label>
                  <Select
                    id="customer-select"
                    value={customer}
                    onChange={(event) => setCustomer(event.target.value)}
                    className="mt-2 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">Walk-in customer</option>
                    {vendorOptions.map((vendor) => (
                      <option key={vendor} value={vendor}>
                        {vendor}
                      </option>
                    ))}
                  </Select>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
                    <Input
                      value={vendorQuickCreate}
                      onChange={(event) => setVendorQuickCreate(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void createVendor();
                        }
                      }}
                      className="min-w-0 flex-1 rounded-md border-dashed border-slate-300 px-3 py-2 text-xs"
                      placeholder="New vendor name"
                      aria-label="New vendor name"
                    />
                    <Select
                      value={vendorState}
                      onChange={(event) => setVendorState(event.target.value)}
                      className="rounded-md px-3 py-2 text-xs text-slate-700"
                      aria-label="Registered state"
                    >
                      <option value="">Registered state *</option>
                      {stateOptions.map((state) => (
                        <option key={state.id} value={state.id}>
                          {state.label}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void createVendor()}
                      disabled={
                        !vendorQuickCreate.trim() || !vendorState || vendorSubmitting
                      }
                      className="min-h-0 rounded-md border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:border-slate-200 disabled:text-slate-400"
                    >
                      {vendorSubmitting ? "Adding..." : "Add vendor"}
                    </Button>
                  </div>
                </div>
                <label className="text-sm font-medium text-slate-700">
                  Invoice date
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(event) => setInvoiceDate(event.target.value)}
                    className="mt-2 rounded-md px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <div className="mt-6 min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-md border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
                    Bill items
                  </p>
                </div>
                {billLines.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-sm font-semibold text-slate-700">
                          Scan or select General FG stock to start billing
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      The stock record ID is accepted as the barcode.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {billLines.map((line) => (
                      <div
                        key={line.record.id}
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
                                line.record.id,
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
                                line.record.id,
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
                                line.record.id,
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
                                line.record.id,
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
                                line.record.id,
                                "hsnCode",
                                event.target.value,
                              )
                            }
                            className="mt-1 rounded border-slate-300 px-2 py-1 text-right text-sm"
                            placeholder="HSN"
                          />
                        </label>
                        <p className="text-right text-sm font-bold text-slate-900">
                          Rs {(
                            line.quantity *
                            line.rate *
                            (1 - line.discountPercent / 100)
                          ).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </Section>
      </div>
      {invoiceNumber && (
        <SalesInvoicePrint
          invoiceNumber={invoiceNumber}
          invoiceDate={invoiceDate}
          customer={customer}
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
      className={`${compact ? "rounded-md border px-2 py-1.5" : "rounded-md border px-3 py-2"} ${strong ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}
    >
      <p
        className={`${compact ? "text-[8px]" : "text-[10px]"} font-bold uppercase tracking-wide ${strong ? "text-emerald-700" : "text-slate-500"}`}
      >
        {label}
      </p>
      <p
        className={`${compact ? "mt-0.5 text-xs" : "mt-1 text-sm"} ${strong ? "font-black text-emerald-800" : "font-semibold text-slate-900"}`}
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
              {customer || "Walk-in customer"}
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
              <tr key={line.record.id}>
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
    ["Qty In", record.qty_in],
    ["Qty Out", record.qty_out],
    ["Current Stock", record.current_stock],
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stock-details-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
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
      </div>
    </div>
  );
}
