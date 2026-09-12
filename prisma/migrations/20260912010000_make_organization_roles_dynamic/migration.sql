CREATE TABLE "organization_role_definitions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role_key" VARCHAR(100) NOT NULL,
    "label" VARCHAR(150) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organization_role_definitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_role_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_role_definitions_organization_id_role_key_key"
ON "organization_role_definitions"("organization_id", "role_key");
CREATE INDEX "organization_role_definitions_organization_id_is_system_idx"
ON "organization_role_definitions"("organization_id", "is_system");

ALTER TABLE "organization_memberships" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "organization_memberships" ALTER COLUMN "role" TYPE VARCHAR(100) USING "role"::text;
ALTER TABLE "organization_memberships" ALTER COLUMN "role" SET DEFAULT 'VIEWER';
ALTER TABLE "organization_role_permissions" ALTER COLUMN "role" TYPE VARCHAR(100) USING "role"::text;
ALTER TABLE "organization_invitations" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "organization_invitations" ALTER COLUMN "role" TYPE VARCHAR(100) USING "role"::text;
DROP TYPE "OrganizationRole";