import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/bootstrap/prisma";
import { buildPaginationMeta, getPaginationArgs } from "../../lib/pagination";
import { getCurrentUser, requireModuleAccess, requireOrganizationAccess, requireTenantAccess } from "../../lib/auth";

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationArgs(searchParams);
    const status = searchParams.get("status") ?? undefined;
    const organizationId = searchParams.get("orgId");

    if (!organizationId) {
      return NextResponse.json({ error: "Organization scope is required." }, { status: 400 });
    }

    await requireOrganizationAccess(currentUser.id, organizationId);
    await requireModuleAccess(currentUser.id, organizationId, "order-management", "merchandising");

    const where = {
      organizationId,
      ...(status ? { status } : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          id: true,
          organizationId: true,
          tenantId: true,
          entityName: true,
          category: true,
          subCategory: true,
          season: true,
          article: true,
          styleName: true,
          colors: true,
          buyer: true,
          brand: true,
          sizeGroup: true,
          typeField: true,
          fob: true,
          orderQty: true,
          orderQtyWithoutExcess: true,
          orderValue: true,
          deliveryDate: true,
          buyerPoDate: true,
          buyerPoNo: true,
          merchandiser: true,
          orderVolume: true,
          gst: true,
          hsnCode: true,
          sourceImportId: true,
          remarks: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return NextResponse.json({
      data: orders,
      meta: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch orders." },
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

    if (!body.entityName || !body.article || !body.brand || !body.buyer) {
      return NextResponse.json(
        { error: "Entity name, article, brand, and buyer are required." },
        { status: 400 }
      );
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json(
        { error: "At least one size row is required to create an order." },
        { status: 400 }
      );
    }

    const organizationId = typeof body.organizationId === "string" ? body.organizationId : (typeof body.orgId === "string" ? body.orgId : "");
    if (!organizationId) {
      return NextResponse.json({ error: "Organization scope is required." }, { status: 400 });
    }

    await requireOrganizationAccess(currentUser.id, organizationId);
    await requireModuleAccess(currentUser.id, organizationId, "order-management", "merchandising");

    if (body.tenantId) {
      await requireTenantAccess(currentUser.id, String(body.tenantId), organizationId);
    }

    const order = await prisma.order.create({
      data: {
        organizationId,
        tenantId: body.tenantId ?? null,
        entityName: body.entityName ?? null,
        category: body.category ?? null,
        subCategory: body.subCategory ?? null,
        season: body.season ?? null,
        article: body.article ?? null,
        styleName: body.styleName ?? null,
        colors: body.colors ?? null,
        buyer: body.buyer ?? null,
        brand: body.brand ?? null,
        sizeGroup: body.sizeGroup ?? null,
        typeField: body.typeField ?? "Direct",
        fob: Number(body.fob ?? 0),
        orderQty: Number(body.orderQty ?? 0),
        orderQtyWithoutExcess: Number(body.orderQtyWithoutExcess ?? 0),
        orderValue: Number(body.orderValue ?? 0),
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
        buyerPoDate: body.buyerPoDate ? new Date(body.buyerPoDate) : null,
        buyerPoNo: body.buyerPoNo ?? null,
        merchandiser: body.merchandiser ?? null,
        orderVolume: body.orderVolume ?? "Medium",
        gst: body.gst ?? null,
        hsnCode: body.hsnCode ?? null,
        sourceImportId: body.sourceImportId ?? null,
        remarks: body.remarks ?? null,
        status: body.status ?? "Draft",
        orderItems: {
          create: items.map((item: any) => ({
            size: String(item.size ?? ""),
            beforeExcessQty: Number(item.beforeExcessQty ?? 0),
            excess: Number(item.excess ?? 0),
            excessQty: Number(item.excessQty ?? 0),
            totalQty: Number(item.totalQty ?? 0),
            buyerPoPrice: Number(item.buyerPoPrice ?? 0),
            value: Number(item.value ?? 0),
          })),
        },
      },
      include: { orderItems: true },
    });

    return NextResponse.json({
      message: "Order saved successfully.",
      order,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to save the order.",
      },
      { status: error instanceof Error && error.message.includes("access") ? 403 : 500 }
    );
  }
}
