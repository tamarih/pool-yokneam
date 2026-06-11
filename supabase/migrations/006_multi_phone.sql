-- Allow multiple phones per membership/punch_card (primary + spouse + children)
alter table public.memberships add column if not exists phones text[] not null default '{}';
alter table public.punch_cards add column if not exists phones text[] not null default '{}';

-- Migrate existing single phone column → array (preserve back-compat)
update public.memberships set phones = array[phone]
  where phone is not null and phone <> '' and (phones = '{}' or phones is null);
update public.punch_cards set phones = array[phone]
  where phone is not null and phone <> '' and (phones = '{}' or phones is null);

create index if not exists idx_memberships_phones on public.memberships using gin (phones);
create index if not exists idx_punch_cards_phones on public.punch_cards using gin (phones);

-- =====================
-- Helper: normalize phone digits
-- =====================
create or replace function public.normalize_phone(p text) returns text language sql immutable as $$
  select case
    when p is null then null
    when regexp_replace(p, '\D', '', 'g') like '972%' then
      '0' || substring(regexp_replace(p, '\D', '', 'g') from 4)
    else regexp_replace(p, '\D', '', 'g')
  end;
$$;

-- =====================
-- Check whether a normalized phone matches any phone in an array
-- =====================
create or replace function public.phone_in_array(p_cleaned text, p_phones text[]) returns boolean language sql immutable as $$
  select exists (
    select 1 from unnest(p_phones) as ph
    where public.normalize_phone(ph) = p_cleaned
       or public.normalize_phone(ph) like '%' || right(p_cleaned, 9)
  );
$$;

-- =====================
-- get_family_by_phone — supports array phones + single phone + family phone
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
  v_cleaned := public.normalize_phone(p_phone);
  if v_cleaned is null or length(v_cleaned) < 9 then
    return json_build_object('error', 'מספר טלפון לא תקין');
  end if;

  -- find family: by family.phone OR via any membership/punch_card phone match
  select f.* into v_family
  from public.families f
  where public.normalize_phone(f.phone) = v_cleaned
     or public.normalize_phone(f.phone) like '%' || right(v_cleaned, 9)
     or exists (
       select 1 from public.memberships m
       where m.family_id = f.id
         and (public.phone_in_array(v_cleaned, m.phones)
              or (m.phone is not null and (
                public.normalize_phone(m.phone) = v_cleaned
                or public.normalize_phone(m.phone) like '%' || right(v_cleaned, 9)
              )))
     )
     or exists (
       select 1 from public.punch_cards pc
       where pc.family_id = f.id
         and (public.phone_in_array(v_cleaned, pc.phones)
              or (pc.phone is not null and (
                public.normalize_phone(pc.phone) = v_cleaned
                or public.normalize_phone(pc.phone) like '%' || right(v_cleaned, 9)
              )))
     )
  limit 1;

  if not found then
    return json_build_object('error', 'מספר טלפון לא נמצא במערכת');
  end if;

  -- active membership matching this phone (array OR single phone OR family fallback)
  select * into v_membership
  from public.memberships
  where family_id = v_family.id
    and active = true
    and (end_date is null or end_date >= v_today)
    and (
      public.phone_in_array(v_cleaned, phones)
      or (phone is not null and (
        public.normalize_phone(phone) = v_cleaned
        or public.normalize_phone(phone) like '%' || right(v_cleaned, 9)
      ))
      or ((phones = '{}' or phones is null) and phone is null and (
        public.normalize_phone(v_family.phone) = v_cleaned
        or public.normalize_phone(v_family.phone) like '%' || right(v_cleaned, 9)
      ))
    )
  order by created_at desc
  limit 1;

  -- active punch_card matching this phone
  select * into v_punch_card
  from public.punch_cards
  where family_id = v_family.id
    and status = 'active'
    and remaining_entries > 0
    and (expiry_date is null or expiry_date >= v_today)
    and (
      public.phone_in_array(v_cleaned, phones)
      or (phone is not null and (
        public.normalize_phone(phone) = v_cleaned
        or public.normalize_phone(phone) like '%' || right(v_cleaned, 9)
      ))
      or ((phones = '{}' or phones is null) and phone is null and (
        public.normalize_phone(v_family.phone) = v_cleaned
        or public.normalize_phone(v_family.phone) like '%' || right(v_cleaned, 9)
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

grant execute on function public.normalize_phone(text) to anon, authenticated;
grant execute on function public.phone_in_array(text, text[]) to anon, authenticated;
grant execute on function public.get_family_by_phone(text) to anon, authenticated;
