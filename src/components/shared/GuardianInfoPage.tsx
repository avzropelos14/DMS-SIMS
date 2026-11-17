import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle, ChevronDown, Pencil, Users } from "lucide-react";
import { supabase } from "../../supabase";

// Student Details → Parent / Guardian page (admin / registrar): the student's parents or
// guardians, with an edit page for each. Name and phone live on the guardian's own record
// (shared by all their children); the relationship is per child. The email is the parent's
// sign-in address, so it is shown but not edited here. The student's own copy of the contact
// (students.guardian_name / guardian_phone / guardian_relationship, read by ID cards and the
// gate) is kept in step on save.

interface GuardianLink {
    linkId: string;
    guardianId: string;
    fullName: string;
    email: string | null;
    phone: string;
    relationship: string;
    primary: boolean;
}

interface LegacyContact {
    name: string | null;
    phone: string | null;
    relationship: string | null;
    email: string | null;
}

// Same wording as the enrollment form (Mother / Father, plus its other guardian options).
const RELATIONSHIPS = ["Mother", "Father", "Legal Guardian", "Grandparent", "Sibling", "Other"];

// A Philippine mobile number as 09XXXXXXXXX, or null when it isn't one.
function normalizeMobile(input: string): string | null {
    const d = input.replace(/[^0-9]/g, "");
    if (/^09[0-9]{9}$/.test(d)) return d;
    if (/^9[0-9]{9}$/.test(d)) return `0${d}`;
    if (/^639[0-9]{9}$/.test(d)) return `0${d.slice(2)}`;
    return null;
}

const isGeneratedEmail = (email: string | null) => !!email && email.toLowerCase().endsWith("@missionschool.edu.ph");

// Loads the student's linked guardians (primary contact first) and the enrollment-form contact.
async function loadStudentGuardians(
    studentId: string,
): Promise<{ links: GuardianLink[]; legacy: LegacyContact | null } | null> {
    const [{ data: linkRows, error }, { data: student }] = await Promise.all([
        supabase
            .from("student_guardians")
            .select("id, relationship, is_primary_contact, guardians(id, full_name, email, phone)")
            .eq("student_id", studentId),
        supabase
            .from("students")
            .select("guardian_name, guardian_phone, guardian_relationship, guardian_email")
            .eq("id", studentId)
            .maybeSingle(),
    ]);
    if (error) return null;
    const links = ((linkRows ?? []) as unknown as {
        id: string;
        relationship: string | null;
        is_primary_contact: boolean | null;
        guardians: { id: string; full_name: string | null; email: string | null; phone: string | null } | null;
    }[])
        .filter((r) => r.guardians)
        .map((r) => ({
            linkId: r.id,
            guardianId: r.guardians!.id,
            fullName: r.guardians!.full_name ?? "",
            email: r.guardians!.email,
            phone: r.guardians!.phone ?? "",
            relationship: r.relationship ?? "",
            primary: Boolean(r.is_primary_contact),
        }))
        .sort((a, b) => Number(b.primary) - Number(a.primary));
    return {
        links,
        legacy: student
            ? {
                  name: student.guardian_name,
                  phone: student.guardian_phone,
                  relationship: student.guardian_relationship,
                  email: student.guardian_email,
              }
            : null,
    };
}

export function GuardianInfoPage({
    studentId,
    studentLabel,
    onBack,
    onChanged,
}: {
    studentId: string;
    studentLabel: string;
    onBack: () => void;
    onChanged?: () => void;
}) {
    const [links, setLinks] = useState<GuardianLink[] | null>(null);
    const [legacy, setLegacy] = useState<LegacyContact | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [editing, setEditing] = useState<GuardianLink | null>(null);
    const [form, setForm] = useState({ fullName: "", phone: "", relationship: "" });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const res = await loadStudentGuardians(studentId);
        if (!res) {
            setLoadFailed(true);
            return;
        }
        setLoadFailed(false);
        setLinks(res.links);
        setLegacy(res.legacy);
    }, [studentId]);

    useEffect(() => {
        let cancelled = false;
        loadStudentGuardians(studentId).then((res) => {
            if (cancelled) return;
            if (!res) {
                setLoadFailed(true);
                return;
            }
            setLinks(res.links);
            setLegacy(res.legacy);
        });
        return () => { cancelled = true; };
    }, [studentId]);

    const startEdit = (g: GuardianLink) => {
        setEditing(g);
        setForm({ fullName: g.fullName, phone: g.phone, relationship: g.relationship });
        setFormError(null);
        setMessage(null);
    };

    const save = async () => {
        if (!editing) return;
        const fullName = form.fullName.trim().replace(/\s+/g, " ");
        const relationship = form.relationship.trim();
        const phone = normalizeMobile(form.phone);
        if (!fullName) {
            setFormError("Please enter the parent's full name.");
            return;
        }
        if (!phone) {
            setFormError("Please enter a valid mobile number with 11 digits, like 09171234567.");
            return;
        }
        if (!relationship) {
            setFormError("Please choose the relationship to the student.");
            return;
        }
        setSaving(true);
        setFormError(null);

        const { error: gError } = await supabase
            .from("guardians")
            .update({ full_name: fullName, phone })
            .eq("id", editing.guardianId);
        if (gError) {
            setSaving(false);
            setFormError("Couldn't save the parent's details. Please try again.");
            return;
        }
        const { error: lError } = await supabase
            .from("student_guardians")
            .update({ relationship })
            .eq("id", editing.linkId);

        // Keep each child's own copy of the contact in step, where this parent is that child's
        // primary contact (ID cards and the gate read these copies).
        const { data: primaryFor } = await supabase
            .from("student_guardians")
            .select("student_id")
            .eq("guardian_id", editing.guardianId)
            .eq("is_primary_contact", true);
        const childIds = (primaryFor ?? []).map((r: { student_id: string }) => r.student_id);
        let copyFailed = false;
        if (childIds.length) {
            const { error } = await supabase.from("students").update({ guardian_name: fullName, guardian_phone: phone }).in("id", childIds);
            if (error) copyFailed = true;
        }
        if (editing.primary) {
            const { error } = await supabase.from("students").update({ guardian_relationship: relationship }).eq("id", studentId);
            if (error) copyFailed = true;
        }

        setSaving(false);
        if (copyFailed) {
            // Saving again is safe: it writes the same values.
            setFormError("The parent's details were saved, but the copy on the student record (used by ID cards and the gate) didn't update. Check the connection and press Save again.");
            return;
        }
        if (lError) {
            setFormError("The name and phone were saved, but the relationship couldn't be. Please try again.");
            return;
        }
        setEditing(null);
        setMessage(
            childIds.length > 1
                ? `Saved. ${fullName}'s details were updated for all ${childIds.length} of their children.`
                : "Parent details saved.",
        );
        await reload();
        onChanged?.();
    };

    const input = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]";
    const phoneValid = (p: string) => normalizeMobile(p) !== null;

    // ─── edit page ───
    if (editing) {
        return (
            <div className="space-y-6">
                <div>
                    <button
                        onClick={() => { setEditing(null); setFormError(null); }}
                        className="flex items-center gap-1.5 text-base font-medium text-[#1a2b4a] hover:underline mb-2"
                    >
                        <ChevronDown className="w-5 h-5 rotate-90" />
                        Back to Parent / Guardian
                    </button>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">Edit Parent / Guardian</h1>
                    <p className="text-[#6b6456]">{editing.fullName} • parent of {studentLabel}</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Full name <span className="font-normal text-[#8b8476]">(Last, First Middle)</span>
                            </label>
                            <input
                                value={form.fullName}
                                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                                className={input}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">Mobile number</label>
                            <input
                                value={form.phone}
                                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                                inputMode="tel"
                                placeholder="09171234567"
                                className={input}
                            />
                            {form.phone && !phoneValid(form.phone) ? (
                                <p className="text-xs text-amber-700 mt-1">Needs 11 digits starting with 09.</p>
                            ) : (
                                <p className="text-xs text-[#8b8476] mt-1">Used for SMS alerts and the emergency call list.</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">Relationship to {studentLabel.split(" • ")[0]}</label>
                            <select
                                value={RELATIONSHIPS.includes(form.relationship) || !form.relationship ? form.relationship : "Other"}
                                onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
                                className={`${input} bg-white`}
                            >
                                <option value="">Select</option>
                                {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div className="sm:col-span-2 bg-[#faf8f5] rounded-lg p-3">
                            <p className="text-xs font-semibold text-[#8b8476] uppercase tracking-wide mb-1">Email (sign-in address)</p>
                            <p className="text-sm text-[#1a2b4a] font-medium break-all">{editing.email ?? "—"}</p>
                            <p className="text-xs text-[#8b8476] mt-1">The parent signs in with this email, so it can't be changed here.</p>
                        </div>
                    </div>

                    {formError && (
                        <div className="flex items-start gap-2 p-3 rounded-lg text-sm border bg-red-50 border-red-200 text-red-700">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{formError}</span>
                        </div>
                    )}

                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                        <button
                            onClick={() => { setEditing(null); setFormError(null); }}
                            disabled={saving}
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all disabled:opacity-60"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => { void save(); }}
                            disabled={saving}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60"
                        >
                            {saving ? "Saving…" : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ─── view page ───
    return (
        <div className="space-y-6">
            <div>
                <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-base font-medium text-[#1a2b4a] hover:underline mb-2"
                >
                    <ChevronDown className="w-5 h-5 rotate-90" />
                    Back to Student Details
                </button>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">Parent / Guardian</h1>
                <p className="text-[#6b6456]">{studentLabel}</p>
            </div>

            {message && (
                <div className="flex items-start gap-2 p-3 rounded-lg text-sm border bg-green-50 border-green-200 text-green-700">
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{message}</span>
                </div>
            )}

            {loadFailed ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-red-500 text-sm">
                    Couldn't load the parent's details.
                </div>
            ) : links === null ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-[#8b8476] text-sm">
                    Loading…
                </div>
            ) : links.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-[#6b6456]">No parent account is linked to this student yet.</p>
                    {legacy?.name && (
                        <p className="text-sm text-[#8b8476] mt-2">
                            Contact on the enrollment form: {legacy.name}
                            {legacy.relationship ? ` (${legacy.relationship})` : ""}
                            {legacy.phone ? ` · ${legacy.phone}` : ""}
                        </p>
                    )}
                </div>
            ) : (
                links.map((g) => (
                    <div key={g.linkId} className="bg-white rounded-xl shadow-sm border border-gray-200">
                        <div className="p-6 space-y-5">
                            <div className="flex items-start gap-4 pb-5 border-b border-gray-200">
                                <div className="w-14 h-14 bg-gradient-to-br from-[#1a2b4a] to-[#7d1935] rounded-xl flex items-center justify-center text-white text-lg font-bold shrink-0">
                                    <Users className="w-6 h-6" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-xl font-bold text-[#1a2b4a]">{g.fullName || "—"}</h3>
                                    <p className="text-[#c9a961] font-medium">{g.relationship || "Relationship not set"}</p>
                                    {g.primary && (
                                        <span className="inline-flex mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                                            Primary contact
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-[#faf8f5] rounded-lg p-3">
                                    <p className="text-xs font-semibold text-[#8b8476] mb-1 uppercase tracking-wide">Mobile Number</p>
                                    <p className="text-sm text-[#2c2c2c] font-medium">{g.phone || "—"}</p>
                                    {g.phone && !phoneValid(g.phone) && (
                                        <p className="text-xs font-semibold text-amber-700 mt-1">Invalid number: SMS can't be sent</p>
                                    )}
                                </div>
                                <div className="bg-[#faf8f5] rounded-lg p-3">
                                    <p className="text-xs font-semibold text-[#8b8476] mb-1 uppercase tracking-wide">Email (sign-in)</p>
                                    <p className="text-sm text-[#2c2c2c] font-medium break-all">
                                        {g.email ?? "—"}
                                        {isGeneratedEmail(g.email) && <span className="text-xs font-normal text-[#8b8476]"> (school-generated)</span>}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-200">
                            <button
                                onClick={() => startEdit(g)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all text-sm"
                            >
                                <Pencil className="w-4 h-4" />
                                Edit
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
