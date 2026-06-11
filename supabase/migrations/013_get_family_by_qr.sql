create or replace function public.get_family_by_qr_token(p_token text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_family_id uuid;
  v_phone text;
begin
  select id into v_family_id from public.families where qr_token = p_token limit 1;
  if v_family_id is null then
    return jsonb_build_object('error', 'QR לא תקין');
  end if;
  return public.get_family_by_id(v_family_id);
end;
$$;

grant execute on function public.get_family_by_qr_token(text) to authenticated;
grant execute on function public.get_family_by_qr_token(text) to anon;
