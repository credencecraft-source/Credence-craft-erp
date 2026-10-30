DROP TABLE IF EXISTS "contact_distributor_dealer_assignments" CASCADE;

CREATE TABLE "contact_distributor_dealer_assignments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "distributor_id" TEXT NOT NULL,
    "dealer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_distributor_dealer_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_distributor_dealer_unique"
ON "contact_distributor_dealer_assignments"("organization_id", "distributor_id", "dealer_id");

CREATE INDEX "contact_distributor_dealer_created_idx"
ON "contact_distributor_dealer_assignments"("organization_id", "distributor_id", "created_at");

CREATE INDEX "contact_distributor_dealer_dealer_idx"
ON "contact_distributor_dealer_assignments"("organization_id", "dealer_id");

ALTER TABLE "contact_distributor_dealer_assignments"
ADD CONSTRAINT "contact_distributor_dealer_assignments_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_distributor_dealer_assignments"
ADD CONSTRAINT "contact_distributor_dealer_assignments_distributor_fkey"
FOREIGN KEY ("organization_id", "distributor_id") REFERENCES "contacts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_distributor_dealer_assignments"
ADD CONSTRAINT "contact_distributor_dealer_assignments_dealer_fkey"
FOREIGN KEY ("organization_id", "dealer_id") REFERENCES "contacts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
