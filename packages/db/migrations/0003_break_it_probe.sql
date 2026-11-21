-- TEMPORARY break-it probe: intentionally permissive policy on a single table.
-- Reverted in the next commit; exists only to prove the RLS suite detects leaks.
DROP POLICY tenant_isolation ON tenant_users;
CREATE POLICY tenant_isolation ON tenant_users USING (true) WITH CHECK (true);
