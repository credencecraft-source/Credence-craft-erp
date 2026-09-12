import { randomUUID } from "node:crypto";

import { encryptSecret } from "@/lib/auth/secret-cryptography";
import { prisma } from "@/lib/database/prisma-client";

async function migrateLegacyCredentials() {
  const legacyConnections = await prisma.databaseConnection.findMany({
    where: { OR: [{ connection_string: { not: null } }, { username: { not: null } }] },
    select: { id: true, connection_string: true, username: true, connection_string_encrypted: true, username_encrypted: true },
  });

  if (legacyConnections.length === 0) return;

  await prisma.$transaction(
    legacyConnections.map((connection) => prisma.databaseConnection.update({
      where: { id: connection.id },
      data: {
        connection_string_encrypted: connection.connection_string_encrypted ?? (connection.connection_string ? encryptSecret(connection.connection_string) : null),
        username_encrypted: connection.username_encrypted ?? (connection.username ? encryptSecret(connection.username) : null),
        connection_string: null,
        username: null,
      },
    })),
  );
}

export async function listDatabaseConnections() {
  await migrateLegacyCredentials();

  return prisma.databaseConnection.findMany({
    select: {
      id: true,
      connection_id: true,
      provider: true,
      connection_name: true,
      host: true,
      port: true,
      database_name: true,
      connection_string_encrypted: true,
      username_encrypted: true,
      status: true,
      is_default: true,
      notes: true,
      created_at: true,
      updated_at: true,
    },
    orderBy: { created_at: "asc" },
  }).then((connections) => connections.map(({ connection_string_encrypted, username_encrypted, ...connection }) => ({
    ...connection,
    hasCredentials: Boolean(connection_string_encrypted || username_encrypted),
  })));
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
      connection_string_encrypted: input.connectionString?.trim() ? encryptSecret(input.connectionString.trim()) : null,
      host: input.host?.trim() || null,
      port: input.port ?? null,
      database_name: input.databaseName?.trim() || null,
      username: input.username?.trim() || null,
      username_encrypted: input.username?.trim() ? encryptSecret(input.username.trim()) : null,
      status: input.status?.trim() || "active",
      notes: input.notes?.trim() || null,
    },
  });
}
