-- Rollback for 20261108040000_housekeeping_purge.sql
-- Stops the daily clean-up. Rows already deleted are not restored (they were short-lived:
-- sign-in codes, email counters, old notifications, expired devices and sessions).
-- pg_cron is left installed if other jobs use it; drop it only when no jobs remain.

begin;

select cron.unschedule('sims-housekeeping') where exists (select 1 from cron.job where jobname = 'sims-housekeeping');
drop function if exists private.purge_old_data();

do $$
begin
  if not exists (select 1 from cron.job) then
    drop extension if exists pg_cron;
  end if;
end $$;

commit;
