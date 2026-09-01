import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { createDatabaseConnection } from "@/lib/services/platform/database-connection-service";

const PROVIDER_OPTIONS = [
  { label: "Neon", value: "neon" },
  { label: "Supabase", value: "supabase" },
  { label: "AWS RDS PostgreSQL", value: "aws_rds" },
  { label: "Azure PostgreSQL", value: "azure" },
  { label: "Google Cloud SQL", value: "gcp_sql" },
  { label: "DigitalOcean PostgreSQL", value: "digitalocean" },
  { label: "Other PostgreSQL", value: "other" },
];

export default async function CreateDatabasePage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  await requirePlatformSessionAdmin();
  const params = (await searchParams) ?? {};

  async function createDatabaseAction(formData: FormData) {
    "use server";

    const provider = String(formData.get("provider") || "").trim();
    const connectionName = String(formData.get("connectionName") || "").trim();
    const connectionString = String(formData.get("connectionString") || "").trim();
    const host = String(formData.get("host") || "").trim();
    const portRaw = String(formData.get("port") || "").trim();
    const databaseName = String(formData.get("databaseName") || "").trim();
    const username = String(formData.get("username") || "").trim();
    const notes = String(formData.get("notes") || "").trim();

    try {
      await createDatabaseConnection({
        provider,
        connectionName,
        connectionString,
        host,
        port: portRaw ? Number(portRaw) : undefined,
        databaseName,
        username,
        notes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create database connection.";
      redirect(`/platform/databases/create?error=${encodeURIComponent(message)}`);
    }

    redirect("/platform/databases");
  }

  return (
    <Page className="max-w-xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform</p>
          <h1 className="text-2xl font-bold text-slate-900">Create database</h1>
          <p className="text-sm text-slate-600">
            Register a PostgreSQL-compatible database so it can be assigned to organizations.
          </p>
        </div>

        <Card className="p-6">
          <form action={createDatabaseAction} className="space-y-4">
            <Select label="Provider" name="provider" options={PROVIDER_OPTIONS} required defaultValue="neon" />
            <Input label="Connection name" name="connectionName" required placeholder="Neon - EU Production" />
            <Textarea
              label="Connection string"
              name="connectionString"
              placeholder="postgresql://user:password@host:5432/dbname?sslmode=require"
              rows={3}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Host" name="host" placeholder="ep-example.aws.neon.tech" />
              <Input label="Port" name="port" type="number" placeholder="5432" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Database name" name="databaseName" placeholder="neondb" />
              <Input label="Username" name="username" placeholder="neondb_owner" />
            </div>

            <Textarea label="Notes" name="notes" placeholder="Optional notes for the support team." rows={2} />

            {params.error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {params.error}
              </p>
            )}

            <Button type="submit" className="w-full">
              Create database
            </Button>
          </form>
        </Card>
      </Section>
    </Page>
  );
}
