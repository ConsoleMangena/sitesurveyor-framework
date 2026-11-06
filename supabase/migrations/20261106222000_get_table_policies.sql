create or replace function public.get_table_policies(p_table text)
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'policyname', policyname,
    'cmd', cmd,
    'roles', roles,
    'qual', qual,
    'with_check', with_check
  ))
  into result
  from pg_policies
  where tablename = p_table;
  return result;
end;
$$;
