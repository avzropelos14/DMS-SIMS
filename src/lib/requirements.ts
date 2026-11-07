import { supabase } from "../supabase";

// Student requirements checklist (Phase 7). The catalog lists the documents and which
// enrollment types need them; student_requirements holds each student's status per school year.

export type RequirementStatus = "missing" | "submitted" | "waived";

export interface CatalogItem {
    key: string;
    label: string;
    applies_to: string[];
    sort_order: number;
}

export interface StudentRequirement {
    requirement_key: string;
    status: RequirementStatus;
    received_at: string | null;
    verified_by: string | null;
    notes: string | null;
    updated_at: string;
}

export async function getRequirementCatalog(): Promise<CatalogItem[]> {
    const { data } = await supabase
        .from("requirement_catalog")
        .select("key, label, applies_to, sort_order")
        .eq("active", true)
        .order("sort_order");
    return (data ?? []) as CatalogItem[];
}

// Saves the enrollment form's checklist: ticked items become "submitted", the rest "missing".
// Only the items that apply to this enrollment type are recorded.
export async function saveEnrollmentRequirements(
    studentId: string,
    schoolYearId: string,
    enrollmentType: string,
    checked: Record<string, boolean>,
): Promise<string | null> {
    const catalog = await getRequirementCatalog();
    const rows = catalog
        .filter((c) => c.applies_to.includes(enrollmentType))
        .map((c) => ({
            student_id: studentId,
            school_year_id: schoolYearId,
            requirement_key: c.key,
            status: checked[c.key] ? "submitted" : "missing",
        }));
    if (rows.length === 0) return null;
    const { error } = await supabase
        .from("student_requirements")
        .upsert(rows, { onConflict: "student_id,school_year_id,requirement_key", ignoreDuplicates: true });
    return error ? error.message : null;
}

// Per student: how many items are complete (submitted or waived) out of how many recorded.
// Students without any row have no requirements record and are left out.
export async function getRequirementSummaries(
    schoolYearId: string,
): Promise<Record<string, { complete: number; total: number }>> {
    const { data } = await supabase
        .from("student_requirements")
        .select("student_id, status")
        .eq("school_year_id", schoolYearId);
    const out: Record<string, { complete: number; total: number }> = {};
    for (const r of (data ?? []) as { student_id: string; status: RequirementStatus }[]) {
        const s = (out[r.student_id] ??= { complete: 0, total: 0 });
        s.total++;
        if (r.status !== "missing") s.complete++;
    }
    return out;
}

// Labels of the items still missing for one student and year ([] when none or no record).
export async function getMissingRequirements(studentId: string, schoolYearId: string): Promise<string[]> {
    const [catalog, { data }] = await Promise.all([
        getRequirementCatalog(),
        supabase
            .from("student_requirements")
            .select("requirement_key")
            .eq("student_id", studentId)
            .eq("school_year_id", schoolYearId)
            .eq("status", "missing"),
    ]);
    const labels = new Map(catalog.map((c) => [c.key, c.label]));
    return ((data ?? []) as { requirement_key: string }[]).map((r) => labels.get(r.requirement_key) ?? r.requirement_key);
}
