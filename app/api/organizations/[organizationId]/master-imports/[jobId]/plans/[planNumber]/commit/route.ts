import { NextResponse } from "next/server";

import {
  commitNextMasterImportRow,
  getValidatedMasterImportPlanRows,
} from "@/lib/services/master-data/master-import-service";
import {
  authorizeMasterImportRoute,
  masterImportErrorResponse,
} from "../../../../route-support";

export async function POST(
  _request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string; planNumber: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId, planNumber: rawPlanNumber } = await context.params;
    const planNumber = Number(rawPlanNumber);
    if (!Number.isSafeInteger(planNumber) || planNumber < 1) {
      return NextResponse.json({ error: "Import plan number is invalid." }, { status: 400 });
    }

    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;
    const rowNumbers = await getValidatedMasterImportPlanRows(
      authorization.context.organizationId,
      jobId,
      planNumber,
    );
    if (rowNumbers.length === 0) {
      return NextResponse.json({ error: "This plan has no validated rows to import." }, { status: 409 });
    }

    let result: Awaited<ReturnType<typeof commitNextMasterImportRow>> | null = null;
    for (const rowNumber of rowNumbers) {
      result = await commitNextMasterImportRow({
        organizationId: authorization.context.organizationId,
        actorUserId: authorization.context.userId,
        jobId,
        rowNumber,
      });
      if ((result.row === null && !("validationRequired" in result && result.validationRequired === true))
        || result.job.status === "COMPLETED" || result.job.status === "FAILED") break;
    }
    if (!result) throw new Error("Selected import plan did not process a row.");
    const remainingRows = await getValidatedMasterImportPlanRows(
      authorization.context.organizationId,
      jobId,
      planNumber,
    );
    return NextResponse.json({
      ...result,
      planProgress: { hasMore: remainingRows.length > 0 },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "commit plan");
  }
}
