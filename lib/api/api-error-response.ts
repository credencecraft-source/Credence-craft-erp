import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type ApiErrorResponseOptions = {
  context: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isPrismaInitializationError(error: unknown): boolean {
  return error instanceof Error && [
    "PrismaClientInitializationError",
    "PrismaClientRustPanicError",
    "PrismaClientUnknownRequestError",
  ].includes(error.name);
}

function knownDatabaseError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;

  switch (error.code) {
    case "P2002":
      return { status: 409, code: "CONFLICT", message: "A record with the same value already exists." };
    case "P2025":
      return { status: 404, code: "NOT_FOUND", message: "The requested record was not found." };
    case "P2003":
    case "P2014":
    case "P2004":
      return { status: 409, code: "RELATION_CONFLICT", message: "This operation conflicts with related records." };
    case "P2024":
    case "P1000":
    case "P1001":
    case "P1002":
    case "P1008":
    case "P1017":
      return { status: 503, code: "DATABASE_UNAVAILABLE", message: "The service is temporarily unavailable. Please try again." };
    case "P2000":
    case "P2006":
    case "P2007":
    case "P2011":
    case "P2012":
    case "P2013":
    case "P2023":
      return { status: 400, code: "INVALID_DATA", message: "The submitted data is invalid." };
    default:
      return { status: 500, code: "DATABASE_ERROR", message: "The request could not be completed." };
  }
}

export function apiErrorResponse(error: unknown, options: ApiErrorResponseOptions) {
  const databaseError = knownDatabaseError(error);
  const mappedError = error instanceof ApiError
    ? { status: error.status, code: error.code ?? "REQUEST_FAILED", message: error.message }
    : databaseError
      ?? (isPrismaInitializationError(error)
        ? { status: 503, code: "DATABASE_UNAVAILABLE", message: "The service is temporarily unavailable. Please try again." }
        : { status: 500, code: "INTERNAL_ERROR", message: "An unexpected error occurred. Please try again." });

  console.error(`[${options.context}]`, error);
  return NextResponse.json(
    { error: mappedError.message, code: mappedError.code },
    { status: mappedError.status },
  );
}
