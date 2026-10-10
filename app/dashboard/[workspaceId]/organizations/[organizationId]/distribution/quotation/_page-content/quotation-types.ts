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
  unitPrice: string;
  lineTotal: string;
};

export type DistributionQuotation = {
  id: string;
  quotationNo: string;
  quotationDate: string;
  validUntil: string;
  orderNo: string;
  vendorId: string | null;
  customer: string;
  notes: string;
  mode: string;
  status: string;
  totalQuantity: number;
  subtotal: string;
  parentQuotationId: string | null;
  createdAt: string;
  lines: DistributionQuotationLine[];
};

export type DistributionQuotationSummary = Pick<
  DistributionQuotation,
  "id" | "quotationNo" | "quotationDate" | "customer" | "orderNo" | "mode" | "status" | "totalQuantity" | "subtotal" | "createdAt" | "parentQuotationId"
>;
