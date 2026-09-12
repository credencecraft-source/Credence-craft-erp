// @/lib/services/platform/plan-service.ts
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/database/prisma-client";

export async function listPlans() {
  const plans = await prisma.plan.findMany({
    orderBy: { sort_order: "asc" },
    include: { businessType: true },
  });

  return plans.map((plan) => ({
    ...plan,
    price: plan.price ? plan.price.toNumber() : null,
  }));
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

  return prisma.plan.delete({
    where: { plan_id: planId },
  });
}