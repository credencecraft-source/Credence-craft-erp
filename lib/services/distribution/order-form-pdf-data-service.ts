import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import {
  getSizeGroupSizeOrderMapForOrganization,
  sortBySizeGroupOrder,
} from "@/lib/master-data/master-data-constants";

const contactSelect = {
  legal_name: true,
  display_name: true,
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
      state_code: true,
      postal_code: true,
      country_code: true,
      is_default_billing: true,
      is_default_shipping: true,
      tax_registration: { select: { gstin: true } },
    },
  },
} satisfies Prisma.ContactSelect;

const vendorSelect = {
  id: true,
  vendor: true,
  contact_id: true,
  gst_number: true,
  registered_state: true,
  registeredState: { select: { state: true } },
  contact: { select: contactSelect },
} satisfies Prisma.MasterVendorSelect;

type PdfContact = Prisma.ContactGetPayload<{ select: typeof contactSelect }>;
type PdfVendor = Prisma.MasterVendorGetPayload<{ select: typeof vendorSelect }>;

function mapBuyer(vendor: PdfVendor | null, directContact: PdfContact | null, fallbackName: string) {
  const contact = vendor?.contact ?? directContact;
  const addresses = contact?.addresses ?? [];
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
    state: address.state_name,
    stateCode: address.state_code,
  } : null;

  return {
    name: vendor?.vendor ?? contact?.display_name ?? contact?.legal_name ?? fallbackName,
    legalName: contact?.legal_name ?? null,
    email: contact?.email ?? null,
    phone: contact?.phone ?? null,
    gstin: vendor?.gst_number ??
      addresses.find((address) => address.tax_registration?.gstin)?.tax_registration?.gstin ?? null,
    registeredState: vendor?.registeredState?.state ?? vendor?.registered_state ??
      billingAddress?.state_name ?? shippingAddress?.state_name ?? null,
    billingAddress: formatAddress(billingAddress),
    shippingAddress: formatAddress(shippingAddress),
  };
}

export async function getDistributionOrderFormPdfData(organizationId: string, orderFormId: string) {
  const orderForm = await prisma.distributionOrderForm.findFirst({
    where: { organization_id: organizationId, id: orderFormId },
    select: {
      id: true,
      order_form_no: true,
      order_form_date: true,
      customer: true,
      status: true,
      total_quantity: true,
      quotation_id: true,
      created_at: true,
      vendor_id: true,
      contact_id: true,
      lines: {
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        select: {
          booking_no: true,
          order_no: true,
          brand: true,
          style_name: true,
          quantity: true,
          sourceBooking: {
            select: {
              order: { select: { sizeGroup: true } },
              sizeLines: {
                select: { size: true, booked_quantity: true },
                orderBy: [{ created_at: "asc" }, { id: "asc" }],
              },
            },
          },
        },
      },
    },
  });
  if (!orderForm) throw new Error("The Order Form was not found in this organization.");

  const vendor = orderForm.vendor_id
    ? await prisma.masterVendor.findFirst({
        where: { organization_id: organizationId, id: orderForm.vendor_id },
        select: vendorSelect,
      })
    : null;
  const directContactId = vendor?.contact ? null : vendor?.contact_id ?? orderForm.contact_id;
  const [directContact, organization] = await Promise.all([
    directContactId
      ? prisma.contact.findFirst({
          where: { organization_id: organizationId, id: directContactId },
          select: contactSelect,
        })
      : Promise.resolve(null),
    prisma.organization.findUnique({
      where: { id: organizationId },
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
    }),
  ]);
  if (!organization) throw new Error("The organization details required for the Order Form PDF are unavailable.");

  const sizeGroups = orderForm.lines.map((line) => line.sourceBooking.order?.sizeGroup ?? "");
  const sizeOrderByGroup = await getSizeGroupSizeOrderMapForOrganization(organizationId, sizeGroups);
  const sellerAddress = [
    organization.address_line_1,
    organization.address_line_2,
    organization.city,
    organization.state,
    organization.pin_code,
    organization.country,
  ].filter((part): part is string => Boolean(part?.trim())).join(", ");

  return {
    orderForm: {
      id: orderForm.id,
      orderFormNo: orderForm.order_form_no,
      orderFormDate: orderForm.order_form_date.toISOString().slice(0, 10),
      customer: orderForm.customer,
      status: orderForm.status,
      totalQuantity: orderForm.total_quantity,
      hasQuotation: Boolean(orderForm.quotation_id),
      createdAt: orderForm.created_at.toISOString(),
      lines: orderForm.lines.map((line) => {
        const sizeGroup = line.sourceBooking.order?.sizeGroup ?? "";
        const sizeOrder = sizeOrderByGroup.get(sizeGroup.trim().toLocaleLowerCase()) ?? [];
        return {
          bookingNo: line.booking_no,
          orderNo: line.order_no,
          brand: line.brand ?? "",
          styleName: line.style_name ?? "",
          quantity: line.quantity,
          sizes: sortBySizeGroupOrder(line.sourceBooking.sizeLines, sizeOrder, (sizeLine) => sizeLine.size)
            .map((sizeLine) => ({ size: sizeLine.size, bookedQuantity: sizeLine.booked_quantity })),
        };
      }),
    },
    seller: {
      name: organization.organization_name,
      email: organization.organization_email,
      phone: organization.mobile_number,
      gstin: organization.gst_number,
      address: sellerAddress,
    },
    buyer: mapBuyer(vendor, directContact, orderForm.customer),
  };
}
