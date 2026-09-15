-- Add version ownership to organizations.
ALTER TABLE "organizations" ADD COLUMN "platform_version_id" TEXT;
CREATE INDEX "organizations_platform_version_id_idx" ON "organizations"("platform_version_id");
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_platform_version_id_fkey"
  FOREIGN KEY ("platform_version_id") REFERENCES "platform_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing organizations use the newest active platform version until an administrator selects another one.
UPDATE "organizations" o
SET "platform_version_id" = (
  SELECT v."id"
  FROM "platform_versions" v
  WHERE v."is_active" = true
  ORDER BY v."created_at" DESC, v."version_name" DESC
  LIMIT 1
)
WHERE o."platform_version_id" IS NULL;

-- Create the new restriction table before copying legacy rules.
CREATE TABLE "segment_restrictions" (
    "restriction_id" TEXT NOT NULL,
    "version_business_type_segment_id" TEXT NOT NULL,
    "master_module" TEXT NOT NULL,
    "main_module" TEXT NOT NULL,
    "sub_module" TEXT NOT NULL,
    "action_level" TEXT,
    "url_pattern" TEXT,
    "restriction_type" TEXT NOT NULL DEFAULT 'block',
    "custom_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "segment_restrictions_pkey" PRIMARY KEY ("restriction_id")
);

CREATE INDEX "segment_restrictions_version_business_type_segment_id_restriction_type_idx"
  ON "segment_restrictions"("version_business_type_segment_id", "restriction_type");
ALTER TABLE "segment_restrictions"
  ADD CONSTRAINT "segment_restrictions_version_business_type_segment_id_fkey"
  FOREIGN KEY ("version_business_type_segment_id") REFERENCES "version_business_type_segments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy every legacy plan rule to the matching segment in every configured version.
-- Legacy tier names are normalized to the new segment catalog.
INSERT INTO "segment_restrictions" (
  "restriction_id",
  "version_business_type_segment_id",
  "master_module",
  "main_module",
  "sub_module",
  "action_level",
  "url_pattern",
  "restriction_type",
  "custom_message",
  "created_at"
)
SELECT
  gen_random_uuid()::text,
  vbts."id",
  pr."master_module",
  pr."main_module",
  pr."sub_module",
  pr."action_level",
  pr."url_pattern",
  pr."restriction_type",
  pr."custom_message",
  pr."created_at"
FROM "plan_restrictions" pr
JOIN "plans" p ON p."id" = pr."plan_id"
JOIN "version_business_types" vbt ON vbt."business_type_id" = p."business_type_id"
JOIN "version_business_type_segments" vbts ON vbts."version_business_type_id" = vbt."id"
JOIN "segments" s ON upper(s."name") = upper(
  CASE upper(COALESCE(NULLIF(p."tier_key", ''), ''))
    WHEN 'FREE' THEN 'Free'
    WHEN 'CLASSIC' THEN 'Standard'
    WHEN 'STANDARD' THEN 'Standard'
    WHEN 'PROFESSIONAL' THEN 'Professional'
    WHEN 'PREMIUM' THEN 'Premium'
    WHEN 'ELITE' THEN 'Elite'
    WHEN 'ULTIMATE' THEN 'Ultimate'
    WHEN 'ENTERPRISE' THEN 'Premium'
    ELSE split_part(p."plan_name", ' - ', 2)
  END
)
WHERE p."business_type_id" IS NOT NULL;

-- The plan table is no longer the restriction source of truth.
DROP TABLE "plan_restrictions";
