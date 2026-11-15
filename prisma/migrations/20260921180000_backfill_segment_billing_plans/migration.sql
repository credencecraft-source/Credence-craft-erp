INSERT INTO "plans" (
  "id",
  "plan_id",
  "business_type_id",
  "plan_name",
  "description",
  "price",
  "billing_cycle",
  "tier_key",
  "is_system_plan",
  "is_active",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  gen_random_uuid(),
  vbt."business_type_id",
  bt."name" || ' - ' || s."name",
  COALESCE(s."description", 'Plan for ' || bt."name" || ' - ' || s."name" || '.'),
  vbts."price",
  'monthly',
  UPPER(REGEXP_REPLACE(TRIM(s."name"), '[^A-Za-z0-9]+', '_', 'g')),
  true,
  true,
  COALESCE((SELECT MAX(existing."sort_order") FROM "plans" existing), 0) + ROW_NUMBER() OVER (ORDER BY vbt."business_type_id", s."sort_order", s."name"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "version_business_type_segments" vbts
JOIN "version_business_types" vbt ON vbt."id" = vbts."version_business_type_id"
JOIN "business_types" bt ON bt."id" = vbt."business_type_id"
JOIN "segments" s ON s."id" = vbts."segment_id"
WHERE vbts."price" IS NOT NULL
  AND vbts."is_active" = true
  AND vbt."is_free" = false
  AND NOT EXISTS (
    SELECT 1
    FROM "plans" existing
    WHERE existing."business_type_id" = vbt."business_type_id"
      AND (
        LOWER(REGEXP_REPLACE(TRIM(SPLIT_PART(existing."plan_name", ' - ', 2)), '[^a-z0-9]+', '-', 'g')) = LOWER(REGEXP_REPLACE(TRIM(s."name"), '[^a-z0-9]+', '-', 'g'))
        OR (LOWER(existing."tier_key") = 'classic' AND LOWER(s."name") = 'standard')
        OR (LOWER(existing."tier_key") = 'enterprise' AND LOWER(s."name") = 'premium')
      )
  )
ON CONFLICT ("plan_name") DO NOTHING;
