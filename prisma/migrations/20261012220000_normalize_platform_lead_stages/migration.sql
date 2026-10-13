WITH legacy_stages AS (
  SELECT
    "id",
    "stage" AS "previous_stage",
    CASE
      WHEN "stage" IN ('Froud Verfication', 'Hello blocked') THEN 'MARK AS FROUD'
      WHEN "stage" IN ('Potential Dead', 'Testing WhatsApp msg') THEN '3-Dead'
    END AS "new_stage"
  FROM "platform_leads"
  WHERE "stage" IN (
    'Froud Verfication',
    'Hello blocked',
    'Potential Dead',
    'Testing WhatsApp msg'
  )
),
updated_leads AS (
  UPDATE "platform_leads" AS lead
  SET
    "stage" = legacy_stages."new_stage",
    "updated_at" = CURRENT_TIMESTAMP
  FROM legacy_stages
  WHERE lead."id" = legacy_stages."id"
  RETURNING
    lead."id",
    legacy_stages."previous_stage",
    lead."stage" AS "new_stage"
)
INSERT INTO "platform_audit_events" (
  "id",
  "platform_admin_id",
  "action",
  "entity_type",
  "entity_id",
  "details"
)
SELECT
  gen_random_uuid()::text,
  NULL,
  'PLATFORM_LEAD_STAGE_MIGRATED',
  'PlatformLead',
  "id",
  jsonb_build_object('previousStage', "previous_stage", 'stage', "new_stage")
FROM updated_leads;
