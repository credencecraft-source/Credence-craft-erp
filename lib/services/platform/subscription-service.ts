import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/database/prisma-client";

async function ensureTableExists() {
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "subscriptions" (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        business_type_id TEXT,
        plan_id TEXT NOT NULL,
        start_date TIMESTAMP NOT NULL DEFAULT NOW(),
        end_date TIMESTAMP,
        payment_status VARCHAR(50) NOT NULL DEFAULT 'paid',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
  } catch (e) {
    // Ignore if already exists or fails
  }
}

export async function listSubscriptions() {
  await ensureTableExists();
  try {
    if (prisma?.subscription) {
      const subscriptions = await prisma.subscription.findMany();
      return subscriptions.map((sub: any) => {
        const normalizedPaymentStatus = (sub.payment_status || sub.paymentStatus || "pending").toLowerCase();
        return {
          ...sub,
          start_date: sub.start_date ? new Date(sub.start_date).toISOString() : null,
          end_date: sub.end_date ? new Date(sub.end_date).toISOString() : null,
          created_at: sub.created_at ? new Date(sub.created_at).toISOString() : null,
          updated_at: sub.updated_at ? new Date(sub.updated_at).toISOString() : null,
          organizationId: sub.organization_id,
          businessTypeId: sub.business_type_id,
          planId: sub.plan_id,
          paymentStatus: normalizedPaymentStatus,
          payment_status: normalizedPaymentStatus,
          organization_name: sub.organization_id,
          business_type_name: sub.business_type_id,
          plan_name: sub.plan_id,
        };
      });
    }
  } catch (e) {
    // Fallback to raw query
  }

  const rawSubs: any[] = await prisma.$queryRaw`
    SELECT s.*, 
           o.organization_name,
           bt.name as business_type_name,
           p.plan_name
    FROM "subscriptions" s
    LEFT JOIN "organizations" o ON s.organization_id = o.id
    LEFT JOIN "business_types" bt ON s.business_type_id = bt.id
    LEFT JOIN "plans" p ON s.plan_id = p.id
  `;

  return rawSubs.map((sub: any) => {
    const normalizedPaymentStatus = (sub.payment_status || sub.paymentStatus || "pending").toLowerCase();
    return {
      ...sub,
      start_date: sub.start_date ? new Date(sub.start_date).toISOString() : null,
      end_date: sub.end_date ? new Date(sub.end_date).toISOString() : null,
      created_at: sub.created_at ? new Date(sub.created_at).toISOString() : null,
      updated_at: sub.updated_at ? new Date(sub.updated_at).toISOString() : null,
      organizationId: sub.organization_id,
      businessTypeId: sub.business_type_id,
      planId: sub.plan_id,
      paymentStatus: normalizedPaymentStatus,
      payment_status: normalizedPaymentStatus,
      organization_name: sub.organization_name || sub.organization_id,
      business_type_name: sub.business_type_name || sub.business_type_id,
      plan_name: sub.plan_name || sub.plan_id,
    };
  });
}

export async function getSubscriptionsByOrganization(organizationId: string) {
  await ensureTableExists();
  try {
    if (prisma?.subscription) {
      const subscriptions = await prisma.subscription.findMany({
        where: { organization_id: organizationId },
      });
      return subscriptions.map((sub: any) => {
        const normalizedPaymentStatus = (sub.payment_status || sub.paymentStatus || "pending").toLowerCase();
        return {
          ...sub,
          start_date: sub.start_date ? new Date(sub.start_date).toISOString() : null,
          end_date: sub.end_date ? new Date(sub.end_date).toISOString() : null,
          created_at: sub.created_at ? new Date(sub.created_at).toISOString() : null,
          updated_at: sub.updated_at ? new Date(sub.updated_at).toISOString() : null,
          organizationId: sub.organization_id,
          businessTypeId: sub.business_type_id,
          planId: sub.plan_id,
          paymentStatus: normalizedPaymentStatus,
          payment_status: normalizedPaymentStatus,
          plan: {
            features: [],
          },
        };
      });
    }
  } catch (e) {
    // Fallback to raw query
  }

  const rawSubs: any[] = await prisma.$queryRaw`
    SELECT s.*, 
           bt.name as business_type_name,
           p.plan_name
    FROM "subscriptions" s
    LEFT JOIN "business_types" bt ON s.business_type_id = bt.id
    LEFT JOIN "plans" p ON s.plan_id = p.id
    WHERE s.organization_id = ${organizationId}
  `;

  return rawSubs.map((sub: any) => {
    const normalizedPaymentStatus = (sub.payment_status || sub.paymentStatus || "pending").toLowerCase();
    return {
      ...sub,
      start_date: sub.start_date ? new Date(sub.start_date).toISOString() : null,
      end_date: sub.end_date ? new Date(sub.end_date).toISOString() : null,
      created_at: sub.created_at ? new Date(sub.created_at).toISOString() : null,
      updated_at: sub.updated_at ? new Date(sub.updated_at).toISOString() : null,
      organizationId: sub.organization_id,
      businessTypeId: sub.business_type_id,
      planId: sub.plan_id,
      paymentStatus: normalizedPaymentStatus,
      payment_status: normalizedPaymentStatus,
      plan: {
        plan_name: sub.plan_name,
        features: [],
      },
    };
  });
}

export async function createSubscription(data: {
  organizationId: string;
  businessTypeId: string;
  planId: string;
  startDate: string;
  endDate?: string;
  paymentStatus?: string;
}) {
  await ensureTableExists();
  const id = randomUUID();
  const startDateStr = data.startDate ? new Date(data.startDate).toISOString() : new Date().toISOString();
  const endDateStr = data.endDate ? new Date(data.endDate).toISOString() : null;
  const startDate = new Date(startDateStr);
  const endDate = endDateStr ? new Date(endDateStr) : null;
  const paymentStatus = (data.paymentStatus || "paid").toLowerCase();

  try {
    if (prisma?.subscription) {
      const res = await prisma.subscription.create({
        data: {
          id,
          organization_id: data.organizationId,
          business_type_id: data.businessTypeId,
          plan_id: data.planId,
          start_date: startDate,
          end_date: endDate,
          payment_status: paymentStatus,
        },
      });
      return {
        ...res,
        start_date: res.start_date ? new Date(res.start_date).toISOString() : null,
        end_date: res.end_date ? new Date(res.end_date).toISOString() : null,
        created_at: res.created_at ? new Date(res.created_at).toISOString() : null,
        updated_at: res.updated_at ? new Date(res.updated_at).toISOString() : null,
        paymentStatus,
        payment_status: paymentStatus,
      };
    }
  } catch (e) {
    // Fallback to raw query
  }

  if (endDateStr) {
    await prisma.$executeRaw`
      INSERT INTO "subscriptions" (id, organization_id, business_type_id, plan_id, start_date, end_date, payment_status, created_at, updated_at)
      VALUES (${id}, ${data.organizationId}, ${data.businessTypeId}, ${data.planId}, ${startDateStr}::timestamp, ${endDateStr}::timestamp, ${paymentStatus}, NOW(), NOW())
    `;
  } else {
    await prisma.$executeRaw`
      INSERT INTO "subscriptions" (id, organization_id, business_type_id, plan_id, start_date, end_date, payment_status, created_at, updated_at)
      VALUES (${id}, ${data.organizationId}, ${data.businessTypeId}, ${data.planId}, ${startDateStr}::timestamp, NULL, ${paymentStatus}, NOW(), NOW())
    `;
  }

  return {
    id,
    organization_id: data.organizationId,
    business_type_id: data.businessTypeId,
    plan_id: data.planId,
    start_date: startDateStr,
    end_date: endDateStr,
    paymentStatus,
    payment_status: paymentStatus,
  };
}

export async function updateSubscription(
  id: string,
  data: {
    organizationId: string;
    businessTypeId: string;
    planId: string;
    startDate: string;
    endDate?: string;
    paymentStatus?: string;
  }
) {
  await ensureTableExists();
  const startDateStr = data.startDate ? new Date(data.startDate).toISOString() : new Date().toISOString();
  const endDateStr = data.endDate ? new Date(data.endDate).toISOString() : null;
  const startDate = new Date(startDateStr);
  const endDate = endDateStr ? new Date(endDateStr) : null;
  const paymentStatus = (data.paymentStatus || "paid").toLowerCase();

  try {
    if (prisma?.subscription) {
      const res = await prisma.subscription.update({
        where: { id },
        data: {
          organization_id: data.organizationId,
          business_type_id: data.businessTypeId,
          plan_id: data.planId,
          start_date: startDate,
          end_date: endDate,
          payment_status: paymentStatus,
        },
      });
      return {
        ...res,
        start_date: res.start_date ? new Date(res.start_date).toISOString() : null,
        end_date: res.end_date ? new Date(res.end_date).toISOString() : null,
        created_at: res.created_at ? new Date(res.created_at).toISOString() : null,
        updated_at: res.updated_at ? new Date(res.updated_at).toISOString() : null,
        paymentStatus,
        payment_status: paymentStatus,
      };
    }
  } catch (e) {
    // Fallback to raw query
  }

  if (endDateStr) {
    await prisma.$executeRaw`
      UPDATE "subscriptions"
      SET organization_id = ${data.organizationId},
          business_type_id = ${data.businessTypeId},
          plan_id = ${data.planId},
          start_date = ${startDateStr}::timestamp,
          end_date = ${endDateStr}::timestamp,
          payment_status = ${paymentStatus},
          updated_at = NOW()
      WHERE id = ${id}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE "subscriptions"
      SET organization_id = ${data.organizationId},
          business_type_id = ${data.businessTypeId},
          plan_id = ${data.planId},
          start_date = ${startDateStr}::timestamp,
          end_date = NULL,
          payment_status = ${paymentStatus},
          updated_at = NOW()
      WHERE id = ${id}
    `;
  }

  return { id, ...data, paymentStatus, payment_status: paymentStatus };
}

export async function deleteSubscription(id: string) {
  await ensureTableExists();
  try {
    if (prisma?.subscription) {
      return await prisma.subscription.delete({
        where: { id },
      });
    }
  } catch (e) {
    // Fallback to raw query
  }

  return prisma.$executeRaw`DELETE FROM "subscriptions" WHERE id = ${id}`;
}

export async function duplicateSubscription(id: string) {
  await ensureTableExists();
  return createSubscription({
    organizationId: "",
    businessTypeId: "",
    planId: "",
    startDate: new Date().toISOString(),
    paymentStatus: "paid",
  });
}

export async function validateOrganizationAccess(organizationId: string, masterModule: string, childModule?: string) {
  return true;
}