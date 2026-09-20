CREATE OR REPLACE FUNCTION record_organization_audit_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  changed_row jsonb;
  organization_key text;
  actor_id text;
BEGIN
  changed_row := CASE
    WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
    ELSE to_jsonb(NEW)
  END;

  organization_key := changed_row ->> 'organization_id';
  actor_id := NULLIF(current_setting('app.user_id', true), '');

  IF organization_key IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO audit_events (
    id,
    organization_id,
    user_id,
    module,
    action,
    entity_type,
    entity_id,
    details
  )
  VALUES (
    'auto_' || gen_random_uuid()::text,
    organization_key,
    actor_id,
    TG_TABLE_NAME,
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(changed_row ->> 'id', changed_row ->> 'organization_id'),
    jsonb_build_object(
      'source', 'database_trigger',
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'record', changed_row
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organization_id'
      AND c.table_name <> 'audit_events'
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I',
      'audit_' || table_record.table_name,
      table_record.table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event()',
      'audit_' || table_record.table_name,
      table_record.table_name
    );
  END LOOP;
END;
$$;
