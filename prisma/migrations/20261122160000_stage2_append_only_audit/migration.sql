-- Stage 2.5: stock movement and audit append-only enforcement plus actor-aware diffs.
CREATE OR REPLACE FUNCTION prevent_stock_movement_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock movements are immutable';
END;
$$;
DROP TRIGGER IF EXISTS "stock_movements_immutable" ON "stock_movements";
CREATE TRIGGER "stock_movements_immutable"
BEFORE UPDATE OR DELETE ON "stock_movements"
FOR EACH ROW EXECUTE FUNCTION prevent_stock_movement_mutation();

CREATE OR REPLACE FUNCTION redact_audit_data(payload jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT payload
    #- '{password}' #- '{password_hash}' #- '{token}' #- '{access_token}'
    #- '{refresh_token}' #- '{secret}' #- '{credentials}' #- '{database_url}'
$$;

CREATE OR REPLACE FUNCTION record_organization_audit_event()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  organization_key text;
  before_data jsonb;
  after_data jsonb;
  changed_fields jsonb;
  key_name text;
  actor_id text;
  valid_user_id text;
BEGIN
  IF TG_TABLE_NAME = 'organizations' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  organization_key := CASE
    WHEN TG_TABLE_NAME = 'organizations' THEN NEW.id
    ELSE CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END
  END;
  IF organization_key IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  before_data := CASE WHEN TG_OP = 'DELETE' THEN redact_audit_data(to_jsonb(OLD))
                      WHEN TG_OP = 'UPDATE' THEN redact_audit_data(to_jsonb(OLD))
                      ELSE NULL END;
  after_data := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE redact_audit_data(to_jsonb(NEW)) END;
  changed_fields := '[]'::jsonb;
  IF TG_OP = 'UPDATE' THEN
    FOR key_name IN
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = TG_TABLE_NAME
      ORDER BY ordinal_position
    LOOP
      IF (to_jsonb(OLD) -> key_name) IS DISTINCT FROM (to_jsonb(NEW) -> key_name) THEN
        changed_fields := changed_fields || to_jsonb(key_name);
      END IF;
    END LOOP;
  END IF;
  actor_id := COALESCE(
    NULLIF(current_setting('app.user_id', true), ''),
    CASE WHEN NULLIF(current_setting('app.actor_type', true), '') = 'SYSTEM_WEBHOOK' THEN 'SYSTEM_WEBHOOK'
         WHEN NULLIF(current_setting('app.actor_type', true), '') = 'SYSTEM_JOB' THEN 'SYSTEM_JOB'
         ELSE 'SYSTEM' END
  );
  valid_user_id := NULL;
  IF actor_id NOT IN ('SYSTEM','SYSTEM_WEBHOOK','SYSTEM_JOB') THEN
    SELECT id INTO valid_user_id FROM workspace_users WHERE id = actor_id LIMIT 1;
  END IF;
  INSERT INTO "audit_events" (
    "id","organization_id","user_id","actor_id","module","action","entity_type","entity_id",
    "source_context","request_id","before_data","after_data","changed_fields","details","created_at"
  ) VALUES (
    'auto_' || gen_random_uuid()::text, organization_key, valid_user_id, actor_id,
    TG_TABLE_NAME, TG_OP, TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN COALESCE(OLD.id, organization_key) ELSE COALESCE(NEW.id, organization_key) END,
    NULLIF(current_setting('app.source_context', true), ''),
    NULLIF(current_setting('app.request_id', true), ''),
    before_data, after_data, changed_fields,
    jsonb_build_object('source','database_trigger','table',TG_TABLE_NAME,'operation',TG_OP),
    CURRENT_TIMESTAMP
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
DECLARE table_record record;
BEGIN
  FOR table_record IN
    SELECT DISTINCT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organization_id'
      AND c.table_name <> 'audit_events'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'audit_' || table_record.table_name, table_record.table_name);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event()',
      'audit_' || table_record.table_name, table_record.table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only';
END;
$$;
DROP TRIGGER IF EXISTS "audit_events_append_only_update" ON "audit_events";
CREATE TRIGGER "audit_events_append_only_update"
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
