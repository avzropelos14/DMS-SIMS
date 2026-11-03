import { supabase } from "../supabase";

async function generateEmployeeId(fullName: string): Promise<string> {
    const parts = fullName.trim().split(/\s+/);
    const last = parts[parts.length - 1] || "STAFF";
    const surname = last.toUpperCase().replace(/[^A-Z]/g, "") || "STAFF";
    const prefix = `EMP-${surname}-`;
    const { count } = await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .like("id", `${prefix}%`);
    const seq = ((count ?? 0) + 1).toString().padStart(3, "0");
    return `${prefix}${seq}`;
}

export async function getDepartmentIdByName(name: string): Promise<string | null> {
    if (!name) return null;
    const { data } = await supabase
        .from("departments")
        .select("id")
        .eq("name", name)
        .maybeSingle();
    return data?.id ?? null;
}

interface NewEmployeeInput {
    fullName: string;
    position: string;
    departmentName: string;
    email?: string | null;
    phone: string;
    education?: string | null;
    employmentType?: "full-time" | "part-time" | "contractual" | null;
    dateHired: string;
    address?: string | null;
    licenseNo?: string | null;
    notes?: string | null;
}

export async function insertEmployee(input: NewEmployeeInput) {
    const id = await generateEmployeeId(input.fullName);
    const departmentId = await getDepartmentIdByName(input.departmentName);
    const { data, error } = await supabase
        .from("employees")
        .insert({
            id,
            full_name: input.fullName,
            position: input.position,
            department_id: departmentId,
            email: input.email || null,
            phone: input.phone,
            education: input.education || null,
            employment_type: input.employmentType || null,
            date_hired: input.dateHired,
            status: "active",
            address: input.address || null,
            license_no: input.licenseNo || null,
            notes: input.notes || null,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

// Academic departments available for teacher subject specialization (must match `departments` table)
export const TEACHER_SUBJECTS = [
    "Mathematics",
    "English",
    "Science",
    "Filipino",
    "Araling Panlipunan",
    "MAPEH",
    "Christian Living",
];
