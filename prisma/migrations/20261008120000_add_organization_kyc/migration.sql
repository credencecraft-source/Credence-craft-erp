CREATE TABLE "organization_kyc_profiles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
    "registration_snapshot" JSONB,
    "business_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "business_type_other" VARCHAR(255),
    "staff_count" INTEGER,
    "factory_count" INTEGER,
    "outlet_count" INTEGER,
    "business_started_year" INTEGER,
    "software_used" VARCHAR(1000),
    "major_challenges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "major_challenge_other" VARCHAR(1000),
    "brands_worked_with" VARCHAR(2000),
    "monthly_production_pcs" INTEGER,
    "business_activities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "factory_arrangement" VARCHAR(20),
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_platform_admin_id" TEXT,
    "review_note" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_kyc_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_kyc_profiles_organization_id_key"
ON "organization_kyc_profiles"("organization_id");

CREATE INDEX "organization_kyc_profiles_status_submitted_at_idx"
ON "organization_kyc_profiles"("status", "submitted_at");

CREATE INDEX "organization_kyc_profiles_reviewed_by_platform_admin_id_reviewed_at_idx"
ON "organization_kyc_profiles"("reviewed_by_platform_admin_id", "reviewed_at");

ALTER TABLE "organization_kyc_profiles"
ADD CONSTRAINT "organization_kyc_profiles_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_kyc_profiles"
ADD CONSTRAINT "organization_kyc_profiles_reviewed_by_platform_admin_id_fkey"
FOREIGN KEY ("reviewed_by_platform_admin_id") REFERENCES "platform_admins"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
