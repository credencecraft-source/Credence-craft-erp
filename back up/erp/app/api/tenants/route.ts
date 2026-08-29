import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/bootstrap/prisma";
import { runTenantBootstrap } from "../../lib/bootstrap";
import { buildPaginationMeta, getPaginationArgs } from "../../lib/pagination";
import { getCurrentUser, requireModuleAccess, requireOrganizationAccess, requireTenantAccess, writeAuditLog } from "../../lib/auth";

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
    await requireModuleAccess(currentUser.id, organizationId, "masters", "entities");

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where: { organizationId },
        include: { gstRegisteredState: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.tenant.count({ where: { organizationId } }),
    ]);

    return NextResponse.json({
      data: tenants,
      meta: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch entities." },
      { status: error instanceof Error && error.message.includes("access") ? 403 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const organizationId = typeof body.organizationId === "string" ? body.organizationId : (typeof body.orgId === "string" ? body.orgId : "");

    if (!organizationId) {
      return NextResponse.json({ error: "Organization scope is required." }, { status: 400 });
    }

    await requireOrganizationAccess(currentUser.id, organizationId);

    if (!body.name) {
      return NextResponse.json(
        { error: "Entity Name is required" },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.create({
      data: {
        organizationId,
        name: body.name,
        logoUrl: body.logoUrl ?? null,
        gstRegisteredStateId: body.gstRegisteredStateId ?? null,
        gstNumber: body.gstNumber ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        displayName: body.displayName ?? null,
        addressLine1: body.addressLine1 ?? null,
        addressLine2: body.addressLine2 ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        postalCode: body.postalCode ?? null,
        country: body.country ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        flagField1: body.flagField1 ?? false,
      },
    });

    await writeAuditLog({
      organizationId,
      userId: currentUser.id,
      action: "tenant_created",
      entityType: "Tenant",
      entityId: tenant.id,
      details: { name: tenant.name, displayName: tenant.displayName },
    });

    await runTenantBootstrap(tenant.id);

    return NextResponse.json(
      { message: "Entity Name Added Successfully", tenant },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create entity." },
      { status: error instanceof Error && error.message.includes("access") ? 403 : 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    if (!body.id || !body.name) {
      return NextResponse.json({ error: "Entity id and name are required" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: body.id },
      select: { id: true, organizationId: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Entity was not found" }, { status: 404 });
    }

    await requireOrganizationAccess(currentUser.id, tenant.organizationId);

    const updatedTenant = await prisma.tenant.update({
      where: { id: body.id },
      data: {
        name: body.name,
        gstNumber: body.gstNumber ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        displayName: body.displayName ?? null,
        addressLine1: body.addressLine1 ?? null,
        addressLine2: body.addressLine2 ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        postalCode: body.postalCode ?? null,
        country: body.country ?? null,
      },
    });

    await writeAuditLog({
      organizationId: tenant.organizationId,
      userId: currentUser.id,
      action: "tenant_updated",
      entityType: "Tenant",
      entityId: tenant.id,
      details: { name: updatedTenant.name, changes: { email: updatedTenant.email, phone: updatedTenant.phone } },
    });

    return NextResponse.json({ message: "Entity updated successfully", tenant: updatedTenant });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update entity." },
      { status: error instanceof Error && error.message.includes("access") ? 403 : 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Entity id is required" }, { status: 400 });

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, organizationId: true, name: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Entity was not found" }, { status: 404 });
    }

    await requireOrganizationAccess(currentUser.id, tenant.organizationId);

    const vendorCount = await prisma.vendor.count({ where: { tenantId: id } });
    if (vendorCount > 0) {
      return NextResponse.json({ error: "This entity cannot be deleted because it has vendor records" }, { status: 409 });
    }

    const confirmed = new URL(req.url).searchParams.get("confirm") === "true";
    if (!confirmed) {
      return NextResponse.json({ error: "Delete confirmation is required. Pass confirm=true to delete this entity." }, { status: 400 });
    }

    await prisma.tenant.delete({ where: { id } });
    await writeAuditLog({
      organizationId: tenant.organizationId,
      userId: currentUser.id,
      action: "tenant_deleted",
      entityType: "Tenant",
      entityId: tenant.id,
      details: { name: tenant.name },
    });
    return NextResponse.json({ message: "Entity deleted successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete entity." },
      { status: error instanceof Error && error.message.includes("access") ? 403 : 500 }
    );
  }
}