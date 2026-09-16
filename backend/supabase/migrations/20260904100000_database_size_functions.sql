-- Database size tracking functions for workspace settings page
-- Apply with: supabase db push

-- 1. Function to get total database size
CREATE OR REPLACE FUNCTION get_database_size()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_database_size(current_database());
$$;

-- 2. Function to get all public tables size
CREATE OR REPLACE FUNCTION get_tables_size()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname = 'public';
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION get_database_size() TO authenticated;
GRANT EXECUTE ON FUNCTION get_tables_size() TO authenticated;
