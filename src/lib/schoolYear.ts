import { supabase } from '../supabase';

export interface SchoolYear {
  id: string;
  label: string;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  // The physical, pre-printed official receipt (OR) booklet range for this school year,
  // and the next number the Cashier should issue from it — see CashierPortal.tsx.
  or_range_start: string | null;
  or_range_end: string | null;
  or_next_number: string | null;
}

const SCHOOL_YEAR_COLUMNS = 'id, label, is_current, start_date, end_date, or_range_start, or_range_end, or_next_number';

export async function getCurrentSchoolYear(): Promise<SchoolYear | null> {
  const { data } = await supabase
    .from('school_years')
    .select(SCHOOL_YEAR_COLUMNS)
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function getSchoolYearByLabel(label: string): Promise<SchoolYear | null> {
  const { data } = await supabase
    .from('school_years')
    .select(SCHOOL_YEAR_COLUMNS)
    .eq('label', label)
    .maybeSingle();
  return data ?? null;
}

export async function listAllSchoolYears(): Promise<SchoolYear[]> {
  const { data } = await supabase
    .from('school_years')
    .select(SCHOOL_YEAR_COLUMNS)
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  return data ?? [];
}
