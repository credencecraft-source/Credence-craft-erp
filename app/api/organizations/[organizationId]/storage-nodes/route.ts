import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import {
  createStorageNode,
  listStorageNodesForOrganization,
  STORAGE_NODE_TYPES,
  StorageNodeError,
  type StorageNodeType,
} from "@/lib/services/inventory/storage-node-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failureResponse(error: unknown, fallback: string) {
  if (error instanceof StorageNodeError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json({ error: "That storage code is already in use in this organization." }, { status: 409 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationPermission(user.id, organizationId, "VIEW_STORAGE_NODES");
    const { searchParams } = new URL(request.url);
    const nodeTypeValue = searchParams.get("nodeType") || undefined;
    if (nodeTypeValue && !STORAGE_NODE_TYPES.includes(nodeTypeValue as StorageNodeType)) {
      return NextResponse.json({ error: "Select a valid storage hierarchy level." }, { status: 400 });
    }
    const limit = Number(searchParams.get("limit") ?? 200);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      return NextResponse.json({ error: "Storage node limit must be between 1 and 500." }, { status: 400 });
    }
    const search = searchParams.get("search")?.trim() || undefined;
    if (search && (search.length < 2 || search.length > 100)) {
      return NextResponse.json({ error: "Storage node search must contain between 2 and 100 characters." }, { status: 400 });
    }
    const siteEntityId = searchParams.get("siteEntityId")?.trim() || undefined;
    if (siteEntityId && siteEntityId.length > 100) {
      return NextResponse.json({ error: "A valid site Entity is required when searching storage locations." }, { status: 400 });
    }
    const cursor = searchParams.get("cursor")?.trim() || undefined;
    const resultLimit = Math.min(limit + 1, 500);
    const queriedNodes = await listStorageNodesForOrganization(organization.id, {
      includeInactive: searchParams.get("includeInactive") === "true",
      nodeType: nodeTypeValue as StorageNodeType | undefined,
      siteEntityId,
      search,
      limit: resultLimit,
      cursor,
    });
    const hasMore = queriedNodes.length > limit;
    const nodes = queriedNodes.slice(0, limit);
    return NextResponse.json({
      nodes,
      hasMore,
      nextCursor: hasMore ? nodes[nodes.length - 1]?.id ?? null : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to load storage nodes." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  let user;
  try {
    user = await requireSessionUser();
  } catch {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let organization;
  try {
    const { organizationId } = await context.params;
    organization = await requireOrganizationPermission(user.id, organizationId, "MANAGE_STORAGE_NODES");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to verify organization access." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "A storage node request is required." }, { status: 400 });
  }

  try {
    const node = await createStorageNode(organization.id, user.id, {
      nodeType: body.nodeType,
      code: body.code,
      name: body.name,
      parentId: body.parentId,
      entityId: body.entityId,
      masterLocationId: body.masterLocationId,
    });
    return NextResponse.json({ node }, { status: 201 });
  } catch (error) {
    return failureResponse(error, "Unable to create the storage node.");
  }
}
