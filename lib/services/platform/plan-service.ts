// @/lib/services/platform/plan-service.ts
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/database/prisma-client";
import { ensureStandardPlansForBusinessTypes } from "@/lib/services/platform/subscription-service";

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
    throw new Error("Standard plans cannot be deleted. Configure their restrictions instead.");
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
  maxOrderQty?: number | null;
}) {
  const plan = await prisma.plan.findUnique({ where: { plan_id: input.planId } });
  if (!plan) throw new Error("Plan not found.");

  if (input.price !== null && input.price !== undefined && input.price < 0) {
    throw new Error("Plan price cannot be negative.");
  }
  if (input.maxOrderQty !== null && input.maxOrderQty !== undefined && input.maxOrderQty < 0) {
    throw new Error("Order quantity limit cannot be negative.");
  }

  const updatedPlan = await prisma.plan.update({
    where: { id: plan.id },
    data: {
      description: input.description?.trim() || null,
      price: input.price ?? null,
      billing_cycle: input.billingCycle?.trim() || null,
      max_order_qty: input.maxOrderQty ?? null,
    },
    include: { businessType: true },
  });

  return {
    ...updatedPlan,
    price: updatedPlan.price ? updatedPlan.price.toNumber() : null,
  };
}