-- Phase 3 (C1): make MFA real — enforced by the database, not just the login screen.
-- Additive only. Ships with enforcement OFF: nothing changes for anyone until
--   update private.security_settings set value = 'pilot' | 'on' where key = 'enforce_mfa_in_rls';
-- Emergency off switch (Supabase SQL Editor):
--   update private.security_settings set value = 'off' where key = 'enforce_mfa_in_rls';
-- Rollback: supabase/rollbacks/20261105150000_phase3_mfa_enforcement.sql

begin;

-- ─── private schema: not exposed through the API (PostgREST serves public only) ───
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- authenticated needs USAGE only so RLS policies can call private.mfa_ok(); it has no
-- grants on any table in here.
grant usage on schema private to authenticated, service_role, supabase_auth_admin;
alter default privileges in schema private revoke execute on functions from public;

create table private.security_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  constraint enforce_mode_valid check (key <> 'enforce_mfa_in_rls' or value in ('off', 'pilot', 'on'))
);
insert into private.security_settings (key, value) values
  ('enforce_mfa_in_rls', 'off'),
  ('mfa_session_hours', '12'),          -- one school day
  ('email_daily_limit_mfa', '70'),      -- Resend free tier: 100/day in total
  ('email_daily_limit_security', '30');

-- Accounts enforced while the switch is 'pilot'.
create table private.mfa_pilot_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

-- One row per auth session that passed MFA. Deleted automatically when the session
-- ends (sign-out, admin reset, revoke) through the cascade.
create table private.mfa_verified_sessions (
  session_id uuid primary key references auth.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  method text not null check (method in ('code', 'trusted_device', 'recovery')),
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index mfa_verified_sessions_user_idx on private.mfa_verified_sessions (user_id);

-- Server-side "must set your own password". Unlike user_metadata.password_set, the
-- account owner cannot edit this; it is cleared only by an actual password change.
create table private.password_change_required (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

-- One-time recovery codes, issued by an admin (or from the SQL Editor), valid 24 hours.
create table private.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  attempts integer not null default 0,
  issued_by uuid,
  issued_via text not null default 'admin',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index mfa_recovery_codes_user_idx on private.mfa_recovery_codes (user_id, created_at desc);

-- Daily email budget (UTC day, like Resend's quota).
create table private.email_log (
  day date not null,
  channel text not null check (channel in ('mfa', 'security')),
  count integer not null default 0,
  primary key (day, channel)
);

revoke all on all tables in schema private from public, anon, authenticated;

-- Backfill: the accounts already flagged password_set=false.
insert into private.password_change_required (user_id, reason)
select id, 'backfill_password_set_false'
from auth.users
where raw_user_meta_data ->> 'password_set' = 'false'
on conflict do nothing;

-- ─── core checks ───
create or replace function private.mfa_mode()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select value from private.security_settings where key = 'enforce_mfa_in_rls'), 'off');
$$;

create or replace function private.session_verified(p_session_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_session_id is not null and exists (
    select 1 from private.mfa_verified_sessions v
    where v.session_id = p_session_id and v.user_id = p_user_id and v.expires_at > now()
  );
$$;

-- The single rule every protected table applies. Any mode other than 'off' / an
-- unlisted pilot account fails closed.
create or replace function private.mfa_ok_for(p_session_id uuid, p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_mode text := private.mfa_mode();
begin
  if v_mode = 'off' then return true; end if;
  if p_user_id is null then return false; end if;
  if v_mode = 'pilot' and not exists (select 1 from private.mfa_pilot_users where user_id = p_user_id) then
    return true;
  end if;
  return private.session_verified(p_session_id, p_user_id)
     and not exists (select 1 from private.password_change_required where user_id = p_user_id);
end;
$$;

create or replace function private.mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.mfa_ok_for(nullif(auth.jwt() ->> 'session_id', '')::uuid, auth.uid());
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.mfa_ok() to authenticated;

-- ─── what the login screen may ask before MFA (booleans only, no personal data) ───
create or replace function public.my_login_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_mode text := private.mfa_mode();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'provisioned',
      exists (select 1 from public.profiles where id = v_uid and role is not null)
      or exists (select 1 from public.guardians where id = v_uid)
      or exists (select 1 from public.student_accounts where auth_user_id = v_uid),
    'mfa_required',
      v_mode not in ('off', 'pilot')
      or (v_mode = 'pilot' and exists (select 1 from private.mfa_pilot_users where user_id = v_uid)),
    'mfa_verified', private.session_verified(nullif(auth.jwt() ->> 'session_id', '')::uuid, v_uid),
    'must_change_password', exists (select 1 from private.password_change_required where user_id = v_uid)
  );
end;
$$;
revoke execute on function public.my_login_status() from public, anon;
grant execute on function public.my_login_status() to authenticated;

-- ─── service-role helpers for the edge functions ───
create or replace function public.mfa_mark_session_verified(p_session_id uuid, p_user_id uuid, p_method text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_hours integer := coalesce((select value::integer from private.security_settings where key = 'mfa_session_hours'), 12);
begin
  insert into private.mfa_verified_sessions (session_id, user_id, method, verified_at, expires_at)
  select s.id, s.user_id, p_method, now(), now() + make_interval(hours => v_hours)
  from auth.sessions s
  where s.id = p_session_id and s.user_id = p_user_id
  on conflict (session_id) do update
    set method = excluded.method, verified_at = excluded.verified_at, expires_at = excluded.expires_at;
  return found;
end;
$$;

create or replace function public.mfa_check_session(p_session_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.mfa_ok_for(p_session_id, p_user_id);
$$;

create or replace function public.mark_password_change_required(p_user_id uuid, p_reason text)
returns void language sql security definer set search_path = '' as $$
  insert into private.password_change_required (user_id, reason)
  values (p_user_id, p_reason)
  on conflict (user_id) do update set reason = excluded.reason, created_at = now();
$$;

-- Atomic: one UPSERT that only increments while under the limit. true = may send.
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

-- Replaces any outstanding code for the user. Returns the expiry.
create or replace function public.mfa_issue_recovery_code(p_user_id uuid, p_code_hash text, p_issued_by uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_expires timestamptz := now() + interval '24 hours';
begin
  update private.mfa_recovery_codes set consumed_at = now()
  where user_id = p_user_id and consumed_at is null;
  insert into private.mfa_recovery_codes (user_id, code_hash, issued_by, issued_via, expires_at)
  values (p_user_id, p_code_hash, p_issued_by, 'admin', v_expires);
  return v_expires;
end;
$$;

-- Consumes a matching code exactly once; a miss counts against every live code (max 5).
create or replace function public.mfa_consume_recovery_code(p_user_id uuid, p_code_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.mfa_recovery_codes set consumed_at = now()
  where user_id = p_user_id and code_hash = p_code_hash
    and consumed_at is null and expires_at > now() and attempts < 5;
  if found then return true; end if;
  update private.mfa_recovery_codes set attempts = attempts + 1
  where user_id = p_user_id and consumed_at is null and expires_at > now();
  return false;
end;
$$;

revoke execute on function public.mfa_mark_session_verified(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.mfa_check_session(uuid, uuid)              from public, anon, authenticated;
revoke execute on function public.mark_password_change_required(uuid, text)  from public, anon, authenticated;
revoke execute on function public.email_budget_consume(text)                 from public, anon, authenticated;
revoke execute on function public.mfa_issue_recovery_code(uuid, text, uuid)  from public, anon, authenticated;
revoke execute on function public.mfa_consume_recovery_code(uuid, text)      from public, anon, authenticated;
grant execute on function public.mfa_mark_session_verified(uuid, uuid, text) to service_role;
grant execute on function public.mfa_check_session(uuid, uuid)              to service_role;
grant execute on function public.mark_password_change_required(uuid, text)  to service_role;
grant execute on function public.email_budget_consume(text)                 to service_role;
grant execute on function public.mfa_issue_recovery_code(uuid, text, uuid)  to service_role;
grant execute on function public.mfa_consume_recovery_code(uuid, text)      to service_role;

-- ─── SQL Editor only: recovery code for any account (e.g. a locked-out admin) ───
--   select private.emergency_recovery_code('someone@example.com');
create or replace function private.emergency_recovery_code(p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars: no modulo bias
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_code text := '';
begin
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'No account with that email';
  end if;
  for i in 0..9 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  update private.mfa_recovery_codes set consumed_at = now() where user_id = v_uid and consumed_at is null;
  insert into private.mfa_recovery_codes (user_id, code_hash, issued_via, expires_at)
  values (v_uid, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), 'sql_editor', now() + interval '24 hours');
  insert into public.audit_log (actor_role, action, target_user_id, details)
  values ('sql_editor', 'mfa_recovery_code_issued', v_uid, jsonb_build_object('via', 'sql_editor'));
  return substr(v_code, 1, 5) || '-' || substr(v_code, 6, 5);
end;
$$;
revoke execute on function private.emergency_recovery_code(text) from public, anon, authenticated, service_role;

-- ─── a real password change clears the server-side requirement ───
create or replace function private.clear_password_change_required()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    delete from private.password_change_required where user_id = new.id;
  end if;
  return null;
end;
$$;
revoke execute on function private.clear_password_change_required() from public, anon, authenticated;
grant execute on function private.clear_password_change_required() to supabase_auth_admin;

create trigger on_auth_user_password_changed
  after update of encrypted_password on auth.users
  for each row execute function private.clear_password_change_required();

-- ─── restrictive policies: only ever take access away, never grant it ───
-- Every public table except the four config tables read around sign-in.
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('school_settings', 'school_years', 'tuition_fees', 'enrollment_fees')
  loop
    execute format(
      'create policy "mfa required" on public.%I as restrictive for all to authenticated '
      'using ((select private.mfa_ok())) with check ((select private.mfa_ok()))', r.relname);
  end loop;
end $$;

create policy "mfa required for id card photos" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'id-cards' or (select private.mfa_ok()))
  with check (bucket_id <> 'id-cards' or (select private.mfa_ok()));

-- ─── the SECURITY DEFINER RPCs skip RLS, so they check MFA themselves ───
create or replace function public.next_receipt_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_staff_role() in ('cashier', 'full_admin'), false) is not true
     or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return 'RCT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0');
end;
$$;

create or replace function public.claim_or_receipt_number(p_school_year_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_end text;
begin
  if coalesce(public.current_staff_role() in ('cashier', 'full_admin'), false) is not true
     or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select or_next_number, or_range_end into v_old, v_end
  from public.school_years where id = p_school_year_id
  for update;

  if v_old is null or v_end is null or v_old > v_end then
    raise exception 'No OR range is configured, or the range has been fully issued, for this school year.';
  end if;

  update public.school_years
  set or_next_number = case
        when v_old ~ '^[0-9]+$' then lpad((v_old::int + 1)::text, length(v_old), '0')
        else v_old
      end
  where id = p_school_year_id;

  return v_old;
end;
$$;

-- create or replace keeps the existing ACL; restate it.
revoke execute on function public.next_receipt_number()         from public, anon;
revoke execute on function public.claim_or_receipt_number(uuid) from public, anon;
grant  execute on function public.next_receipt_number()         to authenticated;
grant  execute on function public.claim_or_receipt_number(uuid) to authenticated;

commit;
