-- Rollback for 20261108010000_phase6b_fix_campus_status.sql
-- Restores the original Phase 6B definition. NOTE: that version fails at run time
-- ("full_name is ambiguous"); only use this to return exactly to the earlier state.
-- To remove late pickup entirely, use rollbacks/20261107030000_phase6b_late_pickup.sql.

begin;

create or replace function public.campus_status_today()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_closed record;
begin
  perform private.require_verified_gate_staff();
  select closed_at, closed_by, summary into v_closed from private.dismissal_days where day = v_today;
  return jsonb_build_object(
    'day', v_today,
    'late_pickup_time', coalesce(private.pickup_setting('late_pickup_time'), '17:00'),
    'closed_at', v_closed.closed_at,
    'closed_by', (select full_name from public.employees e join public.profiles p on p.employee_id = e.id
                  where p.id = v_closed.closed_by),
    'students', coalesce((select jsonb_agg(to_jsonb(r) order by r.grade_level, r.student_name)
                          from private.campus_rows(v_today) r), '[]'::jsonb)
  );
end;
$$;

commit;
