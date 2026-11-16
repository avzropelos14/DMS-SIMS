-- Rollback for 20261116030000_late_notice_siblings.sql
-- Back to one notice per student (no brothers or sisters included); the three functions are
-- restored exactly as they were before.

begin;

create or replace function public.notify_parent_late(p_student_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_id bigint;
  v_guardian uuid;
  v_name text;
  v_phone text;
begin
  perform private.require_verified_gate_staff();
  if not exists (select 1 from public.students where id = p_student_id and status::text = 'Active') then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from private.late_notices
             where student_id = p_student_id and day = v_today and sent_at > now() - interval '10 minutes') then
    return jsonb_build_object('error', 'too_soon');
  end if;
  insert into private.late_notices (student_id, day, sent_by) values (p_student_id, v_today, auth.uid())
  returning id into v_id;
  v_name := private.student_display_name(p_student_id);
  select contact_phone into v_phone from public.school_settings limit 1;
  for v_guardian in select guardian_id from public.student_guardians where student_id = p_student_id loop
    perform private.notify(v_guardian, 'late_pickup',
      v_name || ' is still at school',
      v_name || ' has not been picked up yet (' || private.manila_time(now()) || '). Please come to the school or call the school'
        || coalesce(' at ' || nullif(btrim(v_phone), ''), '') || ' to arrange the pickup.');
  end loop;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'late_pickup_notice', null,
          jsonb_build_object('student_id', p_student_id, 'notice_id', v_id));
  return jsonb_build_object('ok', true, 'notice_id', v_id);
end;
$$;

create or replace function public.claim_late_notice_email(p_notice_id bigint, p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_n record;
  v_emails jsonb;
  v_phone text;
begin
  update private.late_notices set emailed_at = now()
  where id = p_notice_id and sent_by = p_staff_id and emailed_at is null and sent_at > now() - interval '10 minutes'
  returning student_id into v_n;
  if not found then
    return null;
  end if;
  select coalesce(jsonb_agg(distinct g.email), '[]'::jsonb) into v_emails
  from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
  where sg.student_id = v_n.student_id and nullif(btrim(coalesce(g.email, '')), '') is not null;
  select contact_phone into v_phone from public.school_settings limit 1;
  return jsonb_build_object('emails', v_emails, 'student_name', private.student_display_name(v_n.student_id),
                            'school_phone', nullif(btrim(coalesce(v_phone, '')), ''),
                            'when', private.manila_time(now()));
end;
$$;

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

drop function if exists private.late_batch_names_for(bigint, uuid);
drop function if exists private.late_batch_students(bigint);
drop function if exists private.join_names(text[]);
drop index if exists private.late_notices_batch_idx;
alter table private.late_notices drop column if exists batch_id;

commit;
