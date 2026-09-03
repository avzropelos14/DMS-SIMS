// Subject catalog shared by the Teacher Portal's Subject Management section (where subjects
// are created/edited/deleted) and every place elsewhere in the app that assigns a subject to
// a class (Admin's Class Management "Add Class" / "Edit Section" modals). Centralizing it here
// means both surfaces stay in sync automatically.

import { supabase } from '../supabase';
import { TUITION_GRADE_GROUPS } from './tuition';

// Reuses the same grade-level groupings already established by TUITION_GRADE_GROUPS
// (Primary / Elementary / High School Level) so "curriculum" means the same thing
// everywhere in the app instead of introducing a second, differently-named grouping.
export const CURRICULA: string[] = TUITION_GRADE_GROUPS.map((g) => g.label);

export function curriculumForGrade(grade: string): string | null {
  const group = TUITION_GRADE_GROUPS.find((g) => g.grades.includes(grade));
  return group?.label ?? null;
}

export interface Subject {
  id: string;
  name: string;
  curriculum: string | null;
  hidden?: boolean;
}

// Excludes hidden subjects by default — that's every picker across the app (Class
// Management's Add Class / Edit Section, etc). Pass includeHidden for Subject
// Management itself, which still needs to list and unhide them.
export async function listSubjects(curriculum?: string, includeHidden = false): Promise<Subject[]> {
  let query = supabase.from('subjects').select('id, name, curriculum, hidden').order('name', { ascending: true });
  if (curriculum) query = query.eq('curriculum', curriculum);
  if (!includeHidden) query = query.eq('hidden', false);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Subject[];
}

export async function createSubject(name: string, curriculum: string | null): Promise<Subject> {
  const { data, error } = await supabase
    .from('subjects')
    .insert({ name: name.trim(), curriculum })
    .select('id, name, curriculum')
    .single();
  if (error) throw error;
  return data as Subject;
}

export async function updateSubject(id: string, name: string, curriculum: string | null): Promise<void> {
  const { error } = await supabase
    .from('subjects')
    .update({ name: name.trim(), curriculum })
    .eq('id', id);
  if (error) throw error;
}

// Tries a hard delete first. If the subject is still referenced by a class_section_subjects
// row — including ones from an archived school year, kept around for their grade history —
// the FK blocks that delete, so fall back to hiding it instead: it disappears from every
// picker and from Subject Management's default list, without touching that graded history.
export async function deleteSubject(id: string): Promise<{ error: string | null; hidden: boolean }> {
  const { error } = await supabase.from('subjects').delete().eq('id', id);
  if (!error) return { error: null, hidden: false };
  if (error.code === '23503') {
    const { error: hideErr } = await supabase
      .from('subjects')
      .update({ hidden: true })
      .eq('id', id);
    if (hideErr) return { error: hideErr.message, hidden: false };
    return { error: null, hidden: true };
  }
  return { error: error.message, hidden: false };
}

export async function setSubjectHidden(id: string, hidden: boolean): Promise<string | null> {
  const { error } = await supabase.from('subjects').update({ hidden }).eq('id', id);
  return error ? error.message : null;
}

// Looks a subject up by exact name, creating it (uncategorized) if it doesn't exist yet —
// keeps `getOrCreateSubjectId` in AdminDashboard.tsx working for any caller that still
// passes a free-typed subject name instead of picking one from the catalog.
export async function getOrCreateSubjectId(name: string, curriculum?: string): Promise<string> {
  const trimmed = name.trim();
  const { data: existing } = await supabase
    .from('subjects')
    .select('id')
    .ilike('name', trimmed)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: inserted, error } = await supabase
    .from('subjects')
    .insert({ name: trimmed, curriculum: curriculum ?? null })
    .select('id')
    .single();
  if (error) throw error;
  return inserted.id;
}
