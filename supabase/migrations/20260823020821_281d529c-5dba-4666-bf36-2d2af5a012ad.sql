create or replace function public.check_leads_capi_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending int;
  v_last_sent timestamptz;
  v_stuck int;
  v_stalled boolean;
  v_msg text;
begin
  select count(*) into v_pending
  from public.leads
  where capi_status is null or capi_status = 'retry';

  select max(capi_sent_at) into v_last_sent
  from public.leads where capi_status = 'sent';

  select count(*) into v_stuck
  from public.leads
  where capi_status = 'processing' and capi_sent_at < now() - interval '1 hour';

  v_stalled := (v_pending > 100)
            or (v_last_sent is null or v_last_sent < now() - interval '6 hours')
            or (v_stuck > 0);

  if v_stalled then
    v_msg := format(
      'Envio de leads para o Meta CAPI parado. Por enviar: %s. Presos em processing: %s. Ultimo envio: %s.',
      v_pending, v_stuck, coalesce(v_last_sent::text, 'nunca'));

    insert into public.system_reminders (key, title, message, due_date, frequency, link_url, is_active)
    values ('leads_capi_stalled', 'CAPI de leads parado', v_msg, current_date, 'daily', '/admin', true)
    on conflict (key) do update
      set message = excluded.message,
          due_date = current_date,
          is_active = true,
          updated_at = now(),
          completed_at = null;
  else
    update public.system_reminders
      set is_active = false, completed_at = now(), updated_at = now()
      where key = 'leads_capi_stalled' and is_active;
  end if;

  return jsonb_build_object(
    'pending', v_pending, 'stuck_processing', v_stuck,
    'last_sent_at', v_last_sent, 'stalled', v_stalled);
end;
$$;

revoke all on function public.check_leads_capi_health() from public;
revoke all on function public.check_leads_capi_health() from anon;
grant execute on function public.check_leads_capi_health() to service_role;