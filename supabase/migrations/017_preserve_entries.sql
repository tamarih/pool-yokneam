-- Make entries survive family deletion: family_id nullable, FK → SET NULL,
-- plus a family_name_snapshot so history stays readable.

alter table public.entries alter column family_id drop not null;

alter table public.entries
  drop constraint if exists entries_family_id_fkey;

alter table public.entries
  add constraint entries_family_id_fkey
  foreign key (family_id) references public.families(id) on delete set null;

alter table public.entries add column if not exists family_name_snapshot text;

-- Trigger: when a family is deleted, copy its name into all its entries first
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
