-- Phase 4 (H1, H2, H3, M2): tighten database permissions.
-- Additive only: new RESTRICTIVE policies (they can only take access away), triggers and
-- functions. No existing policy, table or column is dropped or renamed.
-- Rollback: supabase/rollbacks/20261106020000_phase4_tighten_permissions.sql

begin;

-- ─── H3 helper: which students a teacher may see ───
-- Students enrolled in a section the caller advises or teaches (any school year).
create or replace function public.teacher_sees_student(p_student_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.enrollments e
    join public.class_sections cs
      on cs.school_year_id = e.school_year_id
     and cs.grade_level = e.grade_level
     and cs.section_name = e.section
    where e.student_id = p_student_id
      and (
        cs.adviser_id = public.current_employee_id()
        or exists (
          select 1 from public.class_section_subjects css
          where css.class_section_id = cs.id
            and css.teacher_id = public.current_employee_id()
            and coalesce(css.archived, false) = false
        )
      )
  );
$$;
revoke execute on function public.teacher_sees_student(text) from public, anon;
grant  execute on function public.teacher_sees_student(text) to authenticated;

-- ─── H3: least-privilege reads for staff ───
-- Non-staff (parents, students) have current_staff_role() = null and are unaffected:
-- their own existing policies still decide what they see.
create policy "staff read scope" on public.students
  as restrictive for select to authenticated
  using (
    (select public.current_staff_role()) is null
    or (select public.current_staff_role()) in ('full_admin', 'registrar', 'cashier')
    or ((select public.current_staff_role()) = 'teacher' and public.teacher_sees_student(id))
  );

do $$
declare t text;
begin
  -- Guardian, link, account and pickup data: admin and registrar only among staff.
  -- Guards use guard_record_pickup() / guard_pickup_history() below instead.
  foreach t in array array['guardians', 'student_guardians', 'student_accounts',
                           'pickup_authorizations', 'pickup_qr_codes', 'pickup_logs'] loop
    execute format(
      'create policy "staff read scope" on public.%I as restrictive for select to authenticated '
      'using ((select public.current_staff_role()) is null '
      'or (select public.current_staff_role()) in (''full_admin'', ''registrar''))', t);
  end loop;
end $$;

-- ─── H1: a parent may only revoke their own authorization for their own child ───
create policy "guardian update scope" on public.pickup_authorizations
  as restrictive for update to authenticated
  using (
    coalesce(public.is_admin_or_registrar(), false)
    or (authorized_by = (select auth.uid()) and public.is_guardian_of(student_id))
  )
  with check (
    coalesce(public.is_admin_or_registrar(), false)
    or (authorized_by = (select auth.uid()) and public.is_guardian_of(student_id))
  );

create or replace function private.pickup_authorizations_limit_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Service role / SQL Editor (no auth.uid()) and admin/registrar are not limited.
  if auth.uid() is null or coalesce(public.is_admin_or_registrar(), false) then
    return new;
  end if;
  -- Everyone else (parents): nothing may change except status, and only to 'revoked'.
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status')
     or new.status is distinct from 'revoked' then
    raise exception 'A pickup authorization can only be revoked here.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.pickup_authorizations_limit_update() from public, anon, authenticated;

create trigger pickup_authorizations_limit_update
  before update on public.pickup_authorizations
  for each row execute function private.pickup_authorizations_limit_update();

-- ─── H2: a guardian may only change their own phone number ───
create or replace function private.guardians_limit_self_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(public.is_admin_or_registrar(), false) then
    return new;
  end if;
  -- Compares every column (including ones added later) except phone and updated_at.
  if (to_jsonb(new) - 'phone' - 'updated_at') is distinct from (to_jsonb(old) - 'phone' - 'updated_at') then
    raise exception 'Only the phone number can be changed here. Please contact the school office for other changes.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.guardians_limit_self_update() from public, anon, authenticated;

create trigger guardians_limit_self_update
  before update on public.guardians
  for each row execute function private.guardians_limit_self_update();

-- ─── M2: pickup_logs is append-only (corrections are new rows) ───
create or replace function private.pickup_logs_block_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Deleting a student cascades to their logs; that cascade runs inside a trigger.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Pickup logs cannot be edited or deleted. Record a correction as a new entry.'
    using errcode = '42501';
end;
$$;
revoke execute on function private.pickup_logs_block_changes() from public, anon, authenticated;

create trigger pickup_logs_append_only
  before update or delete on public.pickup_logs
  for each row execute function private.pickup_logs_block_changes();

-- ─── M2: only the cashier (and full admin, for corrections) write payments ───
create policy "payment writers" on public.payments
  as restrictive for insert to authenticated
  with check ((select public.current_staff_role()) in ('cashier', 'full_admin'));
create policy "payment editors" on public.payments
  as restrictive for update to authenticated
  using ((select public.current_staff_role()) in ('cashier', 'full_admin'))
  with check ((select public.current_staff_role()) in ('cashier', 'full_admin'));
create policy "payment removers" on public.payments
  as restrictive for delete to authenticated
  using ((select public.current_staff_role()) in ('cashier', 'full_admin'));

-- ─── Guards: narrow functions instead of table access ───
-- Validates a scanned pickup QR exactly like the Guard portal used to, then records the
-- pickup. Returns {record:{...}} with only what the guard screen shows, or {error:code}.
create or replace function public.guard_record_pickup(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_type text := p_payload ->> 'type';
  v_student_id text := p_payload ->> 'studentId';
  v_relationship text := p_payload ->> 'relationship';
  v_guardian_uuid uuid;
  v_student record;
  v_link record;
  v_auth record;
  v_log record;
  v_school_year uuid;
  v_guardian_name text;
  v_method text;
  v_guardian_id uuid;
  v_auth_id text;
begin
  if coalesce(public.is_staff_role('guard'), false) is not true or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select s.id, s.first_name, s.last_name, s.grade_level into v_student
  from public.students s
  where s.id = v_student_id and s.status = 'Active';
  if not found then
    return jsonb_build_object('error', 'student_not_found');
  end if;

  if v_type = 'permanent' then
    begin
      v_guardian_uuid := (p_payload ->> 'guardianId')::uuid;
    exception when others then
      return jsonb_build_object('error', 'guardian_not_linked');
    end;
    select sg.guardian_id, g.full_name into v_link
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = v_student_id
      and sg.guardian_id = v_guardian_uuid
      and coalesce(sg.can_pickup, true);
    if not found then
      return jsonb_build_object('error', 'guardian_not_linked');
    end if;
    v_guardian_name := coalesce(v_link.full_name, p_payload ->> 'guardianName');
    v_method := 'qr_persistent';
    v_guardian_id := v_link.guardian_id;
  elsif v_type = 'temporary' then
    select pa.id, pa.guardian_name, pa.valid_until, pa.status into v_auth
    from public.pickup_authorizations pa
    where pa.id = p_payload ->> 'authId' and pa.student_id = v_student_id;
    if not found or v_auth.status is distinct from 'active' then
      return jsonb_build_object('error', 'authorization_invalid');
    end if;
    if v_auth.valid_until < now() then
      return jsonb_build_object('error', 'authorization_expired');
    end if;
    v_guardian_name := v_auth.guardian_name;
    v_method := 'qr_authorization';
    v_auth_id := v_auth.id;
  else
    return jsonb_build_object('error', 'invalid_code');
  end if;

  select sy.id into v_school_year from public.school_years sy where sy.is_current limit 1;

  insert into public.pickup_logs
    (student_id, school_year_id, method, guardian_id, pickup_authorization_id,
     picked_up_by_name, relationship, scanned_by, notes)
  values
    (v_student.id, v_school_year, v_method, v_guardian_id, v_auth_id,
     v_guardian_name, v_relationship, public.current_employee_id(), null)
  returning id, scanned_at into v_log;

  return jsonb_build_object('record', jsonb_build_object(
    'id', v_log.id,
    'student_id', v_student.id,
    'student_name', v_student.first_name || ' ' || v_student.last_name,
    'grade_level', v_student.grade_level,
    'guardian_name', v_guardian_name,
    'relationship', v_relationship,
    'scanned_at', v_log.scanned_at
  ));
end;
$$;

-- The guard's recent-pickups list: names and grade only.
create or replace function public.guard_pickup_history(p_limit integer default 100)
returns table (
  id uuid,
  student_id text,
  student_name text,
  grade_level text,
  guardian_name text,
  relationship text,
  guardian_id uuid,
  scanned_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if coalesce(public.is_staff_role('guard'), false) is not true or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select l.id,
           l.student_id,
           coalesce(s.first_name || ' ' || s.last_name, l.student_id),
           coalesce(s.grade_level, '—'),
           coalesce(g.full_name, l.picked_up_by_name, 'Unknown'),
           l.relationship,
           l.guardian_id,
           l.scanned_at
    from public.pickup_logs l
    left join public.students s on s.id = l.student_id
    left join public.guardians g on g.id = l.guardian_id
    order by l.scanned_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke execute on function public.guard_record_pickup(jsonb)     from public, anon;
revoke execute on function public.guard_pickup_history(integer)  from public, anon;
grant  execute on function public.guard_record_pickup(jsonb)     to authenticated;
grant  execute on function public.guard_pickup_history(integer)  to authenticated;

commit;
