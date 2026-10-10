CREATE TABLE "challan_number_configurations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "document_type" VARCHAR(40) NOT NULL,
  "label" VARCHAR(100) NOT NULL,
  "prefix" VARCHAR(20) NOT NULL,
  "start_number" INTEGER NOT NULL DEFAULT 1,
  "current_number" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "challan_number_configurations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "challan_number_configurations_organization_id_document_type_key"
  ON "challan_number_configurations"("organization_id", "document_type");
ALTER TABLE "challan_number_configurations"
  ADD CONSTRAINT "challan_number_configurations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;