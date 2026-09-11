// @/lib/services/platform/subscription-service.ts
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/database/prisma-client";

export async function listSubscriptions(organizationId?: string, limit = 100) {
  const page = await listSubscriptionsPage({ organizationId, limit });
  return page.subscriptions;
}

export async function listSubscriptionsPage(options: { organizationId?: string; cursor?: string; limit?: number } = {}) {
  const take = Math.min(Math.max(options.limit ?? 100, 1), 100);
  const subscriptions = await prisma.subscription.findMany({
    where: options.organizationId ? { organization_id: options.organizationId } : undefined,
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
    where: { organization_id: organizationId },
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
  const subscription = await prisma.subscription.findFirst({
    where: { organization_id: organizationId },
    select: { plan_id: true },
  });

  return subscription?.plan_id || null;
}

export async function ensureFreePlanSubscriptionsForOrganization(organizationId: string) {
  const [businessTypes, plans, subscriptions] = await Promise.all([
    prisma.businessType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.plan.findMany({
      where: {
        is_active: true,
        price: { lte: 0 },
      },
      select: { business_type_id: true },
    }),
    prisma.subscription.findMany({
      where: { organization_id: organizationId },
      select: { business_type_id: true },
    }),
  ]);
  const freePlanBusinessTypeIds = new Set(
    plans
      .map((plan) => plan.business_type_id)
      .filter((businessTypeId): businessTypeId is string => Boolean(businessTypeId)),
  );
  const subscriptionBusinessTypeIds = new Set(
    subscriptions
      .map((subscription) => subscription.business_type_id)
      .filter((businessTypeId): businessTypeId is string => Boolean(businessTypeId)),
  );
  const needsSetup = businessTypes.some(
    (businessType) =>
      !freePlanBusinessTypeIds.has(businessType.id) ||
      !subscriptionBusinessTypeIds.has(businessType.id),
  );

  if (!needsSetup) return;

  return prisma.$transaction(async (transaction) => {
    const businessTypes = await transaction.businessType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    const plans = await transaction.plan.findMany({
      where: {
        is_active: true,
        price: { lte: 0 },
      },
      orderBy: { sort_order: "asc" },
    });
    const subscriptions = await transaction.subscription.findMany({
      where: { organization_id: organizationId },
    });
    const planByBusinessTypeId = new Map(
      plans
        .filter((plan) => plan.business_type_id)
        .map((plan) => [plan.business_type_id as string, plan]),
    );
    const subscriptionBusinessTypeIds = new Set(
      subscriptions
        .map((subscription) => subscription.business_type_id)
        .filter((businessTypeId): businessTypeId is string => Boolean(businessTypeId)),
    );
    let nextSortOrder = plans.reduce(
      (highestSortOrder, plan) => Math.max(highestSortOrder, plan.sort_order),
      -1,
    ) + 1;

    for (const businessType of businessTypes) {
      let freePlan = planByBusinessTypeId.get(businessType.id);

      if (!freePlan) {
        freePlan = await transaction.plan.create({
          data: {
            plan_id: randomUUID(),
            business_type_id: businessType.id,
            plan_name: `${businessType.name} - Free`,
            description: `Default free plan for ${businessType.name}.`,
            price: 0,
            billing_cycle: "monthly",
            sort_order: nextSortOrder,
          },
        });
        planByBusinessTypeId.set(businessType.id, freePlan);
        nextSortOrder += 1;
      }

      if (!subscriptionBusinessTypeIds.has(businessType.id)) {
        await transaction.subscription.create({
          data: {
            organization_id: organizationId,
            business_type_id: businessType.id,
            plan_id: freePlan.id,
            payment_status: "paid",
          },
        });
        subscriptionBusinessTypeIds.add(businessType.id);
      }
    }
  }, { timeout: 15000 });
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