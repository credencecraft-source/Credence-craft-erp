import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/bootstrap/prisma";
import { getCurrentUser, requireOrganizationAccess, writeAuditLog } from "../../../lib/auth";
import {
  getGstType,
  isValidGstNumber,
  normalizeGstNumber,
  normalizeVendorName,
} from "../../../lib/vendors";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: { tenant: true },
    });

    if (!vendor) {
      return NextResponse.json({ error: "Vendor was not found" }, { status: 404 });
    }

    await requireOrganizationAccess(currentUser.id, vendor.organizationId);

    const vendorName =
      typeof body.vendorName === "string"
        ? normalizeVendorName(body.vendorName)
        : vendor.vendorName;
    const gstNumber =
      typeof body.gstNumber === "string"
        ? normalizeGstNumber(body.gstNumber)
        : vendor.gstNumber;
    const registeredGstStateId =
      typeof body.registeredGstStateId === "string"
        ? body.registeredGstStateId || null
        : vendor.registeredGstStateId;

    if (!vendorName) {
      return NextResponse.json({ error: "Vendor Name is required" }, { status: 400 });
    }
    if (gstNumber && !isValidGstNumber(gstNumber)) {
      return NextResponse.json(
        { error: "GST number must contain exactly 15 letters and digits" },
        { status: 400 }
      );
    }

    try {
      const updatedVendor = await prisma.vendor.update({
        where: { id },
        data: {
          vendorName,
          gstNumber,
          registeredGstStateId,
          gstType: getGstType(vendor.tenant.gstRegisteredStateId, registeredGstStateId),
          currencyType:
            typeof body.currencyType === "string"
              ? body.currencyType.trim()
              : vendor.currencyType,
          isThisCustomer:
            typeof body.isThisCustomer === "boolean"
              ? body.isThisCustomer
              : vendor.isThisCustomer,
          city: body.city ?? vendor.city,
          addressLine1: body.addressLine1 ?? vendor.addressLine1,
          addressLine2: body.addressLine2 ?? vendor.addressLine2,
          stateProvince: body.stateProvince ?? vendor.stateProvince,
          postalCode: body.postalCode ?? vendor.postalCode,
          country: body.country ?? vendor.country,
        },
        include: { registeredGstState: true, tenant: true },
      });

      await writeAuditLog({
        organizationId: vendor.organizationId,
        userId: currentUser.id,
        action: "vendor_updated",
        entityType: "Vendor",
        entityId: vendor.id,
        details: { vendorName: updatedVendor.vendorName, tenantId: updatedVendor.tenantId },
      });

      return NextResponse.json(updatedVendor);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Vendor_tenantId_vendorName_key")
      ) {
        return NextResponse.json(
          { error: "A vendor with this name already exists for the selected entity" },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update vendor." },
      { status: error instanceof Error && error.message.includes("access") ? 403 : 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      select: { id: true, organizationId: true, vendorName: true },
    });
    if (!vendor) return NextResponse.json({ error: "Vendor was not found" }, { status: 404 });

    await requireOrganizationAccess(currentUser.id, vendor.organizationId);

    const confirmed = new URL(_request.url).searchParams.get("confirm") === "true";
    if (!confirmed) {
      return NextResponse.json({ error: "Delete confirmation is required. Pass confirm=true to delete this vendor." }, { status: 400 });
    }

    await prisma.vendor.delete({ where: { id } });
    await writeAuditLog({
      organizationId: vendor.organizationId,
      userId: currentUser.id,
      action: "vendor_deleted",
      entityType: "Vendor",
      entityId: vendor.id,
      details: { vendorName: vendor.vendorName },
    });
    return NextResponse.json({ message: "Vendor deleted successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete vendor." },
      { status: error instanceof Error && error.message.includes("access") ? 403 : 500 }
    );
  }
}
