ALTER TABLE "organizations"
  ADD COLUMN "trial_started_at" TIMESTAMP(3),
  ADD COLUMN "trial_ends_at" TIMESTAMP(3),
  ADD COLUMN "trial_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "trial_extension_hours" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_trial_extension_hours_check"
  CHECK ("trial_extension_hours" >= 0);