import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/bootstrap/prisma";
import { buildPaginationMeta, getPaginationArgs } from "../../lib/pagination";
import { getCurrentUser, requireModuleAccess, requireOrganizationAccess, requireTenantAccess } from "../../lib/auth";
import {
  fetchGstDetails,
  getGstType,
  isValidGstNumber,
  normalizeGstNumber,
  normalizeVendorName,
} from "../../lib/vendors";

function requiredString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationArgs(searchParams);
    const organizationId = searchParams.get("orgId");

    if (!organizationId) {
      return NextResponse.json({ error: "Organization scope is required." }, { status: 400 });
    }

    await requireOrganizationAccess(currentUser.id, organizationId);
    await requireModuleAccess(currentUser.id, organizationId, "masters", "vendors");

    const [vendors, total] = await Promise.all([
      prisma.vendor.findMany({
        where: { organizationId },
        include: { registeredGstState: true, tenant: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.vendor.count({ where: { organizationId } }),
    ]);

    return NextResponse.json({
      data: vendors,
      meta: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch vendors." },
      { status: error instanceof Error && error.message.includes("access") ? 403 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const vendorName = requiredString(body.vendorName)
      ? normalizeVendorName(body.vendorName)
      : "";

    if (!requiredString(body.tenantId)) {
      return NextResponse.json({ error: "Entity Name is required" }, { status: 400 });
    }
    if (!vendorName) {
      return NextResponse.json({ error: "Vendor Name is required" }, { status: 400 });
    }

    const organizationId = typeof body.organizationId === "string" ? body.organizationId : (typeof body.orgId === "string" ? body.orgId : "");
    if (!organizationId) {
      return NextResponse.json({ error: "Organization scope is required." }, { status: 400 });
    }

    await requireOrganizationAccess(currentUser.id, organizationId);
    await requireModuleAccess(currentUser.id, organizationId, "masters", "vendors");

    const tenant = await prisma.tenant.findUnique({
      where: { id: body.tenantId },
      select: { id: true, organizationId: true, gstRegisteredStateId: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Entity was not found" }, { status: 400 });
    }
    if (tenant.organizationId !== organizationId) {
      return NextResponse.json({ error: "This entity does not belong to the selected organization." }, { status: 400 });
    }

    const gstNumber = requiredString(body.gstNumber)
      ? normalizeGstNumber(body.gstNumber)
      : null;
    if (gstNumber && !isValidGstNumber(gstNumber)) {
      return NextResponse.json(
        { error: "GST number must contain exactly 15 letters and digits" },
        { status: 400 }
      );
    }

    const registeredGstStateId = requiredString(body.registeredGstStateId)
      ? body.registeredGstStateId
      : null;
    const gstType = getGstType(tenant.gstRegisteredStateId, registeredGstStateId);
    const lastVendor = await prisma.vendor.findFirst({
      orderBy: { vendorSupportNo: "desc" },
      select: { vendorSupportNo: true },
    });

    try {
      const vendor = await prisma.vendor.create({
        data: {
          organizationId,
          tenantId: tenant.id,
          gstNumber,
          currencyType: requiredString(body.currencyType)
            ? body.currencyType.trim()
            : "INR",
          gstType,
          registeredGstStateId,
          vendorName,
          isThisCustomer: body.isThisCustomer === true,
          city: body.city ?? null,
          addressLine1: body.addressLine1 ?? null,
          addressLine2: body.addressLine2 ?? null,
          stateProvince: body.stateProvince ?? null,
          postalCode: body.postalCode ?? null,
          country: body.country ?? null,
          zohoBooksVendorId: body.zohoBooksVendorId ?? null,
          status: "Draft",
          vendorSupportNo: (lastVendor?.vendorSupportNo ?? 0) + 1,
        },
        include: { registeredGstState: true, tenant: true },
      });

      return NextResponse.json(vendor, { status: 201 });
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
      { error: error instanceof Error ? error.message : "Unable to create vendor." },
      { status: error instanceof Error && error.message.includes("access") ? 403 : 500 }
    );
  }
}

export async function POST_GST_LOOKUP(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const organizationId = typeof body.organizationId === "string" ? body.organizationId : (typeof body.orgId === "string" ? body.orgId : "");
    const gstNumber = requiredString(body.gstNumber)
      ? normalizeGstNumber(body.gstNumber)
      : "";

    if (!tenantId) {
      return NextResponse.json({ error: "Entity Name is required" }, { status: 400 });
    }
    if (!organizationId) {
      return NextResponse.json({ error: "Organization scope is required." }, { status: 400 });
    }
    if (!isValidGstNumber(gstNumber)) {
      return NextResponse.json(
        { error: "Enter a valid 15-character GST number" },
        { status: 400 }
      );
    }

    await requireOrganizationAccess(currentUser.id, organizationId);
    await requireTenantAccess(currentUser.id, tenantId, organizationId);

    try {
      return NextResponse.json(await fetchGstDetails(gstNumber));
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "GST lookup failed" },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch GST details." },
      { status: error instanceof Error && error.message.includes("access") ? 403 : 500 }
    );
  }
}
