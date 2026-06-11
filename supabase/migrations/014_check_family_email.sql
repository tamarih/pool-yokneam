-- Security definer function to check if an email exists in families
-- (bypasses RLS so unauthenticated users can check before requesting magic link)
create or replace function public.check_family_email_exists(p_email text)
returns boolean
language plpgsql
security definer
as $$
begin
  return exists (
    select 1 from public.families
    where lower(trim(email)) = lower(trim(p_email))
  );
end;
$$;

grant execute on function public.check_family_email_exists(text) to anon;
grant execute on function public.check_family_email_exists(text) to authenticated;
