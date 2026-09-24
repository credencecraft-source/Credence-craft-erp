CREATE TABLE "version_business_type_tags" (
    "id" TEXT NOT NULL,
    "version_business_type_id" TEXT NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "version_business_type_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "version_business_type_tags_version_business_type_id_label_key" ON "version_business_type_tags"("version_business_type_id", "label");
CREATE INDEX "version_business_type_tags_version_business_type_id_idx" ON "version_business_type_tags"("version_business_type_id");
ALTER TABLE "version_business_type_tags" ADD CONSTRAINT "version_business_type_tags_version_business_type_id_fkey" FOREIGN KEY ("version_business_type_id") REFERENCES "version_business_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
