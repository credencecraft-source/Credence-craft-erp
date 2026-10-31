import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";
import {
  getSizeGroupSizeOrderMapForOrganization,
  sortBySizeGroupOrder,
} from "@/lib/master-data/master-data-constants";

const quotationInclude = {
  lines: {
    orderBy: [{ created_at: "asc" as const }, { id: "asc" as const }],
    include: {
      sourceBooking: {
        select: {
          customer: true,
          order: { select: { sizeGroup: true } },
          sizeLines: {
            select: { size: true, booked_quantity: true },
            orderBy: [{ created_at: "asc" as const }, { id: "asc" as const }],
          },
        },
      },
    },
  },
};

const quotationSummarySelect = {
  id: true,
  quotation_no: true,
  quotation_date: true,
  order_no: true,
  customer: true,
  mode: true,
  status: true,
  total_quantity: true,
  subtotal: true,
  parent_quotation_id: true,
  created_at: true,
};

const quotationRegisterSelect = {
  ...quotationSummarySelect,
  vendor_id: true,
  orderForms: {
    select: {
      contact_id: true,
      vendor_id: true,
    },
  },
};

const quotationPartyInclude = {
  select: {
    vendor: true,
    gst_number: true,
    registered_state: true,
    contact: {
      select: {
        legal_name: true,
        email: true,
        phone: true,
        addresses: {
          where: { is_active: true },
          orderBy: [
            { is_default_billing: "desc" as const },
            { is_default_shipping: "desc" as const },
            { created_at: "asc" as const },
          ],
          select: {
            usage: true,
            address_line_1: true,
            address_line_2: true,
            city: true,
            state_name: true,
            postal_code: true,
            country_code: true,
            is_default_billing: true,
            is_default_shipping: true,
            tax_registration: { select: { gstin: true } },
          },
        },
      },
    },
  },
};

const masterQuotationDetailInclude = {
  ...quotationInclude,
  lines: { ...quotationInclude.lines, take: 0 },
  childQuotations: { select: quotationSummarySelect },
};

const masterQuotationPdfInclude = {
  ...masterQuotationDetailInclude,
  childQuotations: {
    orderBy: [{ quotation_date: "asc" as const }, { created_at: "asc" as const }],
    include: { ...quotationInclude, vendor: quotationPartyInclude },
  },
  organization: {
    select: {
      organization_name: true,
      organization_email: true,
      gst_number: true,
      mobile_number: true,
      address_line_1: true,
      address_line_2: true,
      city: true,
      state: true,
      country: true,
      pin_code: true,
    },
  },
  vendor: quotationPartyInclude,
};

function mapQuotationParty(
  vendor: Prisma.MasterVendorGetPayload<{ select: typeof quotationPartyInclude.select }> | null,
  fallbackName: string,
) {
  const addresses = vendor?.contact?.addresses ?? [];
  const billingAddress = addresses.find((address) =>
    address.is_default_billing && (address.usage === "BILLING" || address.usage === "BOTH"),
  ) ?? addresses.find((address) => address.usage === "BILLING" || address.usage === "BOTH");
  const shippingAddress = addresses.find((address) =>
    address.is_default_shipping && (address.usage === "SHIPPING" || address.usage === "BOTH"),
  ) ?? addresses.find((address) => address.usage === "SHIPPING" || address.usage === "BOTH");
  const formatAddress = (address: typeof billingAddress) => address ? {
    lines: [
      address.address_line_1,
      address.address_line_2,
      address.city,
      address.state_name,
      address.postal_code,
      address.country_code,
    ].filter((part): part is string => Boolean(part?.trim())),
    gstin: address.tax_registration?.gstin ?? null,
  } : null;

  return {
    name: vendor?.vendor ?? fallbackName,
    legalName: vendor?.contact?.legal_name ?? null,
    email: vendor?.contact?.email ?? null,
    phone: vendor?.contact?.phone ?? null,
    gstin: vendor?.gst_number ??
      addresses.find((address) => address.tax_registration?.gstin)?.tax_registration?.gstin ?? null,
    registeredState: vendor?.registered_state ?? null,
    billingAddress: formatAddress(billingAddress),
    shippingAddress: formatAddress(shippingAddress),
  };
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function mapQuotation(
  organizationId: string,
  record: Prisma.DistributionQuotationGetPayload<{ include: typeof quotationInclude }>,
  suppliedSizeOrderByGroup?: Map<string, string[]>,
) {
  const sizeOrderByGroup = suppliedSizeOrderByGroup ?? await getSizeGroupSizeOrderMapForOrganization(
    organizationId,
    record.lines.map((line) => line.sourceBooking.order?.sizeGroup ?? ""),
  );
  return {
    id: record.id,
    quotationNo: record.quotation_no,
    quotationDate: record.quotation_date.toISOString().slice(0, 10),
    validUntil: record.valid_until?.toISOString().slice(0, 10) ?? "",
    orderNo: record.order_no,
    vendorId: record.vendor_id,
    customer: record.customer,
    notes: record.notes ?? "",
    mode: record.mode,
    status: record.status,
    totalQuantity: record.total_quantity,
    subtotal: record.subtotal.toFixed(2),
    parentQuotationId: record.parent_quotation_id,
    createdAt: record.created_at.toISOString(),
    lines: record.lines.map((line) => {
      const sizeGroup = line.sourceBooking.order?.sizeGroup ?? "";
      const sizeOrder = sizeOrderByGroup.get(sizeGroup.trim().toLocaleLowerCase()) ?? [];
      const orderedSizeLines = sortBySizeGroupOrder(line.sourceBooking.sizeLines, sizeOrder, (sizeLine) => sizeLine.size);
      return {
        id: line.id,
        sourceBookingId: line.source_booking_id,
        endCustomer: line.sourceBooking.customer ?? "",
        sizes: orderedSizeLines.map((sizeLine) => ({
          size: sizeLine.size,
          bookedQuantity: sizeLine.booked_quantity,
        })),
        bookingNo: line.booking_no,
        orderNo: line.order_no,
        description: line.item_description,
        brand: line.brand ?? "",
        styleName: line.style_name ?? "",
        quantity: line.quantity,
        unitPrice: line.unit_price.toFixed(4),
        lineTotal: line.line_total.toFixed(2),
      };
    }),
  };
}

function mapQuotationSummary(
  record: Prisma.DistributionQuotationGetPayload<{ select: typeof quotationSummarySelect }>,
) {
  return {
    id: record.id,
    quotationNo: record.quotation_no,
    quotationDate: record.quotation_date.toISOString().slice(0, 10),
    orderNo: record.order_no,
    customer: record.customer,
    mode: record.mode,
    status: record.status,
    totalQuantity: record.total_quantity,
    subtotal: record.subtotal.toFixed(2),
    parentQuotationId: record.parent_quotation_id,
    createdAt: record.created_at.toISOString(),
  };
}

export async function listDistributionQuotations(organizationId: string) {
  const quotations = await prisma.distributionQuotation.findMany({
    where: { organization_id: organizationId },
    select: quotationRegisterSelect,
    orderBy: [{ quotation_date: "desc" }, { created_at: "desc" }],
    take: 500,
  });
  const vendorIds = [...new Set(quotations.flatMap((quotation) => [
    ...(quotation.vendor_id ? [quotation.vendor_id] : []),
    ...quotation.orderForms.flatMap((orderForm) => orderForm.vendor_id ? [orderForm.vendor_id] : []),
  ]))];
  const vendors = vendorIds.length
    ? await prisma.masterVendor.findMany({
        where: { organization_id: organizationId, id: { in: vendorIds } },
        select: { id: true, contact_id: true },
      })
    : [];
  const contactIdByVendorId = new Map(vendors.map((vendor) => [vendor.id, vendor.contact_id]));
  const contactIds = [...new Set(quotations.flatMap((quotation) => [
    ...(quotation.vendor_id && contactIdByVendorId.has(quotation.vendor_id)
      ? [contactIdByVendorId.get(quotation.vendor_id)!]
      : []),
    ...quotation.orderForms.flatMap((orderForm) => {
      const contactId = orderForm.contact_id
        ?? (orderForm.vendor_id ? contactIdByVendorId.get(orderForm.vendor_id) : null);
      return contactId ? [contactId] : [];
    }),
  ]))];
  const roleAssignments = contactIds.length
    ? await prisma.contactRoleAssignment.findMany({
        where: {
          organization_id: organizationId,
          contact_id: { in: contactIds },
          is_active: true,
          role: { is_active: true },
        },
        select: {
          contact_id: true,
          role: { select: { label: true } },
        },
        orderBy: [{ contact_id: "asc" }, { role_code: "asc" }],
      })
    : [];
  const rolesByContactId = new Map<string, Set<string>>();
  for (const assignment of roleAssignments) {
    const roles = rolesByContactId.get(assignment.contact_id) ?? new Set<string>();
    roles.add(assignment.role.label);
    rolesByContactId.set(assignment.contact_id, roles);
  }

  return {
    quotations: quotations.map((quotation) => {
      const contactIdsForQuotation = new Set([
        ...(quotation.vendor_id && contactIdByVendorId.has(quotation.vendor_id)
          ? [contactIdByVendorId.get(quotation.vendor_id)!]
          : []),
        ...quotation.orderForms.flatMap((orderForm) => {
          const contactId = orderForm.contact_id
            ?? (orderForm.vendor_id ? contactIdByVendorId.get(orderForm.vendor_id) : null);
          return contactId ? [contactId] : [];
        }),
      ]);
      const contactRole = [...contactIdsForQuotation]
        .flatMap((contactId) => [...(rolesByContactId.get(contactId) ?? [])])
        .filter((role, index, roles) => roles.indexOf(role) === index)
        .join(", ") || "—";
      return { ...mapQuotationSummary(quotation), contactRole };
    }),
  };
}

export async function getDistributionQuotation(
  organizationId: string,
  quotationId: string,
  options: { masterOrder?: boolean; includeChildren?: boolean; salesOrderDocument?: boolean } = {},
) {
  if (options.masterOrder && options.salesOrderDocument) {
    const masterQuotation = await prisma.distributionQuotation.findFirst({
      where: { organization_id: organizationId, id: quotationId, mode: "MASTER" },
      include: masterQuotationPdfInclude,
    });
    if (masterQuotation) {
      const linkedSizeGroups = masterQuotation.childQuotations.flatMap((child) =>
        child.lines.map((line) => line.sourceBooking.order?.sizeGroup ?? ""),
      );
      const sizeOrderByGroup = await getSizeGroupSizeOrderMapForOrganization(organizationId, linkedSizeGroups);
      const sellerAddress = [
        masterQuotation.organization.address_line_1,
        masterQuotation.organization.address_line_2,
        masterQuotation.organization.city,
        masterQuotation.organization.state,
        masterQuotation.organization.pin_code,
        masterQuotation.organization.country,
      ].filter((part): part is string => Boolean(part?.trim())).join(", ");
      return {
        quotation: await mapQuotation(organizationId, masterQuotation, sizeOrderByGroup),
        children: await Promise.all(masterQuotation.childQuotations.map((child) =>
          mapQuotation(organizationId, child, sizeOrderByGroup).then((quotation) => ({
            ...quotation,
            quotationParty: mapQuotationParty(child.vendor, child.customer),
          })),
        )),
        salesOrderDocument: {
          seller: {
            name: masterQuotation.organization.organization_name,
            email: masterQuotation.organization.organization_email,
            phone: masterQuotation.organization.mobile_number,
            gstin: masterQuotation.organization.gst_number,
            address: sellerAddress,
          },
          buyer: mapQuotationParty(masterQuotation.vendor, masterQuotation.customer),
        },
      };
    }
    throw new Error("The Sales Order was not found in this organization.");
  }

  if (options.masterOrder) {
    const masterQuotation = await prisma.distributionQuotation.findFirst({
      where: { organization_id: organizationId, id: quotationId, mode: "MASTER" },
      include: masterQuotationDetailInclude,
    });
    if (masterQuotation) {
      return {
        quotation: await mapQuotation(organizationId, masterQuotation),
        children: masterQuotation.childQuotations.map(mapQuotationSummary),
      };
    }
  }

  if (options.includeChildren === false) {
    const quotation = await prisma.distributionQuotation.findFirst({
      where: { organization_id: organizationId, id: quotationId },
      include: quotationInclude,
    });
    if (!quotation) throw new Error("The quotation was not found in this organization.");
    return { quotation: await mapQuotation(organizationId, quotation), children: [] };
  }

  const quotation = await prisma.distributionQuotation.findFirst({
    where: { organization_id: organizationId, id: quotationId },
    include: { ...quotationInclude, childQuotations: { select: quotationSummarySelect } },
  });
  if (!quotation) throw new Error("The quotation was not found in this organization.");
  return {
    quotation: await mapQuotation(organizationId, quotation),
    children: quotation.childQuotations.map(mapQuotationSummary),
  };
}

export async function listDistributionOrderForms(organizationId: string) {
  const forms = await prisma.distributionOrderForm.findMany({
    where: { organization_id: organizationId },
    include: {
      lines: {
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        select: {
          id: true,
          source_booking_id: true,
          booking_no: true,
          order_no: true,
          brand: true,
          style_name: true,
          quantity: true,
        },
      },
    },
    orderBy: [{ order_form_date: "desc" }, { created_at: "desc" }],
  });
  const vendorIds = [...new Set(
    forms.flatMap((form) => form.vendor_id && !form.contact_id ? [form.vendor_id] : []),
  )];
  const vendors = vendorIds.length
    ? await prisma.masterVendor.findMany({
        where: { organization_id: organizationId, id: { in: vendorIds } },
        select: { id: true, contact_id: true },
      })
    : [];
  const contactIdByVendorId = new Map(vendors.map((vendor) => [vendor.id, vendor.contact_id]));
  const contactIds = [...new Set(
    forms.flatMap((form) => {
      const contactId = form.contact_id
        ?? (form.vendor_id ? contactIdByVendorId.get(form.vendor_id) : null);
      return contactId ? [contactId] : [];
    }),
  )];
  const roleAssignments = contactIds.length
    ? await prisma.contactRoleAssignment.findMany({
        where: {
          organization_id: organizationId,
          contact_id: { in: contactIds },
          is_active: true,
          role: { is_active: true },
        },
        select: {
          contact_id: true,
          role_code: true,
          role: { select: { label: true } },
        },
        orderBy: [{ contact_id: "asc" }, { role_code: "asc" }],
      })
    : [];
  const rolesByContactId = new Map<string, string[]>();
  for (const assignment of roleAssignments) {
    const roles = rolesByContactId.get(assignment.contact_id) ?? [];
    roles.push(assignment.role.label);
    rolesByContactId.set(assignment.contact_id, roles);
  }

  return forms.map((form) => ({
    id: form.id,
    orderFormNo: form.order_form_no,
    orderFormDate: form.order_form_date.toISOString().slice(0, 10),
    customer: form.customer,
    contactRole: (rolesByContactId.get(
      form.contact_id ?? (form.vendor_id ? contactIdByVendorId.get(form.vendor_id) : null) ?? "",
    ) ?? []).join(", ") || "—",
    status: form.status,
    quotationId: form.quotation_id,
    totalQuantity: form.total_quantity,
    subtotal: form.subtotal.toFixed(2),
    createdAt: form.created_at.toISOString(),
    lines: form.lines,
  }));
}

export async function createDistributionOrderFormFromBookings(
  organizationId: string,
  userId: string,
  bookingIds: string[],
  vendorId: string | null,
  contactId: string | null,
) {
  const selectedVendorId = vendorId?.trim() || null;
  const selectedContactId = contactId?.trim() || null;
  if (Boolean(selectedVendorId) === Boolean(selectedContactId)) {
    throw new Error("Select either a Dealer or a Contact Master contact for the Order Form.");
  }
  if (bookingIds.length === 0 || bookingIds.length > 100 || bookingIds.some((id) => !id.trim())) {
    throw new Error("Select between one and 100 advance bookings for an Order Form.");
  }
  if (new Set(bookingIds).size !== bookingIds.length) {
    throw new Error("Each advance booking can only be included once in an Order Form.");
  }

  const created = await prisma.$transaction(async (transaction) => {
    let vendorIdForForm: string | null = null;
    let customer: string;
    if (selectedContactId) {
      const contact = await transaction.contact.findFirst({
        where: { organization_id: organizationId, id: selectedContactId },
        select: { id: true, legal_name: true, display_name: true },
      });
      if (!contact) throw new Error("Select a Contact Master contact from this organization.");
      customer = contact.display_name || contact.legal_name;
      if (!customer.trim()) throw new Error("The selected Contact Master contact does not have a display name.");
    } else {
      if (!selectedVendorId) throw new Error("Select an active Dealer for the Order Form.");
      const vendor = await transaction.masterVendor.findFirst({
        where: { organization_id: organizationId, id: selectedVendorId, is_active: true },
        select: { id: true, vendor: true },
      });
      if (!vendor) throw new Error("Select an active Dealer for the Order Form.");
      vendorIdForForm = vendor.id;
      customer = vendor.vendor;
    }

    const bookings = await transaction.advanceBooking.findMany({
      where: { organization_id: organizationId, id: { in: bookingIds } },
      include: {
        order: { select: { orderNo: true } },
        sizeLines: { select: { booked_quantity: true } },
        distributionOrderFormLines: { select: { id: true }, take: 1 },
      },
    });
    if (bookings.length !== bookingIds.length) {
      throw new Error("One or more selected bookings are unavailable in this organization.");
    }
    const alreadyAssigned = bookings.find((booking) => booking.distributionOrderFormLines.length > 0);
    if (alreadyAssigned) {
      throw new Error(`Booking ${bookingIds.find((id) => id === alreadyAssigned.id) ?? ""} already belongs to an Order Form.`);
    }

    const orderedBookings = bookingIds.map((id) => bookings.find((booking) => booking.id === id)!);
    const totalQuantity = orderedBookings.reduce(
      (sum, booking) => sum + booking.sizeLines.reduce((lineSum, line) => lineSum + line.booked_quantity, 0),
      0,
    );
    const orderForm = await transaction.distributionOrderForm.create({
      data: {
        organization_id: organizationId,
        vendor_id: vendorIdForForm,
        contact_id: selectedContactId,
        order_form_no: await reserveProcurementDocumentNumber(organizationId, "DISTRIBUTION_ORDER_FORM", transaction),
        order_form_date: new Date(),
        customer,
        status: "DRAFT",
        total_quantity: totalQuantity,
        subtotal: new Prisma.Decimal(0),
        created_by: userId,
      },
      include: { lines: true },
    });
    await transaction.distributionOrderFormLine.createMany({
      data: orderedBookings.map((booking) => ({
        organization_id: organizationId,
        order_form_id: orderForm.id,
        source_booking_id: booking.id,
        booking_no: booking.booking_no,
        order_no: booking.order.orderNo,
        brand: booking.brand,
        style_name: booking.style_name,
        quantity: booking.sizeLines.reduce((sum, line) => sum + line.booked_quantity, 0),
      })),
    });

    await createAuditEvent({
      organizationId,
      userId,
      module: "Distribution",
      action: "CREATE_DISTRIBUTION_ORDER_FORM",
      entityType: "DistributionOrderForm",
      entityId: orderForm.id,
      details: {
        order_form_no: orderForm.order_form_no,
        booking_ids: bookingIds,
        total_quantity: totalQuantity,
      },
    }, transaction);

    return {
      id: orderForm.id,
      orderFormNo: orderForm.order_form_no,
      orderFormDate: orderForm.order_form_date.toISOString().slice(0, 10),
      customer: orderForm.customer,
      status: orderForm.status,
      totalQuantity: orderForm.total_quantity,
      subtotal: orderForm.subtotal.toFixed(2),
      createdAt: orderForm.created_at.toISOString(),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });

  return created;
}

export async function createDistributionQuotationFromOrderForms(
  organizationId: string,
  userId: string,
  orderFormIds: string[],
  vendorId: string | null,
  contactId: string | null,
) {
  if (orderFormIds.length === 0 || orderFormIds.length > 100 || new Set(orderFormIds).size !== orderFormIds.length) {
    throw new Error("Select between one and 100 Order Forms.");
  }
  const forms = await prisma.distributionOrderForm.findMany({
    where: { organization_id: organizationId, id: { in: orderFormIds }, quotation_id: null, status: "DRAFT" },
    include: { lines: { select: { source_booking_id: true } } },
  });
  if (forms.length !== orderFormIds.length) {
    throw new Error("One or more selected Order Forms are unavailable or already converted.");
  }
  const distinctVendorIds = [...new Set(forms.map((form) => form.vendor_id).filter((id): id is string => Boolean(id)))];
  const distinctContactIds = [...new Set(forms.map((form) => form.contact_id).filter((id): id is string => Boolean(id)))];
  if (distinctVendorIds.length > 1 || distinctContactIds.length > 1 ||
      (distinctVendorIds.length > 0 && distinctContactIds.length > 0)) {
    throw new Error("Selected Order Forms must belong to the same Customer/Contact before creating a quotation.");
  }
  if (!vendorId && !contactId) {
    vendorId = distinctVendorIds[0] ?? null;
    contactId = distinctContactIds[0] ?? null;
  }
  const bookingIds = forms.flatMap((form) => form.lines.map((line) => line.source_booking_id));
  const quotation = await createDistributionQuotationFromBookings(
    organizationId,
    userId,
    bookingIds,
    vendorId,
    contactId,
  );
  await prisma.distributionOrderForm.updateMany({
    where: { organization_id: organizationId, id: { in: orderFormIds }, quotation_id: null, status: "DRAFT" },
    data: { quotation_id: quotation.id, status: "CONVERTED" },
  });
  return quotation;
}

export async function createDistributionQuotationFromBookings(
  organizationId: string,
  userId: string,
  bookingIds: string[],
  vendorId: string | null,
  contactId?: string | null,
) {
  const selectedVendorId = vendorId?.trim() || null;
  const selectedContactId = contactId?.trim() || null;
  if (Boolean(selectedVendorId) === Boolean(selectedContactId)) {
    throw new Error("Select either a Dealer from Vendor Master or a Contact Master contact.");
  }
  if (bookingIds.length === 0 || bookingIds.length > 100) {
    throw new Error("Select between one and 100 advance bookings for a quotation.");
  }
  if (bookingIds.some((id) => !id.trim()) || new Set(bookingIds).size !== bookingIds.length) {
    throw new Error("Each advance booking can only be included once in a quotation.");
  }

  const created = await prisma.$transaction(async (transaction) => {
    let vendor: { id: string; vendor: string } | null = null;
    let customer: string;
    if (selectedVendorId) {
      vendor = await transaction.masterVendor.findFirst({
        where: { organization_id: organizationId, id: selectedVendorId, is_active: true },
        select: { id: true, vendor: true },
      });
      if (!vendor) throw new Error("Select an active Dealer from Vendor Master for the quotation.");
      customer = vendor.vendor;
    } else {
      if (!selectedContactId) throw new Error("Select a Contact Master contact for the quotation.");
      const contact = await transaction.contact.findFirst({
        where: { organization_id: organizationId, id: selectedContactId },
        select: { id: true, legal_name: true, display_name: true },
      });
      if (!contact) throw new Error("Select a Contact Master contact from this organization.");
      vendor = await transaction.masterVendor.findFirst({
        where: { organization_id: organizationId, contact_id: contact.id },
        select: { id: true, vendor: true },
      });
      customer = contact.display_name || contact.legal_name;
      if (!customer.trim()) throw new Error("The selected Contact Master contact does not have a display name.");
    }

    const bookings = await transaction.advanceBooking.findMany({
      where: { organization_id: organizationId, id: { in: bookingIds } },
      include: {
        order: { select: { orderNo: true, sizeGroup: true } },
        sizeLines: { orderBy: [{ created_at: "asc" }, { id: "asc" }] },
        quotationLines: { select: { booking_no: true }, take: 1 },
      },
    });
    if (bookings.length !== bookingIds.length) {
      throw new Error("One or more selected bookings are unavailable in this organization.");
    }
    const orderedBookings = bookingIds.map((id) => bookings.find((booking) => booking.id === id)!);
    const previouslyQuoted = orderedBookings.find((booking) => booking.quotationLines.length > 0)
      ?.quotationLines[0];
    if (previouslyQuoted) {
      throw new Error(`Booking ${previouslyQuoted.booking_no} already has a quotation. Use that quotation instead of creating a duplicate.`);
    }

    const totalQuantity = orderedBookings.reduce(
      (sum, booking) => sum + booking.sizeLines.reduce((lineSum, line) => lineSum + line.booked_quantity, 0),
      0,
    );
    if (!Number.isSafeInteger(totalQuantity) || totalQuantity <= 0) {
      throw new Error("The selected bookings must have a positive, supported total quantity.");
    }
    const orderNumbers = [...new Set(orderedBookings.map((booking) => booking.order.orderNo))];
    const combinedOrderNumbers = orderNumbers.join(", ");
    if (combinedOrderNumbers.length > 1000) throw new Error("The selected source order numbers exceed the quotation header limit.");
    const quotationLines = orderedBookings.map((booking) => {
      const itemDescription = [booking.brand, booking.style_name].filter(Boolean).join(" ");
      if (itemDescription.length > 500) {
        throw new Error(`Booking ${booking.booking_no} has a description that exceeds the quotation line limit.`);
      }
      const quantity = booking.sizeLines.reduce((sum, line) => sum + line.booked_quantity, 0);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new Error(`Booking ${booking.booking_no} must have a positive, supported total quantity.`);
      }
      return {
        source_booking_id: booking.id,
        booking_no: booking.booking_no,
        order_no: booking.order.orderNo,
        item_description: itemDescription,
        brand: booking.brand,
        style_name: booking.style_name,
        quantity,
        unit_price: new Prisma.Decimal(0),
        line_total: new Prisma.Decimal(0),
      };
    });
    const quotation = await transaction.distributionQuotation.create({
      data: {
        organization_id: organizationId,
        vendor_id: vendor?.id ?? null,
        quotation_no: await reserveProcurementDocumentNumber(organizationId, "DISTRIBUTION_QUOTATION", transaction),
        quotation_date: new Date(),
        order_no: combinedOrderNumbers,
        customer,
        mode: orderedBookings.length === 1 ? "SINGLE" : "MULTIPLE",
        status: "DRAFT",
        total_quantity: totalQuantity,
        subtotal: new Prisma.Decimal(0),
        created_by: userId,
        lines: { create: quotationLines },
      },
      select: {
        id: true,
        quotation_no: true,
        customer: true,
      },
    });
    await createAuditEvent({
      organizationId,
      userId,
      module: "Distribution",
      action: "CREATE_DISTRIBUTION_QUOTATION",
      entityType: "DistributionQuotation",
      entityId: quotation.id,
      details: {
        quotation_no: quotation.quotation_no,
        booking_nos: orderedBookings.map((booking) => booking.booking_no),
        vendor_id: vendor?.id ?? null,
        ...(selectedContactId ? { contact_id: selectedContactId } : {}),
        total_quantity: totalQuantity,
      },
    }, transaction);
    return quotation;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  return {
    id: created.id,
    quotationNo: created.quotation_no,
    customer: created.customer,
  };
}

export async function saveDistributionQuotationDraft(
  organizationId: string,
  userId: string,
  quotationId: string,
  input: {
    quotationDate: string;
    validUntil: string;
    notes: string;
    lines: Array<{ id: string; unitPrice: string }>;
  },
) {
  if (!isValidDateOnly(input.quotationDate)) throw new Error("Enter a valid quotation date.");
  if (input.validUntil && !isValidDateOnly(input.validUntil)) throw new Error("Enter a valid quotation validity date.");
  if (input.validUntil && input.validUntil < input.quotationDate) throw new Error("The validity date cannot be earlier than the quotation date.");
  if (input.notes.length > 2000) throw new Error("Quotation notes cannot exceed 2,000 characters.");
  if (input.lines.length === 0 || input.lines.length > 500) throw new Error("The quotation must contain valid detail lines.");
  if (input.lines.some((line) => !line.id.trim()) || new Set(input.lines.map((line) => line.id)).size !== input.lines.length) {
    throw new Error("Each quotation detail line must be included once.");
  }
  const prices = input.lines.map(({ unitPrice }) => {
    if (!/^\d{1,10}(\.\d{1,4})?$/.test(unitPrice)) throw new Error("Each unit price must be a non-negative amount with up to four decimal places.");
    return new Prisma.Decimal(unitPrice);
  });

  const record = await prisma.$transaction(async (transaction) => {
    const current = await transaction.distributionQuotation.findFirst({
      where: { organization_id: organizationId, id: quotationId },
      include: quotationInclude,
    });
    if (!current) throw new Error("The quotation was not found in this organization.");
    if (current.status !== "DRAFT" || current.mode === "MASTER") {
      throw new Error("Only draft regular quotations can be edited.");
    }
    if (current.lines.length !== input.lines.length ||
        current.lines.some((line) => !input.lines.some((entry) => entry.id === line.id))) {
      throw new Error("Quotation detail lines changed. Reload the quotation before saving.");
    }

    let subtotal = new Prisma.Decimal(0);
    for (const line of current.lines) {
      const priceIndex = input.lines.findIndex((entry) => entry.id === line.id);
      const unitPrice = prices[priceIndex];
      const lineTotal = unitPrice.mul(line.quantity).toDecimalPlaces(2);
      subtotal = subtotal.add(lineTotal);
      const lineUpdate = await transaction.distributionQuotationLine.updateMany({
        where: { organization_id: organizationId, quotation_id: current.id, id: line.id },
        data: { unit_price: unitPrice, line_total: lineTotal },
      });
      if (lineUpdate.count !== 1) throw new Error("A quotation detail line changed. Reload the quotation before saving.");
    }
    const quotationUpdate = await transaction.distributionQuotation.updateMany({
      where: { organization_id: organizationId, id: current.id, status: "DRAFT" },
      data: {
        quotation_date: new Date(`${input.quotationDate}T00:00:00.000Z`),
        valid_until: input.validUntil ? new Date(`${input.validUntil}T00:00:00.000Z`) : null,
        notes: input.notes.trim() || null,
        subtotal,
      },
    });
    if (quotationUpdate.count !== 1) throw new Error("The draft quotation changed. Reload it before saving.");
    const updated = await transaction.distributionQuotation.findFirst({
      where: { organization_id: organizationId, id: current.id },
      include: quotationInclude,
    });
    if (!updated) throw new Error("The quotation could not be reloaded after saving.");
    await createAuditEvent({
      organizationId,
      userId,
      module: "Distribution",
      action: "UPDATE_DISTRIBUTION_QUOTATION_DRAFT",
      entityType: "DistributionQuotation",
      entityId: current.id,
      details: {
        quotation_no: current.quotation_no,
        status: current.status,
        before_subtotal: current.subtotal.toFixed(2),
        after_subtotal: updated.subtotal.toFixed(2),
      },
    }, transaction);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  return mapQuotation(organizationId, record);
}

export async function createDistributionMasterQuotations(
  organizationId: string,
  userId: string,
  quotationIds: string[],
  vendorId: string | null,
  contactId?: string | null,
) {
  const selectedVendorId = vendorId?.trim() || null;
  const selectedContactId = contactId?.trim() || null;
  if (Boolean(selectedVendorId) === Boolean(selectedContactId)) {
    throw new Error("Select either a Vendor Master vendor or a Contact Master contact for the sales order.");
  }
  if (quotationIds.length < 1 || quotationIds.length > 100) {
    throw new Error("Select between one and 100 regular quotations for a sales order.");
  }
  if (new Set(quotationIds).size !== quotationIds.length || quotationIds.some((id) => !id.trim())) {
    throw new Error("Each regular quotation can only be included once.");
  }
  const records = await prisma.$transaction(async (transaction) => {
    let selectedParty: {
      vendorId: string | null;
      vendorName: string | null;
      customer: string;
      contactId: string | null;
    };
    if (selectedVendorId) {
      const vendor = await transaction.masterVendor.findFirst({
        where: { organization_id: organizationId, id: selectedVendorId, is_active: true },
        select: { id: true, vendor: true, contact_id: true },
      });
      if (!vendor) throw new Error("Select an active Vendor Master vendor.");
      selectedParty = {
        vendorId: vendor.id,
        vendorName: vendor.vendor,
        customer: vendor.vendor,
        contactId: vendor.contact_id,
      };
    } else {
      if (!selectedContactId) throw new Error("Select a Contact Master contact for the sales order.");
      const contact = await transaction.contact.findFirst({
        where: { organization_id: organizationId, id: selectedContactId },
        select: { id: true, legal_name: true, display_name: true },
      });
      if (!contact) throw new Error("Select a Contact Master contact from this organization.");
      const customer = contact.display_name || contact.legal_name;
      if (!customer.trim()) throw new Error("The selected Contact Master contact does not have a display name.");
      selectedParty = {
        vendorId: null,
        vendorName: null,
        customer,
        contactId: contact.id,
      };
    }
    const children = await transaction.distributionQuotation.findMany({
      where: {
        organization_id: organizationId,
        id: { in: quotationIds },
        parent_quotation_id: null,
        mode: { in: ["SINGLE", "MULTIPLE"] },
      },
      select: {
        id: true,
        quotation_no: true,
        order_no: true,
        total_quantity: true,
        subtotal: true,
        vendor: { select: { contact_id: true } },
      },
    });
    if (children.length !== quotationIds.length) {
      throw new Error("One or more selected quotations are unavailable or already grouped.");
    }
    const orderedChildren = quotationIds.map((id) => children.find((child) => child.id === id)!);
    const dealerContactIds = [...new Set(
      orderedChildren
        .map((quotation) => quotation.vendor?.contact_id || selectedParty.contactId)
        .filter((id): id is string => Boolean(id)),
    )];
    const dealerMappings = dealerContactIds.length > 0
      ? await transaction.contactDistributorDealerAssignment.findMany({
        where: { organization_id: organizationId, dealer_id: { in: dealerContactIds } },
        select: { dealer_id: true, distributor_id: true },
      })
      : [];
    const distributorIds = [...new Set(dealerMappings.map((mapping) => mapping.distributor_id))];
    const roleSettings = distributorIds.length > 0
      ? await transaction.contactRoleSetting.findMany({
        where: {
          organization_id: organizationId,
          contact_id: { in: distributorIds },
          role_code: "DISTRIBUTOR",
        },
        select: {
          contact_id: true,
          mapped_contact_id: true,
          always_bill_to_distributor: true,
          use_common_settings: true,
        },
      })
      : [];
    const billToDistributorByDealer = new Map<string, string>();
    for (const dealerId of dealerContactIds) {
      const mapping = dealerMappings.find((item) => item.dealer_id === dealerId);
      if (!mapping) continue;
      const commonSettings = roleSettings.find((setting) =>
        setting.contact_id === mapping.distributor_id && setting.mapped_contact_id === null,
      );
      const individualSettings = roleSettings.find((setting) =>
        setting.contact_id === mapping.distributor_id && setting.mapped_contact_id === dealerId,
      );
      const alwaysBillToDistributor = commonSettings?.use_common_settings
        ? commonSettings.always_bill_to_distributor
        : individualSettings?.always_bill_to_distributor ?? false;
      if (alwaysBillToDistributor) billToDistributorByDealer.set(dealerId, mapping.distributor_id);
    }

    const billToDistributorIds = [...new Set(billToDistributorByDealer.values())];
    const distributors = billToDistributorIds.length > 0
      ? await transaction.contact.findMany({
        where: { organization_id: organizationId, id: { in: billToDistributorIds } },
        select: { id: true, legal_name: true, display_name: true },
      })
      : [];
    const distributorContacts = new Map(distributors.map((contact) => [contact.id, contact]));
    const distributorVendors = billToDistributorIds.length > 0
      ? await transaction.masterVendor.findMany({
        where: {
          organization_id: organizationId,
          contact_id: { in: billToDistributorIds },
          is_active: true,
        },
        select: { id: true, vendor: true, contact_id: true },
      })
      : [];
    const distributorVendorByContact = new Map(
      distributorVendors.filter((vendor) => vendor.contact_id).map((vendor) => [vendor.contact_id!, vendor]),
    );

    const selectedPartyKey = selectedParty.vendorId
      ? `vendor:${selectedParty.vendorId}`
      : `contact:${selectedParty.contactId}`;
    const orderGroups = new Map<string, {
      vendorId: string | null;
      vendorName: string | null;
      customer: string;
      contactId: string | null;
      distributorContactId: string | null;
      dealerContactIds: Set<string>;
      quotations: typeof orderedChildren;
    }>();
    for (const quotation of orderedChildren) {
      const dealerId = quotation.vendor?.contact_id || selectedParty.contactId;
      const distributorId = dealerId ? billToDistributorByDealer.get(dealerId) : undefined;
      let groupParty = selectedParty;
      if (distributorId) {
        const distributor = distributorContacts.get(distributorId);
        if (!distributor) {
          throw new Error("A mapped Distributor is unavailable. Update the Dealer mapping before creating Sales Orders.");
        }
        const customer = distributor.display_name || distributor.legal_name;
        if (!customer.trim()) {
          throw new Error("A mapped Distributor does not have a name. Update Contact Master before creating Sales Orders.");
        }
        const distributorVendor = distributorVendorByContact.get(distributorId);
        groupParty = {
          vendorId: distributorVendor?.id ?? null,
          vendorName: distributorVendor?.vendor ?? null,
          customer,
          contactId: distributorId,
        };
      }
      const groupKey = distributorId ? `distributor:${distributorId}` : selectedPartyKey;
      let group = orderGroups.get(groupKey);
      if (!group) {
        group = {
          ...groupParty,
          distributorContactId: distributorId ?? null,
          dealerContactIds: new Set<string>(),
          quotations: [],
        };
        orderGroups.set(groupKey, group);
      }
      if (distributorId && dealerId) group.dealerContactIds.add(dealerId);
      group.quotations.push(quotation);
    }

    const createdMasters = [];
    for (const group of orderGroups.values()) {
      const totalQuantity = group.quotations.reduce((sum, child) => sum + child.total_quantity, 0);
      if (!Number.isSafeInteger(totalQuantity)) {
        throw new Error("The selected quotation quantities exceed the supported total.");
      }
      const orderNumbers = [...new Set(
        group.quotations.flatMap((child) => child.order_no.split(",").map((value) => value.trim()).filter(Boolean)),
      )];
      const groupQuotationIds = group.quotations.map((child) => child.id);
      const subtotal = group.quotations.reduce((sum, child) => sum.add(child.subtotal), new Prisma.Decimal(0));
      const master = await transaction.distributionQuotation.create({
        data: {
          organization_id: organizationId,
          vendor_id: group.vendorId,
          quotation_no: await reserveProcurementDocumentNumber(organizationId, "DISTRIBUTION_MASTER_QUOTATION", transaction),
          quotation_date: new Date(),
          order_no: orderNumbers.join(", "),
          customer: group.customer,
          mode: "MASTER",
          status: "DRAFT",
          total_quantity: totalQuantity,
          subtotal,
          created_by: userId,
        },
        include: quotationInclude,
      });
      const linked = await transaction.distributionQuotation.updateMany({
        where: {
          organization_id: organizationId,
          id: { in: groupQuotationIds },
          parent_quotation_id: null,
          mode: { in: ["SINGLE", "MULTIPLE"] },
        },
        data: { parent_quotation_id: master.id },
      });
      if (linked.count !== groupQuotationIds.length) {
        throw new Error("Selected quotations changed. Reload and try again.");
      }
      await createAuditEvent({
        organizationId,
        userId,
        module: "Distribution",
        action: "CREATE_DISTRIBUTION_MASTER_QUOTATION",
        entityType: "DistributionQuotation",
        entityId: master.id,
        details: {
          quotation_no: master.quotation_no,
          child_quotation_nos: group.quotations.map((child) => child.quotation_no),
          vendor_id: group.vendorId,
          ...(group.vendorName ? { vendor_name: group.vendorName } : {}),
          ...(selectedContactId ? { contact_id: selectedContactId } : {}),
          ...(group.distributorContactId
            ? {
              bill_to_distributor_contact_id: group.distributorContactId,
              dealer_contact_ids: [...group.dealerContactIds],
              bill_to_distributor_name: group.customer,
            }
            : selectedContactId ? { contact_name: group.customer } : {}),
          total_quantity: totalQuantity,
        },
      }, transaction);
      createdMasters.push(master);
    }
    return createdMasters;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  return Promise.all(records.map((record) => mapQuotation(organizationId, record)));
}

export async function deleteDistributionQuotations(
  organizationId: string,
  userId: string,
  quotationIds: string[],
) {
  if (
    quotationIds.length === 0 ||
    quotationIds.length > 500 ||
    quotationIds.some((id) => !id.trim()) ||
    new Set(quotationIds).size !== quotationIds.length
  ) {
    throw new Error("Select between one and 500 unique quotations to delete.");
  }

  return prisma.$transaction(async (transaction) => {
    const quotations = await transaction.distributionQuotation.findMany({
      where: { organization_id: organizationId, id: { in: quotationIds } },
      include: {
        lines: { select: { booking_no: true } },
        childQuotations: { select: { id: true, quotation_no: true } },
      },
    });
    if (quotations.length !== quotationIds.length) {
      throw new Error("One or more selected quotations were not found in this organization.");
    }

    const orderedQuotations = quotationIds.map((id) => quotations.find((quotation) => quotation.id === id)!);
    if (orderedQuotations.some((quotation) => quotation.status !== "DRAFT")) {
      throw new Error("Only draft quotations can be deleted. Draft sales orders may also be deleted; preserve issued documents and use the approved reversal process.");
    }

    const includesMaster = orderedQuotations.some((quotation) => quotation.mode === "MASTER");
    const includesRegular = orderedQuotations.some((quotation) => quotation.mode !== "MASTER");
    if (includesMaster && includesRegular) {
      throw new Error("Delete sales orders and regular quotations in separate selections.");
    }

    const linkedOrderForms = await transaction.distributionOrderForm.findMany({
      where: {
        organization_id: organizationId,
        quotation_id: { in: quotationIds },
      },
      select: { id: true, order_form_no: true, quotation_id: true, status: true },
    });
    const orderFormInUnexpectedState = linkedOrderForms.find((orderForm) => orderForm.status !== "CONVERTED");
    if (orderFormInUnexpectedState) {
      throw new Error(
        `Cannot reopen distribution order form ${orderFormInUnexpectedState.order_form_no} because it is not in the converted state. Resolve its lifecycle before retrying.`,
      );
    }
    if (linkedOrderForms.length > 0) {
      const reopened = await transaction.distributionOrderForm.updateMany({
        where: {
          organization_id: organizationId,
          id: { in: linkedOrderForms.map((orderForm) => orderForm.id) },
          quotation_id: { in: quotationIds },
          status: "CONVERTED",
        },
        data: { quotation_id: null, status: "DRAFT" },
      });
      if (reopened.count !== linkedOrderForms.length) {
        throw new Error("One or more linked order forms changed state. Reload and try again.");
      }

      for (const orderForm of linkedOrderForms) {
        const quotation = orderedQuotations.find((item) => item.id === orderForm.quotation_id);
        await createAuditEvent({
          organizationId,
          userId,
          module: "Distribution",
          action: "REOPEN_DISTRIBUTION_ORDER_FORM",
          entityType: "DistributionOrderForm",
          entityId: orderForm.id,
          details: {
            order_form_no: orderForm.order_form_no,
            previous_status: "CONVERTED",
            status: "DRAFT",
            previous_quotation_id: orderForm.quotation_id,
            previous_quotation_no: quotation?.quotation_no ?? null,
          },
        }, transaction);
      }
    }

    const linkedQuotationIds = orderedQuotations.flatMap((quotation) =>
      quotation.mode === "MASTER"
        ? quotation.childQuotations.map((child) => child.id)
        : [quotation.id],
    );
    const sourceBookingLines = await transaction.distributionQuotationLine.findMany({
      where: { organization_id: organizationId, quotation_id: { in: linkedQuotationIds } },
      select: { source_booking_id: true },
    });
    const sourceBookingIds = [...new Set(sourceBookingLines.map((line) => line.source_booking_id))];
    if (sourceBookingIds.length > 0) {
      const sourceBookings = await transaction.advanceBooking.findMany({
        where: { organization_id: organizationId, id: { in: sourceBookingIds } },
        select: {
          booking_no: true,
          sizeLines: {
            select: {
              assignments: {
                select: {
                  grnAllocations: { select: { id: true } },
                  finishedGoodsStockReceipts: { select: { id: true } },
                },
              },
            },
          },
        },
      });
      const bookingWithFulfillment = sourceBookings.find((booking) =>
        booking.sizeLines.some((line) =>
          line.assignments.some((assignment) =>
            assignment.grnAllocations.length > 0 || assignment.finishedGoodsStockReceipts.length > 0,
          ),
        ),
      );
      if (bookingWithFulfillment) {
        throw new Error(
          `Booking ${bookingWithFulfillment.booking_no} has Work Order GRN fulfillment. Reverse its inventory fulfillment before deleting this ${includesMaster ? "sales order" : "quotation"}.`,
        );
      }
    }

    for (const quotation of orderedQuotations) {
      if (quotation.mode === "MASTER") {
        const unlinked = await transaction.distributionQuotation.updateMany({
          where: {
            organization_id: organizationId,
            id: { in: quotation.childQuotations.map((child) => child.id) },
            parent_quotation_id: quotation.id,
          },
          data: { parent_quotation_id: null },
        });
        if (unlinked.count !== quotation.childQuotations.length) {
          throw new Error("The sales order's linked quotations changed. Reload and try again.");
        }
      } else if (quotation.parent_quotation_id) {
        throw new Error("Delete the parent sales order first, then delete this quotation.");
      }
    }

    const deleted = await transaction.distributionQuotation.deleteMany({
      where: {
        organization_id: organizationId,
        id: { in: quotationIds },
        status: "DRAFT",
        parent_quotation_id: null,
      },
    });
    if (deleted.count !== orderedQuotations.length) {
      throw new Error("One or more selected quotations changed while deleting. Reload and try again.");
    }

    for (const quotation of orderedQuotations) {
      await createAuditEvent({
        organizationId,
        userId,
        module: "Distribution",
        action: quotation.mode === "MASTER" ? "DELETE_DISTRIBUTION_MASTER_QUOTATION" : "DELETE_DISTRIBUTION_QUOTATION",
        entityType: "DistributionQuotation",
        entityId: quotation.id,
        details: {
          quotation_no: quotation.quotation_no,
          mode: quotation.mode,
          child_quotation_nos: quotation.childQuotations.map((child) => child.quotation_no),
          booking_nos: quotation.lines.map((line) => line.booking_no),
        },
      }, transaction);
    }

    return orderedQuotations.map((quotation) => ({
      id: quotation.id,
      quotationNo: quotation.quotation_no,
      mode: quotation.mode,
      unlinkedQuotationCount: quotation.mode === "MASTER" ? quotation.childQuotations.length : 0,
      reopenedOrderFormCount: linkedOrderForms.filter((orderForm) => orderForm.quotation_id === quotation.id).length,
    }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function deleteDistributionQuotation(
  organizationId: string,
  userId: string,
  quotationId: string,
) {
  const [deleted] = await deleteDistributionQuotations(organizationId, userId, [quotationId]);
  return deleted;
}
