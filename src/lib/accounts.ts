import { supabase } from "../supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";

// supabase.functions.invoke only sets error.message to a generic
// "Edge Function returned a non-2xx status code" — the actual reason (e.g. an
// Auth/SMTP failure) lives in the response body, which this reads out.
export async function functionErrorMessage(error: unknown): Promise<string> {
    if (error instanceof FunctionsHttpError) {
        try {
            const body = await error.context.json();
            if (body?.error) return body.error as string;
        } catch {
            // response body wasn't JSON — fall through to the generic message
        }
    }
    return error instanceof Error ? error.message : "Something went wrong";
}

export async function createStudentAccount(
    studentId: string,
    email?: string | null,
): Promise<{ email: string; password: string | null; emailSent?: boolean }> {
    // Pass the caller's access token explicitly rather than relying on the client's implicit
    // default headers — the edge function requires a real user JWT (verify_jwt is on), and
    // without an explicit token some sessions were reaching it with neither an Authorization
    // nor apikey header, which the gateway rejects with UNAUTHORIZED_NO_AUTH_HEADER before the
    // function even runs.
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
        throw new Error(
            "Your session has expired — please log in again before confirming this enrollment.",
        );
    }
    const { data, error } = await supabase.functions.invoke(
        "create-student-account",
        {
            body: { student_id: studentId, email: email || undefined },
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    if (error) throw new Error(await functionErrorMessage(error));
    return data as { email: string; password: string | null; emailSent?: boolean };
}

// Creates (or reuses, if the email already has a parent account) a guardian login and
// links it to the student. `isPrimaryContact` marks whether this guardian is the
// designated contact of record for the student.
export async function createGuardianAccount(args: {
    studentId: string;
    fullName: string;
    relationship: string;
    phone?: string;
    email?: string;
    isPrimaryContact?: boolean;
}): Promise<{
    email: string;
    password: string | null;
    isNewAccount: boolean;
    emailSent?: boolean;
}> {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
        throw new Error(
            "Your session has expired — please log in again before confirming this enrollment.",
        );
    }
    const { data, error } = await supabase.functions.invoke(
        "create-guardian-account",
        {
            body: {
                student_id: args.studentId,
                full_name: args.fullName,
                relationship: args.relationship,
                phone: args.phone,
                email: args.email,
                is_primary_contact: args.isPrimaryContact ?? true,
            },
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    if (error) throw new Error(await functionErrorMessage(error));
    return data as {
        email: string;
        password: string | null;
        isNewAccount: boolean;
        emailSent?: boolean;
    };
}

type StaffAppRole =
    | "full_admin"
    | "registrar"
    | "cashier"
    | "teacher"
    | "guard";

export const STAFF_POSITION_ROLES: Record<string, StaffAppRole> = {
    Teacher: "teacher",
    Admin: "full_admin",
    Registrar: "registrar",
    Cashier: "cashier",
    Guard: "guard",
};

export async function createStaffAccount(
    employeeId: string,
    role: StaffAppRole,
    email?: string,
): Promise<{ email: string; password: string | null; emailSent?: boolean }> {
    // See createStudentAccount above — pass the caller's access token explicitly so the
    // gateway doesn't reject the request with UNAUTHORIZED_NO_AUTH_HEADER.
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
        throw new Error(
            "Your session has expired — please log in again before adding this employee.",
        );
    }
    const { data, error } = await supabase.functions.invoke(
        "create-staff-account",
        {
            body: { employee_id: employeeId, role, email },
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    if (error) throw new Error(await functionErrorMessage(error));
    return data as { email: string; password: string | null; emailSent?: boolean };
}

// Full-admin-only: removes the Supabase Auth login tied to a student, employee, or
// profile record (server-side, via the service role) so removing them here also
// cleans up their account instead of leaving an orphaned login in Supabase.
export async function deleteAuthAccountFor(
    target: { studentId: string } | { employeeId: string } | { userId: string },
): Promise<{ deleted: boolean }> {
    const body =
        "studentId" in target
            ? { student_id: target.studentId }
            : "employeeId" in target
              ? { employee_id: target.employeeId }
              : { user_id: target.userId };
    const { data, error } = await supabase.functions.invoke(
        "delete-user-account",
        { body },
    );
    if (error) throw new Error(await functionErrorMessage(error));
    return data as { deleted: boolean };
}
