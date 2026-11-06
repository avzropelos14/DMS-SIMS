-- Rollback for 20261106200000_phase5c_guardian_lockdown.sql
-- Guardians still locked down are unblocked (sign-in only; their links stay suspended and
-- their QR codes stay the new ones, so the office can re-open links one by one).

begin;

update auth.users u set banned_until = null
from private.security_incidents i
where i.guardian_id = u.id and i.resolved_at is null;

drop function if exists public.lockdown_guardian(uuid, text);
drop function if exists public.restore_guardian_access(uuid, text);
drop function if exists public.set_guardian_link_access(uuid, text);
drop function if exists public.rotate_guardian_link_qr(uuid);
drop function if exists public.guardian_security_status(uuid);
drop function if exists public.security_incidents_open();
drop function if exists public.grant_pickup_override(text, text);
drop function if exists public.pickup_overrides_today();
drop function if exists public.photo_cleanup_list();
drop function if exists public.photo_cleanup_done(text[]);
drop function if exists private.require_verified_admin();
drop function if exists private.new_qr_secret(uuid);

-- Back to the Phase 5B version (no cleanup queue).
create or replace function public.submit_my_guardian_photo(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.mfa_ok()
     or not exists (select 1 from public.guardians where id = v_uid) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_path !~ ('^pending/' || v_uid::text || '/[A-Za-z0-9_.-]+\.jpg$') then
    raise exception 'Invalid photo path' using errcode = '22023';
  end if;
  insert into private.guardian_photo_submissions (guardian_id, path, submitted_at)
  values (v_uid, p_path, now())
  on conflict (guardian_id) do update set path = excluded.path, submitted_at = excluded.submitted_at;
end;
$$;

drop table if exists private.photo_cleanup_queue;
drop table if exists private.security_incidents;

commit;
