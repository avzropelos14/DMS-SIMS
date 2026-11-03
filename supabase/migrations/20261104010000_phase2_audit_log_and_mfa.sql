-- Phase 2 (C2, C3, M1, F): audit_log, atomic MFA attempt counter, session revocation helper.
-- Additive only. Rollback: supabase/rollbacks/20261104010000_phase2_audit_log_and_mfa.sql

begin;

-- F. audit_log: our own long-lived evidence trail (Supabase Free keeps logs for 1 day).
-- Written only by edge functions (service role). Append-only: no policy lets clients write,
-- and a trigger blocks UPDATE/DELETE even for the service role. Never purge without approval.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,                       -- auth.users id of who did it; null = system
  actor_role text,
  action text not null,                -- e.g. 'password_reset', 'student_account_created', 'mfa_locked'
  target_user_id uuid,
  details jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_target_user_id_idx on public.audit_log (target_user_id);
create index if not exists audit_log_action_idx on public.audit_log (action);

alter table public.audit_log enable row level security;

create policy "full admin reads audit_log" on public.audit_log
  for select to authenticated
  using (public.is_staff_role('full_admin'));

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create or replace function public.audit_log_block_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.audit_log_block_changes();

revoke execute on function public.audit_log_block_changes() from public, anon, authenticated;

-- D. MFA: timestamp of the latest failed attempt, for the cross-code lockout window.
alter table public.mfa_codes add column if not exists last_failed_at timestamptz;
create index if not exists mfa_codes_user_created_idx on public.mfa_codes (user_id, created_at desc);

-- D. Atomic failed-attempt increment: a single UPDATE ... WHERE attempts < max, so two
-- concurrent wrong guesses can't both slip under the limit. Returns the new count, or
-- null when the code is already exhausted/consumed. Service role only.
create or replace function public.mfa_register_failed_attempt(p_code_id uuid, p_max_attempts integer)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.mfa_codes
  set attempts = attempts + 1,
      last_failed_at = now()
  where id = p_code_id
    and attempts < p_max_attempts
    and not consumed
  returning attempts;
$$;

revoke execute on function public.mfa_register_failed_attempt(uuid, integer) from public, anon, authenticated;
grant execute on function public.mfa_register_failed_attempt(uuid, integer) to service_role;

-- A. Revoke every session (and, by cascade, refresh token) of a user, e.g. after an admin
-- password reset. Already-issued access tokens stay valid until they expire (max 1 hour).
-- Service role only.
create or replace function public.admin_revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.admin_revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_user_sessions(uuid) to service_role;

commit;
