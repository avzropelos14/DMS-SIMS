import { supabase } from '../supabase';
import { getCurrentSchoolYear } from './schoolYear';

// The `schedules.teacher` column is free text typed into the schedule builder and can drift
// from the actual subject-teacher assignment made in Class/Section management
// (class_section_subjects.teacher_id -> employees). This builds a subject -> teacher name
// map from that assignment table so portals can show the real assigned teacher instead.
export async function fetchAssignedTeacherMap(
  gradeLevel: string,
  section: string | null
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const schoolYear = await getCurrentSchoolYear();
  if (!schoolYear) return map;

  let query = supabase
    .from('class_sections')
    .select('grade_level, section_name, class_section_subjects(archived, subjects(name), employees(full_name))')
    .eq('school_year_id', schoolYear.id)
    .eq('grade_level', gradeLevel);

  if (section) {
    query = query.eq('section_name', section);
  }

  const { data, error } = await query;
  if (error || !data) return map;

  for (const classSection of data as any[]) {
    for (const entry of classSection.class_section_subjects ?? []) {
      if (entry.archived) continue;
      // Supabase sometimes returns these nested one-to-one joins as a single object and
      // sometimes as a single-element array depending on how it infers the relationship —
      // handle both shapes, matching the fallback pattern used elsewhere in the portals.
      const subjectName = entry.subjects?.name ?? entry.subjects?.[0]?.name;
      const teacherName = entry.employees?.full_name ?? entry.employees?.[0]?.full_name;
      if (subjectName && teacherName) {
        map[subjectName] = teacherName;
      }
    }
  }

  return map;
}
