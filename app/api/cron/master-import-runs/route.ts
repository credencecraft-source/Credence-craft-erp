import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runMasterImportWorkerBatch } from "@/lib/services/master-data/master-import-run-service";

export const maxDuration = 300;

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

  try {
    const result = await runMasterImportWorkerBatch();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Master import worker failed.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to process background imports." }, { status: 500 });
  }
}
