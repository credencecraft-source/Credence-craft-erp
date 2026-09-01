import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/database/prisma-client";

export async function listDatabaseConnections() {
  return prisma.databaseConnection.findMany({
    orderBy: { created_at: "asc" },
  });
}

export async function createDatabaseConnection(input: {
  provider: string;
  connectionName: string;
  connectionString?: string;
  host?: string;
  port?: number;
  databaseName?: string;
  username?: string;
  status?: string;
  notes?: string;
}) {
  const provider = input.provider.trim();
  const connectionName = input.connectionName.trim();

  if (!provider) {
    throw new Error("Database provider is required.");
  }

  if (!connectionName) {
    throw new Error("Connection name is required.");
  }

  return prisma.databaseConnection.create({
    data: {
      connection_id: randomUUID(),
      provider,
      connection_name: connectionName,
      connection_string: input.connectionString?.trim() || null,
      host: input.host?.trim() || null,
      port: input.port ?? null,
      database_name: input.databaseName?.trim() || null,
      username: input.username?.trim() || null,
      status: input.status?.trim() || "active",
      notes: input.notes?.trim() || null,
    },
  });
}
