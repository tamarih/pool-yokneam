-- =====================
-- LOOKUP FAMILY BY QR TOKEN (used by guard scanner)
-- =====================
create or replace function public.get_family_by_qr(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_family families%rowtype;
  v_membership memberships%rowtype;
  v_punch_card punch_cards%rowtype;
  v_last_entry entries%rowtype;
  v_now timestamptz := now();
  v_today date := current_date;
  v_5min_ago timestamptz := v_now - interval '5 minutes';
begin
  -- find family
  select * into v_family from public.families where qr_token = p_token;
  if not found then
    return json_build_object('error', 'קוד QR לא תקין');
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

  -- find last entry (for duplicate scan detection)
  select * into v_last_entry
  from public.entries
  where family_id = v_family.id
    and status = 'valid'
    and created_at >= v_5min_ago
  order by created_at desc
  limit 1;

  return json_build_object(
    'family', row_to_json(v_family),
    'membership', case when v_membership.id is not null then row_to_json(v_membership) else null end,
    'punch_card', case when v_punch_card.id is not null then row_to_json(v_punch_card) else null end,
    'last_entry', case when v_last_entry.id is not null then row_to_json(v_last_entry) else null end
  );
end;
$$;

-- =====================
-- RECORD ENTRY (atomic: deducts punch card if needed)
-- =====================
create or replace function public.record_entry(
  p_family_id uuid,
  p_people_count integer,
  p_entry_type text,
  p_punch_card_id uuid default null,
  p_guard_user_id uuid default null,
  p_notes text default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_entry entries%rowtype;
  v_punch_card punch_cards%rowtype;
begin
  -- validate punch card has enough entries
  if p_entry_type = 'punch_card' and p_punch_card_id is not null then
    select * into v_punch_card from public.punch_cards where id = p_punch_card_id for update;
    if v_punch_card.remaining_entries < p_people_count then
      return json_build_object('error', 'אין מספיק כניסות בכרטיסייה');
    end if;

    -- deduct entries
    update public.punch_cards
    set used_entries = used_entries + p_people_count,
        status = case when (remaining_entries - p_people_count) <= 0 then 'depleted' else 'active' end
    where id = p_punch_card_id;
  end if;

  -- record entry
  insert into public.entries (
    family_id, people_count, entry_type, guard_user_id, punch_card_id, notes
  ) values (
    p_family_id, p_people_count, p_entry_type, p_guard_user_id, p_punch_card_id, p_notes
  ) returning * into v_entry;

  return json_build_object('entry', row_to_json(v_entry), 'success', true);
end;
$$;

-- =====================
-- DASHBOARD STATS
-- =====================
create or replace function public.get_dashboard_stats()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_today date := current_date;
  v_week_start date := date_trunc('week', current_date)::date;
  v_month_start date := date_trunc('month', current_date)::date;
  v_2hours_ago timestamptz := now() - interval '2 hours';
begin
  return json_build_object(
    'active_families', (select count(*) from public.families where status = 'active'),
    'active_memberships', (
      select count(*) from public.memberships
      where active = true and (end_date is null or end_date >= v_today)
    ),
    'active_punch_cards', (
      select count(*) from public.punch_cards
      where status = 'active' and remaining_entries > 0
        and (expiry_date is null or expiry_date >= v_today)
    ),
    'entries_today', (
      select coalesce(sum(people_count), 0) from public.entries
      where entry_date = v_today and status = 'valid'
    ),
    'entries_week', (
      select coalesce(sum(people_count), 0) from public.entries
      where entry_date >= v_week_start and status = 'valid'
    ),
    'entries_month', (
      select coalesce(sum(people_count), 0) from public.entries
      where entry_date >= v_month_start and status = 'valid'
    ),
    'people_inside', (
      select coalesce(sum(people_count), 0) from public.entries
      where created_at >= v_2hours_ago and status = 'valid'
    )
  );
end;
$$;

-- grant execute to authenticated users with admin/guard role
grant execute on function public.get_family_by_qr(text) to authenticated;
grant execute on function public.record_entry(uuid, integer, text, uuid, uuid, text) to authenticated;
grant execute on function public.get_dashboard_stats() to authenticated;
