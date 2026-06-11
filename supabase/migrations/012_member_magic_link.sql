-- When a user logs in via magic link, auto-link them to their family by email
-- and assign 'member' role if they don't already have one

create or replace function public.handle_member_login()
returns trigger
language plpgsql
security definer
as $$
declare
  v_family_id uuid;
  v_existing_role text;
begin
  -- Check if user already has a role (admin/guard should not be overridden)
  select role into v_existing_role from public.profiles where id = new.id;

  -- Only auto-assign member role if no profile exists yet
  if v_existing_role is null then
    -- Look up family by email
    select id into v_family_id
    from public.families
    where lower(trim(email)) = lower(trim(new.email))
    limit 1;

    if v_family_id is not null then
      -- Create profile with member role
      insert into public.profiles (id, role, full_name)
      values (new.id, 'member', new.email)
      on conflict (id) do update set role = 'member';

      -- Link user to family
      insert into public.family_user_links (user_id, family_id)
      values (new.id, v_family_id)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

-- Trigger on new auth user or email confirmation
drop trigger if exists on_auth_user_member_login on auth.users;
create trigger on_auth_user_member_login
  after insert or update of email_confirmed_at
  on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.handle_member_login();
