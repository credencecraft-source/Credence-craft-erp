// @/lib/services/platform/subscription-service.ts
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma-client";

export const FREE_PLAN_NAME = "Free";

export const STANDARD_PLAN_DEFINITIONS = [
  { tierKey: "FREE", label: "Free", price: 0, color: "slate" },
  { tierKey: "CLASSIC", label: "Classic", price: 4999, color: "blue" },
  { tierKey: "PROFESSIONAL", label: "Professional", price: 9999, color: "violet" },
  { tierKey: "ENTERPRISE", label: "Enterprise", price: 19999, color: "amber" },
] as const;

export async function ensureStandardPlansForBusinessTypes(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const businessTypes = await client.businessType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const plans = await client.plan.findMany({ where: { business_type_id: { in: businessTypes.map(({ id }) => id) } } });
  let nextSortOrder = (await client.plan.aggregate({ _max: { sort_order: true } }))._max.sort_order ?? 0;

  for (const businessType of businessTypes) {
    for (const definition of STANDARD_PLAN_DEFINITIONS) {
      const standardPlanName = `${businessType.name} - ${definition.label}`;
      let plan = plans.find((candidate) => candidate.business_type_id === businessType.id && candidate.tier_key === definition.tierKey);
      if (!plan && definition.tierKey === "FREE") {
        plan = plans.find((candidate) => candidate.business_type_id === businessType.id && candidate.plan_name === standardPlanName);
      }
      if (!plan) {
        const existingByName = await client.plan.findUnique({ where: { plan_name: standardPlanName } });
        if (existingByName) plan = existingByName;
      }

      if (plan) {
        const duplicatePlans = plans.filter((candidate) =>
          candidate.id !== plan!.id
          && candidate.business_type_id === businessType.id
          && (candidate.tier_key === definition.tierKey || candidate.plan_name === `${businessType.name} - ${definition.label}`)
        );

        for (const duplicate of duplicatePlans) {
          await client.subscription.updateMany({
            where: { plan_id: duplicate.id },
            data: { plan_id: plan.id },
          });
          await client.plan.delete({ where: { id: duplicate.id } });
        }

        await client.plan.update({
          where: { id: plan.id },
          data: {
            business_type_id: businessType.id,
            tier_key: definition.tierKey,
            is_system_plan: true,
            display_color: definition.color,
            ...(plan.plan_name !== standardPlanName && plan.tier_key === definition.tierKey
              ? { plan_name: standardPlanName }
              : {}),
          },
        });
        continue;
      }

      nextSortOrder += 1;
      await client.plan.create({
        data: {
          plan_id: randomUUID(),
          business_type_id: businessType.id,
          plan_name: standardPlanName,
          description: "",
          price: definition.price,
          billing_cycle: "monthly",
          tier_key: definition.tierKey,
          is_system_plan: true,
          display_color: definition.color,
          sort_order: nextSortOrder,
        },
      });
    }
  }
}

export async function ensureFreePlansForBusinessTypes(client: Prisma.TransactionClient | typeof prisma = prisma) {
  await ensureStandardPlansForBusinessTypes(client);
}

export async function ensureGlobalFreePlan(client: Prisma.TransactionClient | typeof prisma = prisma) {
  return client.plan.upsert({
    where: { plan_name: FREE_PLAN_NAME },
    update: {
      business_type_id: null,
      description: "Shared default plan for every business module.",
      price: 0,
      billing_cycle: "monthly",
      is_active: true,
    },
    create: {
      plan_id: randomUUID(),
      plan_name: FREE_PLAN_NAME,
      description: "Shared default plan for every business module.",
      price: 0,
      billing_cycle: "monthly",
      sort_order: -1,
    },
  });
}

function isFreePlan(plan: { price: unknown; tier_key?: string | null; business_type_id?: string | null }) {
  return plan.tier_key === "FREE" || Number(plan.price ?? 0) <= 0;
}

export async function listSubscriptions(organizationId?: string, limit = 100) {
  const page = await listSubscriptionsPage({ organizationId, limit });
  return page.subscriptions;
}

export async function listSubscriptionsPage(options: { organizationId?: string; cursor?: string; limit?: number } = {}) {
  const take = Math.min(Math.max(options.limit ?? 100, 1), 100);
  const subscriptions = await prisma.subscription.findMany({
    where: {
      ...(options.organizationId ? { organization_id: options.organizationId } : {}),
      plan: { price: { gt: 0 } },
    },
    orderBy: { created_at: "desc" },
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    take: take + 1,
  });

  const hasNextPage = subscriptions.length > take;
  const pageSubscriptions = hasNextPage ? subscriptions.slice(0, take) : subscriptions;
  return {
    subscriptions: pageSubscriptions.map((sub) => ({
    ...sub,
    organizationId: sub.organization_id,
    businessTypeId: sub.business_type_id,
    planId: sub.plan_id,
    paymentStatus: sub.payment_status,
    organization_name: sub.organization_id,
    business_type_name: sub.business_type_id,
    plan_name: sub.plan_id,
    })),
    nextCursor: hasNextPage ? pageSubscriptions.at(-1)?.id ?? null : null,
  };
}

export async function getSubscriptionsByOrganization(organizationId: string) {
  const subscriptions = await prisma.subscription.findMany({
    where: { organization_id: organizationId, plan: { price: { gt: 0 } } },
  });

  return subscriptions.map((sub) => ({
    ...sub,
    organizationId: sub.organization_id,
    businessTypeId: sub.business_type_id,
    planId: sub.plan_id,
    paymentStatus: sub.payment_status,
    plan: {
      plan_name: sub.plan_id,
      features: [],
    },
  }));
}

export async function createSubscription(data: {
  organizationId: string;
  businessTypeId?: string;
  planId: string;
  startDate: string;
  endDate?: string;
  paymentStatus?: string;
}) {
  const paymentStatus = (data.paymentStatus || "paid").toLowerCase();
  const plan = await prisma.plan.findUnique({ where: { id: data.planId } });

  if (!plan || isFreePlan(plan)) {
    throw new Error("The shared free plan does not require a subscription.");
  }

  const subscription = await prisma.subscription.create({
    data: {
      id: randomUUID(),
      organization_id: data.organizationId,
      business_type_id: data.businessTypeId || null,
      plan_id: data.planId,
      start_date: new Date(data.startDate),
      end_date: data.endDate ? new Date(data.endDate) : null,
      payment_status: paymentStatus,
    },
  });

  return {
    ...subscription,
    paymentStatus,
  };
}

export async function createPendingSubscription(data: {
  organizationId: string;
  organizationName?: string;
  businessTypeId: string;
  planId: string;
  monthlyPrice: number;
  billingMonths: 6 | 12;
}) {
  const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
  if (!plan || isFreePlan(plan)) {
    throw new Error("The shared free plan does not require checkout.");
  }

  const subtotalAmount = data.monthlyPrice * data.billingMonths;
  const gstAmount = subtotalAmount * 0.18;
  const totalAmount = subtotalAmount + gstAmount;

  return prisma.subscription.create({
    data: {
      organization_id: data.organizationId,
      organization_name: data.organizationName || null,
      business_type_id: data.businessTypeId,
      plan_id: data.planId,
      payment_status: "pending",
      service_status: "inactive",
      billing_months: data.billingMonths,
      subtotal_amount: subtotalAmount,
      gst_amount: gstAmount,
      total_amount: totalAmount,
    },
  });
}

export async function updateSubscription(
  id: string,
  data: {
    organizationId: string;
    businessTypeId?: string;
    planId: string;
    startDate: string;
    endDate?: string;
    paymentStatus?: string;
  }
) {
  const paymentStatus = (data.paymentStatus || "paid").toLowerCase();
  const plan = await prisma.plan.findUnique({ where: { id: data.planId } });

  if (!plan || isFreePlan(plan)) {
    throw new Error("The shared free plan does not require a subscription.");
  }

  const subscription = await prisma.subscription.update({
    where: { id },
    data: {
      organization_id: data.organizationId,
      business_type_id: data.businessTypeId || null,
      plan_id: data.planId,
      start_date: new Date(data.startDate),
      end_date: data.endDate ? new Date(data.endDate) : null,
      payment_status: paymentStatus,
    },
  });

  return {
    ...subscription,
    paymentStatus,
  };
}

export async function deleteSubscription(id: string) {
  return prisma.subscription.delete({
    where: { id },
  });
}

export async function getOrganizationPlanId(organizationId: string) {
  const effectivePlans = await getEffectivePlansForOrganization(organizationId);
  return effectivePlans[0]?.plan?.id || null;
}

export async function ensureFreePlanSubscriptionsForOrganization(organizationId: string) {
  await prisma.$transaction(async (transaction) => {
    await ensureFreePlansForBusinessTypes(transaction);
    await transaction.subscription.deleteMany({
      where: {
        organization_id: organizationId,
        plan: { price: { lte: 0 } },
      },
    });
  }, { timeout: 15000 });
}

export async function getEffectivePlansForOrganization(organizationId: string) {
  const [businessTypes, freePlans, subscriptions] = await Promise.all([
    prisma.businessType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.plan.findMany({ where: { business_type_id: { not: null }, tier_key: "FREE" } }),
    prisma.subscription.findMany({
      where: { organization_id: organizationId },
      orderBy: { updated_at: "desc" },
    }),
  ]);
  const plans = await prisma.plan.findMany({
    where: { id: { in: subscriptions.map((subscription) => subscription.plan_id) } },
  });
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const freePlanByBusinessType = new Map(
    freePlans.map((plan) => [plan.business_type_id as string, plan]),
  );
  const now = new Date();
  const latestByBusinessType = new Map<string, (typeof subscriptions)[number]>();

  for (const subscription of subscriptions) {
    if (!subscription.business_type_id) continue;
    if (!planById.has(subscription.plan_id)) continue;

    const current = latestByBusinessType.get(subscription.business_type_id);
    if (!current || new Date(subscription.updated_at).getTime() > new Date(current.updated_at).getTime()) {
      latestByBusinessType.set(subscription.business_type_id, subscription);
    }
  }

  return businessTypes.map((businessType) => {
    const subscription = latestByBusinessType.get(businessType.id);
    const subscriptionPlan = subscription ? planById.get(subscription.plan_id) : null;
    const subscriptionIsActive = Boolean(
      subscription &&
      subscriptionPlan &&
      !isFreePlan(subscriptionPlan) &&
      ["paid"].includes(subscription.payment_status.toLowerCase()) &&
      subscription.service_status.toLowerCase() !== "inactive" &&
      (!subscription.end_date || subscription.end_date > now),
    );

    return {
      businessType,
      plan: subscriptionIsActive ? subscriptionPlan : freePlanByBusinessType.get(businessType.id),
      subscription: subscriptionIsActive ? subscription : null,
      isFree: !subscriptionIsActive,
    };
  });
}

export async function activatePlanForBusinessType(data: {
  organizationId: string;
  businessTypeId: string;
  planId: string;
  startDate: string;
  endDate?: string;
  paymentStatus?: string;
}) {
  const paymentStatus = (data.paymentStatus || "paid").toLowerCase();
  const plan = await prisma.plan.findUnique({ where: { id: data.planId } });

  if (!plan || isFreePlan(plan)) {
    throw new Error("The shared free plan is assigned automatically and cannot be activated.");
  }

  if (plan.business_type_id !== data.businessTypeId) {
    throw new Error("The selected plan does not belong to this business type.");
  }

  return prisma.$transaction(async (transaction) => {
    const subscriptions = await transaction.subscription.findMany({
      where: {
        organization_id: data.organizationId,
        business_type_id: data.businessTypeId,
      },
      orderBy: { updated_at: "desc" },
    });

    const currentSubscription = subscriptions[0];
    if (!currentSubscription) {
      return transaction.subscription.create({
        data: {
          organization_id: data.organizationId,
          business_type_id: data.businessTypeId,
          plan_id: data.planId,
          start_date: new Date(data.startDate),
          end_date: data.endDate ? new Date(data.endDate) : null,
          payment_status: paymentStatus,
        },
      });
    }

    if (subscriptions.length > 1) {
      await transaction.subscription.deleteMany({
        where: { id: { in: subscriptions.slice(1).map(({ id }) => id) } },
      });
    }

    return transaction.subscription.update({
      where: { id: currentSubscription.id },
      data: {
        plan_id: data.planId,
        start_date: new Date(data.startDate),
        end_date: data.endDate ? new Date(data.endDate) : null,
        payment_status: paymentStatus,
      },
    });
  });
}

export async function updateSubscriptionStatus(id: string, paymentStatus: string) {
  return prisma.subscription.update({
    where: { id },
    data: { payment_status: paymentStatus.toLowerCase() },
  });
}

export async function approveSubscription(id: string) {
  return prisma.subscription.update({
    where: { id },
    data: {
      payment_status: "paid",
      service_status: "active",
    },
  });
}

export async function countActiveSubscriptionsByPlan() {
  const groups = await prisma.subscription.groupBy({
    by: ["plan_id"],
    where: {
      payment_status: { in: ["paid", "PAID"] },
      OR: [{ end_date: null }, { end_date: { gt: new Date() } }],
    },
    _count: { _all: true },
  });

  return new Map(groups.map((group) => [group.plan_id, group._count._all]));
}