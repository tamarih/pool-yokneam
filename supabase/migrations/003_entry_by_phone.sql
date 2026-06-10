-- Lookup family by phone (public, no auth required)
create or replace function public.get_family_by_phone(p_phone text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_family families%rowtype;
  v_membership memberships%rowtype;
  v_punch_card punch_cards%rowtype;
  v_today date := current_date;
  v_cleaned text;
begin
  -- normalize: keep digits only, handle 972 prefix
  v_cleaned := regexp_replace(p_phone, '\D', '', 'g');
  if v_cleaned like '972%' then
    v_cleaned := '0' || substring(v_cleaned from 4);
  end if;

  -- find family by phone (try exact, then last 9 digits)
  select * into v_family
  from public.families
  where regexp_replace(phone, '\D', '', 'g') = v_cleaned
     or regexp_replace(phone, '\D', '', 'g') like '%' || right(v_cleaned, 9)
  limit 1;

  if not found then
    return json_build_object('error', 'מספר טלפון לא נמצא במערכת');
  end if;

  -- find active membership
  select * into v_membership
  from public.memberships
  where family_id = v_family.id
    and active = true
    and (end_date is null or end_date >= v_today)
  order by created_at desc
  limit 1;

  -- find active punch card
  select * into v_punch_card
  from public.punch_cards
  where family_id = v_family.id
    and status = 'active'
    and remaining_entries > 0
    and (expiry_date is null or expiry_date >= v_today)
  order by created_at desc
  limit 1;

  return json_build_object(
    'family', row_to_json(v_family),
    'membership', case when v_membership.id is not null then row_to_json(v_membership) else null end,
    'punch_card', case when v_punch_card.id is not null then row_to_json(v_punch_card) else null end,
    'is_valid', (v_family.status = 'active' and (v_membership.id is not null or (v_punch_card.id is not null and v_punch_card.remaining_entries > 0))),
    'error_message', case
      when v_family.status <> 'active' then 'המשפחה אינה פעילה'
      when v_membership.id is null and (v_punch_card.id is null or v_punch_card.remaining_entries = 0) then 'אין מנוי פעיל או כרטיסייה בתוקף'
      else null
    end
  );
end;
$$;

-- Public record_entry (no guard user required, accessible to anon)
create or replace function public.record_entry_public(
  p_family_id uuid,
  p_people_count integer,
  p_entry_type text,
  p_punch_card_id uuid default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_punch_card punch_cards%rowtype;
begin
  if p_entry_type = 'punch_card' and p_punch_card_id is not null then
    select * into v_punch_card from public.punch_cards where id = p_punch_card_id for update;
    if v_punch_card.remaining_entries < p_people_count then
      return json_build_object('error', 'אין מספיק כניסות בכרטיסייה');
    end if;
    update public.punch_cards
    set used_entries = used_entries + p_people_count,
        status = case when (remaining_entries - p_people_count) <= 0 then 'depleted' else 'active' end
    where id = p_punch_card_id;
  end if;

  insert into public.entries (family_id, people_count, entry_type, punch_card_id)
  values (p_family_id, p_people_count, p_entry_type, p_punch_card_id);

  return json_build_object('success', true);
end;
$$;

-- Allow anon (unauthenticated) to call these
grant execute on function public.get_family_by_phone(text) to anon;
grant execute on function public.record_entry_public(uuid, integer, text, uuid) to anon;
grant execute on function public.get_family_by_phone(text) to authenticated;
grant execute on function public.record_entry_public(uuid, integer, text, uuid) to authenticated;
