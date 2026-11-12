-- Rollback for 20261112010000_office_request_alerts.sql
-- Stops the office alerts (in-app and email), gives the sign-in code budget back its 60, and
-- restores the numbers-only budget check. Notifications already delivered stay until the
-- nightly clean-up removes them.

begin;

drop trigger if exists self_dismissal_notify_office on private.self_dismissal_permissions;
drop trigger if exists grade_reopen_notify_admin on public.grade_reopen_requests;
drop function if exists public.claim_office_request_email(text, uuid, uuid);
drop function if exists private.notify_office_self_dismissal();
drop function if exists private.notify_admin_grade_reopen();
drop function if exists private.grade_reopen_summary(uuid);
drop function if exists private.travel_mode_label(text);
drop function if exists private.office_recipients(text[]);
drop table if exists private.office_request_emails;

delete from private.security_settings where key = 'email_daily_limit_office';
update private.security_settings set value = '60', updated_at = now()
where key = 'email_daily_limit_mfa' and value = '45';

-- The budget check as it was in Phase 3 (numbers only). Any limit set to 'unlimited' must be
-- set back to a number first, or that channel stops sending.
create or replace function public.email_budget_consume(p_channel text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer := coalesce((select value::integer from private.security_settings
                               where key = 'email_daily_limit_' || p_channel), 0);
  v_day date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  if v_limit <= 0 then return false; end if;
  insert into private.email_log as e (day, channel, count) values (v_day, p_channel, 1)
  on conflict (day, channel) do update set count = e.count + 1 where e.count < v_limit
  returning e.count into v_count;
  return v_count is not null;
end;
$$;
revoke execute on function public.email_budget_consume(text) from public, anon, authenticated;
grant execute on function public.email_budget_consume(text) to service_role;

commit;
