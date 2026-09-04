// lib/services/platform/subscription-service.ts
import { listOrganizationClients } from "@/lib/services/platform/client-service";
import { listPlans } from "@/lib/services/platform/plan-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";

global.mockSubscriptions = global.mockSubscriptions || [];

export async function listSubscriptions() {
  const clients = await listOrganizationClients();
  const plans = await listPlans();
  const businessTypes = await listBusinessTypes();

  return global.mockSubscriptions.map((sub: any) => {
    const client = clients.find((c: any) => c.id === sub.organizationId);
    const bt = businessTypes.find((b: any) => b.id === sub.businessTypeId);
    const plan = plans.find((p: any) => p.id === sub.planId);

    return {
      ...sub,
      organization_name: client ? client.organization_name : sub.organizationId,
      business_type_name: bt ? bt.name : sub.businessTypeId,
      plan_name: plan ? plan.plan_name : sub.planId,
    };
  });
}

export async function createSubscription(data: {
  organizationId: string;
  businessTypeId: string;
  planId: string;
  startDate: string;
}) {
  const newSub = {
    id: Math.random().toString(36).substring(2, 9),
    ...data,
  };
  
  global.mockSubscriptions.push(newSub);
  return newSub;
}

export async function updateSubscription(
  id: string,
  data: {
    organizationId: string;
    businessTypeId: string;
    planId: string;
    startDate: string;
  }
) {
  const index = global.mockSubscriptions.findIndex((sub: any) => sub.id === id);
  if (index === -1) throw new Error("Subscription not found.");

  global.mockSubscriptions[index] = {
    id,
    ...data,
  };
  return global.mockSubscriptions[index];
}

export async function deleteSubscription(id: string) {
  const index = global.mockSubscriptions.findIndex((sub: any) => sub.id === id);
  if (index === -1) throw new Error("Subscription not found.");

  const deleted = global.mockSubscriptions.splice(index, 1);
  return deleted[0];
}

export async function duplicateSubscription(id: string) {
  const sub = global.mockSubscriptions.find((s: any) => s.id === id);
  if (!sub) throw new Error("Subscription not found.");

  const newSub = {
    ...sub,
    id: Math.random().toString(36).substring(2, 9),
    startDate: new Date().toISOString().split("T")[0],
  };

  global.mockSubscriptions.push(newSub);
  return newSub;
}