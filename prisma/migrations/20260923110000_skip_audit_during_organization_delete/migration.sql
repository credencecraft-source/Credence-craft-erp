CREATE OR REPLACE FUNCTION record_organization_audit_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  changed_row jsonb;
  organization_key text;
  actor_id text;
BEGIN
  IF current_setting('app.skip_organization_audit', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- A deleted organization cannot retain an audit row because audit_events cascades with it.
  IF TG_TABLE_NAME = 'organizations' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  changed_row := CASE
    WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
    ELSE to_jsonb(NEW)
  END;

  organization_key := CASE
    WHEN TG_TABLE_NAME = 'organizations' THEN changed_row ->> 'id'
    ELSE changed_row ->> 'organization_id'
  END;
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
