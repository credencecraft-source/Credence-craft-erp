import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config();

type EnvValue = string | undefined;

function getMigrationUrl(): string {
  const explicitDirectUrl = process.env["DIRECT_URL"] as EnvValue;
  if (explicitDirectUrl) return explicitDirectUrl;

  const configuredUrl =
    (process.env["DATABASE_URL_UNPOOLED"] as EnvValue) ??
    (process.env["DATABASE_URL"] as EnvValue) ??
    "";
  const unpooledHost = process.env["PGHOST_UNPOOLED"] as EnvValue;

  if (!configuredUrl || !unpooledHost) return configuredUrl;

  try {
    const url = new URL(configuredUrl);
    url.hostname = unpooledHost;
    return url.toString();
  } catch {
    return configuredUrl;
  }
}

export default defineConfig({
  schema: "prisma/", // Points to the directory to automatically load all .prisma files
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getMigrationUrl(),
  },
});
