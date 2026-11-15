ALTER TABLE "segment_form_restrictions"
    ADD COLUMN "field_sum_limits" JSONB NOT NULL DEFAULT '{}'::jsonb;