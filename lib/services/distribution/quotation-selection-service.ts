export type MasterQuotationChildSource = {
  quoteId: string;
  parentQuoteId?: string;
  childQuoteIds?: string[];
};

export function validateMasterQuotationChildSelection(
  selectedQuoteIds: string[],
  quotations: MasterQuotationChildSource[],
): string {
  if (selectedQuoteIds.length < 2) {
    return "Select at least two quotations to create a sales order.";
  }
  if (new Set(selectedQuoteIds).size !== selectedQuoteIds.length) {
    return "A quotation can only be included once in a sales order.";
  }

  const selectedIdSet = new Set(selectedQuoteIds);
  const selectedQuotes = new Map<string, MasterQuotationChildSource>();
  for (const quotation of quotations) {
    if (!selectedIdSet.has(quotation.quoteId)) continue;
    if (selectedQuotes.has(quotation.quoteId)) {
      return "Selected quotation IDs are not unique in the saved data.";
    }
    selectedQuotes.set(quotation.quoteId, quotation);
  }
  if (selectedQuotes.size !== selectedQuoteIds.length) {
    return "One or more selected quotations are no longer available.";
  }
  if ([...selectedQuotes.values()].some((quotation) =>
    Boolean(quotation.parentQuoteId?.trim()) || Boolean(quotation.childQuoteIds?.length),
  )) {
    return "Only quotations that are not already part of a sales order can be selected.";
  }

  return "";
}

export type BookingQuotationSource = {
    bookingId: string;
    orderNo: string;
    vendorId: string | null;
    customer: string | null;
    totalBooked: number;
};

export function filterAdvanceBookingsForView<T extends { quotationNo: string | null }>(
  bookings: T[],
  view: "booking" | "fulfillment" | "shipment",
) {
  return bookings.filter((booking) => (
    view === "booking" ? !booking.quotationNo : Boolean(booking.quotationNo)
  ));
}

export function filterFullyAssignedBookings<T extends { assignmentStatus: string }>(bookings: T[]) {
  return bookings.filter((booking) => booking.assignmentStatus === "FULLY_ASSIGNED");
}

export function filterBookingsWaitingForWorkOrderAssignment<T extends { assignmentStatus: string }>(bookings: T[]) {
  return bookings.filter((booking) => booking.assignmentStatus !== "FULLY_ASSIGNED");
}

export function validateBookingQuotationSelection(bookings: BookingQuotationSource[]) {
  if (bookings.length === 0) return "Select at least one advance booking to create a quotation.";
  if (new Set(bookings.map((booking) => booking.bookingId)).size !== bookings.length) {
    return "A booking can only be included once in a quotation.";
  }
  if (bookings.some((booking) => !booking.bookingId.trim() || !booking.orderNo.trim())) {
    return "Every selected booking must have an order.";
  }
  if (bookings.some((booking) => !Number.isSafeInteger(booking.totalBooked) || booking.totalBooked <= 0)) {
    return "Every selected booking must have a positive whole-number quantity.";
  }
  const totalBooked = bookings.reduce((total, booking) => total + booking.totalBooked, 0);
  if (!Number.isSafeInteger(totalBooked)) return "The selected booking quantities exceed the supported quotation total.";
  return "";
}
