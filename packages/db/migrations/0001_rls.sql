-- RLS policies for all tenant tables (with FORCE)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['tenant_users','roles','departments','user_roles','role_permissions','user_departments','tenant_audit_log']) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  END LOOP;
END $$;
