-- Housekeeping (free tier): keep the database small by deleting short-lived rows on a schedule.
-- Additive. Uses pg_cron (available on the Free plan). Deletes ONLY:
--   mfa_codes                 older than 1 day        (sign-in codes expire in minutes)
--   email_log                 older than 60 days      (daily email counters)
--   notifications             older than 90 days      (parent bell)
--   trusted_devices           expired more than 7 days ago
--   mfa_verified_sessions     expired
--   password_confirmations    older than 1 day        (5-minute confirmations)
-- Never touches audit_log, pickup_logs or any school record. Each run writes one audit_log row.
-- Rollback: supabase/rollbacks/20261108040000_housekeeping_purge.sql

begin;

create or replace function private.purge_old_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
begin
  delete from public.mfa_codes where created_at < now() - interval '1 day';
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('mfa_codes', v_n);

  delete from private.email_log where day < (now() at time zone 'Asia/Manila')::date - 60;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('email_log', v_n);

  delete from private.notifications where created_at < now() - interval '90 days';
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('notifications', v_n);

  delete from public.trusted_devices where expires_at < now() - interval '7 days';
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('trusted_devices', v_n);

  delete from private.mfa_verified_sessions where expires_at < now();
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('mfa_verified_sessions', v_n);

  delete from private.password_confirmations where confirmed_at < now() - interval '1 day';
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('password_confirmations', v_n);

  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (null, 'system', 'housekeeping_purge', null, v_counts);
  return v_counts;
end;
$$;
revoke execute on function private.purge_old_data() from public, anon, authenticated;

create extension if not exists pg_cron;

-- Every day at 3:00 AM Philippine time (19:00 UTC).
select cron.schedule('sims-housekeeping', '0 19 * * *', $$select private.purge_old_data()$$);

commit;
