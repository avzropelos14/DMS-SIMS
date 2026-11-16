-- Late pickup notice covers brothers and sisters. When staff press "Notify parent" for one
-- student, every other child of that student's parents who is also still on campus today
-- (and wasn't notified in the last 10 minutes) gets a notice in the same batch. Each parent
-- gets ONE in-app notice, ONE email and ONE SMS naming only their own children in the batch.
-- Additive. Rollback: supabase/rollbacks/20261116030000_late_notice_siblings.sql

begin;

alter table private.late_notices add column if not exists batch_id uuid;
create index if not exists late_notices_batch_idx on private.late_notices (batch_id);

-- "Ana", "Ana and Ben", "Ana, Ben and Carlo".
create or replace function private.join_names(p_names text[])
returns text language sql immutable set search_path = '' as $$
  select case
    when coalesce(array_length(p_names, 1), 0) = 0 then ''
    when array_length(p_names, 1) = 1 then p_names[1]
    else array_to_string(p_names[1:array_length(p_names, 1) - 1], ', ') || ' and ' || p_names[array_length(p_names, 1)]
  end;
$$;
revoke execute on function private.join_names(text[]) from public, anon, authenticated;

-- The students in a notice batch (a notice from before batches counts as its own batch).
create or replace function private.late_batch_students(p_notice_id bigint)
returns table (notice_id bigint, student_id text)
language sql stable security definer set search_path = '' as $$
  select n2.id, n2.student_id
  from private.late_notices n1
  join private.late_notices n2 on (n1.batch_id is not null and n2.batch_id = n1.batch_id) or n2.id = n1.id
  where n1.id = p_notice_id;
$$;
revoke execute on function private.late_batch_students(bigint) from public, anon, authenticated;

-- For one guardian: the names of their own children in a batch, and how many.
create or replace function private.late_batch_names_for(p_notice_id bigint, p_guardian uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'names', private.join_names(array_agg(private.student_display_name(b.student_id) order by private.student_display_name(b.student_id))),
    'count', count(*))
  from private.late_batch_students(p_notice_id) b
  join public.student_guardians sg on sg.student_id = b.student_id and sg.guardian_id = p_guardian;
$$;
revoke execute on function private.late_batch_names_for(bigint, uuid) from public, anon, authenticated;

-- Staff: notify the parents that a student (and their brothers or sisters still on campus)
-- haven't been picked up. Same checks as Phase 6B; returns the pressed student's notice_id
-- plus the names of the other children included.
create or replace function public.notify_parent_late(p_student_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_batch uuid := gen_random_uuid();
  v_id bigint;
  v_sib record;
  v_also text[] := '{}';
  v_g record;
  v_n jsonb;
  v_phone text;
  v_when text := private.manila_time(now());
begin
  perform private.require_verified_gate_staff();
  if not exists (select 1 from public.students where id = p_student_id and status::text = 'Active') then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from private.late_notices
             where student_id = p_student_id and day = v_today and sent_at > now() - interval '10 minutes') then
    return jsonb_build_object('error', 'too_soon');
  end if;

  insert into private.late_notices (student_id, day, sent_by, batch_id) values (p_student_id, v_today, auth.uid(), v_batch)
  returning id into v_id;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'late_pickup_notice', null,
          jsonb_build_object('student_id', p_student_id, 'notice_id', v_id));

  -- Brothers and sisters (sharing a parent) who are also still on campus today.
  for v_sib in
    select r.student_id
    from private.campus_rows(v_today) r
    where r.state = 'on_campus' and r.student_id <> p_student_id
      and r.student_id in (select sg2.student_id from public.student_guardians sg1
                           join public.student_guardians sg2 on sg2.guardian_id = sg1.guardian_id
                           where sg1.student_id = p_student_id)
      and not exists (select 1 from private.late_notices ln
                      where ln.student_id = r.student_id and ln.day = v_today and ln.sent_at > now() - interval '10 minutes')
  loop
    insert into private.late_notices (student_id, day, sent_by, batch_id) values (v_sib.student_id, v_today, auth.uid(), v_batch);
    insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
    values (auth.uid(), public.current_staff_role()::text, 'late_pickup_notice', null,
            jsonb_build_object('student_id', v_sib.student_id, 'notice_id', v_id, 'with_sibling_of', p_student_id));
    v_also := v_also || private.student_display_name(v_sib.student_id);
  end loop;

  -- One notice per parent, naming only their own children in this batch.
  select contact_phone into v_phone from public.school_settings limit 1;
  for v_g in
    select distinct sg.guardian_id
    from private.late_notices ln join public.student_guardians sg on sg.student_id = ln.student_id
    where ln.batch_id = v_batch
  loop
    v_n := private.late_batch_names_for(v_id, v_g.guardian_id);
    perform private.notify(v_g.guardian_id, 'late_pickup',
      (v_n ->> 'names') || case when (v_n ->> 'count')::int > 1 then ' are' else ' is' end || ' still at school',
      (v_n ->> 'names') || case when (v_n ->> 'count')::int > 1 then ' have' else ' has' end
        || ' not been picked up yet (' || v_when || '). Please come to the school or call the school'
        || coalesce(' at ' || nullif(btrim(v_phone), ''), '') || ' to arrange the pickup.');
  end loop;

  return jsonb_build_object('ok', true, 'notice_id', v_id, 'also_notified', to_jsonb(v_also));
end;
$$;

-- Email claim: claims every notice in the batch, and returns one recipient per parent email
-- with that parent's own children's names. 'emails' and 'student_name' are kept as before.
create or replace function public.claim_late_notice_email(p_notice_id bigint, p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_claimed integer;
  v_emails jsonb;
  v_recipients jsonb;
  v_phone text;
begin
  update private.late_notices set emailed_at = now()
  where id in (select b.notice_id from private.late_batch_students(p_notice_id) b)
    and sent_by = p_staff_id and emailed_at is null and sent_at > now() - interval '10 minutes';
  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('email', x.email, 'student_name', x.n ->> 'names', 'count', (x.n ->> 'count')::int)), '[]'::jsonb),
         coalesce(jsonb_agg(x.email), '[]'::jsonb)
    into v_recipients, v_emails
  from (
    select distinct on (lower(g.email)) g.email, private.late_batch_names_for(p_notice_id, g.id) as n
    from private.late_batch_students(p_notice_id) b
    join public.student_guardians sg on sg.student_id = b.student_id
    join public.guardians g on g.id = sg.guardian_id
    where nullif(btrim(coalesce(g.email, '')), '') is not null
    order by lower(g.email)
  ) x;

  select contact_phone into v_phone from public.school_settings limit 1;
  return jsonb_build_object('emails', v_emails, 'recipients', v_recipients,
                            'student_name', (select private.student_display_name(student_id) from private.late_notices where id = p_notice_id),
                            'school_phone', nullif(btrim(coalesce(v_phone, '')), ''),
                            'when', private.manila_time(now()));
end;
$$;

-- SMS claim: same as 20261113010000, except late_pickup covers the whole batch and each
-- recipient carries their own children's names.
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
  v_n jsonb;
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
      from private.late_batch_students(p_ref::bigint) b
      join public.student_guardians sg on sg.student_id = b.student_id
      join public.guardians g on g.id = sg.guardian_id
      where private.ph_mobile(g.phone) is not null
    loop
      v_log := private.sms_claim(p_kind, p_ref, v_g.id);
      if v_log is not null then
        v_n := private.late_batch_names_for(p_ref::bigint, v_g.id);
        v_recipients := v_recipients || jsonb_build_object('log_id', v_log, 'phone', v_g.phone,
                                                           'student_name', v_n ->> 'names', 'count', (v_n ->> 'count')::int);
      end if;
    end loop;
    return jsonb_build_object('recipients', v_recipients,
      'student_name', private.student_display_name(v_student),
      'when', to_char(now() at time zone 'Asia/Manila', 'FMHH12:MI AM'),
      'school_phone', v_school_phone);

  elsif p_kind = 'test' then
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

commit;
