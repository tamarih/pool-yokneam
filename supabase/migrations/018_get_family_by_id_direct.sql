-- Rewrite get_family_by_id to load the SPECIFIC family's products directly,
-- without re-routing through phone lookup (which is ambiguous when two
-- families share a phone, e.g. רותי דר + מילי דר).

create or replace function public.get_family_by_id(p_family_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_family families%rowtype;
  v_membership memberships%rowtype;
  v_punch_card punch_cards%rowtype;
  v_member_count integer;
  v_members json;
  v_last_entry entries%rowtype;
  v_today date := current_date;
  v_10min_ago timestamptz := now() - interval '10 minutes';
begin
  select * into v_family from public.families where id = p_family_id;
  if not found then
    return json_build_object('error', 'משפחה לא נמצאה');
  end if;

  -- active membership of THIS family
  select * into v_membership
  from public.memberships
  where family_id = v_family.id
    and active = true
    and (end_date is null or end_date >= v_today)
  order by created_at desc
  limit 1;

  -- active punch_card of THIS family
  select * into v_punch_card
  from public.punch_cards
  where family_id = v_family.id
    and status = 'active'
    and remaining_entries > 0
    and (expiry_date is null or expiry_date >= v_today)
  order by created_at desc
  limit 1;

  select count(*) into v_member_count from public.family_members where family_id = v_family.id;

  select coalesce(json_agg(
    json_build_object('first_name', first_name, 'last_name', last_name)
    order by created_at
  ), '[]'::json) into v_members
  from public.family_members
  where family_id = v_family.id;

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
    'members', v_members,
    'membership', case when v_membership.id is not null then row_to_json(v_membership) else null end,
    'punch_card', case when v_punch_card.id is not null then row_to_json(v_punch_card) else null end,
    'last_entry', case when v_last_entry.id is not null then row_to_json(v_last_entry) else null end,
    'is_valid', (v_family.status = 'active' and (v_membership.id is not null or (v_punch_card.id is not null and v_punch_card.remaining_entries > 0))),
    'error_message', case
      when v_family.status <> 'active' then 'המשפחה אינה פעילה'
      when v_membership.id is null and (v_punch_card.id is null or v_punch_card.remaining_entries = 0) then 'אין מנוי או כרטיסייה פעילים למשפחה זו'
      else null
    end
  );
end;
$$;

grant execute on function public.get_family_by_id(uuid) to anon, authenticated;
