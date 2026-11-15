-- Rename canonical Sales Channel module references to Price List.
UPDATE "master_modules"
SET
  "module_key" = 'price-list',
  "module_name" = 'Price List',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "module_key" = 'sales-channel';

UPDATE "approval_requests"
SET
  "module_key" = 'price-list',
  "module_name" = 'Price List',
  "entity_type" = REPLACE("entity_type", 'sales-channel', 'price-list'),
  "entity_key" = REPLACE("entity_key", 'sales-channel', 'price-list')
WHERE "module_key" = 'sales-channel'
   OR "entity_type" LIKE '%sales-channel%'
   OR "entity_key" LIKE '%sales-channel%';

UPDATE "audit_events"
SET
  "module" = REPLACE("module", 'sales-channel', 'price-list'),
  "entity_type" = CASE
    WHEN "entity_type" IS NULL THEN NULL
    ELSE REPLACE("entity_type", 'sales-channel', 'price-list')
  END,
  "details" = CASE
    WHEN "details" IS NULL THEN NULL
    ELSE REPLACE("details"::text, 'sales-channel', 'price-list')::jsonb
  END
WHERE "module" LIKE '%sales-channel%'
   OR "entity_type" LIKE '%sales-channel%'
   OR "details"::text LIKE '%sales-channel%';

UPDATE "master_module_values"
SET
  "metadata" = CASE
    WHEN "metadata" IS NULL THEN NULL
    ELSE REPLACE("metadata"::text, 'sales-channel', 'price-list')::jsonb
  END
WHERE "metadata"::text LIKE '%sales-channel%';
