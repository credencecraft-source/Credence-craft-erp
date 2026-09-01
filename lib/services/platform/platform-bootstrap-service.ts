import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/database/prisma-client";
import { hashPlatformPassword } from "@/lib/auth/platform-password-hasher";
import { PLAN_FEATURE_CATALOG } from "@/lib/services/platform/plan-feature-catalog";

const DEFAULT_PLANS = [
  { plan_name: "Free", description: "Limited features for evaluation.", sort_order: 0, enabledFeatureKeys: ["order_management", "master_data"] },
  { plan_name: "Basic", description: "Core ERP modules for small teams.", sort_order: 1, enabledFeatureKeys: ["order_management", "merchandising_orders", "master_data", "approvals", "reports"] },
  { plan_name: "Professional", description: "All modules for growing organizations.", sort_order: 2, enabledFeatureKeys: PLAN_FEATURE_CATALOG.map((f) => f.feature_key) },
];

// Idempotent: creates default plans/features, a default database connection, and
// a default platform admin (from env) the first time the platform area is used.
export async function ensurePlatformDefaults() {
  const existingPlanCount = await prisma.plan.count();

  if (existingPlanCount === 0) {
    for (const planSeed of DEFAULT_PLANS) {
      const plan = await prisma.plan.create({
        data: {
          plan_id: randomUUID(),
          plan_name: planSeed.plan_name,
          description: planSeed.description,
          sort_order: planSeed.sort_order,
        },
      });

      await prisma.planFeature.createMany({
        data: PLAN_FEATURE_CATALOG.map((feature) => ({
          feature_id: randomUUID(),
          plan_id: plan.id,
          feature_key: feature.feature_key,
          feature_name: feature.feature_name,
          is_enabled: planSeed.enabledFeatureKeys.includes(feature.feature_key),
        })),
      });
    }
  }

  const existingConnectionCount = await prisma.databaseConnection.count();

  if (existingConnectionCount === 0) {
    await prisma.databaseConnection.create({
      data: {
        connection_id: randomUUID(),
        provider: "neon",
        connection_name: "Neon - Default",
        status: "active",
        is_default: true,
      },
    });
  }

  const existingAdminCount = await prisma.platformAdmin.count();

  if (existingAdminCount === 0) {
    const email = process.env.PLATFORM_ADMIN_EMAIL || "support@platform.local";
    const password = process.env.PLATFORM_ADMIN_PASSWORD || "ChangeMe123!";

    await prisma.platformAdmin.create({
      data: {
        admin_id: randomUUID(),
        full_name: "Support Team",
        email,
        password_hash: hashPlatformPassword(password),
      },
    });
  }
}
