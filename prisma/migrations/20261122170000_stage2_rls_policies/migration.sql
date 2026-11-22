-- Stage 2.6: tenant RLS policies, organizations override applied last.
DO $$
DECLARE table_record record;
BEGIN
  FOR table_record IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organization_id'
      AND c.table_name <> 'organizations'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_record.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_record.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', table_record.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON %I FOR ALL
       USING (
         COALESCE(NULLIF(current_setting(''app.bypass_rls'', true), ''''), ''false'') = ''true''
         OR "organization_id"::text = NULLIF(current_setting(''app.organization_id'', true), '''')
       )
       WITH CHECK (
         COALESCE(NULLIF(current_setting(''app.bypass_rls'', true), ''''), ''false'') = ''true''
         OR "organization_id"::text = NULLIF(current_setting(''app.organization_id'', true), '''')
       )',
      table_record.table_name
    );
  END LOOP;
END;
$$;

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "organizations";
CREATE POLICY tenant_isolation_policy ON "organizations"
FOR ALL
USING (
  COALESCE(NULLIF(current_setting('app.bypass_rls', true), ''), 'false') = 'true'
  OR "id" = NULLIF(current_setting('app.organization_id', true), '')
)
WITH CHECK (
  COALESCE(NULLIF(current_setting('app.bypass_rls', true), ''), 'false') = 'true'
  OR "id" = NULLIF(current_setting('app.organization_id', true), '')
);
