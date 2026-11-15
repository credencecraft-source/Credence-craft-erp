CREATE TYPE "platform_version_type" AS ENUM ('BEST_PRICE', 'REGULAR_PRICE', 'PREMIUM');

ALTER TABLE "platform_versions"
ADD COLUMN "version_type" "platform_version_type" NOT NULL DEFAULT 'REGULAR_PRICE';

UPDATE "platform_versions"
SET "version_type" = CASE
    WHEN LOWER("version_name") LIKE '%best price%'
      OR LOWER("version_name") LIKE '%best-price%'
      OR LOWER("version_name") LIKE '%best_price%'
      THEN 'BEST_PRICE'::"platform_version_type"
    WHEN LOWER("version_name") LIKE '%premium%'
      THEN 'PREMIUM'::"platform_version_type"
    ELSE 'REGULAR_PRICE'::"platform_version_type"
END;
