-- Allow platform versions to mark individual business types as free modules.
ALTER TABLE "version_business_types"
ADD COLUMN "is_free" BOOLEAN NOT NULL DEFAULT false;
