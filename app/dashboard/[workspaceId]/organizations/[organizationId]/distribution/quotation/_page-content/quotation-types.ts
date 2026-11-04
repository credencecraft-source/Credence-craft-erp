export type DistributionQuotationLine = {
  id: string;
  sourceBookingId: string;
  endCustomer: string;
  bookingNo: string;
  orderNo: string;
  description: string;
  brand: string;
  styleName: string;
  quantity: number;
  sizes: Array<{
    size: string;
    bookedQuantity: number;
  }>;
  unitPrice: string;
  lineTotal: string;
  taxRate: string;
  taxType: string;
  cgstRate: string;
  sgstRate: string;
  igstRate: string;
  vatRate: string;
  salesTaxRate: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  vatAmount: string;
  salesTaxAmount: string;
  taxAmount: string;
  totalAmount: string;
};

export type DistributionQuotation = {
  id: string;
  quotationNo: string;
  quotationDate: string;
  validUntil: string;
  orderNo: string;
  vendorId: string | null;
  contactId: string | null;
  customer: string;
  notes: string;
  mode: string;
  status: string;
  totalQuantity: number;
  subtotal: string;
  deliveryCharge: string;
  deliveryTaxRate: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  vatAmount: string;
  salesTaxAmount: string;
  taxAmount: string;
  grandTotal: string;
  parentQuotationId: string | null;
  createdAt: string;
  lines: DistributionQuotationLine[];
};

export type DistributionQuotationSummary = Pick<
  DistributionQuotation,
  "id" | "quotationNo" | "quotationDate" | "customer" | "orderNo" | "mode" | "status" | "totalQuantity" | "subtotal" | "createdAt" | "parentQuotationId"
> & {
  contactRole: string;
  childCount?: number;
};

export type DistributionQuotationTaxOption = {
  value: string;
  label: string;
  taxType: string;
  cgstRate: string;
  sgstRate: string;
  igstRate: string;
  vatRate: string;
  salesTaxRate: string;
};

export type DistributionQuotationTaxOptions = {
  taxRegime: string;
  country: string;
  options: DistributionQuotationTaxOption[];
  organizationState: string | null;
  organizationGstin: string | null;
  counterpartyState: string | null;
  counterpartyGstin: string | null;
};
