// @/lib/services/platform/subscription-service.ts
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
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

export function isSubscriptionActiveAt(
  subscription: {
    payment_status: string;
    service_status: string;
    start_date: Date;
    end_date: Date | null;
  },
  plan: { price: unknown; tier_key?: string | null },
  now = new Date(),
) {
  return !isFreePlan(plan)
    && subscription.payment_status.toLowerCase() === "paid"
    && subscription.service_status.toLowerCase() === "active"
    && subscription.start_date <= now
    && (!subscription.end_date || subscription.end_date > now);
}

export async function listSubscriptions(organizationId?: string, limit = 100) {
  const page = await listSubscriptionsPage({ organizationId, limit });
  const now = new Date();
  return page.subscriptions.map((subscription) => ({
    ...subscription,
    isExpired: subscription.payment_status.toLowerCase() === "paid"
      && Boolean(subscription.end_date && subscription.end_date <= now),
    isScheduled: subscription.payment_status.toLowerCase() === "paid"
      && subscription.service_status.toLowerCase() === "active"
      && subscription.start_date > now,
  }));
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
  const organizationIds = [...new Set(pageSubscriptions.map(({ organization_id }) => organization_id))];
  const organizations = organizationIds.length > 0
    ? await prisma.organization.findMany({
        where: {
          OR: [
            { id: { in: organizationIds } },
            { organization_id: { in: organizationIds } },
          ],
        },
        select: {
          id: true,
          organization_id: true,
          organization_name: true,
          organization_number: true,
        },
      })
    : [];
  const organizationByReference = mapOrganizationsByReference(organizations);

  return {
    subscriptions: pageSubscriptions.map((sub) => ({
    ...sub,
    organizationId: organizationByReference.get(sub.organization_id)?.id ?? sub.organization_id,
    businessTypeId: sub.business_type_id,
    planId: sub.plan_id,
    paymentStatus: sub.payment_status,
    organizationName: organizationByReference.get(sub.organization_id)?.organization_name ?? sub.organization_name,
    organization_name: organizationByReference.get(sub.organization_id)?.organization_name ?? sub.organization_name,
    organizationPublicId: organizationByReference.get(sub.organization_id)?.organization_id ?? null,
    organizationNumber: organizationByReference.get(sub.organization_id)?.organization_number ?? null,
    organizationMissing: !organizationByReference.has(sub.organization_id),
    business_type_name: sub.business_type_id,
    plan_name: sub.plan_id,
    })),
    nextCursor: hasNextPage ? pageSubscriptions.at(-1)?.id ?? null : null,
  };
}

export function mapOrganizationsByReference<T extends { id: string; organization_id: string }>(organizations: T[]) {
  const organizationsByReference = new Map<string, T>();
  for (const organization of organizations) {
    organizationsByReference.set(organization.id, organization);
    organizationsByReference.set(organization.organization_id, organization);
  }
  return organizationsByReference;
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

function normalizePaymentStatus(value: string | undefined) {
  const status = (value || "paid").toLowerCase();
  if (status !== "paid" && status !== "pending") throw new Error("Payment status must be paid or pending.");
  return status;
}

function normalizeServiceStatus(value: string | undefined) {
  const status = (value || "active").toLowerCase();
  if (status !== "active" && status !== "inactive") throw new Error("Service status must be active or inactive.");
  return status;
}

function normalizeBillingMonths(value: number | undefined) {
  if (value === undefined) return 12;
  if (value !== 6 && value !== 12) throw new Error("Billing term must be 6 or 12 months.");
  return value;
}

function parseSubscriptionDate(value: string | undefined, label: string, isEndDate = false) {
  if (!value) throw new Error(`${label} is required.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} is invalid.`);
  if (isEndDate && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function calculateSubscriptionAmounts(monthlyPrice: Prisma.Decimal, billingMonths: number) {
  const subtotalAmount = monthlyPrice.mul(billingMonths).toDecimalPlaces(2);
  const gstAmount = subtotalAmount.mul("0.18").toDecimalPlaces(2);
  return {
    subtotal_amount: subtotalAmount,
    gst_amount: gstAmount,
    total_amount: subtotalAmount.add(gstAmount).toDecimalPlaces(2),
  };
}

export async function createSubscription(data: {
  organizationId: string;
  organizationName?: string;
  businessTypeId?: string;
  planId: string;
  startDate: string;
  endDate?: string;
  paymentStatus?: string;
  serviceStatus?: string;
  billingMonths?: number;
}) {
  const admin = await requirePlatformSessionAdmin();
  const paymentStatus = normalizePaymentStatus(data.paymentStatus);
  const serviceStatus = normalizeServiceStatus(data.serviceStatus);
  const billingMonths = normalizeBillingMonths(data.billingMonths);
  const startDate = parseSubscriptionDate(data.startDate, "Start date");
  const endDate = data.endDate ? parseSubscriptionDate(data.endDate, "End date", true) : null;
  if (endDate && endDate <= startDate) throw new Error("End date must be after the start date.");
  const plan = await prisma.plan.findUnique({ where: { id: data.planId } });

  if (!plan || isFreePlan(plan)) {
    throw new Error("The shared free plan does not require a subscription.");
  }
  const businessTypeId = data.businessTypeId || plan.business_type_id;
  if (!businessTypeId || plan.business_type_id !== businessTypeId) {
    throw new Error("The selected plan does not belong to the selected business type.");
  }
  const organization = await prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true } });
  if (!organization) throw new Error("Organization not found.");
  const amounts = calculateSubscriptionAmounts(new Prisma.Decimal(plan.price ?? 0), billingMonths);

  return prisma.$transaction(async (transaction) => {
    const subscription = await transaction.subscription.create({
      data: {
        id: randomUUID(),
        organization_id: data.organizationId,
        organization_name: data.organizationName || null,
        business_type_id: businessTypeId,
        plan_id: data.planId,
        start_date: startDate,
        end_date: endDate,
        payment_status: paymentStatus,
        service_status: serviceStatus,
        billing_months: billingMonths,
        ...amounts,
      },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "SUBSCRIPTION_CREATED",
        entity_type: "Subscription",
        entity_id: subscription.id,
        details: {
          organizationId: subscription.organization_id,
          businessTypeId: subscription.business_type_id,
          planId: subscription.plan_id,
          startDate: subscription.start_date.toISOString(),
          endDate: subscription.end_date?.toISOString() ?? null,
          paymentStatus: subscription.payment_status,
          serviceStatus: subscription.service_status,
          billingMonths: subscription.billing_months,
        },
      },
    });
    return { ...subscription, paymentStatus };
  });
}

export async function createPendingSubscriptions(data: {
  organizationId: string;
  organizationName?: string;
  items: Array<{
    businessTypeId: string;
    planId: string;
    monthlyPrice: Prisma.Decimal;
  }>;
  billingMonths: 6 | 12;
}) {
  if (data.items.length === 0) throw new Error("Select at least one paid plan.");
  const businessTypeIds = data.items.map(({ businessTypeId }) => businessTypeId);
  if (new Set(businessTypeIds).size !== businessTypeIds.length) {
    throw new Error("Select only one plan per business type.");
  }

  return prisma.$transaction(async (transaction) => {
    const pendingSubscriptions = await transaction.subscription.findMany({
      where: {
        organization_id: data.organizationId,
        business_type_id: { in: businessTypeIds },
        payment_status: { in: ["pending", "PENDING"] },
      },
    });
    if (pendingSubscriptions.length > 0) {
      const isSameRequest = pendingSubscriptions.length === data.items.length
        && data.items.every((item) => pendingSubscriptions.some((subscription) =>
          subscription.business_type_id === item.businessTypeId
          && subscription.plan_id === item.planId
          && subscription.billing_months === data.billingMonths,
        ));
      if (isSameRequest) return pendingSubscriptions;
      throw new Error("A different subscription request is already awaiting approval for one or more selected modules.");
    }

    const planIds = data.items.map(({ planId }) => planId);
    const plans = await transaction.plan.findMany({ where: { id: { in: planIds } } });
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const subscriptions = [];

    for (const item of data.items) {
      const plan = planById.get(item.planId);
      if (!plan || !plan.is_active || isFreePlan(plan) || plan.business_type_id !== item.businessTypeId) {
        throw new Error("One of the selected plans is no longer available.");
      }

      const subtotalAmount = item.monthlyPrice.mul(data.billingMonths).toDecimalPlaces(2);
      const gstAmount = subtotalAmount.mul("0.18").toDecimalPlaces(2);
      const totalAmount = subtotalAmount.add(gstAmount).toDecimalPlaces(2);
      subscriptions.push(await transaction.subscription.create({
        data: {
          organization_id: data.organizationId,
          organization_name: data.organizationName || null,
          business_type_id: item.businessTypeId,
          plan_id: item.planId,
          payment_status: "pending",
          service_status: "inactive",
          billing_months: data.billingMonths,
          subtotal_amount: subtotalAmount,
          gst_amount: gstAmount,
          total_amount: totalAmount,
        },
      }));
    }

    return subscriptions;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateSubscription(
  id: string,
  data: {
    organizationId: string;
    organizationName?: string;
    businessTypeId?: string;
    planId: string;
    startDate: string;
    endDate?: string;
    paymentStatus?: string;
    serviceStatus?: string;
    billingMonths?: number;
  }
) {
  const admin = await requirePlatformSessionAdmin();
  const paymentStatus = normalizePaymentStatus(data.paymentStatus);
  const serviceStatus = normalizeServiceStatus(data.serviceStatus);
  const billingMonths = normalizeBillingMonths(data.billingMonths);
  const startDate = parseSubscriptionDate(data.startDate, "Start date");
  const endDate = data.endDate ? parseSubscriptionDate(data.endDate, "End date", true) : null;
  if (endDate && endDate <= startDate) throw new Error("End date must be after the start date.");
  const plan = await prisma.plan.findUnique({ where: { id: data.planId } });

  if (!plan || isFreePlan(plan)) {
    throw new Error("The shared free plan does not require a subscription.");
  }
  const businessTypeId = data.businessTypeId || plan.business_type_id;
  if (!businessTypeId || plan.business_type_id !== businessTypeId) {
    throw new Error("The selected plan does not belong to the selected business type.");
  }
  const organization = await prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true } });
  if (!organization) throw new Error("Organization not found.");
  const amounts = calculateSubscriptionAmounts(new Prisma.Decimal(plan.price ?? 0), billingMonths);

  return prisma.$transaction(async (transaction) => {
    const before = await transaction.subscription.findUnique({ where: { id } });
    if (!before) throw new Error("Subscription not found.");
    const subscription = await transaction.subscription.update({
      where: { id },
      data: {
        organization_id: data.organizationId,
        organization_name: data.organizationName || null,
        business_type_id: businessTypeId,
        plan_id: data.planId,
        start_date: startDate,
        end_date: endDate,
        payment_status: paymentStatus,
        service_status: serviceStatus,
        billing_months: billingMonths,
        ...amounts,
      },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "SUBSCRIPTION_UPDATED",
        entity_type: "Subscription",
        entity_id: subscription.id,
        details: {
          before: {
            organizationId: before.organization_id,
            businessTypeId: before.business_type_id,
            planId: before.plan_id,
            paymentStatus: before.payment_status,
            serviceStatus: before.service_status,
            startDate: before.start_date.toISOString(),
            endDate: before.end_date?.toISOString() ?? null,
          },
          after: {
            organizationId: subscription.organization_id,
            businessTypeId: subscription.business_type_id,
            planId: subscription.plan_id,
            paymentStatus: subscription.payment_status,
            serviceStatus: subscription.service_status,
            startDate: subscription.start_date.toISOString(),
            endDate: subscription.end_date?.toISOString() ?? null,
          },
        },
      },
    });
    return { ...subscription, paymentStatus };
  });
}

export function orphanedSubscriptionAuditDetails(subscription: {
  organization_id: string;
  organization_name: string | null;
}) {
  return {
    organizationReference: subscription.organization_id,
    organizationName: subscription.organization_name,
    reason: "The referenced organization record does not exist.",
  };
}

export async function deleteSubscription(
  id: string,
  platformAdminId?: string,
  organizationId?: string,
  workspaceUserId?: string,
) {
  if (organizationId) {
    if (!workspaceUserId) throw new Error("An authenticated organization actor is required.");
    return prisma.$transaction(async (transaction) => {
      const subscription = await transaction.subscription.findFirst({
        where: { id, organization_id: organizationId, payment_status: { in: ["pending", "PENDING"] } },
      });
      if (!subscription) return { deleted: false };
      const result = await transaction.subscription.deleteMany({
        where: { id, organization_id: organizationId, payment_status: { in: ["pending", "PENDING"] } },
      });
      if (result.count === 1) {
        await transaction.auditEvent.create({
          data: {
            organization_id: organizationId,
            user_id: workspaceUserId,
            module: "pricing",
            action: "PENDING_SUBSCRIPTION_DELETED",
            entity_type: "Subscription",
            entity_id: id,
            details: {
              businessTypeId: subscription.business_type_id,
              planId: subscription.plan_id,
              paymentStatus: subscription.payment_status,
            },
          },
        });
      }
      return { deleted: result.count === 1 };
    });
  }

  if (!platformAdminId) throw new Error("A platform administrator is required to delete this subscription.");
  const platformAdmin = await requirePlatformSessionAdmin();
  if (platformAdmin.id !== platformAdminId) {
    throw new Error("Platform administrator authorization changed. Refresh and retry.");
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id },
    select: { id: true, organization_id: true, organization_name: true },
  });
  if (!subscription) return { deleted: false };

  const organization = await prisma.organization.findFirst({
    where: {
      OR: [
        { id: subscription.organization_id },
        { organization_id: subscription.organization_id },
      ],
    },
    select: { id: true },
  });

  if (organization) {
    return prisma.$transaction(async (transaction) => {
      const currentSubscription = await transaction.subscription.findUnique({
        where: { id: subscription.id },
        select: { organization_id: true },
      });
      if (!currentSubscription) return { deleted: false };
      if (currentSubscription.organization_id !== organization.id) {
        await transaction.subscription.update({
          where: { id: subscription.id },
          data: { organization_id: organization.id },
        });
      }
      const result = await transaction.subscription.deleteMany({
        where: { id: subscription.id, organization_id: organization.id },
      });
      if (result.count === 1) {
        await transaction.platformAuditEvent.create({
          data: {
            platform_admin_id: platformAdminId,
            action: "SUBSCRIPTION_DELETED",
            entity_type: "Subscription",
            entity_id: subscription.id,
            details: {
              organizationId: organization.id,
              organizationName: subscription.organization_name,
              reason: "Deleted by platform administrator.",
            },
          },
        });
      }
      return { deleted: result.count === 1 };
    });
  }

  return prisma.$transaction(async (transaction) => {
    const currentSubscription = await transaction.subscription.findUnique({
      where: { id: subscription.id },
      select: { id: true, organization_id: true, organization_name: true },
    });
    if (!currentSubscription) return { deleted: false };

    const recoveredOrganization = await transaction.organization.findFirst({
      where: {
        OR: [
          { id: currentSubscription.organization_id },
          { organization_id: currentSubscription.organization_id },
        ],
      },
      select: { id: true },
    });
    if (recoveredOrganization) {
      if (currentSubscription.organization_id !== recoveredOrganization.id) {
        await transaction.subscription.update({
          where: { id: currentSubscription.id },
          data: { organization_id: recoveredOrganization.id },
        });
      }
      const result = await transaction.subscription.deleteMany({
        where: { id: currentSubscription.id, organization_id: recoveredOrganization.id },
      });
      return { deleted: result.count === 1 };
    }

    await transaction.$executeRaw`SELECT set_config('app.skip_organization_audit', 'true', true)`;
    const deleted = await transaction.subscription.deleteMany({
      where: { id: currentSubscription.id, organization_id: currentSubscription.organization_id },
    });
    if (deleted.count !== 1) return { deleted: false };

    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: platformAdminId,
        action: "ORPHANED_SUBSCRIPTION_DELETED",
        entity_type: "Subscription",
        entity_id: currentSubscription.id,
        details: orphanedSubscriptionAuditDetails(currentSubscription),
      },
    });
    return { deleted: true };
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

export async function getEffectivePlansForOrganization(
  organizationId: string,
  database: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const [businessTypes, freePlans, subscriptions] = await Promise.all([
    database.businessType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    database.plan.findMany({ where: { business_type_id: { not: null }, tier_key: "FREE" } }),
    database.subscription.findMany({
      where: { organization_id: organizationId },
      orderBy: { updated_at: "desc" },
    }),
  ]);
  const plans = await database.plan.findMany({
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
    const plan = planById.get(subscription.plan_id);
    if (!plan || !isSubscriptionActiveAt(subscription, plan, now)) continue;

    const current = latestByBusinessType.get(subscription.business_type_id);
    if (!current || new Date(subscription.updated_at).getTime() > new Date(current.updated_at).getTime()) {
      latestByBusinessType.set(subscription.business_type_id, subscription);
    }
  }

  return businessTypes.map((businessType) => {
    const subscription = latestByBusinessType.get(businessType.id);
    const subscriptionPlan = subscription ? planById.get(subscription.plan_id) : null;
    const subscriptionIsActive = Boolean(subscription && subscriptionPlan);

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

export function addBillingMonths(date: Date, months: number) {
  const result = new Date(date);
  const targetMonth = result.getUTCMonth() + months;
  const targetYear = result.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  result.setUTCDate(1);
  result.setUTCFullYear(targetYear, normalizedMonth, Math.min(date.getUTCDate(), lastDay));
  return result;
}

export async function approveSubscription(id: string) {
  const admin = await requirePlatformSessionAdmin();

  return prisma.$transaction(async (transaction) => {
    const subscription = await transaction.subscription.findUnique({ where: { id } });
    if (!subscription) throw new Error("Subscription not found.");
    if (subscription.payment_status.toLowerCase() === "paid") return subscription;
    if (subscription.payment_status.toLowerCase() !== "pending") {
      throw new Error("Only pending subscriptions can be approved.");
    }
    if (!subscription.business_type_id) {
      throw new Error("Assign a business type before approving this subscription.");
    }

    const now = new Date();
    const currentSubscriptions = await transaction.subscription.findMany({
      where: {
        organization_id: subscription.organization_id,
        business_type_id: subscription.business_type_id,
        id: { not: subscription.id },
        payment_status: { in: ["paid", "PAID"] },
        service_status: { in: ["active", "ACTIVE"] },
        start_date: { lte: now },
        OR: [{ end_date: null }, { end_date: { gt: now } }],
      },
      orderBy: { updated_at: "desc" },
    });
    const activeTermEndDate = currentSubscriptions.reduce<Date | null>((latestEndDate, current) =>
      current.end_date && current.end_date > (latestEndDate ?? now) ? current.end_date : latestEndDate,
    null);
    const startDate = activeTermEndDate ?? now;
    const billingMonths = subscription.billing_months === 6 ? 6 : 12;
    const endDate = addBillingMonths(startDate, billingMonths);
    const update = await transaction.subscription.updateMany({
      where: { id: subscription.id, payment_status: { in: ["pending", "PENDING"] } },
      data: {
        payment_status: "paid",
        service_status: "active",
        billing_months: billingMonths,
        start_date: startDate,
        end_date: endDate,
      },
    });

    if (update.count !== 1) {
      const latest = await transaction.subscription.findUnique({ where: { id: subscription.id } });
      if (latest?.payment_status.toLowerCase() === "paid") return latest;
      throw new Error("Subscription status changed before approval. Refresh and retry.");
    }

    const approvedSubscription = await transaction.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "SUBSCRIPTION_APPROVED",
        entity_type: "Subscription",
        entity_id: approvedSubscription.id,
        details: {
          organizationId: approvedSubscription.organization_id,
          businessTypeId: approvedSubscription.business_type_id,
          planId: approvedSubscription.plan_id,
          billingMonths,
          startDate: approvedSubscription.start_date.toISOString(),
          endDate: approvedSubscription.end_date?.toISOString() ?? null,
        },
      },
    });
    return approvedSubscription;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function countActiveSubscriptionsByPlan() {
  const now = new Date();
  const groups = await prisma.subscription.groupBy({
    by: ["plan_id"],
    where: {
      payment_status: { in: ["paid", "PAID"] },
      service_status: { in: ["active", "ACTIVE"] },
      start_date: { lte: now },
      OR: [{ end_date: null }, { end_date: { gt: now } }],
    },
    _count: { _all: true },
  });

  return new Map(groups.map((group) => [group.plan_id, group._count._all]));
}