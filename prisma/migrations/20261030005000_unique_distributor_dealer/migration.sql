ALTER TABLE "contact_distributor_dealer_assignments"
  DROP CONSTRAINT IF EXISTS "contact_distributor_dealer_org_dealer_key";

DROP INDEX IF EXISTS "contact_distributor_dealer_org_dealer_key";
DROP INDEX IF EXISTS "contact_distributor_dealer_unique";

CREATE INDEX IF NOT EXISTS "contact_distributor_dealer_dealer_idx"
ON "contact_distributor_dealer_assignments"("organization_id", "dealer_id");

CREATE INDEX IF NOT EXISTS "contact_distributor_dealer_lookup_idx"
ON "contact_distributor_dealer_assignments"("organization_id", "distributor_id", "dealer_id");
