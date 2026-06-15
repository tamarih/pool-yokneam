-- Return all matching families + products when a phone is shared.
-- Use the same matching rules as get_family_by_phone but return an array.

create or replace function public.get_family_options_by_phone(p_phone text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_cleaned text;
  v_today date := current_date;
  v_10min_ago timestamptz := now() - interval '10 minutes';
  v_options json;
begin
  v_cleaned := public.normalize_phone(p_phone);
  if v_cleaned is null or length(v_cleaned) < 9 then
    return json_build_object('error', 'מספר טלפון לא תקין');
  end if;

  with matching_families as (
    select distinct f.*
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
  ),
  per_family as (
    select
      f.id as family_id,
      row_to_json(f) as family,
      (select count(*) from public.family_members fm where fm.family_id = f.id) as member_count,
      (select coalesce(json_agg(json_build_object('first_name', first_name, 'last_name', last_name) order by created_at), '[]'::json)
       from public.family_members where family_id = f.id) as members,
      (
        select row_to_json(m) from public.memberships m
        where m.family_id = f.id and m.active = true
          and (m.end_date is null or m.end_date >= v_today)
          and (
            public.phone_in_array(v_cleaned, m.phones)
            or (m.phone is not null and (
              public.normalize_phone(m.phone) = v_cleaned
              or public.normalize_phone(m.phone) like '%' || right(v_cleaned, 9)
            ))
            or ((m.phones = '{}' or m.phones is null) and m.phone is null and (
              public.normalize_phone(f.phone) = v_cleaned
              or public.normalize_phone(f.phone) like '%' || right(v_cleaned, 9)
            ))
          )
        order by m.created_at desc limit 1
      ) as membership,
      (
        select row_to_json(pc) from public.punch_cards pc
        where pc.family_id = f.id and pc.status = 'active' and pc.remaining_entries > 0
          and (pc.expiry_date is null or pc.expiry_date >= v_today)
          and (
            public.phone_in_array(v_cleaned, pc.phones)
            or (pc.phone is not null and (
              public.normalize_phone(pc.phone) = v_cleaned
              or public.normalize_phone(pc.phone) like '%' || right(v_cleaned, 9)
            ))
            or ((pc.phones = '{}' or pc.phones is null) and pc.phone is null and (
              public.normalize_phone(f.phone) = v_cleaned
              or public.normalize_phone(f.phone) like '%' || right(v_cleaned, 9)
            ))
          )
        order by pc.created_at desc limit 1
      ) as punch_card,
      (
        select row_to_json(e) from public.entries e
        where e.family_id = f.id and e.status = 'valid' and e.created_at >= v_10min_ago
        order by e.created_at desc limit 1
      ) as last_entry
    from matching_families f
  ),
  options_filtered as (
    -- only include a family option that actually has an active product matching this phone
    select * from per_family
    where membership is not null or punch_card is not null
  )
  select coalesce(json_agg(json_build_object(
    'family', family,
    'member_count', member_count,
    'members', members,
    'membership', membership,
    'punch_card', punch_card,
    'last_entry', last_entry,
    'is_valid', ((family->>'status') = 'active' and (membership is not null or punch_card is not null))
  ) order by family->>'family_name'), '[]'::json) into v_options
  from options_filtered;

  if v_options is null or v_options::text = '[]' then
    return json_build_object('error', 'אין מנוי או כרטיסייה משויכים לטלפון זה');
  end if;

  return json_build_object('options', v_options);
end;
$$;

grant execute on function public.get_family_options_by_phone(text) to anon, authenticated;
