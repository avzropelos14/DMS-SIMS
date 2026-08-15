import { supabase } from '../supabase';
import type { UserRole } from '../App';

const APP_ROLE_TO_USER_ROLE: Record<string, UserRole> = {
    full_admin: 'admin',
    registrar: 'registrar',
    cashier: 'cashier',
    teacher: 'teacher',
    guard: 'guard',
};

export interface ResolvedIdentity {
    role: UserRole;
    userData: Record<string, any>;
}

/**
 * Resolves a signed-in auth.users id to an app role + user data by checking,
 * in order: profiles (staff incl. guard) -> guardians (parent) -> student_accounts (student).
 * These are mutually exclusive by construction. Returns null if none match
 * (a valid auth session with no provisioned identity row).
 */
export async function resolveIdentity(userId: string): Promise<ResolvedIdentity | null> {
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, employee_id, employees(*)')
        .eq('id', userId)
        .maybeSingle();

    if (profile) {
        const role = APP_ROLE_TO_USER_ROLE[profile.role as string] ?? null;
        if (!role) return null;
        return {
            role,
            userData: {
                id: profile.id,
                name: profile.full_name,
                email: profile.email,
                role: profile.role,
                employeeId: profile.employee_id,
                employee: profile.employees ?? null,
            },
        };
    }

    const { data: currentYear } = await supabase
        .from('school_years')
        .select('id')
        .eq('is_current', true)
        .limit(1)
        .maybeSingle();

    const { data: guardian } = await supabase
        .from('guardians')
        .select('id, full_name, email, phone')
        .eq('id', userId)
        .maybeSingle();

    if (guardian) {
        let enrollmentConfirmed = false;
        if (currentYear) {
            const { data: links } = await supabase
                .from('student_guardians')
                .select('student_id')
                .eq('guardian_id', userId);
            const studentIds = (links ?? []).map((l) => l.student_id);
            if (studentIds.length) {
                const { count } = await supabase
                    .from('enrollments')
                    .select('id', { count: 'exact', head: true })
                    .in('student_id', studentIds)
                    .eq('school_year_id', currentYear.id)
                    .eq('status', 'confirmed');
                enrollmentConfirmed = (count ?? 0) > 0;
            }
        }
        return {
            role: 'parent',
            userData: {
                id: guardian.id,
                name: guardian.full_name,
                email: guardian.email,
                phone: guardian.phone,
                enrollmentConfirmed,
            },
        };
    }

    const { data: studentAccount } = await supabase
        .from('student_accounts')
        .select('student_id, auth_user_id, students(*)')
        .eq('auth_user_id', userId)
        .maybeSingle();

    if (studentAccount) {
        const student = studentAccount.students as Record<string, any> | null;
        const name = student ? [student.first_name, student.last_name].filter(Boolean).join(' ') : '';
        let enrollmentConfirmed = false;
        if (currentYear) {
            const { data: enr } = await supabase
                .from('enrollments')
                .select('status')
                .eq('student_id', studentAccount.student_id)
                .eq('school_year_id', currentYear.id)
                .maybeSingle();
            enrollmentConfirmed = enr?.status === 'confirmed';
        }
        return {
            role: 'student',
            userData: {
                id: studentAccount.student_id,
                authUserId: studentAccount.auth_user_id,
                studentId: studentAccount.student_id,
                name,
                email: student?.email ?? null,
                grade: student?.grade_level ?? null,
                student: student ?? null,
                enrollmentConfirmed,
            },
        };
    }

    return null;
}
