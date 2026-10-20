import { NextResponse } from "next/server";

import {
  createPlatformSalesManager,
  listPlatformSalesManagers,
} from "@/lib/services/platform/platform-sales-manager-service";

export async function GET() {
  try {
    const managers = await listPlatformSalesManagers();
    return NextResponse.json({ managers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load sales managers." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : {};
    const manager = await createPlatformSalesManager({
      fullName: typeof body.fullName === "string" ? body.fullName : "",
      email: typeof body.email === "string" ? body.email : "",
      mobileNumber: typeof body.mobileNumber === "string" ? body.mobileNumber : undefined,
    });
    return NextResponse.json({ manager }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the sales manager." },
      { status: 400 },
    );
  }
}
