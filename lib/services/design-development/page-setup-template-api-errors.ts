import { NextResponse } from "next/server";

import {
  DATABASE_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailableError,
} from "@/lib/database/database-errors";

const SCHEMA_NOT_READY_MESSAGE =
  "Page Setup is not ready. Restart the application to load the updated Prisma Client, then apply the pending database migration.";

function getPrismaErrorCode(error: unknown) {
  const visited = new Set<object>();
  let current = error;

  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    const code = Reflect.get(current, "code");
    if (typeof code === "string") return code;
    current = Reflect.get(current, "cause");
  }
  return null;
}

export function getPageSetupTemplateApiErrorResponse(
  error: unknown,
  action: "load" | "save" | "delete",
  hasGeneratedModel: boolean,
) {
  const prismaCode = getPrismaErrorCode(error);
  if (!hasGeneratedModel || prismaCode === "P2021" || prismaCode === "P2022") {
    console.error("Page Setup schema or Prisma Client is not ready.", {
      prismaCode: prismaCode ?? undefined,
      generatedModelAvailable: hasGeneratedModel,
    });
    return NextResponse.json(
      { error: SCHEMA_NOT_READY_MESSAGE, code: "SCHEMA_NOT_READY" },
      { status: 503 },
    );
  }
  if (action === "save" && prismaCode === "P2002") {
    return NextResponse.json(
      { error: "A page setup template with this name already exists." },
      { status: 409 },
    );
  }
  if (
    error instanceof Error
    && (error.message.startsWith("Access denied:") || error.message.includes("trial has ended"))
  ) {
    return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  }
  if (isDatabaseUnavailableError(error)) {
    return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  console.error(`Unable to ${action} organization Page Setup template.`, {
    errorName: error instanceof Error ? error.name : "UnknownError",
    prismaCode: prismaCode ?? undefined,
  });
  return NextResponse.json(
    {
      error: action === "load"
        ? "Unable to load Page Setup template."
        : action === "delete"
          ? "Unable to delete Page Setup templates."
          : "Unable to save Page Setup template.",
    },
    { status: 500 },
  );
}
