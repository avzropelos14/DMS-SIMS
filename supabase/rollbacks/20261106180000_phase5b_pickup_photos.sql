-- Rollback for supabase/migrations/20261106180000_phase5b_pickup_photos.sql
-- Deploy the pre-5B website first. Photo FILES are not deleted by this script: empty the
-- guardian-photos bucket in the Supabase dashboard (Storage) first if you want them gone,
-- otherwise the bucket and its files stay (only the database side is rolled back).
-- To restore the 5A guard lookup exactly, re-run the pickup_qr_lookup definition from
-- supabase/migrations/20261106120000_phase5a_secure_pickup_qr.sql after this script; the
-- 5B version only adds two extra fields, so leaving it in place is harmless.

begin;

drop policy if exists "guardian photos staff read" on storage.objects;
drop policy if exists "guardian photos office insert" on storage.objects;
drop policy if exists "guardian photos office update" on storage.objects;
drop policy if exists "guardian photos office delete" on storage.objects;
drop policy if exists "guardian photos parent submit" on storage.objects;
drop policy if exists "mfa required for guardian photos" on storage.objects;

drop function if exists public.submit_my_guardian_photo(text);
drop function if exists public.my_guardian_photo_status();
drop function if exists public.pending_guardian_photos();
drop function if exists public.review_guardian_photo(uuid, boolean);
drop function if exists public.set_guardian_photo(uuid, text);
drop function if exists public.remove_guardian_photo(uuid);
drop function if exists public.set_student_photo(text, text);
drop function if exists private.require_verified_office();

drop table if exists private.guardian_photo_submissions;

alter table public.guardians drop constraint if exists guardians_photo_status_check;
alter table public.guardians
  drop column if exists photo_path,
  drop column if exists photo_status,
  drop column if exists photo_approved_by,
  drop column if exists photo_approved_at;
alter table public.students drop column if exists photo_path;

commit;
