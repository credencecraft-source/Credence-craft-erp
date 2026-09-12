CREATE TABLE "organization_order_counters" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "current_value" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_order_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_order_counters_organization_id_key"
  ON "organization_order_counters"("organization_id");

ALTER TABLE "organization_order_counters"
  ADD CONSTRAINT "organization_order_counters_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "organization_order_counters" ("id", "organization_id", "current_value", "updated_at")
SELECT
  md5('organization-order-counter:' || o."id"),
  o."id",
  COALESCE(MAX(
    CASE
      WHEN m."orderNo" ~* '^OD[- ]?[0-9]+$'
        THEN regexp_replace(m."orderNo", '^OD[- ]?', '', 'i')::integer
      ELSE 0
    END
  ), 0),
  CURRENT_TIMESTAMP
FROM "organizations" o
LEFT JOIN "merchandising_orders" m ON m."organization_id" = o."id"
GROUP BY o."id"
HAVING COUNT(m."id") > 0;
