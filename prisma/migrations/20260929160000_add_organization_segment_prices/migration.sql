CREATE TABLE "organization_segment_prices" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "version_business_type_segment_id" TEXT NOT NULL,
  "snapshot_price" DECIMAL(12, 2),
  "custom_price" DECIMAL(12, 2),
  "updated_by_platform_admin_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_segment_prices_pkey" PRIMARY KEY ("id")
);

INSERT INTO "organization_segment_prices" (
  "id",
  "organization_id",
  "version_business_type_segment_id",
  "snapshot_price",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  organization."id",
  segment_assignment."id",
  segment_assignment."price",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" AS organization
JOIN "version_business_types" AS version_business_type
  ON version_business_type."version_id" = organization."platform_version_id"
JOIN "version_business_type_segments" AS segment_assignment
  ON segment_assignment."version_business_type_id" = version_business_type."id"
WHERE organization."platform_version_id" IS NOT NULL;

CREATE UNIQUE INDEX "organization_segment_prices_organization_id_version_business_type_segment_id_key"
ON "organization_segment_prices"("organization_id", "version_business_type_segment_id");

CREATE INDEX "organization_segment_prices_organization_id_custom_price_idx"
ON "organization_segment_prices"("organization_id", "custom_price");

CREATE INDEX "organization_segment_prices_version_business_type_segment_id_idx"
ON "organization_segment_prices"("version_business_type_segment_id");

ALTER TABLE "organization_segment_prices"
ADD CONSTRAINT "organization_segment_prices_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_segment_prices"
ADD CONSTRAINT "organization_segment_prices_version_business_type_segment_id_fkey"
FOREIGN KEY ("version_business_type_segment_id") REFERENCES "version_business_type_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER "audit_organization_segment_prices"
AFTER INSERT OR UPDATE OR DELETE ON "organization_segment_prices"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();