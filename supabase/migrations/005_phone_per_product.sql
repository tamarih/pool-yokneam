-- Each membership and punch_card may have its own phone (separate "owner" within family)
alter table public.memberships add column if not exists phone text;
alter table public.punch_cards add column if not exists phone text;

create index if not exists idx_memberships_phone on public.memberships(phone);
create index if not exists idx_punch_cards_phone on public.punch_cards(phone);

-- =====================
-- get_family_by_phone — phone-aware product lookup
-- A phone matches a product if:
--   product.phone matches the caller's phone (specific assignment)
--   OR product.phone is null AND family.phone matches (legacy / unassigned)
-- =====================
create or replace function public.get_family_by_phone(p_phone text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_family families%rowtype;
  v_membership memberships%rowtype;
  v_punch_card punch_cards%rowtype;
  v_member_count integer;
  v_last_entry entries%rowtype;
  v_today date := current_date;
  v_10min_ago timestamptz := now() - interval '10 minutes';
  v_cleaned text;
begin
  v_cleaned := regexp_replace(p_phone, '\D', '', 'g');
  if v_cleaned like '972%' then
    v_cleaned := '0' || substring(v_cleaned from 4);
  end if;

  -- find family: by family.phone OR by a membership/punch_card assigned to this phone
  select f.* into v_family
  from public.families f
  where regexp_replace(f.phone, '\D', '', 'g') = v_cleaned
     or regexp_replace(f.phone, '\D', '', 'g') like '%' || right(v_cleaned, 9)
     or exists (
       select 1 from public.memberships m
       where m.family_id = f.id
         and m.phone is not null
         and (regexp_replace(m.phone, '\D', '', 'g') = v_cleaned
              or regexp_replace(m.phone, '\D', '', 'g') like '%' || right(v_cleaned, 9))
     )
     or exists (
       select 1 from public.punch_cards pc
       where pc.family_id = f.id
         and pc.phone is not null
         and (regexp_replace(pc.phone, '\D', '', 'g') = v_cleaned
              or regexp_replace(pc.phone, '\D', '', 'g') like '%' || right(v_cleaned, 9))
     )
  limit 1;

  if not found then
    return json_build_object('error', 'מספר טלפון לא נמצא במערכת');
  end if;

  -- active membership matching this phone (or legacy null-phone fallback)
  select * into v_membership
  from public.memberships
  where family_id = v_family.id
    and active = true
    and (end_date is null or end_date >= v_today)
    and (
      (phone is not null and (
        regexp_replace(phone, '\D', '', 'g') = v_cleaned
        or regexp_replace(phone, '\D', '', 'g') like '%' || right(v_cleaned, 9)
      ))
      or (phone is null and (
        regexp_replace(v_family.phone, '\D', '', 'g') = v_cleaned
        or regexp_replace(v_family.phone, '\D', '', 'g') like '%' || right(v_cleaned, 9)
      ))
    )
  order by created_at desc
  limit 1;

  -- active punch_card matching this phone (or legacy null-phone fallback)
  select * into v_punch_card
  from public.punch_cards
  where family_id = v_family.id
    and status = 'active'
    and remaining_entries > 0
    and (expiry_date is null or expiry_date >= v_today)
    and (
      (phone is not null and (
        regexp_replace(phone, '\D', '', 'g') = v_cleaned
        or regexp_replace(phone, '\D', '', 'g') like '%' || right(v_cleaned, 9)
      ))
      or (phone is null and (
        regexp_replace(v_family.phone, '\D', '', 'g') = v_cleaned
        or regexp_replace(v_family.phone, '\D', '', 'g') like '%' || right(v_cleaned, 9)
      ))
    )
  order by created_at desc
  limit 1;

  select count(*) into v_member_count from public.family_members where family_id = v_family.id;

  select * into v_last_entry
  from public.entries
  where family_id = v_family.id
    and status = 'valid'
    and created_at >= v_10min_ago
  order by created_at desc
  limit 1;

  return json_build_object(
    'family', row_to_json(v_family),
    'member_count', v_member_count,
    'membership', case when v_membership.id is not null then row_to_json(v_membership) else null end,
    'punch_card', case when v_punch_card.id is not null then row_to_json(v_punch_card) else null end,
    'last_entry', case when v_last_entry.id is not null then row_to_json(v_last_entry) else null end,
    'is_valid', (v_family.status = 'active' and (v_membership.id is not null or (v_punch_card.id is not null and v_punch_card.remaining_entries > 0))),
    'error_message', case
      when v_family.status <> 'active' then 'המשפחה אינה פעילה'
      when v_membership.id is null and (v_punch_card.id is null or v_punch_card.remaining_entries = 0) then 'אין מנוי או כרטיסייה משויכים לטלפון זה'
      else null
    end
  );
end;
$$;

grant execute on function public.get_family_by_phone(text) to anon;
grant execute on function public.get_family_by_phone(text) to authenticated;
