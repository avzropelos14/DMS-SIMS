-- Guard Portal call list: each phone number once. The list draws on the parent accounts, the
-- student's own copy of the contact, and the mother / father / guardian details from the
-- enrollment form, which usually repeat the same number. Numbers are compared by digits
-- (0917..., +63917..., spaced or dashed are the same number); the parent-account entry wins,
-- then the student's record, then the enrollment form. Entries without a number are left out
-- (nothing to call). Everything else is unchanged from Phase 6B.
-- Rollback: supabase/rollbacks/20261116020000_call_list_dedupe.sql

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

  select coalesce(jsonb_agg(d.c order by d.source, d.is_primary desc, d.c ->> 'name'), '[]'::jsonb) into v_list
  from (
    select distinct on (q.phone_key) q.c, q.source, q.is_primary
    from (
      select src.c, src.source, coalesce((src.c ->> 'primary')::boolean, false) as is_primary,
             coalesce(private.ph_mobile(src.c ->> 'phone'),
                      nullif(regexp_replace(coalesce(src.c ->> 'phone', ''), '[^0-9]', '', 'g'), '')) as phone_key
      from (
        select '1_guardian' as source,
               jsonb_build_object('source', '1_guardian', 'name', g.full_name, 'relationship', sg.relationship,
                                  'phone', g.phone, 'primary', coalesce(sg.is_primary_contact, false)) as c
        from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
        where sg.student_id = p_student_id
        union all
        select '2_record',
               jsonb_build_object('source', '2_record', 'name', v_s.guardian_name, 'relationship',
                                  coalesce(v_s.guardian_relationship, 'Guardian on record'), 'phone', v_s.guardian_phone,
                                  'primary', false)
        union all
        select '3_parent',
               jsonb_build_object('source', '3_parent',
                                  'name', nullif(btrim(coalesce(x.info ->> 'first_name', '') || ' ' || coalesce(x.info ->> 'last_name', '')), ''),
                                  'relationship', x.label, 'phone', x.info ->> 'phone', 'primary', false)
        from (values ('Mother', v_s.mother_info), ('Father', v_s.father_info), ('Guardian', v_s.guardian_info)) as x(label, info)
        where jsonb_typeof(x.info) = 'object'
      ) src
    ) q
    where q.phone_key is not null
    order by q.phone_key, q.source, q.is_primary desc
  ) d;

  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'call_list_viewed', null,
          jsonb_build_object('student_id', p_student_id));
  return v_list;
end;
$$;

commit;
