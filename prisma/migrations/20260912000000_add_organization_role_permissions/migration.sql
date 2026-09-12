CREATE TABLE "organization_role_permissions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "permission" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organization_role_permissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_role_permissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_role_permissions_organization_id_role_permission_key"
ON "organization_role_permissions"("organization_id", "role", "permission");
CREATE INDEX "organization_role_permissions_organization_id_role_idx"
ON "organization_role_permissions"("organization_id", "role");