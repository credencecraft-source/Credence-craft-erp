CREATE TABLE "segment_form_restrictions" (
    "restriction_id" TEXT NOT NULL,
    "version_business_type_segment_id" TEXT NOT NULL,
    "form_key" VARCHAR(150) NOT NULL,
    "monthly_qty_limit" INTEGER,
    "monthly_entry_limit" INTEGER,
    "restricted_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segment_form_restrictions_pkey" PRIMARY KEY ("restriction_id")
);

CREATE UNIQUE INDEX "segment_form_restrictions_version_business_type_segment_id_form_key_key"
    ON "segment_form_restrictions"("version_business_type_segment_id", "form_key");

CREATE INDEX "segment_form_restrictions_version_business_type_segment_id_idx"
    ON "segment_form_restrictions"("version_business_type_segment_id");

ALTER TABLE "segment_form_restrictions"
    ADD CONSTRAINT "segment_form_restrictions_version_business_type_segment_id_fkey"
    FOREIGN KEY ("version_business_type_segment_id")
    REFERENCES "version_business_type_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
