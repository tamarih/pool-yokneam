create or replace function public.get_family_by_id(p_family_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_family   record;
  v_phone    text;
begin
  select phone into v_phone from public.families where id = p_family_id limit 1;
  if v_phone is null then
    -- fallback: use first phone from membership or punch card
    select phones[1] into v_phone from public.memberships where family_id = p_family_id limit 1;
  end if;
  if v_phone is null then
    select phones[1] into v_phone from public.punch_cards where family_id = p_family_id and is_active = true limit 1;
  end if;
  if v_phone is null then
    return jsonb_build_object('error', 'לא נמצא מספר טלפון למשפחה');
  end if;
  return public.get_family_by_phone(v_phone);
end;
$$;

grant execute on function public.get_family_by_id(uuid) to authenticated;
grant execute on function public.get_family_by_id(uuid) to anon;
