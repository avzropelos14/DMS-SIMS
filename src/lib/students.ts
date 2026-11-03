import { supabase } from "../supabase";

export async function getCurrentSchoolYearId(): Promise<string | null> {
    const { data } = await supabase
        .from("school_years")
        .select("id")
        .eq("is_current", true)
        .limit(1)
        .maybeSingle();
    return data?.id ?? null;
}

// Student portal login accounts are only auto-created for junior high (Grades 7-10) —
// younger grades don't get a student email/account.
const JUNIOR_HIGH_GRADES = ["Grade 7", "Grade 8", "Grade 9", "Grade 10"];
export function isJuniorHighGrade(grade: string): boolean {
    return JUNIOR_HIGH_GRADES.includes(grade);
}

// Keeps a student's `enrollments` row for a given school year in sync with a grade/section
// change made outside the enrollment flow (e.g. Class Management's "Assign Student", or a
// Student Management edit). `students.grade_level/section` is a mutable pointer, but rosters
// (Student Management's list, Teacher Dashboard's My Classes) read from `enrollments`, which is
// per-year and never auto-updated — without this, a reassigned student keeps showing up under
// their old class there even though `students` reflects the new one.
export async function syncEnrollmentGradeSection(
    studentId: string,
    schoolYearId: string,
    gradeLevel: string,
    section: string | null,
): Promise<void> {
    const { data, error } = await supabase
        .from("enrollments")
        .update({ grade_level: gradeLevel, section })
        .eq("student_id", studentId)
        .eq("school_year_id", schoolYearId)
        .select("student_id");
    if (error) throw error;
    if (!data || data.length === 0) {
        const { error: insertError } = await supabase.from("enrollments").insert({
            student_id: studentId,
            school_year_id: schoolYearId,
            grade_level: gradeLevel,
            section,
            status: "confirmed",
            enrollment_type: "Continuing Student",
        });
        if (insertError) throw insertError;
    }
}

export async function generateStudentId(lastName: string): Promise<string> {
    const surname =
        lastName
            .trim()
            .toUpperCase()
            .replace(/[^A-Z]/g, "") || "STUDENT";
    const prefix = `STU-${surname}-`;
    const { count } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .like("id", `${prefix}%`);
    const seq = ((count ?? 0) + 1).toString().padStart(3, "0");
    return `${prefix}${seq}`;
}

// Student Management Section
export type StudentStatus =
    | "Active"
    | "Graduate"
    | "Dropped"
    | "Transferred"
    | "Archived";

export type Student = {
    id: string;
    name: string;
    firstName: string;
    middleName: string;
    lastName: string;
    suffix: string;
    grade: string;
    section: string;
    gpa: number;
    status: StudentStatus;
    email: string;
    phone: string;
    enrolled: string;
    guardianName: string;
    guardianRelationship: string;
    guardianPhone: string;
    guardianEmail: string;
    isTransferee: boolean;
    transferDate: string;
};

export function studentRowToStudent(
    row: any,
    isTransferee: boolean,
    transferDate: string = "",
): Student {
    const name =
        [row.first_name, row.middle_name, row.last_name]
            .filter(Boolean)
            .join(" ") + (row.suffix ? ` ${row.suffix}` : "");
    return {
        id: row.id,
        name,
        firstName: row.first_name || "",
        middleName: row.middle_name || "",
        lastName: row.last_name || "",
        suffix: row.suffix || "",
        grade: row.grade_level,
        section: row.section || "",
        gpa: row.gpa ?? null,
        status: row.status,
        email: row.email || "",
        phone: row.phone || "",
        enrolled: row.enrolled_date
            ? new Date(row.enrolled_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
              })
            : "",
        guardianName: row.guardian_name || "",
        guardianRelationship: row.guardian_relationship || "",
        guardianPhone: row.guardian_phone || "",
        guardianEmail: row.guardian_email || "",
        isTransferee,
        transferDate,
    };
}

// Splits a "First Middle Last" name into { firstName, lastName } for writing back to the
// students table's separate first_name/last_name columns (same "last word = family name"
// convention used by familyName/formatFamilyNameFirst throughout this file).
export function splitStudentName(fullName: string): {
    firstName: string;
    lastName: string;
} {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 2)
        return { firstName: fullName.trim(), lastName: fullName.trim() };
    return {
        firstName: parts.slice(0, -1).join(" "),
        lastName: parts[parts.length - 1],
    };
}
