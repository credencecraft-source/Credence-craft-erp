import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { aggregateTenantUsageForDate } from "@/lib/services/workspace/tenant-usage-metering-service";

export const maxDuration = 10;

function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  try {
    const result = await aggregateTenantUsageForDate(yesterday);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Tenant usage aggregation failed.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to aggregate tenant usage." },
      { status: 500 },
    );
  }
}
