import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/database/prisma-client";

const DEFAULT_PLANS = [
  { plan_name: "Free", description: "Limited features for evaluation.", sort_order: 0 },
  { plan_name: "Basic", description: "Core ERP modules for small teams.", sort_order: 1 },
  { plan_name: "Professional", description: "All modules for growing organizations.", sort_order: 2 },
];

// Idempotent defaults for authenticated platform setup screens. Platform
// administrator enrollment is deliberately handled by an explicit operator command.
export async function ensurePlatformDefaults() {
  const existingPlanCount = await prisma.plan.count();

  if (existingPlanCount === 0) {
    for (const planSeed of DEFAULT_PLANS) {
      await prisma.plan.create({
        data: {
          plan_id: randomUUID(),
          plan_name: planSeed.plan_name,
          description: planSeed.description,
          sort_order: planSeed.sort_order,
        },
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
}