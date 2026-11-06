import { supabase } from "../supabase";
import { functionErrorMessage } from "./accounts";

// Self-dismissal (Phase 6A): shared types, labels and the password check.

export interface SelfDismissal {
    id: string;
    student_id: string;
    guardian_id: string;
    guardian_name: string | null;
    valid_from: string;
    valid_to: string;
    earliest_release_time: string; // "15:30"
    travel_mode: TravelMode;
    travel_note: string | null;
    status: "pending_approval" | "active" | "denied" | "revoked";
    created_at: string;
    decision_note: string | null;
    // Only in some lists:
    student_name?: string;
    grade_level?: string | null;
    student_photo_path?: string | null;
    left_at?: string | null;
}

export type TravelMode = "walk" | "public_transport" | "bicycle" | "school_service" | "other";

export const TRAVEL_MODES: { value: TravelMode; label: string }[] = [
    { value: "walk", label: "Walks home" },
    { value: "public_transport", label: "Public transport (jeepney, tricycle, bus)" },
    { value: "bicycle", label: "Bicycle" },
    { value: "school_service", label: "School service / van" },
    { value: "other", label: "Other" },
];

export const travelLabel = (mode: string) => TRAVEL_MODES.find((m) => m.value === mode)?.label ?? mode;

export const STATUS_LABEL: Record<SelfDismissal["status"], string> = {
    pending_approval: "Waiting for registrar",
    active: "Allowed",
    denied: "Not approved",
    revoked: "Cancelled",
};

// Bump when the consent wording below changes; the version is stored with each permission.
export const CONSENT_VERSION = "v1-2026-11";
export const CONSENT_TEXT =
    "I allow my child to leave the school premises on their own at dismissal, within the dates and " +
    "not earlier than the time I chose. I understand that once my child leaves the school gate, the " +
    "school is no longer responsible for their safety on the way home. I can cancel this permission " +
    "at any time from the Parent Portal.";

// "15:30" -> "3:30 PM"
export function formatTime12(hhmm: string): string {
    const [h, m] = hhmm.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
    const suffix = h >= 12 ? "PM" : "AM";
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatDateShort(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Today's date in the Philippines, as YYYY-MM-DD.
export function manilaToday(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

// Re-checks the signed-in user's password on the server (confirm-password edge function).
// Returns an error message, or null when confirmed (valid for 5 minutes, used once).
export async function confirmPassword(password: string): Promise<string | null> {
    const { data, error } = await supabase.functions.invoke("confirm-password", { body: { password } });
    if (error) return functionErrorMessage(error);
    if (!data?.success) return data?.error ?? "Could not confirm your password.";
    return null;
}

export async function getPickupSettings(): Promise<{ self_dismissal_min_grade: number; late_pickup_time: string } | null> {
    const { data, error } = await supabase.rpc("get_pickup_settings");
    if (error || !data) return null;
    return data;
}

// "Grade 7" -> 7, Kinder / unknown -> 0 (same rule as the database).
export function gradeNumber(grade: string | null | undefined): number {
    const m = /^\s*grade\s*(\d+)/i.exec(grade ?? "");
    return m ? Number(m[1]) : 0;
}
