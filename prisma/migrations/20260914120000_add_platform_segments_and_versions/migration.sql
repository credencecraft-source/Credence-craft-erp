-- CreateTable
CREATE TABLE "segments" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_versions" (
    "id" TEXT NOT NULL,
    "version_name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version_business_types" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "business_type_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "version_business_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version_business_type_segments" (
    "id" TEXT NOT NULL,
    "version_business_type_id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "version_business_type_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "segments_name_key" ON "segments"("name");
CREATE INDEX "segments_is_active_idx" ON "segments"("is_active");
CREATE UNIQUE INDEX "platform_versions_version_name_key" ON "platform_versions"("version_name");
CREATE INDEX "platform_versions_is_active_idx" ON "platform_versions"("is_active");
CREATE UNIQUE INDEX "version_business_types_version_id_business_type_id_key" ON "version_business_types"("version_id", "business_type_id");
CREATE INDEX "version_business_types_business_type_id_idx" ON "version_business_types"("business_type_id");
CREATE UNIQUE INDEX "version_business_type_segments_version_business_type_id_segment_id_key" ON "version_business_type_segments"("version_business_type_id", "segment_id");
CREATE INDEX "version_business_type_segments_segment_id_idx" ON "version_business_type_segments"("segment_id");

-- AddForeignKey
ALTER TABLE "version_business_types" ADD CONSTRAINT "version_business_types_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "platform_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "version_business_types" ADD CONSTRAINT "version_business_types_business_type_id_fkey" FOREIGN KEY ("business_type_id") REFERENCES "business_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "version_business_type_segments" ADD CONSTRAINT "version_business_type_segments_version_business_type_id_fkey" FOREIGN KEY ("version_business_type_id") REFERENCES "version_business_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "version_business_type_segments" ADD CONSTRAINT "version_business_type_segments_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the standard segment catalog.
INSERT INTO "segments" ("id", "name", "created_at", "updated_at") VALUES
  (gen_random_uuid()::text, 'Free', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Standard', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Professional', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Premium', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Elite', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Ultimate', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
