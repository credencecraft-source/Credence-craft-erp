// @/lib/services/platform/plan-service.ts
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/database/prisma-client";
import { ensureStandardPlansForBusinessTypes } from "@/lib/services/platform/subscription-service";
import { resolveOrganizationSegmentPrice } from "@/lib/services/platform/organization-segment-pricing-service";

export async function listPlans() {
  await ensureStandardPlansForBusinessTypes();
  const plans = await prisma.plan.findMany({
    where: { business_type_id: { not: null } },
    orderBy: { sort_order: "asc" },
    include: { businessType: true },
  });

  const visiblePlans = [] as typeof plans;
  const freePlanBusinessTypes = new Set<string>();

  for (const plan of plans) {
    if (plan.business_type_id && Number(plan.price ?? 0) <= 0) {
      if (freePlanBusinessTypes.has(plan.business_type_id)) continue;
      freePlanBusinessTypes.add(plan.business_type_id);
    }
    visiblePlans.push(plan);
  }

  return visiblePlans.map((plan) => ({
    ...plan,
    price: plan.price ? plan.price.toNumber() : null,
  }));
}

function normalizeSegmentName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function segmentNamesForPlan(plan: { tier_key?: string | null; plan_name: string }) {
  const tierKey = normalizeSegmentName(plan.tier_key || "");
  const planTier = plan.plan_name.includes(" - ") ? plan.plan_name.split(" - ").slice(1).join(" - ") : plan.plan_name;
  const mappedTier = tierKey === "classic" ? "standard" : tierKey === "enterprise" ? "premium" : tierKey;
  return new Set([mappedTier, normalizeSegmentName(planTier)].filter(Boolean));
}

type BusinessTypePlan = {
  business_type_id: string | null;
  tier_key?: string | null;
  plan_name: string;
};

export function findPlanForVersionSegment<T extends BusinessTypePlan>(
  plans: T[],
  businessTypeId: string,
  segmentName: string,
) {
  const normalizedSegmentName = normalizeSegmentName(segmentName);
  return plans.find((candidate) =>
    candidate.business_type_id === businessTypeId && segmentNamesForPlan(candidate).has(normalizedSegmentName),
  );
}

export async function listVersionSegmentPlansForOrganization(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { platform_version_id: true },
  });

  const versionId = organization?.platform_version_id;
  if (!versionId) return { plans: [], businessTypes: [], versionId: null, versionName: null };

  const version = await prisma.platformVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      version_name: true,
      businessTypes: {
        include: {
          businessType: true,
          tags: { orderBy: { label: "asc" } },
          segments: { where: { is_active: true }, include: { segment: true, locationLimit: true } },
        },
      },
    },
  });

  if (!version) return { plans: [], businessTypes: [], versionId: null, versionName: null };

  const versionSegmentIds = version.businessTypes.flatMap(({ segments }) => segments.map(({ id }) => id));
  const organizationPrices = await prisma.organizationSegmentPrice.findMany({
    where: {
      organization_id: organizationId,
      version_business_type_segment_id: { in: versionSegmentIds },
    },
    select: {
      version_business_type_segment_id: true,
      snapshot_price: true,
      custom_price: true,
    },
  });
  const organizationPriceBySegment = new Map(
    organizationPrices.map((price) => [price.version_business_type_segment_id, price]),
  );

  const billableBusinessTypes = version.businessTypes.filter(({ is_free }) => !is_free);
  const businessTypeIds = billableBusinessTypes.map(({ business_type_id }) => business_type_id);
  const plans = await prisma.plan.findMany({
    where: { is_active: true, business_type_id: { in: businessTypeIds } },
    orderBy: { sort_order: "asc" },
    include: { businessType: true },
  });

  const segmentPlans = billableBusinessTypes.flatMap((assignment) =>
    assignment.segments.flatMap((segmentAssignment) => {
      const { id: segmentId, segment } = segmentAssignment;
      const plan = findPlanForVersionSegment(plans, assignment.business_type_id, segment.name);
      const organizationPrice = organizationPriceBySegment.get(segmentId) ?? null;
      const snapshotPrice = organizationPrice ? organizationPrice.snapshot_price : segmentAssignment.price;
      const effectivePrice = resolveOrganizationSegmentPrice(organizationPrice, segmentAssignment.price);
      return [{
        id: plan?.id ?? `segment-${segmentId}`,
        plan_id: plan?.plan_id ?? null,
        business_type_id: assignment.business_type_id,
        plan_name: plan?.plan_name ?? `${assignment.businessType.name} - ${segment.name}`,
        description: plan?.description ?? segment.description,
        price: effectivePrice?.toNumber() ?? null,
        segment_price: effectivePrice?.toNumber() ?? null,
        version_price: segmentAssignment.price?.toNumber() ?? null,
        organization_snapshot_price: snapshotPrice?.toNumber() ?? null,
        is_custom_price: organizationPrice?.custom_price != null,
        billing_cycle: plan?.billing_cycle ?? null,
        is_active: plan?.is_active ?? true,
        tier_key: plan?.tier_key ?? null,
        billing_plan_id: plan?.id ?? null,
        is_pricing_configured: segmentAssignment.price != null,
        segment_id: segmentId,
        location_limit: segmentAssignment.locationLimit?.max_locations ?? null,
        platform_segment_id: segment.id,
        segment_name: segment.name,
        segment_sort_order: segment.sort_order,
        segment_label: segmentAssignment.label,
        version_name: version.version_name,
      }];
    }),
  );

  return {
    plans: segmentPlans,
    versionId: version.id,
    businessTypes: billableBusinessTypes.map(({ businessType, tags }) => ({
      ...businessType,
      tags: tags.map(({ id, label }) => ({ id, label })),
    })),
    versionName: version.version_name,
  };
}

export async function listPlansForOrganizationVersion(organizationId: string) {
  const catalog = await listVersionSegmentPlansForOrganization(organizationId);
  return catalog.plans;
}

export async function getPlanById(planId: string) {
  const plan = await prisma.plan.findFirst({
    where: {
      OR: [{ id: planId }, { plan_id: planId }],
    },
    include: { businessType: true },
  });

  if (!plan) return null;

  return {
    ...plan,
    price: plan.price ? plan.price.toNumber() : null,
  };
}

export async function createPlan(input: {
  planName: string;
  businessTypeId?: string;
  description?: string;
  price?: number;
  billingCycle?: string;
}) {
  const planName = input.planName.trim();

  if (!planName) {
    throw new Error("Plan name is required.");
  }

  if (input.price !== undefined && input.price <= 0) {
    throw new Error("Free is a shared platform plan and is managed automatically.");
  }

  const existing = await prisma.plan.findUnique({ where: { plan_name: planName } });

  if (existing) {
    throw new Error("A plan with this name already exists.");
  }

  const planCount = await prisma.plan.count();
  const businessTypeId = input.businessTypeId?.trim();

  const createdPlan = await prisma.plan.create({
    data: {
      plan_id: randomUUID(),
      business_type_id: businessTypeId && businessTypeId !== "" ? businessTypeId : null,
      plan_name: planName,
      description: input.description?.trim() || null,
      price: input.price ?? null,
      billing_cycle: input.billingCycle?.trim() || null,
      sort_order: planCount,
    },
    include: { businessType: true },
  });

  return {
    ...createdPlan,
    price: createdPlan.price ? createdPlan.price.toNumber() : null,
  };
}

export async function deletePlan(planId: string) {
  const plan = await prisma.plan.findUnique({
    where: { plan_id: planId },
  });

  if (!plan) {
    return null;
  }

  if (plan.is_system_plan) {
    throw new Error("Standard plans cannot be deleted.");
  }

  return prisma.plan.delete({
    where: { plan_id: planId },
  });
}

export async function updatePlan(input: {
  planId: string;
  description?: string;
  price?: number | null;
  billingCycle?: string | null;
}) {
  const plan = await prisma.plan.findUnique({ where: { plan_id: input.planId } });
  if (!plan) throw new Error("Plan not found.");

  if (input.price !== null && input.price !== undefined && input.price < 0) {
    throw new Error("Plan price cannot be negative.");
  }
  const updatedPlan = await prisma.plan.update({
    where: { id: plan.id },
    data: {
      description: input.description?.trim() || null,
      price: input.price ?? null,
      billing_cycle: input.billingCycle?.trim() || null,
    },
    include: { businessType: true },
  });

  return {
    ...updatedPlan,
    price: updatedPlan.price ? updatedPlan.price.toNumber() : null,
  };
}