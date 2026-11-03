-- Baseline of the PRODUCTION public schema (project SIMS, eegfeeckeeqexytbslnv), 2026-11-03.
-- Generated from the Postgres catalog (pg_dump unavailable). Schema only: NO data, NO secrets.
-- Reference/rebuild aid, not a migration: it has not been run as one file and may need ordering tweaks.

-- ENUMS

create type public.app_role as enum ('full_admin', 'registrar', 'cashier', 'teacher', 'guard');
create type public.student_status as enum ('Active', 'Graduate', 'Dropped', 'Transferred', 'Archived');
create type public.employee_status as enum ('active', 'on-leave', 'inactive');
create type public.employment_type as enum ('full-time', 'part-time', 'contractual');
create type public.payment_method as enum ('Cash', 'GCash', 'Bank Transfer', 'Card', 'Other');
create type public.event_type as enum ('Academic', 'Religious/Spiritual', 'Sports & Athletics', 'Cultural', 'Parent Meeting', 'Holiday/Break', 'Other');

-- SEQUENCES

create sequence if not exists public.receipt_number_seq;

-- TABLES

create table public.activity_log (
  id uuid not null default gen_random_uuid(),
  activity_type text not null,
  message text not null,
  actor_id uuid,
  created_at timestamp with time zone not null default now()
);

create table public.class_section_subjects (
  id uuid not null default gen_random_uuid(),
  class_section_id uuid not null,
  subject_id uuid not null,
  teacher_id text,
  archived boolean not null default false
);

create table public.class_sections (
  id uuid not null default gen_random_uuid(),
  school_year_id uuid not null,
  grade_level text not null,
  section_name text not null,
  adviser_id text,
  room text,
  created_at timestamp with time zone not null default now()
);

create table public.departments (
  id uuid not null default gen_random_uuid(),
  name text not null
);

create table public.employees (
  id text not null,
  full_name text not null,
  "position" text not null,
  department_id uuid,
  email text,
  phone text not null,
  education text,
  employment_type employment_type,
  date_hired date not null,
  status employee_status not null default 'active'::employee_status,
  address text,
  license_no text,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone
);

create table public.enrollment_fees (
  school_year_id uuid not null,
  grade_level text not null,
  fee numeric not null,
  updated_at timestamp with time zone not null default now()
);

create table public.enrollments (
  id uuid not null default gen_random_uuid(),
  student_id text not null,
  school_year_id uuid not null,
  grade_level text not null,
  section text,
  status text not null default 'pending'::text,
  enrollment_type text not null default 'Continuing Student'::text,
  confirmed_at timestamp with time zone,
  confirmed_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.fee_items (
  id uuid not null default gen_random_uuid(),
  school_year_id uuid not null,
  name text not null,
  category text not null,
  default_amount numeric(12,2)
);

create table public.grade_reopen_requests (
  id uuid not null default gen_random_uuid(),
  student_id text not null,
  class_section_subject_id uuid not null,
  school_year_id uuid not null,
  quarter text not null,
  requested_by text,
  status text not null default 'pending'::text,
  requested_at timestamp with time zone not null default now(),
  resolved_at timestamp with time zone,
  resolved_by uuid,
  notes text
);

create table public.grades (
  id uuid not null default gen_random_uuid(),
  student_id text not null,
  school_year_id uuid not null,
  class_section_subject_id uuid not null,
  q1 numeric(5,2),
  q2 numeric(5,2),
  q3 numeric(5,2),
  q4 numeric(5,2),
  final_grade numeric(5,2),
  updated_at timestamp with time zone not null default now()
);

create table public.grading_periods (
  id uuid not null default gen_random_uuid(),
  school_year_id uuid not null,
  quarter text not null,
  is_open boolean not null default false,
  opened_at timestamp with time zone,
  opened_by uuid,
  updated_at timestamp with time zone not null default now()
);

create table public.guardians (
  id uuid not null,
  full_name text not null,
  email text not null,
  phone text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.messages (
  id uuid not null default gen_random_uuid(),
  student_id text,
  sender_employee_id text,
  recipient_guardian_id uuid not null,
  subject text not null,
  body text not null,
  sent_at timestamp with time zone not null default now(),
  read_at timestamp with time zone
);

create table public.mfa_codes (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  code_hash text not null,
  attempts integer not null default 0,
  consumed boolean not null default false,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now()
);

create table public.payments (
  id uuid not null default gen_random_uuid(),
  student_id text not null,
  school_year_id uuid not null,
  amount numeric(12,2) not null,
  method payment_method not null,
  or_number text,
  paid_at timestamp with time zone not null default now(),
  recorded_by text,
  notes text,
  charge_id uuid,
  description text,
  receipt_number text,
  category text not null default 'tuition'::text
);

create table public.pickup_authorizations (
  id text not null,
  student_id text not null,
  authorized_by uuid not null,
  guardian_name text not null,
  relationship text not null,
  phone text not null,
  qr_token text not null,
  valid_until timestamp with time zone not null,
  status text not null default 'active'::text,
  created_at timestamp with time zone not null default now()
);

create table public.pickup_logs (
  id uuid not null default gen_random_uuid(),
  student_id text not null,
  school_year_id uuid,
  method text not null,
  pickup_qr_code_id uuid,
  pickup_authorization_id text,
  guardian_id uuid,
  picked_up_by_name text,
  relationship text,
  scanned_by text not null,
  scanned_at timestamp with time zone not null default now(),
  notes text
);

create table public.pickup_qr_codes (
  id uuid not null default gen_random_uuid(),
  student_guardian_id uuid not null,
  qr_token text not null,
  status text not null default 'active'::text,
  issued_at timestamp with time zone not null default now(),
  revoked_at timestamp with time zone
);

create table public.profiles (
  id uuid not null,
  full_name text not null,
  email text not null,
  role app_role not null default 'teacher'::app_role,
  employee_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.role_definitions (
  role app_role not null,
  label text not null,
  access_note text not null
);

create table public.rooms (
  id uuid not null default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone not null default now()
);

create table public.schedules (
  id uuid not null default gen_random_uuid(),
  school_year_id uuid not null,
  grade_level text not null,
  section_name text not null,
  subject text not null,
  teacher text not null,
  days text[] not null,
  time_label text not null,
  room text,
  created_at timestamp with time zone not null default now()
);

create table public.scholarships (
  id uuid not null default gen_random_uuid(),
  student_id text not null,
  school_year_id uuid not null,
  scholarship_type text not null,
  amount numeric(12,2),
  percent_discount numeric(5,2),
  awarded_date date not null default CURRENT_DATE,
  notes text
);

create table public.school_events (
  id uuid not null default gen_random_uuid(),
  school_year_id uuid,
  title text not null,
  event_type event_type not null,
  event_date date not null,
  location text not null,
  audience text not null default 'All Grades'::text,
  created_at timestamp with time zone not null default now()
);

create table public.school_settings (
  id boolean not null default true,
  school_name text not null default 'Dumaguete Mission School'::text,
  school_motto text,
  school_address text,
  contact_email text,
  contact_phone text,
  email_notifications boolean not null default true,
  auto_backup boolean not null default true,
  two_factor boolean not null default false,
  sms_alerts boolean not null default false,
  parent_portal_access boolean not null default true,
  late_fee_auto_calc boolean not null default true,
  updated_at timestamp with time zone not null default now()
);

create table public.school_years (
  id uuid not null default gen_random_uuid(),
  label text not null,
  is_current boolean not null default false,
  created_at timestamp with time zone not null default now(),
  start_date date,
  end_date date,
  or_range_start text,
  or_range_end text,
  or_next_number text
);

create table public.student_accounts (
  student_id text not null,
  auth_user_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table public.student_charges (
  id uuid not null default gen_random_uuid(),
  student_id text not null,
  school_year_id uuid not null,
  fee_item_id uuid,
  description text not null,
  amount numeric(12,2) not null,
  due_date date,
  created_at timestamp with time zone not null default now()
);

create table public.student_guardians (
  id uuid not null default gen_random_uuid(),
  student_id text not null,
  guardian_id uuid not null,
  relationship text not null,
  is_primary_contact boolean not null default false,
  can_view_academics boolean not null default true,
  can_pickup boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table public.student_id_cards (
  id uuid not null default gen_random_uuid(),
  student_id text not null,
  school_year_id uuid not null,
  printed boolean not null default false,
  issued_date date,
  printed_by text,
  created_at timestamp with time zone not null default now()
);

create table public.students (
  id text not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  date_of_birth date not null,
  gender text not null,
  grade_level text not null,
  section text,
  status student_status not null default 'Active'::student_status,
  email text,
  phone text,
  home_address text,
  gpa numeric(5,2),
  enrolled_date date not null,
  school_year_id uuid,
  guardian_name text,
  guardian_relationship text,
  guardian_phone text,
  guardian_email text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  nationality text,
  religion text,
  previous_school text,
  suffix text,
  mother_info jsonb,
  father_info jsonb,
  guardian_info jsonb
);

create table public.subjects (
  id uuid not null default gen_random_uuid(),
  name text not null,
  curriculum text,
  hidden boolean not null default false
);

create table public.trusted_devices (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  token_hash text not null,
  user_agent text,
  created_at timestamp with time zone not null default now(),
  last_used_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null
);

create table public.tuition_fees (
  school_year_id uuid not null,
  annual_fee numeric(12,2) not null,
  updated_at timestamp with time zone not null default now(),
  grade_level text not null
);

-- CONSTRAINTS

alter table public.class_section_subjects add constraint class_section_subjects_class_section_id_subject_id_key UNIQUE (class_section_id, subject_id);
alter table public.class_sections add constraint class_sections_school_year_id_grade_level_section_name_key UNIQUE (school_year_id, grade_level, section_name);
alter table public.departments add constraint departments_name_key UNIQUE (name);
alter table public.employees add constraint employees_email_key UNIQUE (email);
alter table public.enrollments add constraint enrollments_student_id_school_year_id_key UNIQUE (student_id, school_year_id);
alter table public.grades add constraint grades_student_id_school_year_id_class_section_subject_id_key UNIQUE (student_id, school_year_id, class_section_subject_id);
alter table public.grading_periods add constraint grading_periods_school_year_id_quarter_key UNIQUE (school_year_id, quarter);
alter table public.guardians add constraint guardians_email_key UNIQUE (email);
alter table public.payments add constraint payments_receipt_number_key UNIQUE (receipt_number);
alter table public.pickup_authorizations add constraint pickup_authorizations_qr_token_key UNIQUE (qr_token);
alter table public.pickup_qr_codes add constraint pickup_qr_codes_qr_token_key UNIQUE (qr_token);
alter table public.pickup_qr_codes add constraint pickup_qr_codes_student_guardian_id_key UNIQUE (student_guardian_id);
alter table public.profiles add constraint profiles_email_key UNIQUE (email);
alter table public.rooms add constraint rooms_name_key UNIQUE (name);
alter table public.school_years add constraint school_years_label_key UNIQUE (label);
alter table public.student_accounts add constraint student_accounts_auth_user_id_key UNIQUE (auth_user_id);
alter table public.student_guardians add constraint student_guardians_student_id_guardian_id_key UNIQUE (student_id, guardian_id);
alter table public.student_id_cards add constraint student_id_cards_student_id_school_year_id_key UNIQUE (student_id, school_year_id);
alter table public.subjects add constraint subjects_name_key UNIQUE (name);
alter table public.trusted_devices add constraint trusted_devices_user_id_token_hash_key UNIQUE (user_id, token_hash);
alter table public.activity_log add constraint activity_log_pkey PRIMARY KEY (id);
alter table public.class_section_subjects add constraint class_section_subjects_pkey PRIMARY KEY (id);
alter table public.class_sections add constraint class_sections_pkey PRIMARY KEY (id);
alter table public.departments add constraint departments_pkey PRIMARY KEY (id);
alter table public.employees add constraint employees_pkey PRIMARY KEY (id);
alter table public.enrollment_fees add constraint enrollment_fees_pkey PRIMARY KEY (school_year_id, grade_level);
alter table public.enrollments add constraint enrollments_pkey PRIMARY KEY (id);
alter table public.fee_items add constraint fee_items_pkey PRIMARY KEY (id);
alter table public.grade_reopen_requests add constraint grade_reopen_requests_pkey PRIMARY KEY (id);
alter table public.grades add constraint grades_pkey PRIMARY KEY (id);
alter table public.grading_periods add constraint grading_periods_pkey PRIMARY KEY (id);
alter table public.guardians add constraint guardians_pkey PRIMARY KEY (id);
alter table public.messages add constraint messages_pkey PRIMARY KEY (id);
alter table public.mfa_codes add constraint mfa_codes_pkey PRIMARY KEY (id);
alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
alter table public.pickup_authorizations add constraint pickup_authorizations_pkey PRIMARY KEY (id);
alter table public.pickup_logs add constraint pickup_logs_pkey PRIMARY KEY (id);
alter table public.pickup_qr_codes add constraint pickup_qr_codes_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.role_definitions add constraint role_definitions_pkey PRIMARY KEY (role);
alter table public.rooms add constraint rooms_pkey PRIMARY KEY (id);
alter table public.schedules add constraint schedules_pkey PRIMARY KEY (id);
alter table public.scholarships add constraint scholarships_pkey PRIMARY KEY (id);
alter table public.school_events add constraint school_events_pkey PRIMARY KEY (id);
alter table public.school_settings add constraint school_settings_pkey PRIMARY KEY (id);
alter table public.school_years add constraint school_years_pkey PRIMARY KEY (id);
alter table public.student_accounts add constraint student_accounts_pkey PRIMARY KEY (student_id);
alter table public.student_charges add constraint student_charges_pkey PRIMARY KEY (id);
alter table public.student_guardians add constraint student_guardians_pkey PRIMARY KEY (id);
alter table public.student_id_cards add constraint student_id_cards_pkey PRIMARY KEY (id);
alter table public.students add constraint students_pkey PRIMARY KEY (id);
alter table public.subjects add constraint subjects_pkey PRIMARY KEY (id);
alter table public.trusted_devices add constraint trusted_devices_pkey PRIMARY KEY (id);
alter table public.tuition_fees add constraint tuition_fees_pkey PRIMARY KEY (school_year_id, grade_level);
alter table public.activity_log add constraint activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.class_section_subjects add constraint class_section_subjects_class_section_id_fkey FOREIGN KEY (class_section_id) REFERENCES class_sections(id) ON DELETE CASCADE;
alter table public.class_section_subjects add constraint class_section_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id);
alter table public.class_section_subjects add constraint class_section_subjects_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES employees(id);
alter table public.class_sections add constraint class_sections_adviser_id_fkey FOREIGN KEY (adviser_id) REFERENCES employees(id);
alter table public.class_sections add constraint class_sections_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.employees add constraint employees_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id);
alter table public.enrollment_fees add constraint enrollment_fees_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.enrollments add constraint enrollments_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.enrollments add constraint enrollments_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.enrollments add constraint enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.fee_items add constraint fee_items_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.grade_reopen_requests add constraint grade_reopen_requests_class_section_subject_id_fkey FOREIGN KEY (class_section_subject_id) REFERENCES class_section_subjects(id);
alter table public.grade_reopen_requests add constraint grade_reopen_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES employees(id);
alter table public.grade_reopen_requests add constraint grade_reopen_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.grade_reopen_requests add constraint grade_reopen_requests_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.grade_reopen_requests add constraint grade_reopen_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id);
alter table public.grades add constraint grades_class_section_subject_id_fkey FOREIGN KEY (class_section_subject_id) REFERENCES class_section_subjects(id);
alter table public.grades add constraint grades_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.grades add constraint grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.grading_periods add constraint grading_periods_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.grading_periods add constraint grading_periods_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE CASCADE;
alter table public.guardians add constraint guardians_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.messages add constraint messages_recipient_guardian_id_fkey FOREIGN KEY (recipient_guardian_id) REFERENCES guardians(id);
alter table public.messages add constraint messages_sender_employee_id_fkey FOREIGN KEY (sender_employee_id) REFERENCES employees(id);
alter table public.messages add constraint messages_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.mfa_codes add constraint mfa_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.payments add constraint payments_charge_id_fkey FOREIGN KEY (charge_id) REFERENCES student_charges(id);
alter table public.payments add constraint payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES employees(id);
alter table public.payments add constraint payments_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.payments add constraint payments_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.pickup_authorizations add constraint pickup_authorizations_authorized_by_fkey FOREIGN KEY (authorized_by) REFERENCES guardians(id);
alter table public.pickup_authorizations add constraint pickup_authorizations_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.pickup_logs add constraint pickup_logs_guardian_id_fkey FOREIGN KEY (guardian_id) REFERENCES guardians(id);
alter table public.pickup_logs add constraint pickup_logs_pickup_authorization_id_fkey FOREIGN KEY (pickup_authorization_id) REFERENCES pickup_authorizations(id);
alter table public.pickup_logs add constraint pickup_logs_pickup_qr_code_id_fkey FOREIGN KEY (pickup_qr_code_id) REFERENCES pickup_qr_codes(id);
alter table public.pickup_logs add constraint pickup_logs_scanned_by_fkey FOREIGN KEY (scanned_by) REFERENCES employees(id);
alter table public.pickup_logs add constraint pickup_logs_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.pickup_logs add constraint pickup_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.pickup_qr_codes add constraint pickup_qr_codes_student_guardian_id_fkey FOREIGN KEY (student_guardian_id) REFERENCES student_guardians(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.schedules add constraint schedules_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.scholarships add constraint scholarships_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.scholarships add constraint scholarships_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.school_events add constraint school_events_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.student_accounts add constraint student_accounts_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.student_accounts add constraint student_accounts_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.student_charges add constraint student_charges_fee_item_id_fkey FOREIGN KEY (fee_item_id) REFERENCES fee_items(id);
alter table public.student_charges add constraint student_charges_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.student_charges add constraint student_charges_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.student_guardians add constraint student_guardians_guardian_id_fkey FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE CASCADE;
alter table public.student_guardians add constraint student_guardians_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.student_id_cards add constraint student_id_cards_printed_by_fkey FOREIGN KEY (printed_by) REFERENCES employees(id);
alter table public.student_id_cards add constraint student_id_cards_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.student_id_cards add constraint student_id_cards_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.students add constraint students_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.trusted_devices add constraint trusted_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.tuition_fees add constraint tuition_fees_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES school_years(id);
alter table public.enrollments add constraint enrollments_enrollment_type_check CHECK ((enrollment_type = ANY (ARRAY['New Student'::text, 'Continuing Student'::text, 'Transferee'::text])));
alter table public.enrollments add constraint enrollments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text])));
alter table public.fee_items add constraint fee_items_category_check CHECK ((category = ANY (ARRAY['tuition'::text, 'misc'::text, 'other'::text])));
alter table public.grade_reopen_requests add constraint grade_reopen_requests_quarter_check CHECK ((quarter = ANY (ARRAY['q1'::text, 'q2'::text, 'q3'::text, 'q4'::text])));
alter table public.grade_reopen_requests add constraint grade_reopen_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'fulfilled'::text])));
alter table public.grading_periods add constraint grading_periods_quarter_check CHECK ((quarter = ANY (ARRAY['q1'::text, 'q2'::text, 'q3'::text, 'q4'::text])));
alter table public.payments add constraint payments_category_check CHECK ((category = ANY (ARRAY['enrollment_fee'::text, 'tuition'::text])));
alter table public.pickup_authorizations add constraint pickup_authorizations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])));
alter table public.pickup_logs add constraint pickup_logs_method_check CHECK ((method = ANY (ARRAY['qr_persistent'::text, 'qr_authorization'::text, 'manual'::text])));
alter table public.pickup_logs add constraint pickup_logs_reference_check CHECK (((method = 'manual'::text) OR (pickup_qr_code_id IS NOT NULL) OR (pickup_authorization_id IS NOT NULL) OR (guardian_id IS NOT NULL)));
alter table public.pickup_qr_codes add constraint pickup_qr_codes_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])));
alter table public.school_settings add constraint single_row CHECK (id);

-- INDEXES

CREATE INDEX enrollments_school_year_id_idx ON public.enrollments USING btree (school_year_id);
CREATE INDEX enrollments_student_id_idx ON public.enrollments USING btree (student_id);
CREATE INDEX idx_employees_deleted_at ON public.employees USING btree (deleted_at);
CREATE INDEX idx_grades_student_year ON public.grades USING btree (student_id, school_year_id);
CREATE INDEX idx_messages_recipient ON public.messages USING btree (recipient_guardian_id, sent_at DESC);
CREATE INDEX idx_payments_school_year ON public.payments USING btree (school_year_id);
CREATE INDEX idx_payments_student ON public.payments USING btree (student_id);
CREATE INDEX idx_pickup_auth_student ON public.pickup_authorizations USING btree (student_id);
CREATE INDEX idx_student_charges_student_year ON public.student_charges USING btree (student_id, school_year_id);
CREATE INDEX idx_student_guardians_guardian ON public.student_guardians USING btree (guardian_id);
CREATE INDEX idx_student_guardians_student ON public.student_guardians USING btree (student_id);
CREATE INDEX idx_students_grade_section ON public.students USING btree (grade_level, section);
CREATE INDEX idx_students_school_year ON public.students USING btree (school_year_id);
CREATE INDEX idx_students_status ON public.students USING btree (status);
CREATE INDEX mfa_codes_user_id_idx ON public.mfa_codes USING btree (user_id);
CREATE INDEX pickup_logs_scanned_by_idx ON public.pickup_logs USING btree (scanned_by, scanned_at DESC);
CREATE INDEX pickup_logs_student_scanned_idx ON public.pickup_logs USING btree (student_id, scanned_at DESC);
CREATE INDEX trusted_devices_user_id_idx ON public.trusted_devices USING btree (user_id);

-- FUNCTIONS

CREATE OR REPLACE FUNCTION public.advises_class_section_subject(p_css_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.class_section_subjects css
    join public.class_sections cs on cs.id = css.class_section_id
    where css.id = p_css_id
      and cs.adviser_id = public.current_employee_id()
  );
$function$
;
CREATE OR REPLACE FUNCTION public.can_view_academics_for(p_student_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.student_guardians sg
    where sg.student_id = p_student_id
      and sg.guardian_id = auth.uid()
      and sg.can_view_academics = true
  );
$function$
;
CREATE OR REPLACE FUNCTION public.claim_or_receipt_number(p_school_year_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.compute_final_grade()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  total numeric := 0;
  count_filled int := 0;
begin
  if new.q1 is not null then total := total + new.q1; count_filled := count_filled + 1; end if;
  if new.q2 is not null then total := total + new.q2; count_filled := count_filled + 1; end if;
  if new.q3 is not null then total := total + new.q3; count_filled := count_filled + 1; end if;
  if new.q4 is not null then total := total + new.q4; count_filled := count_filled + 1; end if;

  if count_filled = 0 then
    new.final_grade := null;
  else
    new.final_grade := round(total / count_filled, 2);
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.current_employee_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select employee_id from public.profiles where id = auth.uid();
$function$
;
CREATE OR REPLACE FUNCTION public.current_staff_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.profiles where id = auth.uid();
$function$
;
CREATE OR REPLACE FUNCTION public.current_student_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select student_id from public.student_accounts where auth_user_id = auth.uid();
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin_or_registrar()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.current_staff_role() in ('full_admin', 'registrar');
$function$
;
CREATE OR REPLACE FUNCTION public.is_guardian_of(p_student_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.student_guardians sg
    where sg.student_id = p_student_id
      and sg.guardian_id = auth.uid()
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_staff_role(role_name app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.current_staff_role() = role_name;
$function$
;
CREATE OR REPLACE FUNCTION public.next_receipt_number()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 'RCT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0');
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.teaches_class_section_subject(p_css_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.class_section_subjects css
    where css.id = p_css_id
      and css.teacher_id = public.current_employee_id()
  );
$function$
;

-- VIEWS

create or replace view public.student_billing_summary with (security_invoker=true) as
 SELECT student_id,
    school_year_id,
    COALESCE(sum(amount), (0)::numeric) AS total_fees,
    COALESCE(( SELECT sum(p.amount) AS sum
           FROM payments p
          WHERE ((p.student_id = sc.student_id) AND (p.school_year_id = sc.school_year_id))), (0)::numeric) AS amount_paid,
    (COALESCE(sum(amount), (0)::numeric) - COALESCE(( SELECT sum(p.amount) AS sum
           FROM payments p
          WHERE ((p.student_id = sc.student_id) AND (p.school_year_id = sc.school_year_id))), (0)::numeric)) AS balance
   FROM student_charges sc
  GROUP BY student_id, school_year_id;

create or replace view public.student_gpa_summary with (security_invoker=true) as
 SELECT student_id,
    school_year_id,
    round(avg(final_grade), 1) AS overall_gpa
   FROM grades
  WHERE (final_grade IS NOT NULL)
  GROUP BY student_id, school_year_id;

create or replace view public.student_payment_status with (security_invoker=true) as
 SELECT s.id AS student_id,
    s.school_year_id,
    COALESCE(tf.annual_fee, (0)::numeric) AS tuition_fee,
    COALESCE(sum(p.amount), (0)::numeric) AS amount_paid,
        CASE
            WHEN ((COALESCE(sum(p.amount), (0)::numeric) >= COALESCE(tf.annual_fee, (0)::numeric)) AND (tf.annual_fee IS NOT NULL)) THEN 'Fully Paid'::text
            WHEN (COALESCE(sum(p.amount), (0)::numeric) > (0)::numeric) THEN 'Partial Payment'::text
            ELSE 'Overdue'::text
        END AS payment_status
   FROM ((students s
     LEFT JOIN payments p ON (((p.student_id = s.id) AND (p.school_year_id = s.school_year_id))))
     LEFT JOIN tuition_fees tf ON ((tf.school_year_id = s.school_year_id)))
  GROUP BY s.id, s.school_year_id, tf.annual_fee;

-- TRIGGERS

CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_grades_compute_final BEFORE INSERT OR UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION compute_final_grade();
CREATE TRIGGER trg_grades_updated_at BEFORE UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_guardians_updated_at BEFORE UPDATE ON public.guardians FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_school_settings_updated_at BEFORE UPDATE ON public.school_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tuition_fees_updated_at BEFORE UPDATE ON public.tuition_fees FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ROW LEVEL SECURITY

alter table public.activity_log enable row level security;
alter table public.class_section_subjects enable row level security;
alter table public.class_sections enable row level security;
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.enrollment_fees enable row level security;
alter table public.enrollments enable row level security;
alter table public.fee_items enable row level security;
alter table public.grade_reopen_requests enable row level security;
alter table public.grades enable row level security;
alter table public.grading_periods enable row level security;
alter table public.guardians enable row level security;
alter table public.messages enable row level security;
alter table public.mfa_codes enable row level security;
alter table public.payments enable row level security;
alter table public.pickup_authorizations enable row level security;
alter table public.pickup_logs enable row level security;
alter table public.pickup_qr_codes enable row level security;
alter table public.profiles enable row level security;
alter table public.role_definitions enable row level security;
alter table public.rooms enable row level security;
alter table public.schedules enable row level security;
alter table public.scholarships enable row level security;
alter table public.school_events enable row level security;
alter table public.school_settings enable row level security;
alter table public.school_years enable row level security;
alter table public.student_accounts enable row level security;
alter table public.student_charges enable row level security;
alter table public.student_guardians enable row level security;
alter table public.student_id_cards enable row level security;
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.trusted_devices enable row level security;
alter table public.tuition_fees enable row level security;

-- POLICIES

create policy "staff insert activity_log" on public.activity_log as permissive for INSERT to public
  with check ((current_staff_role() IS NOT NULL));
create policy "staff read activity_log" on public.activity_log as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "admin registrar manage class_section_subjects" on public.class_section_subjects as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "guardian reads linked student section class_section_subjects" on public.class_section_subjects as permissive for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM (class_sections cs
     JOIN students s ON (((s.grade_level = cs.grade_level) AND (s.section = cs.section_name))))
  WHERE ((cs.id = class_section_subjects.class_section_id) AND is_guardian_of(s.id)))));
create policy "staff read class_section_subjects" on public.class_section_subjects as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "student guardian read own class_section_subjects" on public.class_section_subjects as permissive for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM grades g
  WHERE ((g.class_section_subject_id = class_section_subjects.id) AND ((g.student_id = current_student_id()) OR can_view_academics_for(g.student_id))))));
create policy "student reads own section class_section_subjects" on public.class_section_subjects as permissive for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM (class_sections cs
     JOIN students s ON (((s.grade_level = cs.grade_level) AND (s.section = cs.section_name))))
  WHERE ((cs.id = class_section_subjects.class_section_id) AND (s.id = current_student_id())))));
create policy "admin registrar manage class_sections" on public.class_sections as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "guardian reads linked student class_sections" on public.class_sections as permissive for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM students s
  WHERE (is_guardian_of(s.id) AND (s.grade_level = class_sections.grade_level) AND (s.section = class_sections.section_name)))));
create policy "staff read class_sections" on public.class_sections as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "student reads own class_sections" on public.class_sections as permissive for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM students s
  WHERE ((s.id = current_student_id()) AND (s.grade_level = class_sections.grade_level) AND (s.section = class_sections.section_name)))));
create policy "admin manage departments" on public.departments as permissive for ALL to public
  using (is_staff_role('full_admin'::app_role))
  with check (is_staff_role('full_admin'::app_role));
create policy "staff read departments" on public.departments as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "admin registrar manage employees" on public.employees as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "guardian reads linked student section teachers" on public.employees as permissive for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM ((class_section_subjects css
     JOIN class_sections cs ON ((cs.id = css.class_section_id)))
     JOIN students s ON (((s.grade_level = cs.grade_level) AND (s.section = cs.section_name))))
  WHERE ((css.teacher_id = employees.id) AND is_guardian_of(s.id)))));
create policy "staff read employees" on public.employees as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "student guardian read own teachers" on public.employees as permissive for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM (class_section_subjects css
     JOIN grades g ON ((g.class_section_subject_id = css.id)))
  WHERE ((css.teacher_id = employees.id) AND ((g.student_id = current_student_id()) OR can_view_academics_for(g.student_id))))));
create policy "student reads own section teachers" on public.employees as permissive for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM ((class_section_subjects css
     JOIN class_sections cs ON ((cs.id = css.class_section_id)))
     JOIN students s ON (((s.grade_level = cs.grade_level) AND (s.section = cs.section_name))))
  WHERE ((css.teacher_id = employees.id) AND (s.id = current_student_id())))));
create policy "admin registrar manage enrollment_fees" on public.enrollment_fees as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "authenticated read enrollment_fees" on public.enrollment_fees as permissive for SELECT to public
  using ((auth.uid() IS NOT NULL));
create policy "staff read enrollment_fees" on public.enrollment_fees as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "admin registrar manage enrollments" on public.enrollments as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "guardian reads linked student enrollments" on public.enrollments as permissive for SELECT to public
  using (is_guardian_of(student_id));
create policy "staff read enrollments" on public.enrollments as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "student reads own enrollments" on public.enrollments as permissive for SELECT to public
  using ((student_id = current_student_id()));
create policy "admin registrar manage fee_items" on public.fee_items as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "staff read fee_items" on public.fee_items as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "admin manage reopen requests" on public.grade_reopen_requests as permissive for ALL to public
  using (is_staff_role('full_admin'::app_role))
  with check (is_staff_role('full_admin'::app_role));
create policy "teacher manages own section reopen requests" on public.grade_reopen_requests as permissive for ALL to public
  using ((teaches_class_section_subject(class_section_subject_id) OR is_admin_or_registrar()))
  with check ((teaches_class_section_subject(class_section_subject_id) OR is_admin_or_registrar()));
create policy "adviser reads section grades" on public.grades as permissive for SELECT to public
  using (advises_class_section_subject(class_section_subject_id));
create policy "guardian reads linked child grades" on public.grades as permissive for SELECT to public
  using (can_view_academics_for(student_id));
create policy "student reads own grades" on public.grades as permissive for SELECT to public
  using ((student_id = current_student_id()));
create policy "teacher manages own section grades" on public.grades as permissive for ALL to public
  using ((teaches_class_section_subject(class_section_subject_id) OR is_admin_or_registrar()))
  with check ((teaches_class_section_subject(class_section_subject_id) OR is_admin_or_registrar()));
create policy "admin manage grading_periods" on public.grading_periods as permissive for ALL to public
  using (is_staff_role('full_admin'::app_role))
  with check (is_staff_role('full_admin'::app_role));
create policy "staff read grading_periods" on public.grading_periods as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "admin registrar manage guardians" on public.guardians as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "guardian reads own row" on public.guardians as permissive for SELECT to public
  using ((id = auth.uid()));
create policy "guardian updates own row" on public.guardians as permissive for UPDATE to public
  using ((id = auth.uid()))
  with check ((id = auth.uid()));
create policy "staff read guardians" on public.guardians as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "admin deletes messages" on public.messages as permissive for DELETE to public
  using (is_staff_role('full_admin'::app_role));
create policy "guardian marks own messages read" on public.messages as permissive for UPDATE to public
  using ((recipient_guardian_id = auth.uid()))
  with check ((recipient_guardian_id = auth.uid()));
create policy "guardian reads own messages" on public.messages as permissive for SELECT to public
  using ((recipient_guardian_id = auth.uid()));
create policy "staff read messages" on public.messages as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "staff send messages" on public.messages as permissive for INSERT to public
  with check ((current_staff_role() IS NOT NULL));
create policy "staff update messages" on public.messages as permissive for UPDATE to public
  using ((current_staff_role() IS NOT NULL))
  with check ((current_staff_role() IS NOT NULL));
create policy "cashier admin registrar manage payments" on public.payments as permissive for ALL to public
  using ((is_staff_role('cashier'::app_role) OR is_admin_or_registrar()))
  with check ((is_staff_role('cashier'::app_role) OR is_admin_or_registrar()));
create policy "guardian reads linked student payments" on public.payments as permissive for SELECT to public
  using (is_guardian_of(student_id));
create policy "student reads own payments" on public.payments as permissive for SELECT to public
  using ((student_id = current_student_id()));
create policy "admin registrar manage pickup_authorizations" on public.pickup_authorizations as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "guard staff read pickup_authorizations" on public.pickup_authorizations as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "guardian creates own pickup_authorizations" on public.pickup_authorizations as permissive for INSERT to public
  with check (((authorized_by = auth.uid()) AND is_guardian_of(student_id)));
create policy "guardian reads own pickup_authorizations" on public.pickup_authorizations as permissive for SELECT to public
  using ((authorized_by = auth.uid()));
create policy "guardian revokes own pickup_authorizations" on public.pickup_authorizations as permissive for UPDATE to public
  using ((authorized_by = auth.uid()))
  with check ((authorized_by = auth.uid()));
create policy "admin registrar manage pickup_logs" on public.pickup_logs as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "guard inserts own scans" on public.pickup_logs as permissive for INSERT to public
  with check ((is_staff_role('guard'::app_role) AND (scanned_by = current_employee_id())));
create policy "guard staff read pickup_logs" on public.pickup_logs as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "guardian reads linked student pickup_logs" on public.pickup_logs as permissive for SELECT to public
  using (is_guardian_of(student_id));
create policy "admin registrar manage pickup_qr_codes" on public.pickup_qr_codes as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "guard staff read pickup_qr_codes" on public.pickup_qr_codes as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "guardian reads own pickup_qr_codes" on public.pickup_qr_codes as permissive for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM student_guardians sg
  WHERE ((sg.id = pickup_qr_codes.student_guardian_id) AND (sg.guardian_id = auth.uid())))));
create policy "admin deletes profiles" on public.profiles as permissive for DELETE to public
  using (is_staff_role('full_admin'::app_role));
create policy "admin inserts profiles" on public.profiles as permissive for INSERT to public
  with check (is_staff_role('full_admin'::app_role));
create policy "admin registrar read all profiles" on public.profiles as permissive for SELECT to public
  using (is_admin_or_registrar());
create policy "admin updates profiles" on public.profiles as permissive for UPDATE to public
  using (is_staff_role('full_admin'::app_role))
  with check (is_staff_role('full_admin'::app_role));
create policy "user reads own profile" on public.profiles as permissive for SELECT to public
  using ((id = auth.uid()));
create policy "admin manage role_definitions" on public.role_definitions as permissive for ALL to public
  using (is_staff_role('full_admin'::app_role))
  with check (is_staff_role('full_admin'::app_role));
create policy "staff read role_definitions" on public.role_definitions as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "admin registrar manage rooms" on public.rooms as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "authenticated read rooms" on public.rooms as permissive for SELECT to public
  using ((auth.uid() IS NOT NULL));
create policy "staff read rooms" on public.rooms as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "admin registrar manage schedules" on public.schedules as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "guardian reads linked student schedules" on public.schedules as permissive for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM students s
  WHERE (is_guardian_of(s.id) AND (s.grade_level = schedules.grade_level) AND (s.section = schedules.section_name)))));
create policy "staff read schedules" on public.schedules as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "student reads own schedules" on public.schedules as permissive for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM students s
  WHERE ((s.id = current_student_id()) AND (s.grade_level = schedules.grade_level) AND (s.section = schedules.section_name)))));
create policy "admin registrar manage scholarships" on public.scholarships as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "cashier manage scholarships" on public.scholarships as permissive for ALL to public
  using (is_staff_role('cashier'::app_role))
  with check (is_staff_role('cashier'::app_role));
create policy "guardian reads linked student scholarships" on public.scholarships as permissive for SELECT to public
  using (is_guardian_of(student_id));
create policy "staff read scholarships" on public.scholarships as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "student reads own scholarships" on public.scholarships as permissive for SELECT to public
  using ((student_id = current_student_id()));
create policy "admin registrar manage school_events" on public.school_events as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "authenticated read school_events" on public.school_events as permissive for SELECT to public
  using ((auth.uid() IS NOT NULL));
create policy "admin manage school_settings" on public.school_settings as permissive for ALL to public
  using (is_staff_role('full_admin'::app_role))
  with check (is_staff_role('full_admin'::app_role));
create policy "public read school_settings" on public.school_settings as permissive for SELECT to anon, authenticated
  using (true);
create policy "staff read school_settings" on public.school_settings as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "admin delete school_years" on public.school_years as permissive for DELETE to public
  using (is_staff_role('full_admin'::app_role));
create policy "admin manage school_years" on public.school_years as permissive for INSERT to public
  with check (is_staff_role('full_admin'::app_role));
create policy "admin update school_years" on public.school_years as permissive for UPDATE to public
  using (is_staff_role('full_admin'::app_role))
  with check (is_staff_role('full_admin'::app_role));
create policy "authenticated read school_years" on public.school_years as permissive for SELECT to public
  using ((auth.uid() IS NOT NULL));
create policy "admin registrar manage student_accounts" on public.student_accounts as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "staff read student_accounts" on public.student_accounts as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "student reads own account link" on public.student_accounts as permissive for SELECT to public
  using ((auth_user_id = auth.uid()));
create policy "admin registrar manage student_charges" on public.student_charges as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "guardian reads linked student charges" on public.student_charges as permissive for SELECT to public
  using (is_guardian_of(student_id));
create policy "staff read student_charges" on public.student_charges as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "student reads own charges" on public.student_charges as permissive for SELECT to public
  using ((student_id = current_student_id()));
create policy "admin registrar manage student_guardians" on public.student_guardians as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "guardian reads own links" on public.student_guardians as permissive for SELECT to public
  using ((guardian_id = auth.uid()));
create policy "staff read student_guardians" on public.student_guardians as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "student reads own links" on public.student_guardians as permissive for SELECT to public
  using ((student_id = current_student_id()));
create policy "admin registrar manage student_id_cards" on public.student_id_cards as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "guardian reads linked student id card" on public.student_id_cards as permissive for SELECT to public
  using (is_guardian_of(student_id));
create policy "staff read student_id_cards" on public.student_id_cards as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "student reads own id card" on public.student_id_cards as permissive for SELECT to public
  using ((student_id = current_student_id()));
create policy "admin registrar manage students" on public.students as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "guardian reads linked students" on public.students as permissive for SELECT to public
  using (is_guardian_of(id));
create policy "staff read students" on public.students as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "student reads own row" on public.students as permissive for SELECT to public
  using ((id = current_student_id()));
create policy "admin registrar manage subjects" on public.subjects as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "authenticated read subjects" on public.subjects as permissive for SELECT to public
  using ((auth.uid() IS NOT NULL));
create policy "staff read subjects" on public.subjects as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));
create policy "admin registrar manage tuition_fees" on public.tuition_fees as permissive for ALL to public
  using (is_admin_or_registrar())
  with check (is_admin_or_registrar());
create policy "authenticated read tuition_fees" on public.tuition_fees as permissive for SELECT to public
  using ((auth.uid() IS NOT NULL));
create policy "staff read tuition_fees" on public.tuition_fees as permissive for SELECT to public
  using ((current_staff_role() IS NOT NULL));

-- TABLE GRANTS

grant REFERENCES, TRIGGER, TRUNCATE on public.activity_log to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.activity_log to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.activity_log to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.class_section_subjects to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.class_section_subjects to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.class_section_subjects to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.class_sections to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.class_sections to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.class_sections to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.departments to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.departments to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.departments to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.employees to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.employees to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.employees to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.enrollment_fees to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.enrollment_fees to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.enrollment_fees to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.enrollments to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.enrollments to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.enrollments to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.fee_items to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.fee_items to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.fee_items to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.grade_reopen_requests to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.grade_reopen_requests to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.grade_reopen_requests to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.grades to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.grades to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.grades to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.grading_periods to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.grading_periods to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.grading_periods to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.guardians to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.guardians to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.guardians to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.messages to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.messages to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.messages to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.mfa_codes to anon;
grant REFERENCES, TRIGGER, TRUNCATE on public.mfa_codes to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.mfa_codes to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.payments to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.payments to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.payments to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.pickup_authorizations to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pickup_authorizations to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pickup_authorizations to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.pickup_logs to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pickup_logs to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pickup_logs to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.pickup_qr_codes to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pickup_qr_codes to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pickup_qr_codes to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.profiles to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.profiles to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.profiles to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.role_definitions to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.role_definitions to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.role_definitions to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.rooms to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.rooms to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.rooms to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.schedules to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.schedules to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.schedules to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.scholarships to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.scholarships to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.scholarships to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.school_events to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.school_events to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.school_events to service_role;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on public.school_settings to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.school_settings to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.school_settings to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.school_years to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.school_years to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.school_years to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.student_accounts to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_accounts to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_accounts to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.student_billing_summary to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_billing_summary to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_billing_summary to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.student_charges to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_charges to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_charges to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.student_gpa_summary to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_gpa_summary to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_gpa_summary to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.student_guardians to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_guardians to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_guardians to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.student_id_cards to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_id_cards to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_id_cards to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.student_payment_status to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_payment_status to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.student_payment_status to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.students to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.students to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.students to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.subjects to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.subjects to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.subjects to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.trusted_devices to anon;
grant REFERENCES, TRIGGER, TRUNCATE on public.trusted_devices to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.trusted_devices to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on public.tuition_fees to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.tuition_fees to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.tuition_fees to service_role;

-- FUNCTION ACLS (reference)

-- advises_class_section_subject(p_css_id uuid): {=X/postgres,postgres=X/postgres,service_role=X/postgres}
-- can_view_academics_for(p_student_id text): {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- claim_or_receipt_number(p_school_year_id uuid): {=X/postgres,postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}
-- compute_final_grade(): {=X/postgres,postgres=X/postgres,service_role=X/postgres}
-- current_employee_id(): {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- current_staff_role(): {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- current_student_id(): {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- is_admin_or_registrar(): {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- is_guardian_of(p_student_id text): {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- is_staff_role(role_name app_role): {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- next_receipt_number(): {=X/postgres,postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}
-- set_updated_at(): {=X/postgres,postgres=X/postgres,service_role=X/postgres}
-- teaches_class_section_subject(p_css_id uuid): {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
