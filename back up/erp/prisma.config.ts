import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config();

type EnvValue = string | undefined;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: (process.env["DIRECT_URL"] as EnvValue) ?? (process.env["DATABASE_URL"] as EnvValue) ?? "",
  },
});
