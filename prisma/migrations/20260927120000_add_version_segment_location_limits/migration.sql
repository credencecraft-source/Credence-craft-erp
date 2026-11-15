CREATE TABLE "version_business_type_segment_location_limits" (
    "id" TEXT NOT NULL,
    "version_business_type_segment_id" TEXT NOT NULL,
    "max_locations" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "version_business_type_segment_location_limits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "version_business_type_segment_location_limits_assignment_key"
    ON "version_business_type_segment_location_limits"("version_business_type_segment_id");

ALTER TABLE "version_business_type_segment_location_limits"
    ADD CONSTRAINT "version_business_type_segment_location_limits_assignment_fkey"
    FOREIGN KEY ("version_business_type_segment_id")
    REFERENCES "version_business_type_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;