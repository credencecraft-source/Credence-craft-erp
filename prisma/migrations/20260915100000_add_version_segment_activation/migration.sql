-- Allow each platform version to enable or disable a segment independently.
ALTER TABLE "version_business_type_segments"
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "version_business_type_segments_is_active_idx"
ON "version_business_type_segments"("is_active");
