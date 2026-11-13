-- SMS through iProg SMS (paid: about P1 per SMS). Three uses:
--   1. Late pickup: every guardian of the student, when the guard sends the late notice.
--   2. Pickup refused at the gate: the guardian whose QR code was used.
--   3. Tuition reminder: each guardian, once a month, in the last 5 days before that month's
--      installment is due (the last day of the month), while it is not fully paid.
-- Plus an admin-only test SMS and status (credits left, sent today) for System Settings.
-- The iProg token lives only in the edge function secret IPROG_SMS_API_TOKEN.
-- A daily cap (sms_daily_limit, default 30) protects the credits; 'unlimited' lifts it.
-- Additive only. Rollback: supabase/rollbacks/20261113010000_sms_iprog.sql

begin;

create extension if not exists pg_net;

-- ─── daily cap (kept apart from the email limits, since SMS costs money) ───
insert into private.security_settings (key, value) values ('sms_daily_limit', '30')
on conflict (key) do nothing;

-- Counts in private.email_log under the channel 'sms'. A number is the cap for the day,
-- 'unlimited' means no cap, anything else blocks sending.
create or replace function public.sms_budget_consume()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_raw text := (select btrim(lower(value)) from private.security_settings where key = 'sms_daily_limit');
  v_limit integer;
  v_day date := (now() at time zone 'Asia/Manila')::date;
  v_count integer;
begin
  if v_raw = 'unlimited' then
    insert into private.email_log as e (day, channel, count) values (v_day, 'sms', 1)
    on conflict (day, channel) do update set count = e.count + 1;
    return true;
  end if;
  v_limit := case when v_raw ~ '^[0-9]{1,9}$' then v_raw::integer else 0 end;
  if v_limit <= 0 then return false; end if;
  insert into private.email_log as e (day, channel, count) values (v_day, 'sms', 1)
  on conflict (day, channel) do update set count = e.count + 1 where e.count < v_limit
  returning e.count into v_count;
  return v_count is not null;
end;
$$;

-- ─── which messages went out (no phone numbers or message text are stored) ───
create table if not exists private.sms_log (
  id bigint generated always as identity primary key,
  kind text not null,                 -- late_pickup | pickup_rejected | tuition_reminder | test
  ref text not null,                  -- notice id, audit id, 'student:YYYY-MM', or a timestamp
  recipient_id uuid not null,         -- guardian id (or the admin's user id for a test)
  status text not null default 'claimed',  -- claimed | sent | failed
  provider_message_id text,
  created_at timestamptz not null default now(),
  unique (kind, ref, recipient_id)
);
alter table private.sms_log enable row level security;
revoke all on private.sms_log from public, anon, authenticated;

-- A Philippine mobile number as iProg expects it (639XXXXXXXXX), or null.
-- Accepts 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX and +63..., with spaces or dashes.
create or replace function private.ph_mobile(p_phone text)
returns text language sql immutable set search_path = '' as $$
  select case
    when d ~ '^09[0-9]{9}$' then '63' || substr(d, 2)
    when d ~ '^9[0-9]{9}$' then '63' || d
    when d ~ '^639[0-9]{9}$' then d
    else null end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) x;
$$;
revoke execute on function private.ph_mobile(text) from public, anon, authenticated;

-- Claims one log row per recipient; returns null when it was already claimed.
create or replace function private.sms_claim(p_kind text, p_ref text, p_recipient uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  insert into private.sms_log (kind, ref, recipient_id) values (p_kind, p_ref, p_recipient)
  on conflict do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function private.sms_claim(text, text, uuid) from public, anon, authenticated;

-- ─── for the send-event-sms edge function only (service role) ───
-- Checks the event was just recorded by this caller, claims each recipient once, and returns
-- where to send and what to say. Null when nothing should be sent.
create or replace function public.claim_event_sms(p_kind text, p_ref text, p_caller uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_guardian uuid;
  v_student text;
  v_recipients jsonb := '[]'::jsonb;
  v_g record;
  v_log bigint;
  v_phone text;
  v_school_phone text;
begin
  select nullif(btrim(coalesce(contact_phone, '')), '') into v_school_phone from public.school_settings limit 1;

  if p_kind = 'pickup_rejected' then
    if p_ref !~ '^[0-9]{1,18}$' then return null; end if;
    select id, actor_id, created_at, target_user_id, details into v_row
    from public.audit_log where id = p_ref::bigint and action = 'pickup_rejected';
    if not found or v_row.actor_id is distinct from p_caller
       or v_row.created_at < now() - interval '10 minutes' then
      return null;
    end if;
    v_guardian := v_row.target_user_id;
    if v_guardian is null and (v_row.details ->> 'auth_id') is not null then
      select authorized_by into v_guardian from public.pickup_authorizations where id = v_row.details ->> 'auth_id';
    end if;
    v_student := v_row.details ->> 'student_id';
    select private.ph_mobile(phone) into v_phone from public.guardians where id = v_guardian;
    if v_phone is not null then
      v_log := private.sms_claim(p_kind, p_ref, v_guardian);
      if v_log is not null then
        v_recipients := jsonb_build_array(jsonb_build_object('log_id', v_log, 'phone', v_phone));
      end if;
    end if;
    return jsonb_build_object('recipients', v_recipients,
      'student_name', private.student_display_name(v_student),
      'when', to_char(v_row.created_at at time zone 'Asia/Manila', 'FMHH12:MI AM'),
      'school_phone', v_school_phone);

  elsif p_kind = 'late_pickup' then
    if p_ref !~ '^[0-9]{1,18}$' then return null; end if;
    select student_id into v_student from private.late_notices
    where id = p_ref::bigint and sent_by = p_caller and sent_at > now() - interval '10 minutes';
    if not found then return null; end if;
    for v_g in
      select distinct on (private.ph_mobile(g.phone)) g.id, private.ph_mobile(g.phone) as phone
      from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
      where sg.student_id = v_student and private.ph_mobile(g.phone) is not null
    loop
      v_log := private.sms_claim(p_kind, p_ref, v_g.id);
      if v_log is not null then
        v_recipients := v_recipients || jsonb_build_object('log_id', v_log, 'phone', v_g.phone);
      end if;
    end loop;
    return jsonb_build_object('recipients', v_recipients,
      'student_name', private.student_display_name(v_student),
      'when', to_char(now() at time zone 'Asia/Manila', 'FMHH12:MI AM'),
      'school_phone', v_school_phone);

  elsif p_kind = 'test' then
    -- Full admin only: one SMS to the phone on their own employee record.
    select private.ph_mobile(e.phone) into v_phone
    from public.profiles p join public.employees e on e.id::text = p.employee_id
    where p.id = p_caller and p.role::text = 'full_admin';
    if not found then return null; end if;
    if v_phone is null then return jsonb_build_object('recipients', '[]'::jsonb, 'no_phone', true); end if;
    v_log := private.sms_claim(p_kind, extract(epoch from now())::bigint::text, p_caller);
    return jsonb_build_object('recipients', jsonb_build_array(jsonb_build_object('log_id', v_log, 'phone', v_phone)));
  end if;
  return null;
end;
$$;

-- Records how a send went. A failed tuition reminder is released, so tomorrow's run retries it.
create or replace function public.sms_record_result(p_log_id bigint, p_ok boolean, p_message_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_ok then
    update private.sms_log set status = 'sent', provider_message_id = left(p_message_id, 100) where id = p_log_id;
  else
    delete from private.sms_log where id = p_log_id and kind = 'tuition_reminder';
    update private.sms_log set status = 'failed' where id = p_log_id;
  end if;
end;
$$;

-- For the admin's SMS card: today's count and the cap.
create or replace function public.sms_usage_today()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sent_today', coalesce((select count from private.email_log
                            where channel = 'sms' and day = (now() at time zone 'Asia/Manila')::date), 0),
    'daily_limit', (select value from private.security_settings where key = 'sms_daily_limit'));
$$;

-- ─── tuition reminders (send-tuition-reminders edge function, run daily by pg_cron) ───
-- Mirrors the Parent Portal's billing: annual tuition for the grade, split evenly across the
-- months of the current school year (the last month takes the remainder), each due on the
-- last day of its month; tuition payments count toward the month they were paid in.
-- Returns up to p_limit reminders, each claimed so it is sent once per guardian per month.
create or replace function public.claim_tuition_reminders(p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_month date := date_trunc('month', v_today)::date;
  v_due date := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
  v_sy record;
  v_n integer;
  v_idx integer;
  v_s record;
  v_g record;
  v_installment numeric;
  v_paid numeric;
  v_log bigint;
  v_out jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if v_due - v_today > 4 then return v_out; end if;   -- only in the last 5 days of the month
  select id, start_date, end_date into v_sy from public.school_years where is_current limit 1;
  if not found or v_sy.start_date is null or v_sy.end_date is null then return v_out; end if;
  v_n := (extract(year from v_sy.end_date) * 12 + extract(month from v_sy.end_date))
       - (extract(year from v_sy.start_date) * 12 + extract(month from v_sy.start_date)) + 1;
  v_idx := (extract(year from v_today) * 12 + extract(month from v_today))
         - (extract(year from v_sy.start_date) * 12 + extract(month from v_sy.start_date));
  if v_n <= 0 or v_idx < 0 or v_idx >= v_n then return v_out; end if;

  for v_s in
    select s.id, s.first_name || ' ' || s.last_name as name, t.annual_fee
    from public.enrollments en
    join public.students s on s.id = en.student_id and s.status = 'Active'
    join public.tuition_fees t on t.school_year_id = v_sy.id
                              and t.grade_level = coalesce(en.grade_level, s.grade_level)
    where en.school_year_id = v_sy.id and en.status = 'confirmed' and t.annual_fee > 0
    order by s.last_name, s.first_name
  loop
    v_installment := case when v_idx = v_n - 1
                          then v_s.annual_fee - floor(v_s.annual_fee / v_n) * (v_n - 1)
                          else floor(v_s.annual_fee / v_n) end;
    select coalesce(sum(p.amount), 0) into v_paid from public.payments p
    where p.student_id = v_s.id and p.school_year_id = v_sy.id
      and coalesce(p.description, '') <> 'Enrollment Fee'
      and date_trunc('month', p.paid_at at time zone 'Asia/Manila')::date = v_month;
    continue when v_paid >= v_installment - 0.01;

    for v_g in
      select distinct on (private.ph_mobile(g.phone)) g.id, private.ph_mobile(g.phone) as phone
      from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
      where sg.student_id = v_s.id and private.ph_mobile(g.phone) is not null
    loop
      exit when v_count >= p_limit;
      v_log := private.sms_claim('tuition_reminder', v_s.id || ':' || to_char(v_month, 'YYYY-MM'), v_g.id);
      continue when v_log is null;
      v_out := v_out || jsonb_build_object(
        'log_id', v_log, 'phone', v_g.phone, 'student_name', v_s.name,
        'month', to_char(v_month, 'FMMonth'), 'due', to_char(v_due, 'Mon FMDD'),
        'amount', to_char(v_installment - v_paid, 'FM999,999,990.00'));
      v_count := v_count + 1;
    end loop;
    exit when v_count >= p_limit;
  end loop;
  return v_out;
end;
$$;

-- ─── the daily job: pg_cron calls the edge function with a shared secret from Vault ───
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sims_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'sims_cron_secret',
                                'pg_cron -> send-tuition-reminders edge function');
  end if;
end $$;

create or replace function public.verify_cron_secret(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_secret, '') <> ''
     and p_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'sims_cron_secret');
$$;

select cron.unschedule('sims-tuition-sms') where exists (select 1 from cron.job where jobname = 'sims-tuition-sms');
-- 01:00 UTC = 9:00 AM in Manila.
select cron.schedule('sims-tuition-sms', '0 1 * * *', $cron$
  select net.http_post(
    url := 'https://eegfeeckeeqexytbslnv.supabase.co/functions/v1/send-tuition-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sims_cron_secret')),
    body := '{}'::jsonb);
$cron$);

-- ─── permissions: service role only ───
revoke execute on function public.sms_budget_consume() from public, anon, authenticated;
revoke execute on function public.claim_event_sms(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.sms_record_result(bigint, boolean, text) from public, anon, authenticated;
revoke execute on function public.sms_usage_today() from public, anon, authenticated;
revoke execute on function public.claim_tuition_reminders(integer) from public, anon, authenticated;
revoke execute on function public.verify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.sms_budget_consume() to service_role;
grant execute on function public.claim_event_sms(text, text, uuid) to service_role;
grant execute on function public.sms_record_result(bigint, boolean, text) to service_role;
grant execute on function public.sms_usage_today() to service_role;
grant execute on function public.claim_tuition_reminders(integer) to service_role;
grant execute on function public.verify_cron_secret(text) to service_role;

commit;
