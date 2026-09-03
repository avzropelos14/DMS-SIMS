// Live School Information — a single source of truth for the school_settings row
// (edited in Admin's System Settings) so the header, login screen, cashier receipts,
// and ID cards all reflect the same values instead of hardcoding them.

import { supabase } from '../supabase';

export interface SchoolSettings {
  school_name: string;
  school_motto: string;
  school_address: string;
  contact_email: string;
  contact_phone: string;
}

export const DEFAULT_SCHOOL_SETTINGS: SchoolSettings = {
  school_name: 'Dumaguete Mission School',
  school_motto: '',
  school_address: '',
  contact_email: '',
  contact_phone: '',
};

export async function getSchoolSettings(): Promise<SchoolSettings> {
  const { data } = await supabase
    .from('school_settings')
    .select('school_name, school_motto, school_address, contact_email, contact_phone')
    .eq('id', true)
    .maybeSingle();
  if (!data) return DEFAULT_SCHOOL_SETTINGS;
  return {
    school_name: data.school_name || DEFAULT_SCHOOL_SETTINGS.school_name,
    school_motto: data.school_motto ?? '',
    school_address: data.school_address ?? '',
    contact_email: data.contact_email ?? '',
    contact_phone: data.contact_phone ?? '',
  };
}
