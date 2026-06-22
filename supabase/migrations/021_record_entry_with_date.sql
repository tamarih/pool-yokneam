-- Extend record_entry to accept an optional entry_date and entry_time
-- so admins can add retroactive entries for days the guard missed.

create or replace function public.record_entry(
  p_family_id uuid,
  p_people_count integer,
  p_entry_type text,
  p_punch_card_id uuid default null,
  p_guard_user_id uuid default null,
  p_notes text default null,
  p_member_names text[] default '{}',
  p_entry_date date default null,
  p_entry_time time default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_entry entries%rowtype;
  v_punch_card punch_cards%rowtype;
  v_date date := coalesce(p_entry_date, current_date);
  v_time time := coalesce(p_entry_time, current_time);
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

  insert into public.entries (
    family_id, people_count, entry_type, guard_user_id, punch_card_id, notes, member_names,
    entry_date, entry_time
  ) values (
    p_family_id, p_people_count, p_entry_type, p_guard_user_id, p_punch_card_id, p_notes,
    coalesce(p_member_names, '{}'), v_date, v_time
  ) returning * into v_entry;

  return json_build_object('entry', row_to_json(v_entry), 'success', true);
end;
$$;

grant execute on function public.record_entry(uuid, integer, text, uuid, uuid, text, text[], date, time) to authenticated;
