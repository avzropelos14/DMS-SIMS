// Shared tuition-by-grade-level model used by the Admin System Settings (where the
// amounts are configured) and the Cashier Portal (where they're applied to students).

export const TUITION_GRADE_GROUPS: { label: string; grades: string[] }[] = [
  { label: 'Primary Level', grades: ['Kinder 1', 'Kinder 2'] },
  { label: 'Elementary Level', grades: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'] },
  { label: 'High School Level', grades: ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'] },
];

export const ALL_TUITION_GRADE_LEVELS = TUITION_GRADE_GROUPS.flatMap(g => g.grades);

export const DEFAULT_TUITION_FEES: Record<string, number> = {
  'Kinder 1': 1000,
  'Kinder 2': 1000,
  'Grade 1': 2400,
  'Grade 2': 2400,
  'Grade 3': 2400,
  'Grade 4': 2400,
  'Grade 5': 2400,
  'Grade 6': 2400,
  'Grade 7': 4500,
  'Grade 8': 4500,
  'Grade 9': 4500,
  'Grade 10': 4500,
};

// Pulls the canonical "Grade N" / "Kinder N" level out of labels like
// "Grade 4, Section A" or "Grade 4-A" so it can be looked up in the tuition map.
export function extractGradeLevel(label: string): string | null {
  const match = label.match(/(kinder|grade)\s*(\d+)/i);
  if (!match) return null;
  const word = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  return `${word} ${match[2]}`;
}

export function getTuitionForGrade(fees: Record<string, number>, label: string, fallback = 0): number {
  const key = extractGradeLevel(label);
  if (key && fees[key] != null) return fees[key];
  return fallback;
}
