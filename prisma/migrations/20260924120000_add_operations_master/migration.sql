CREATE TABLE "master_operations" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "operation_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "master_operations_value_id_key" ON "master_operations"("value_id");
CREATE UNIQUE INDEX "master_operations_organization_id_operation_name_key" ON "master_operations"("organization_id", "operation_name");
CREATE INDEX "master_operations_organization_id_is_active_idx" ON "master_operations"("organization_id", "is_active");

ALTER TABLE "master_operations"
ADD CONSTRAINT "master_operations_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
