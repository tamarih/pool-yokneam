-- Preserve readable entry history by storing the family display name at entry time.
-- Safe to run on existing data: makes entries.family_id nullable, changes the FK
-- to ON DELETE SET NULL, adds snapshot columns when needed, backfills when possible,
-- and updates entry-recording functions. It does not delete any data.

alter table public.entries alter column family_id drop not null;

alter table public.entries
  drop constraint if exists entries_family_id_fkey;

alter table public.entries
  add constraint entries_family_id_fkey
  foreign key (family_id) references public.families(id) on delete set null;

alter table public.entries add column if not exists family_name_snapshot text;
alter table public.entries add column if not exists member_names text[] not null default '{}';

update public.entries e
set family_name_snapshot = nullif(trim(coalesce(f.first_name, '') || ' ' || coalesce(f.family_name, '')), '')
from public.families f
where e.family_id = f.id
  and e.family_name_snapshot is null;

create or replace function public.snapshot_family_name_on_delete()
returns trigger language plpgsql as $$
begin
  update public.entries
  set family_name_snapshot = coalesce(family_name_snapshot,
    nullif(trim(coalesce(old.first_name, '') || ' ' || coalesce(old.family_name, '')), ''))
  where family_id = old.id;
  return old;
end;
$$;

drop trigger if exists families_snapshot_before_delete on public.families;
create trigger families_snapshot_before_delete
  before delete on public.families
  for each row execute procedure public.snapshot_family_name_on_delete();

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
  v_family families%rowtype;
  v_punch_card punch_cards%rowtype;
  v_date date := coalesce(p_entry_date, current_date);
  v_time time := coalesce(p_entry_time, current_time);
  v_family_name_snapshot text;
begin
  select * into v_family from public.families where id = p_family_id;
  v_family_name_snapshot := nullif(trim(coalesce(v_family.first_name, '') || ' ' || coalesce(v_family.family_name, '')), '');

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
    family_id, family_name_snapshot, people_count, entry_type, guard_user_id, punch_card_id, notes, member_names,
    entry_date, entry_time
  ) values (
    p_family_id, v_family_name_snapshot, p_people_count, p_entry_type, p_guard_user_id, p_punch_card_id, p_notes,
    coalesce(p_member_names, '{}'), v_date, v_time
  ) returning * into v_entry;

  return json_build_object('entry', row_to_json(v_entry), 'success', true);
end;
$$;

grant execute on function public.record_entry(uuid, integer, text, uuid, uuid, text, text[], date, time) to authenticated;

create or replace function public.record_entry_public(
  p_family_id uuid,
  p_people_count integer,
  p_entry_type text,
  p_punch_card_id uuid default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_family families%rowtype;
  v_punch_card punch_cards%rowtype;
  v_family_name_snapshot text;
begin
  select * into v_family from public.families where id = p_family_id;
  v_family_name_snapshot := nullif(trim(coalesce(v_family.first_name, '') || ' ' || coalesce(v_family.family_name, '')), '');

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

  insert into public.entries (family_id, family_name_snapshot, people_count, entry_type, punch_card_id)
  values (p_family_id, v_family_name_snapshot, p_people_count, p_entry_type, p_punch_card_id);

  return json_build_object('success', true);
end;
$$;

grant execute on function public.record_entry_public(uuid, integer, text, uuid) to anon;
grant execute on function public.record_entry_public(uuid, integer, text, uuid) to authenticated;