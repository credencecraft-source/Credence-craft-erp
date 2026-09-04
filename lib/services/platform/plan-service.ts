import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/database/prisma-client";
import { PLAN_FEATURE_CATALOG } from "@/lib/services/platform/plan-feature-catalog";

export async function listPlans() {
  return prisma.plan.findMany({
    orderBy: { sort_order: "asc" },
    include: { businessType: true },
  });
}

export async function getPlanById(planId: string) {
  return prisma.plan.findUnique({
    where: { id: planId },
    include: { businessType: true },
  });
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

  const existing = await prisma.plan.findUnique({ where: { plan_name: planName } });

  if (existing) {
    throw new Error("A plan with this name already exists.");
  }

  const planCount = await prisma.plan.count();

  return prisma.$transaction(async (transaction) => {
    const plan = await transaction.plan.create({
      data: {
        plan_id: randomUUID(),
        business_type_id: input.businessTypeId?.trim() || null,
        plan_name: planName,
        description: input.description?.trim() || null,
        price: input.price ?? null,
        billing_cycle: input.billingCycle?.trim() || null,
        sort_order: planCount,
      },
      include: { businessType: true },
    });

    await transaction.planFeature.createMany({
      data: PLAN_FEATURE_CATALOG.map((feature) => ({
        feature_id: randomUUID(),
        plan_id: plan.id,
        feature_key: feature.feature_key,
        feature_name: feature.feature_name,
        is_enabled: false,
      })),
    });

    return plan;
  });
}

export async function deletePlan(planId: string) {
  return prisma.$transaction(async (transaction) => {
    await transaction.planFeature.deleteMany({
      where: { plan_id: planId },
    });

    const plan = await transaction.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return null;
    }

    return transaction.plan.delete({
      where: { id: planId },
    });
  });
}

export async function listPlanFeatures(planId: string) {
  const existingFeatures = await prisma.planFeature.findMany({
    where: { plan_id: planId },
  });

  const existingKeys = new Set(existingFeatures.map((feature) => feature.feature_key));
  const missingCatalogItems = PLAN_FEATURE_CATALOG.filter((item) => !existingKeys.has(item.feature_key));

  if (missingCatalogItems.length > 0) {
    await prisma.planFeature.createMany({
      data: missingCatalogItems.map((item) => ({
        feature_id: randomUUID(),
        plan_id: planId,
        feature_key: item.feature_key,
        feature_name: item.feature_name,
        is_enabled: false,
      })),
    });

    return prisma.planFeature.findMany({
      where: { plan_id: planId },
      orderBy: { feature_name: "asc" },
    });
  }

  return existingFeatures.sort((a, b) => a.feature_name.localeCompare(b.feature_name));
}

export async function setPlanFeatureEnabled(planId: string, featureKey: string, isEnabled: boolean) {
  await prisma.planFeature.update({
    where: { plan_id_feature_key: { plan_id: planId, feature_key: featureKey } },
    data: { is_enabled: isEnabled },
  });
}