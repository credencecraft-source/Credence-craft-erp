-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'FINANCE', 'MERCHANDISING', 'APPROVER', 'VIEWER');

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workspace_user_id" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- Preserve the existing organization owner as its first active member.
INSERT INTO "organization_memberships" ("id", "organization_id", "workspace_user_id", "role", "is_active", "created_at", "updated_at")
SELECT 'membership-' || "id", "id", "workspace_user_id", 'OWNER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations";

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_workspace_user_id_key" ON "organization_memberships"("organization_id", "workspace_user_id");
CREATE INDEX "organization_memberships_workspace_user_id_is_active_idx" ON "organization_memberships"("workspace_user_id", "is_active");
CREATE INDEX "organization_memberships_organization_id_role_is_active_idx" ON "organization_memberships"("organization_id", "role", "is_active");

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_workspace_user_id_fkey" FOREIGN KEY ("workspace_user_id") REFERENCES "workspace_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove the single-owner relationship after backfilling memberships.
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_workspace_user_id_fkey";
DROP INDEX "organizations_workspace_user_id_idx";
ALTER TABLE "organizations" DROP COLUMN "workspace_user_id";