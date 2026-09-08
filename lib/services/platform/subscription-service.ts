// @/lib/services/platform/subscription-service.ts
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/database/prisma-client";

export async function listSubscriptions() {
  const subscriptions = await prisma.subscription.findMany({
    orderBy: { created_at: "desc" },
  });

  return subscriptions.map((sub: any) => ({
    ...sub,
    organizationId: sub.organization_id,
    businessTypeId: sub.business_type_id,
    planId: sub.plan_id,
    paymentStatus: sub.payment_status,
    organization_name: sub.organization_id,
    business_type_name: sub.business_type_id,
    plan_name: sub.plan_id,
  }));
}

export async function getSubscriptionsByOrganization(organizationId: string) {
  const subscriptions = await prisma.subscription.findMany({
    where: { organization_id: organizationId },
  });

  return subscriptions.map((sub: any) => ({
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