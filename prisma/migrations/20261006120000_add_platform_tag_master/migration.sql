CREATE TABLE "platform_tags" (
    "id" TEXT NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_tags_pkey" PRIMARY KEY ("id")
);

INSERT INTO "platform_tags" ("id", "label", "is_active", "sort_order", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    legacy_tags."label",
    true,
    ROW_NUMBER() OVER (ORDER BY legacy_tags."label")::INTEGER,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "label"
    FROM "version_business_type_tags"
) AS legacy_tags;

CREATE UNIQUE INDEX "platform_tags_label_key" ON "platform_tags"("label");
CREATE INDEX "platform_tags_is_active_sort_order_idx" ON "platform_tags"("is_active", "sort_order");

ALTER TABLE "version_business_type_tags" ADD COLUMN "platform_tag_id" TEXT;

UPDATE "version_business_type_tags" AS assignments
SET "platform_tag_id" = tags."id"
FROM "platform_tags" AS tags
WHERE assignments."label" = tags."label";

ALTER TABLE "version_business_type_tags" ALTER COLUMN "platform_tag_id" SET NOT NULL;
DROP INDEX "version_business_type_tags_version_business_type_id_label_key";
ALTER TABLE "version_business_type_tags" DROP COLUMN "label";

CREATE UNIQUE INDEX "version_business_type_tags_version_business_type_id_platform_tag_id_key"
ON "version_business_type_tags"("version_business_type_id", "platform_tag_id");
CREATE INDEX "version_business_type_tags_platform_tag_id_idx"
ON "version_business_type_tags"("platform_tag_id");

ALTER TABLE "version_business_type_tags"
ADD CONSTRAINT "version_business_type_tags_platform_tag_id_fkey"
FOREIGN KEY ("platform_tag_id") REFERENCES "platform_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
