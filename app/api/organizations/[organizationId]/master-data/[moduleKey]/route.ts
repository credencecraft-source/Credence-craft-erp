import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { getOrganizationForUser, getOrganizationShellContext, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { createMasterValueForOrganization, getActiveOrganizationDummyDataBatch, getMasterDefinition, getMasterValuesForOrganization, getSizeGroupSizesForOrganization } from "@/lib/master-data/master-data-constants";
import { ORDER_LOOKUP_FIELDS } from "@/lib/master-data/master-data-registry";

type OrderedMasterValue = {
  parent_id?: string | null;
  fields?: Record<string, unknown>;
};

type MasterLookupRouteProfile = {
  startedAt: number;
  organizationMs: number;
  lookupMs: number;
};

function profiledJsonResponse(
  body: unknown,
  init?: ResponseInit,
  profile?: MasterLookupRouteProfile,
) {
  const serializationStartedAt = profile ? performance.now() : 0;
  const response = NextResponse.json(body, init);
  if (profile) {
    const duration = (value: number) => Math.max(0, value).toFixed(1);
    response.headers.set(
      "Server-Timing",
      `organization;dur=${duration(profile.organizationMs)}, lookup;dur=${duration(profile.lookupMs)}, json;dur=${duration(performance.now() - serializationStartedAt)}, total;dur=${duration(performance.now() - profile.startedAt)}`,
    );
  }
  return response;
}

function groupMasterValues<T extends OrderedMasterValue>(
  values: readonly T[],
  orderField: string,
) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    if (!value.parent_id) continue;
    const group = groups.get(value.parent_id) ?? [];
    group.push(value);
    groups.set(value.parent_id, group);
  }
  for (const group of groups.values()) {
    group.sort((left, right) =>
      Number(left.fields?.[orderField] ?? 0) - Number(right.fields?.[orderField] ?? 0),
    );
  }
  return groups;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string; moduleKey: string }> }
) {
  const profile = process.env.NODE_ENV === "development"
    ? { startedAt: performance.now(), organizationMs: 0, lookupMs: 0 }
    : undefined;
  let lookupStartedAt: number | undefined;
  const respond = (body: unknown, init?: ResponseInit) =>
    profiledJsonResponse(body, init, profile);

  try {
    const { organizationId, moduleKey } = await context.params;
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") !== "false";
    const includeDummyData = moduleKey === "vendor" && searchParams.get("includeDummyData") === "true";
    const entityId = moduleKey === "location" ? searchParams.get("entityId") || undefined : undefined;
    const parentId = searchParams.get("parentId") || undefined;
    const search = searchParams.get("search") || undefined;
    const exactSearch = searchParams.get("exact") === "true";
    const compactOrderLookups = searchParams.get("shape") === "compact";
    const requestedLimit = Number(searchParams.get("limit") || 100);
    const maximumLimit = moduleKey === "order-lookups" ? 500 : 200;
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), maximumLimit) : 100;

    if (!organizationId) {
      return respond({ error: "Organization ID is required" }, { status: 400 });
    }

    const user = await requireSessionUser();
    if (!user.workspace_id) {
      return respond({ error: "Unauthorized user workspace" }, { status: 401 });
    }

    const organizationStartedAt = profile ? performance.now() : 0;
    const organization = await getOrganizationShellContext(user.id, organizationId);
    if (profile) profile.organizationMs = performance.now() - organizationStartedAt;
    if (!organization) {
      return respond({ error: "Organization not found" }, { status: 404 });
    }

    if (moduleKey === "order-lookups") {
      const allLookupKeys = ["article", "entity", "category", "sub-category", "season", "color", "buyer", "brand", "size-group", "size", "raw-material-type", "raw-material-category", "raw-material-sub-category", "raw-material"];
      const requestedKeys = searchParams.get("keys")?.split(",").map((key) => key.trim()).filter(Boolean);
      const invalidKeys = requestedKeys?.filter((key) => !allLookupKeys.includes(key));
      if (invalidKeys?.length) {
        return respond({ error: "One or more requested order lookup keys are invalid." }, { status: 400 });
      }
      lookupStartedAt = profile ? performance.now() : undefined;
      const lookupKeys = requestedKeys?.length
        ? allLookupKeys.filter((key) => requestedKeys.includes(key))
        : allLookupKeys;
      const includeSizeGroupSizes = searchParams.get("includeSizeGroupSizes") !== "false";
      const activeDummyDataBatch = getActiveOrganizationDummyDataBatch(organization.id);
      const lookupValues = await Promise.all(
        lookupKeys.map(async (key) => {
          let sizeLinksPromise: ReturnType<typeof getSizeGroupSizesForOrganization> | undefined;
          const values = await getMasterValuesForOrganization(organization.id, key, includeInactive, {
            limit,
            includeDummyData: true,
            activeDummyDataBatch,
            ...(key === "size-group" && includeSizeGroupSizes ? {
              onRowsFetched: (rowIds) => {
                sizeLinksPromise = getSizeGroupSizesForOrganization(organization.id, rowIds, true);
                return sizeLinksPromise.then(() => undefined);
              },
            } : {}),
            ...(requestedKeys?.length && key === "article" ? { includeArticleMetrics: false } : {}),
            ...(key === "article"
              ? { includeArticleDetails: searchParams.get("includeArticleDetails") !== "false" }
              : {}),
          });
          const sizeLinks = key === "size-group"
            ? await sizeLinksPromise
            : undefined;
          return [key, values, sizeLinks] as const;
        }),
      );
      const masterOptions = Object.fromEntries(lookupValues.map(([key, values]) => [key, values]));
      const buyers = masterOptions.buyer;
      const seasons = masterOptions.season;
      const brands = masterOptions.brand;
      const articles = masterOptions.article;
      const colors = masterOptions.color;
      const sizeGroupOptions = masterOptions["size-group"] ?? [];
      const sizeLinks = lookupValues.find(([key]) => key === "size-group")?.[2] ?? [];
      const sizesByGroup = new Map<string, typeof sizeLinks>();
      for (const link of sizeLinks) {
        const groupSizes = sizesByGroup.get(link.groupId) ?? [];
        groupSizes.push(link);
        sizesByGroup.set(link.groupId, groupSizes);
      }
      const sizeGroups = sizeGroupOptions.map((group) => ({
        ...group,
        sizes: (sizesByGroup.get(group.id) ?? []).map((link) => link.size),
      }));
      const enrichedMasterOptions = { ...masterOptions, "size-group": sizeGroups };

      if (profile && lookupStartedAt !== undefined) {
        profile.lookupMs = performance.now() - lookupStartedAt;
      }
      const responseBody = {
        masterOptions: enrichedMasterOptions,
        orderLookups: ORDER_LOOKUP_FIELDS,
      };
      if (compactOrderLookups) {
        return respond(responseBody);
      }

      return respond({
        ...responseBody,
        buyers,
        seasons,
        brands,
        articles,
        colors,
        sizeGroups,
      });
    }

    lookupStartedAt = profile ? performance.now() : undefined;
    const activeDummyDataBatch = ["size-group", "process-template"].includes(moduleKey)
      ? getActiveOrganizationDummyDataBatch(organization.id)
      : undefined;
    let sizeLinksPromise: ReturnType<typeof getSizeGroupSizesForOrganization> | undefined;
    const values = await getMasterValuesForOrganization(organization.id, moduleKey, includeInactive, {
      search,
      limit,
      exactSearch,
      includeDummyData,
      entityId,
      parentId,
      ...(activeDummyDataBatch ? { activeDummyDataBatch } : {}),
      ...(moduleKey === "size-group" ? {
        onRowsFetched: (rowIds) => {
          sizeLinksPromise = getSizeGroupSizesForOrganization(
            organization.id,
            rowIds,
            false,
            activeDummyDataBatch,
          );
          return sizeLinksPromise.then(() => undefined);
        },
      } : {}),
    });
    if (moduleKey === "size-group") {
      const sizeLinks = sizeLinksPromise ? await sizeLinksPromise : [];
      const sizesByGroup = new Map<string, typeof sizeLinks[number][]>();
      for (const link of sizeLinks) {
        if (!includeInactive && !link.size.is_active) continue;
        const groupSizes = sizesByGroup.get(link.groupId) ?? [];
        groupSizes.push(link);
        sizesByGroup.set(link.groupId, groupSizes);
      }

      if (profile && lookupStartedAt !== undefined) {
        profile.lookupMs = performance.now() - lookupStartedAt;
      }
      return respond(values.map((group) => ({
        ...group,
        sizes: (sizesByGroup.get(group.id) ?? []).map((link) => link.size),
      })));
    }
    if (moduleKey === "process-template") {
      const [steps, operationTemplates, operationSteps] = await Promise.all([
        getMasterValuesForOrganization(organization.id, "process-template-step", includeInactive, { limit: 500, activeDummyDataBatch }),
        getMasterValuesForOrganization(organization.id, "operation-template", includeInactive, { limit: 500, activeDummyDataBatch }),
        getMasterValuesForOrganization(organization.id, "operation-template-step", includeInactive, { limit: 500, activeDummyDataBatch }),
      ]);
      const stepsByTemplate = groupMasterValues(steps, "Sl_No");
      const operationTemplatesByProcess = new Map<string, typeof operationTemplates>();
      const operationTemplateByLabel = new Map<string, (typeof operationTemplates)[number]>();
      for (const operationTemplate of operationTemplates) {
        const processName = String(operationTemplate.fields?.Process ?? "").trim();
        const matchingTemplates = operationTemplatesByProcess.get(processName) ?? [];
        matchingTemplates.push(operationTemplate);
        operationTemplatesByProcess.set(processName, matchingTemplates);
        if (!operationTemplateByLabel.has(operationTemplate.label)) {
          operationTemplateByLabel.set(operationTemplate.label, operationTemplate);
        }
      }
      for (const matchingTemplates of operationTemplatesByProcess.values()) {
        matchingTemplates.sort((left, right) =>
          Number(left.fields?.Sort_Order ?? 0) - Number(right.fields?.Sort_Order ?? 0),
        );
      }
      const operationStepsByTemplate = groupMasterValues(operationSteps, "Sl_No");
      const operationsByTemplate = new Map<string, Array<{
        id: string;
        valueId: string;
        slNo: number;
        operation: string;
        price: number;
      }>>();
      for (const operationTemplate of operationTemplates) {
        operationsByTemplate.set(
          operationTemplate.id,
          (operationStepsByTemplate.get(operationTemplate.id) ?? []).map((operationStep) => ({
            id: operationStep.id,
            valueId: operationStep.value_id,
            slNo: Number(operationStep.fields?.Sl_No ?? 0),
            operation: String(operationStep.fields?.Operation ?? operationStep.label),
            price: Number(operationStep.fields?.Price ?? 0),
          })),
        );
      }

      if (profile && lookupStartedAt !== undefined) {
        profile.lookupMs = performance.now() - lookupStartedAt;
      }
      return respond(values.map((template) => ({
        ...template,
        steps: (stepsByTemplate.get(template.id) ?? []).map((step) => {
          const processName = String(step.fields?.Process ?? step.label).trim();
          const legacyOperationTemplateName = String(step.fields?.Operation_Template ?? "").trim();
          const matchingOperationTemplates = operationTemplatesByProcess.get(processName) ?? [];
          const operationTemplate = operationTemplateByLabel.get(legacyOperationTemplateName)
            ?? matchingOperationTemplates[0];
          const operationTemplateName = operationTemplate?.label ?? legacyOperationTemplateName;
          const mapOperations = (selectedOperationTemplate: typeof operationTemplate) =>
            selectedOperationTemplate ? operationsByTemplate.get(selectedOperationTemplate.id) ?? [] : [];

          return {
            id: step.id,
            valueId: step.value_id,
            slNo: Number(step.fields?.Sl_No ?? 0),
            processName,
            isReturnableProcess: step.fields?.Is_Returnable_Process === true,
            blockByProcessName: String(step.fields?.Block_By ?? "").trim() || null,
            operationTemplateName: operationTemplateName || null,
            operationTemplateId: operationTemplate?.id ?? null,
            operationTemplates: matchingOperationTemplates.map((candidate) => ({
              id: candidate.id,
              valueId: candidate.value_id,
              label: candidate.label,
              operations: mapOperations(candidate),
            })),
            operations: mapOperations(operationTemplate),
          };
        }),
      })));
    }
    if (profile && lookupStartedAt !== undefined) {
      profile.lookupMs = performance.now() - lookupStartedAt;
    }
    return respond(values);
  } catch (error: unknown) {
    console.error("Error fetching master data:", error);
    if (profile && lookupStartedAt !== undefined) {
      profile.lookupMs = performance.now() - lookupStartedAt;
    }
    if (isDatabaseUnavailableError(error)) {
      return respond({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return respond({ error: "Unable to load master data. Please try again." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; moduleKey: string }> }
) {
  try {
    const { organizationId: routeOrgId, moduleKey: routeModuleKey } = await context.params;
    const url = new URL(request.url);
    const organizationId = routeOrgId || url.searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
    }

    const user = await requireSessionUser();
    if (!user.workspace_id) {
      return NextResponse.json({ error: "Unauthorized user workspace" }, { status: 401 });
    }

    const organization = await getOrganizationForUser(user.id, organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const body = await request.json();
    await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);
    const masterKey = routeModuleKey || body.masterKey || body.moduleKey || body.masterId || body.key;
    const label = body.label || body.name;
    const code = body.code;
    const description = body.description;
    const parentId = body.parentId || body.parentValueId;

    if (!masterKey || !label) {
      return NextResponse.json({ error: "Master key and label are required", received: body }, { status: 400 });
    }

    const definition = getMasterDefinition(masterKey);
    if (!definition) {
      return NextResponse.json({ error: `Invalid master definition for key: ${masterKey}` }, { status: 400 });
    }

    const fields = body.fields && typeof body.fields === "object" ? body.fields : {};
    const missingRequiredField = definition.fields.some((field) => {
      if (!field.required) return false;
      const value = fields[field.key];
      return Array.isArray(value) ? value.length === 0 : value === null || value === undefined || String(value).trim() === "";
    });
    if (missingRequiredField) {
      return NextResponse.json({ error: `${definition.label} is missing a required field.` }, { status: 400 });
    }

    const newMasterValue = await createMasterValueForOrganization(organization.id, masterKey, {
      label: String(label).trim(),
      code: code ? String(code).trim() : null,
      description: description ? String(description).trim() : null,
      parentValueId: parentId || null,
      fields,
      createOnly: body.createOnly === true,
      ...(masterKey === "size" && typeof body.sizeGroupId === "string" && body.sizeGroupId.trim()
        ? { sizeGroupId: body.sizeGroupId.trim() }
        : {}),
    });

    const multiLookupField = definition.fields.find((field) => field.type === "lookup" && field.multiple && field.lookupModuleKey);
    const selectedValues = multiLookupField ? fields[multiLookupField.key] : [];
    if (masterKey !== "size-group" && multiLookupField?.lookupModuleKey && Array.isArray(selectedValues)) {
      for (const selectedValue of [...new Set(selectedValues.map((value: unknown) => String(value).trim()).filter(Boolean))]) {
        await createMasterValueForOrganization(organization.id, multiLookupField.lookupModuleKey, {
          label: selectedValue,
          fields: { Size: selectedValue },
          parentValueId: newMasterValue.value_id,
        });
      }
    }

    return NextResponse.json(newMasterValue, { status: 201 });
  } catch (error: unknown) {
    console.error("Error creating master value:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal Server Error" }, { status: 500 });
  }
}
