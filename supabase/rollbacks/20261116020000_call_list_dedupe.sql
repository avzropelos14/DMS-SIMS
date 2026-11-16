-- Rollback for 20261116020000_call_list_dedupe.sql
-- Restores the Phase 6B call list (every source listed, repeats included).

begin;

create or replace function public.student_call_list(p_student_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s record;
  v_list jsonb;
begin
  perform private.require_verified_gate_staff();
  select id, guardian_name, guardian_relationship, guardian_phone, mother_info, father_info, guardian_info
    into v_s from public.students where id = p_student_id;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(c order by c ->> 'source', c ->> 'name'), '[]'::jsonb) into v_list
  from (
    select jsonb_build_object('source', '1_guardian', 'name', g.full_name, 'relationship', sg.relationship,
                              'phone', g.phone, 'primary', coalesce(sg.is_primary_contact, false)) as c
    from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student_id
    union all
    select jsonb_build_object('source', '2_record', 'name', v_s.guardian_name, 'relationship',
                              coalesce(v_s.guardian_relationship, 'Guardian on record'), 'phone', v_s.guardian_phone, 'primary', false)
    where nullif(btrim(coalesce(v_s.guardian_phone, '')), '') is not null
    union all
    select jsonb_build_object('source', '3_parent', 'name', nullif(btrim(coalesce(x.info ->> 'first_name', '') || ' ' || coalesce(x.info ->> 'last_name', '')), ''), 'relationship', x.label,
                              'phone', x.info ->> 'phone', 'primary', false)
    from (values ('Mother', v_s.mother_info), ('Father', v_s.father_info), ('Guardian', v_s.guardian_info)) as x(label, info)
    where jsonb_typeof(x.info) = 'object' and nullif(btrim(coalesce(x.info ->> 'phone', '')), '') is not null
  ) q;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'call_list_viewed', null,
          jsonb_build_object('student_id', p_student_id));
  return v_list;
end;
$$;

commit;
