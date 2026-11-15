import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  EntityMasterArchitectureError,
  listEntityDivisions,
} from "@/lib/services/organizations/entity-master-architecture-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    return NextResponse.json({
      divisions: await listEntityDivisions(user.id, organizationId),
    });
  } catch (error) {
    if (error instanceof EntityMasterArchitectureError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load Entity divisions." }, { status: 500 });
  }
}
