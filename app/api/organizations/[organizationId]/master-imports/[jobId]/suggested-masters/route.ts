import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  createMasterValueForOrganization,
  type MasterFieldValues,
} from "@/lib/master-data/master-data-constants";
import { getMasterDefinition } from "@/lib/master-data/master-data-registry";
import {
  getMasterImportJob,
  MasterImportServiceError,
} from "@/lib/services/master-data/master-import-service";
import {
  authorizeMasterImportRoute,
  masterImportErrorResponse,
  parseBoundedJson,
} from "../../route-support";

const SUPPORTED_MODULES = new Set([
  "brand",
  "product-master",
  "category",
  "sub-category",
  "color",
  "size",
]);
const MAX_SUGGESTIONS_PER_REQUEST = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMasterFieldValue(value: unknown): value is MasterFieldValues[string] {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (!Array.isArray(value)) return false;
  return value.every((item) =>
    typeof item === "string"
    || typeof item === "number"
    || (isRecord(item) && value.every(isRecord)),
  );
}

function validateSuggestions(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SUGGESTIONS_PER_REQUEST) {
    throw new MasterImportServiceError(
      `Submit between 1 and ${MAX_SUGGESTIONS_PER_REQUEST} suggested masters at a time.`,
      400,
    );
  }

  const seen = new Set<string>();
  return value.map((candidate) => {
    if (!isRecord(candidate)
      || typeof candidate.moduleKey !== "string"
      || typeof candidate.label !== "string"
      || !isRecord(candidate.fields)
      || !SUPPORTED_MODULES.has(candidate.moduleKey)) {
      throw new MasterImportServiceError("One or more suggested masters are invalid or not supported for automatic creation.", 400);
    }
    const label = candidate.label.trim();
    if (!label || label.length > 255) {
      throw new MasterImportServiceError("Suggested master labels must contain 1 to 255 characters.", 400);
    }
    const key = `${candidate.moduleKey}:${label.toLocaleLowerCase()}`;
    if (seen.has(key)) {
      throw new MasterImportServiceError("Each suggested master can only be submitted once per batch.", 400);
    }
    seen.add(key);

    const definition = getMasterDefinition(candidate.moduleKey);
    if (!definition) {
      throw new MasterImportServiceError("A suggested master definition is unavailable.", 400);
    }
    const allowedFieldKeys = new Set(definition.fields.map((field) => field.key));
    if (Object.keys(candidate.fields).some((fieldKey) => !allowedFieldKeys.has(fieldKey))) {
      throw new MasterImportServiceError(`Suggested ${definition.label} fields are invalid.`, 400);
    }
    const fields: MasterFieldValues = {};
    for (const [fieldKey, fieldValue] of Object.entries(candidate.fields)) {
      if (!isMasterFieldValue(fieldValue)) {
        throw new MasterImportServiceError(`Suggested ${definition.label} fields are invalid.`, 400);
      }
      fields[fieldKey] = fieldValue;
    }
    for (const field of definition.fields) {
      if (!field.required) continue;
      const fieldValue = fields[field.key];
      if (Array.isArray(fieldValue) ? fieldValue.length === 0
        : fieldValue === null || fieldValue === undefined || String(fieldValue).trim() === "") {
        throw new MasterImportServiceError(`Suggested ${definition.label} is missing a required field.`, 400);
      }
    }
    return {
      moduleKey: candidate.moduleKey,
      label,
      fields,
    };
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;

    const body: unknown = await parseBoundedJson(request, 256 * 1024);
    if (!isRecord(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "suggestions")) {
      return NextResponse.json({ error: "Suggested master request is invalid." }, { status: 400 });
    }
    const suggestions = validateSuggestions(body.suggestions);
    const { job } = await getMasterImportJob(authorization.context.organizationId, jobId, {
      skip: 0,
      take: 1,
      tab: "errors",
    });
    if (job.moduleKey !== "article") {
      throw new MasterImportServiceError("Automatic related-master creation is only available for Article imports.", 409);
    }
    if (new Date(job.expiresAt) <= new Date()) {
      throw new MasterImportServiceError("This import job has expired.", 410);
    }

    const results: Array<{ moduleKey: string; label: string; created: boolean; error?: string }> = [];
    for (const suggestion of suggestions) {
      try {
        await createMasterValueForOrganization(
          authorization.context.organizationId,
          suggestion.moduleKey,
          { label: suggestion.label, fields: suggestion.fields, createOnly: true },
        );
        results.push({ moduleKey: suggestion.moduleKey, label: suggestion.label, created: true });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) throw error;
        if (!(error instanceof Error)) throw error;
        results.push({
          moduleKey: suggestion.moduleKey,
          label: suggestion.label,
          created: false,
          error: error.message,
        });
      }
    }
    return NextResponse.json({
      createdCount: results.filter((result) => result.created).length,
      failedCount: results.filter((result) => !result.created).length,
      results,
    });
  } catch (error) {
    return masterImportErrorResponse(error, "create-suggested-masters");
  }
}
