-- =====================
-- CANCEL ENTRY (admin) — sets status='cancelled' and refunds punch card if applicable
-- =====================
create or replace function public.cancel_entry(p_entry_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_entry entries%rowtype;
begin
  select * into v_entry from public.entries where id = p_entry_id for update;
  if not found then
    return json_build_object('error', 'הכניסה לא נמצאה');
  end if;
  if v_entry.status = 'cancelled' then
    return json_build_object('error', 'הכניסה כבר בוטלה');
  end if;

  -- refund punch card if needed
  if v_entry.entry_type = 'punch_card' and v_entry.punch_card_id is not null then
    update public.punch_cards
    set used_entries = greatest(0, used_entries - v_entry.people_count),
        status = 'active'
    where id = v_entry.punch_card_id;
  end if;

  update public.entries set status = 'cancelled' where id = p_entry_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.cancel_entry(uuid) to authenticated;
grant execute on function public.cancel_entry(uuid) to anon;

-- =====================
-- UPDATE: get_family_by_phone — also return last_entry within 10 min
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

  select * into v_family
  from public.families
  where regexp_replace(phone, '\D', '', 'g') = v_cleaned
     or regexp_replace(phone, '\D', '', 'g') like '%' || right(v_cleaned, 9)
  limit 1;

  if not found then
    return json_build_object('error', 'מספר טלפון לא נמצא במערכת');
  end if;

  select * into v_membership
  from public.memberships
  where family_id = v_family.id
    and active = true
    and (end_date is null or end_date >= v_today)
  order by created_at desc
  limit 1;

  select count(*) into v_member_count from public.family_members where family_id = v_family.id;

  select * into v_punch_card
  from public.punch_cards
  where family_id = v_family.id
    and status = 'active'
    and remaining_entries > 0
    and (expiry_date is null or expiry_date >= v_today)
  order by created_at desc
  limit 1;

  -- last valid entry within 10 minutes
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
      when v_membership.id is null and (v_punch_card.id is null or v_punch_card.remaining_entries = 0) then 'אין מנוי פעיל או כרטיסייה בתוקף'
      else null
    end
  );
end;
$$;

grant execute on function public.get_family_by_phone(text) to anon;
grant execute on function public.get_family_by_phone(text) to authenticated;
