-- Rollback for supabase/migrations/20261103150000_phase1_lock_down_rpc.sql
-- Restores the exact definitions and grants that were live on 2026-11-03.

begin;

create or replace function public.next_receipt_number()
returns text
language sql
security definer
set search_path to 'public'
as $function$
  select 'RCT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0');
$function$;

create or replace function public.claim_or_receipt_number(p_school_year_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_old text;
  v_end text;
BEGIN
  SELECT or_next_number, or_range_end INTO v_old, v_end
  FROM school_years WHERE id = p_school_year_id
  FOR UPDATE;

  IF v_old IS NULL OR v_end IS NULL OR v_old > v_end THEN
    RAISE EXCEPTION 'No OR range is configured, or the range has been fully issued, for this school year.';
  END IF;

  UPDATE school_years
  SET or_next_number = CASE
        WHEN v_old ~ '^[0-9]+$' THEN lpad((v_old::int + 1)::text, length(v_old), '0')
        ELSE v_old
      END
  WHERE id = p_school_year_id;

  RETURN v_old;
END;
$function$;

grant execute on function public.next_receipt_number()               to public, authenticated;
grant execute on function public.claim_or_receipt_number(uuid)       to public, authenticated;
grant execute on function public.advises_class_section_subject(uuid) to public;
revoke execute on function public.advises_class_section_subject(uuid) from authenticated;

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'v', 'm') loop
    execute format('grant truncate, trigger, references, maintain on public.%I to anon', r.relname);
  end loop;
end $$;
alter default privileges for role postgres in schema public
  grant truncate, trigger, references, maintain on tables to anon;

commit;
