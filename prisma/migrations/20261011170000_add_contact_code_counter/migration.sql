CREATE TABLE "contact_code_counters" (
  "organization_id" TEXT NOT NULL,
  "current_value" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contact_code_counters_pkey" PRIMARY KEY ("organization_id")
);

UPDATE "contacts"
SET "code" = 'TMP-' || md5("id")
WHERE "code" ~ '^[BV]-[0-9a-f]{32}$';

WITH existing_codes AS (
  SELECT "organization_id", max(substring("code" FROM 3)::INTEGER) AS "last_number"
  FROM "contacts"
  WHERE "code" ~ '^CT[0-9]+$'
  GROUP BY "organization_id"
),
numbered_legacy_contacts AS (
  SELECT contact."id",
         COALESCE(existing_codes."last_number", 0)
           + row_number() OVER (PARTITION BY contact."organization_id" ORDER BY contact."created_at", contact."id") AS "new_number"
  FROM "contacts" contact
  LEFT JOIN existing_codes USING ("organization_id")
  WHERE contact."code" LIKE 'TMP-%'
)
UPDATE "contacts" contact
SET "code" = 'CT' || numbered_legacy_contacts."new_number"::TEXT
FROM numbered_legacy_contacts
WHERE contact."id" = numbered_legacy_contacts."id";

INSERT INTO "contact_code_counters" ("organization_id", "current_value", "updated_at")
SELECT "organization_id", max(substring("code" FROM 3)::INTEGER), CURRENT_TIMESTAMP
FROM "contacts"
WHERE "code" ~ '^CT[0-9]+$'
GROUP BY "organization_id";

ALTER TABLE "contact_code_counters"
  ADD CONSTRAINT "contact_code_counters_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
