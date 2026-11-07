-- Phase 7: student requirements checklist (birth certificate, report card, ...).
-- Additive only.
--   requirement_catalog   which documents exist and which enrollment types need them
--   student_requirements  per student and school year: missing / submitted / waived
-- Access: admin and registrar read and write; a guardian reads their linked students' rows;
-- guards, cashiers and teachers have no access. MFA is required like every other table.
-- Enrollments gain an optional "conditional" deadline for students enrolled with missing items.
-- Rollback: supabase/rollbacks/20261108020000_phase7_student_requirements.sql

begin;

create table public.requirement_catalog (
  key text primary key,
  label text not null,
  applies_to text[] not null default array['New Student', 'Transferee'],
  sort_order integer not null default 0,
  active boolean not null default true
);
alter table public.requirement_catalog enable row level security;

-- The six items of the enrollment form (EnrollmentSection REQUIREMENTS), same keys.
insert into public.requirement_catalog (key, label, sort_order) values
  ('birthCertificate', 'PSA Birth Certificate', 1),
  ('reportCard', 'Report Card / Form 138', 2),
  ('goodMoral', 'Certificate of Good Moral Character', 3),
  ('medicalCert', 'Medical / Health Certificate', 4),
  ('idPhotos', '2x2 ID Photos (2 pcs)', 5),
  ('immunization', 'Immunization Record', 6)
on conflict (key) do nothing;

create policy "office manages requirement catalog" on public.requirement_catalog
  for all to authenticated
  using (coalesce(public.is_admin_or_registrar(), false))
  with check (public.current_staff_role() = 'full_admin');
create policy "guardians read requirement catalog" on public.requirement_catalog
  for select to authenticated
  using (exists (select 1 from public.guardians g where g.id = (select auth.uid())));
create policy "mfa required" on public.requirement_catalog
  as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

create table public.student_requirements (
  student_id text not null references public.students (id) on delete cascade,
  school_year_id uuid not null references public.school_years (id) on delete cascade,
  requirement_key text not null references public.requirement_catalog (key),
  status text not null default 'missing' check (status in ('missing', 'submitted', 'waived')),
  received_at date,
  verified_by uuid,
  notes text,
  updated_at timestamptz not null default now(),
  primary key (student_id, school_year_id, requirement_key),
  -- A waiver always says why.
  constraint student_requirements_waiver_note check (status <> 'waived' or nullif(btrim(coalesce(notes, '')), '') is not null)
);
create index student_requirements_year_idx on public.student_requirements (school_year_id, status);
alter table public.student_requirements enable row level security;

create policy "office manages student requirements" on public.student_requirements
  for all to authenticated
  using (coalesce(public.is_admin_or_registrar(), false))
  with check (coalesce(public.is_admin_or_registrar(), false));
create policy "guardian reads linked student requirements" on public.student_requirements
  for select to authenticated
  using (public.is_guardian_of(student_id));
create policy "mfa required" on public.student_requirements
  as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- Who verified and when are set by the database, not by the browser.
create or replace function private.student_requirements_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'missing' then
      new.received_at := null;
      new.verified_by := null;
    else
      new.verified_by := auth.uid();
      if new.status = 'submitted' then
        new.received_at := coalesce(new.received_at, (now() at time zone 'Asia/Manila')::date);
      else
        new.received_at := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.student_requirements_stamp() from public, anon, authenticated;
create trigger student_requirements_stamp before insert or update on public.student_requirements
  for each row execute function private.student_requirements_stamp();

-- Conditional enrollment (missing requirements at confirmation).
alter table public.enrollments
  add column if not exists conditional_deadline date,
  add column if not exists conditional_note text;

-- ─── Office-printed pickup pass (for guardians without a phone) ───
-- Replaces the old printable pass in Student Management, which used the pre-Phase-5A QR format
-- the guard scanner no longer accepts. The office sees which guardians can have a pass; the QR
-- secret is handed out only when "Print pass" is pressed, which is audit-logged and tells the
-- guardian in the app. A lost printout is cancelled with Guardian Security -> New QR code.
create or replace function public.office_pickup_pass_links(p_student_id text)
returns table (link_id uuid, guardian_name text, relationship text, is_primary boolean, printable boolean, reason text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_verified_office();
  return query
    select sg.id, g.full_name, sg.relationship, coalesce(sg.is_primary_contact, false),
           coalesce(sg.can_pickup, true) and sg.access_status = 'active',
           case when not coalesce(sg.can_pickup, true) then 'Not allowed to pick up'
                when sg.access_status <> 'active' then 'Pickup suspended' end
    from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student_id
    order by coalesce(sg.is_primary_contact, false) desc, g.full_name;
end;
$$;

create or replace function public.issue_pickup_pass(p_link_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_link record;
  v_secret text;
begin
  perform private.require_verified_office();
  select sg.id, sg.guardian_id, sg.student_id, sg.relationship, sg.access_status, sg.can_pickup, g.full_name
    into v_link
  from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
  where sg.id = p_link_id;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if not coalesce(v_link.can_pickup, true) or v_link.access_status <> 'active' then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  select secret into v_secret from private.pickup_qr_secrets where student_guardian_id = p_link_id;
  if v_secret is null then
    return jsonb_build_object('error', 'no_code');
  end if;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'pickup_pass_printed', v_link.guardian_id,
          jsonb_build_object('link_id', p_link_id, 'student_id', v_link.student_id));
  perform private.notify(v_link.guardian_id, 'pickup_pass_printed',
    'Printed pickup pass for ' || private.student_display_name(v_link.student_id),
    'The school office printed a pickup pass (QR code) for you. Keep it safe. If you did not ask for it, '
      || 'or the paper is lost, tell the school office so they can issue a new code.');
  return jsonb_build_object(
    'secret', v_secret,
    'guardian_name', v_link.full_name,
    'relationship', v_link.relationship,
    'student_name', private.student_display_name(v_link.student_id)
  );
end;
$$;

revoke execute on function public.office_pickup_pass_links(text) from public, anon;
revoke execute on function public.issue_pickup_pass(uuid) from public, anon;
grant  execute on function public.office_pickup_pass_links(text) to authenticated;
grant  execute on function public.issue_pickup_pass(uuid) to authenticated;

grant select, insert, update, delete on public.requirement_catalog to authenticated;
grant select, insert, update, delete on public.student_requirements to authenticated;
revoke all on public.requirement_catalog from anon;
revoke all on public.student_requirements from anon;

commit;
