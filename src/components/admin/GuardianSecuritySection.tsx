import { useEffect, useState } from "react";
import {
    AlertCircle, AlertTriangle, Camera, CheckCircle, Lock, PauseCircle, PlayCircle, QrCode,
    Search, ShieldCheck, Trash2, Unlock, User, XCircle, CalendarPlus,
} from "lucide-react";
import { supabase } from "../../supabase";
import { PhotoCaptureModal } from "../shared/PhotoCaptureModal";
import { GuardianActionPage, type GuardianAction } from "./GuardianActionPage";
import { deletePhoto, getPhotoUrl, photoFileName, safeFolder, uploadPhoto } from "../../lib/photo";

// Guardian Security: pickup-verification photos (Phase 5B) and account security (Phase 5C).
// The office approves photos parents submit, takes photos at the desk, removes photos it no
// longer needs to keep (Data Privacy Act), locks down a guardian whose phone or account may be
// compromised, suspends or replaces single pickup QR codes, and allows a second pickup today.

interface LinkedStudent {
    id: string;
    first_name: string;
    last_name: string;
    grade_level: string | null;
    status: string;
    photo_path: string | null;
}

interface GuardianLink {
    id: string;
    relationship: string | null;
    access_status: string;
    students: LinkedStudent | null;
}

interface GuardianRow {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    photo_path: string | null;
    photo_status: string;
    student_guardians: GuardianLink[];
}

interface PendingPhoto {
    guardian_id: string;
    full_name: string;
    email: string | null;
    path: string;
    submitted_at: string;
    current_photo_path: string | null;
}

interface SecurityStatus {
    locked: boolean;
    incident_reason: string | null;
    incident_opened_at: string | null;
    must_change_password: boolean;
    active_temporary_qrs: number;
    qr_rotated_at: Record<string, string>;
}

interface OpenIncident {
    guardian_id: string;
    full_name: string;
    email: string | null;
    reason: string;
    opened_at: string;
}

interface PickupOverride {
    student_id: string;
    student_name: string;
    granted_at: string;
    used_at: string | null;
}

const GUARDIAN_SELECT =
    "id, full_name, email, phone, photo_path, photo_status, student_guardians(id, relationship, access_status, students(id, first_name, last_name, grade_level, status, photo_path))";

function PhotoThumb({ path, size = "w-20 h-20" }: { path: string | null | undefined; size?: string }) {
    // Remembers which path the loaded URL belongs to, so a changed path never shows a stale photo.
    const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);
    useEffect(() => {
        let cancelled = false;
        if (!path) return;
        getPhotoUrl(path).then((u) => { if (!cancelled) setLoaded({ path, url: u }); });
        return () => { cancelled = true; };
    }, [path]);
    const url = path && loaded?.path === path ? loaded.url : null;
    return (
        <div className={`${size} rounded-xl bg-[#faf8f5] border border-gray-200 overflow-hidden flex items-center justify-center shrink-0`}>
            {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <User className="w-1/2 h-1/2 text-gray-300" />}
        </div>
    );
}

type CaptureTarget = { kind: "guardian"; id: string; name: string } | { kind: "student"; id: string; name: string };

// Pending photos a parent replaced before review: delete the files, then clear the queue.
async function cleanUpReplacedPhotos() {
    const { data } = await supabase.rpc("photo_cleanup_list");
    const paths = (data ?? []) as string[];
    if (paths.length === 0) return;
    for (const p of paths) await deletePhoto(p);
    await supabase.rpc("photo_cleanup_done", { p_paths: paths });
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "");

export function GuardianSecuritySection() {
    const [pending, setPending] = useState<PendingPhoto[]>([]);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<GuardianRow[]>([]);
    const [searched, setSearched] = useState(false);
    const [selected, setSelected] = useState<GuardianRow | null>(null);
    const [security, setSecurity] = useState<{ id: string; status: SecurityStatus } | null>(null);
    const [incidents, setIncidents] = useState<OpenIncident[]>([]);
    const [overrides, setOverrides] = useState<PickupOverride[]>([]);
    const [retention, setRetention] = useState<GuardianRow[]>([]);
    const [capture, setCapture] = useState<CaptureTarget | null>(null);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [action, setAction] = useState<GuardianAction | null>(null);

    const fetchPending = () =>
        supabase.rpc("pending_guardian_photos").then(({ data }) => (data ?? []) as PendingPhoto[]);
    const fetchIncidents = () =>
        supabase.rpc("security_incidents_open").then(({ data }) => (data ?? []) as OpenIncident[]);
    const fetchOverrides = () =>
        supabase.rpc("pickup_overrides_today").then(({ data }) => (data ?? []) as PickupOverride[]);

    // Guardians still holding a photo although none of their children is active.
    const fetchRetention = () =>
        supabase.from("guardians").select(GUARDIAN_SELECT).not("photo_path", "is", null).then(({ data }) =>
            ((data ?? []) as unknown as GuardianRow[]).filter(
                (g) => !g.student_guardians.some((l) => l.students?.status === "Active"),
            ),
        );

    const loadPending = async () => setPending(await fetchPending());
    const loadRetention = async () => setRetention(await fetchRetention());
    const loadIncidents = async () => setIncidents(await fetchIncidents());
    const loadOverrides = async () => setOverrides(await fetchOverrides());

    const loadSecurity = async (id: string) => {
        const { data } = await supabase.rpc("guardian_security_status", { p_guardian_id: id });
        setSecurity(data ? { id, status: data as SecurityStatus } : null);
    };

    const refreshSelected = async (id: string) => {
        const { data } = await supabase.from("guardians").select(GUARDIAN_SELECT).eq("id", id).maybeSingle();
        setSelected((data as unknown as GuardianRow) ?? null);
        void loadSecurity(id);
    };

    const openGuardian = (g: GuardianRow) => {
        setSelected(g);
        void loadSecurity(g.id);
    };

    const openGuardianById = async (id: string) => {
        setMessage(null);
        await refreshSelected(id);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    useEffect(() => {
        let cancelled = false;
        fetchPending().then((rows) => { if (!cancelled) setPending(rows); });
        fetchRetention().then((rows) => { if (!cancelled) setRetention(rows); });
        fetchIncidents().then((rows) => { if (!cancelled) setIncidents(rows); });
        fetchOverrides().then((rows) => { if (!cancelled) setOverrides(rows); });
        void cleanUpReplacedPhotos();
        return () => { cancelled = true; };
    }, []);

    const search = async (e: React.FormEvent) => {
        e.preventDefault();
        // Characters that would break the PostgREST "or" filter are dropped.
        const q = query.trim().replace(/[,()*%\\]/g, " ").trim();
        if (!q) return;
        const { data } = await supabase
            .from("guardians")
            .select(GUARDIAN_SELECT)
            .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
            .order("full_name")
            .limit(20);
        setResults((data ?? []) as unknown as GuardianRow[]);
        setSearched(true);
        setSelected(null);
    };

    const flash = (ok: boolean, text: string) => setMessage({ ok, text });

    const review = async (p: PendingPhoto, approve: boolean) => {
        setBusy(true);
        const { data, error } = await supabase.rpc("review_guardian_photo", { p_guardian_id: p.guardian_id, p_approve: approve });
        setBusy(false);
        if (error || data?.error) {
            flash(false, "Couldn't update that photo. Please try again.");
            return;
        }
        await deletePhoto(data?.delete_path);
        flash(true, approve ? `Photo approved for ${p.full_name}.` : `Photo rejected for ${p.full_name}.`);
        void loadPending();
        void loadRetention();
        if (selected?.id === p.guardian_id) void refreshSelected(p.guardian_id);
    };

    const saveCapture = async (blob: Blob): Promise<string | null> => {
        if (!capture) return null;
        const path = capture.kind === "guardian"
            ? `guardians/${capture.id}/${photoFileName()}`
            : `students/${safeFolder(capture.id)}/${photoFileName()}`;
        const uploadError = await uploadPhoto(path, blob);
        if (uploadError) return `Upload failed: ${uploadError}`;
        const { data, error } = capture.kind === "guardian"
            ? await supabase.rpc("set_guardian_photo", { p_guardian_id: capture.id, p_path: path })
            : await supabase.rpc("set_student_photo", { p_student_id: capture.id, p_path: path });
        if (error) {
            await deletePhoto(path);
            return "Couldn't save the photo. Please try again.";
        }
        await deletePhoto(data?.delete_path);
        flash(true, `Photo saved for ${capture.name}.`);
        setCapture(null);
        if (selected) void refreshSelected(selected.id);
        void loadRetention();
        return null;
    };

    // Opens the confirmation page; on success it closes and shows the result message.
    const ask = (a: GuardianAction) => {
        setMessage(null);
        setAction({
            ...a,
            run: async (text) => {
                const failure = await a.run(text);
                if (!failure) {
                    setAction(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }
                return failure;
            },
        });
    };

    const removeGuardianPhoto = (g: GuardianRow) => ask({
        tone: "danger",
        title: "Delete pickup photo",
        subject: g.full_name,
        intro: "The guardian's pickup photo is deleted permanently from the school's storage.",
        points: [
            "Guards will see \"No approved photo\" and must check a government ID at pickup.",
            "The guardian or the office can add a new photo later.",
        ],
        confirmLabel: "Delete photo",
        run: async () => {
            const { data, error } = await supabase.rpc("remove_guardian_photo", { p_guardian_id: g.id });
            if (error) return "Couldn't delete that photo. Please try again.";
            await deletePhoto(data?.delete_path);
            flash(true, `Photo deleted for ${g.full_name}.`);
            void loadRetention();
            if (selected?.id === g.id) void refreshSelected(g.id);
            return null;
        },
    });

    // ─── Phase 5C actions ───
    const lockdown = (g: GuardianRow) => ask({
        tone: "danger",
        title: "Lock down account",
        subject: `${g.full_name}${g.email ? ` · ${g.email}` : ""}`,
        intro: "Use this when the guardian lost their phone or the account may be in someone else's hands. It takes effect immediately.",
        points: [
            "Every pickup QR code of this guardian is suspended and replaced (old codes and screenshots stop working).",
            "Their active temporary QR codes are cancelled.",
            "They are signed out on every device and remembered devices are forgotten.",
            "Sign-in is blocked until the full admin restores access after checking them in person.",
            "They must set a new password at their next sign-in.",
        ],
        inputLabel: "Reason",
        placeholder: "e.g. Lost phone, reported by the parent by phone call",
        confirmLabel: "Lock down now",
        run: async (reason) => {
            const { data, error } = await supabase.rpc("lockdown_guardian", { p_guardian_id: g.id, p_reason: reason });
            if (error || data?.error) {
                return data?.error === "already_locked" ? `${g.full_name} is already locked down.` : "Couldn't lock down this account. Please try again.";
            }
            flash(true,
                `${g.full_name} is locked down: ${data.links_suspended} pickup link(s) suspended, ` +
                `${data.temporary_qrs_revoked} temporary QR code(s) cancelled, ${data.sessions_ended} session(s) ended.`);
            void refreshSelected(g.id);
            void loadIncidents();
            return null;
        },
    });

    const restore = (g: GuardianRow) => ask({
        tone: "success",
        title: "Restore access",
        subject: `${g.full_name}${g.email ? ` · ${g.email}` : ""}`,
        intro: "Only restore access after checking the guardian in person with a valid government ID.",
        points: [
            "Sign-in is unblocked.",
            "The pickup links suspended by the lockdown re-open, with the NEW QR codes.",
            "The guardian must set a new password when they sign in.",
        ],
        inputLabel: "How was the guardian verified?",
        placeholder: "e.g. Verified with driver's licence at the office",
        confirmLabel: "Restore access",
        run: async (note) => {
            const { data, error } = await supabase.rpc("restore_guardian_access", { p_guardian_id: g.id, p_note: note });
            if (error || data?.error) {
                return error?.code === "42501" ? "Only the full admin can restore access." : "Couldn't restore access. Please try again.";
            }
            flash(true, `Access restored for ${g.full_name}. They must set a new password at their next sign-in.`);
            void refreshSelected(g.id);
            void loadIncidents();
            return null;
        },
    });

    const setLinkAccess = (link: GuardianLink, name: string, status: "active" | "suspended") => ask({
        tone: status === "suspended" ? "danger" : "success",
        title: status === "suspended" ? "Suspend pickup" : "Re-activate pickup",
        subject: `${name} · ${selected?.full_name ?? ""}`,
        intro: status === "suspended"
            ? `This guardian's QR code for ${name} stops working until the office re-activates it.`
            : `This guardian's QR code for ${name} works again at the gate.`,
        points: status === "suspended"
            ? ["The parent sees a \"pickup suspended\" notice in their portal.", "Guards see \"suspended\" when the code is scanned."]
            : [],
        confirmLabel: status === "suspended" ? "Suspend pickup" : "Re-activate pickup",
        run: async () => {
            const { data, error } = await supabase.rpc("set_guardian_link_access", { p_link_id: link.id, p_status: status });
            if (error || data?.error) {
                return data?.error === "guardian_locked"
                    ? "This guardian is locked down. Restore access first."
                    : "Couldn't change pickup access. Please try again.";
            }
            flash(true, status === "suspended" ? `Pickup of ${name} suspended.` : `Pickup of ${name} re-activated.`);
            if (selected) void refreshSelected(selected.id);
            return null;
        },
    });

    const rotateQr = (link: GuardianLink, name: string) => ask({
        tone: "normal",
        title: "Issue a new QR code",
        subject: `${name} · ${selected?.full_name ?? ""}`,
        intro: "Use this if the QR code may have been shared, copied or photographed.",
        points: [
            "The current code (and any screenshot of it) stops working at once.",
            "The parent sees the new code in their portal the next time it loads.",
        ],
        confirmLabel: "Issue new QR code",
        run: async () => {
            const { error } = await supabase.rpc("rotate_guardian_link_qr", { p_link_id: link.id });
            if (error) return "Couldn't replace the QR code. Please try again.";
            flash(true, `New QR code issued for ${name}.`);
            if (selected) void loadSecurity(selected.id);
            return null;
        },
    });

    const allowSecondPickup = (studentId: string, name: string) => ask({
        tone: "normal",
        title: "Allow another pickup today",
        subject: name,
        intro: "A student can normally be picked up only once per day. This allows ONE more pickup today, e.g. when the student came back for an activity.",
        points: [
            "Works for one more scan today only, then the normal rule applies again.",
            "Shown under \"Extra pickups allowed today\".",
        ],
        inputLabel: "Reason",
        placeholder: "e.g. Returned to school for the afternoon program",
        confirmLabel: "Allow one more pickup",
        run: async (reason) => {
            const { error } = await supabase.rpc("grant_pickup_override", { p_student_id: studentId, p_reason: reason });
            if (error) return "Couldn't allow the extra pickup. Please try again.";
            flash(true, `One more pickup of ${name} is allowed today.`);
            void loadOverrides();
            return null;
        },
    });

    if (action) return <GuardianActionPage action={action} onCancel={() => setAction(null)} />;

    const status = selected && security?.id === selected.id ? security.status : null;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Guardian Security</h1>
                <p className="text-[#6b6456]">
                    Pickup photos, pickup QR codes and account lockdown for guardians. Photos are private and only
                    shown to guards at pickup and to the school office.
                </p>
            </div>

            {message && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${message.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {message.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{message.text}</span>
                </div>
            )}

            {/* Locked accounts */}
            {incidents.length > 0 && (
                <div className="bg-red-50 rounded-xl border border-red-200 p-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Lock className="w-5 h-5 text-red-700" />
                        <h3 className="text-lg font-semibold text-red-800">Locked-down guardians</h3>
                    </div>
                    <div className="space-y-2">
                        {incidents.map((i) => (
                            <div key={i.guardian_id} className="flex flex-wrap items-center gap-3 p-3 bg-white rounded-lg border border-red-100">
                                <div className="flex-1 min-w-[180px]">
                                    <p className="font-medium text-[#2c2c2c]">{i.full_name}</p>
                                    <p className="text-xs text-[#8b8476]">{i.reason} · since {fmt(i.opened_at)}</p>
                                </div>
                                <button onClick={() => openGuardianById(i.guardian_id)} className="px-3 py-1.5 rounded-lg border-2 border-[#1a2b4a] text-[#1a2b4a] text-sm font-medium">
                                    Open
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Pending approvals */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-1">Photos awaiting approval</h3>
                <p className="text-sm text-[#6b6456] mb-4">Submitted by parents from the Parent Portal. Compare with the photo on file or their ID.</p>
                {pending.length === 0 ? (
                    <p className="text-sm text-[#8b8476]">Nothing to review.</p>
                ) : (
                    <div className="space-y-3">
                        {pending.map((p) => (
                            <div key={p.guardian_id} className="flex flex-wrap items-center gap-4 p-3 bg-[#faf8f5] rounded-lg">
                                <div className="flex items-center gap-2">
                                    <div className="text-center">
                                        <PhotoThumb path={p.current_photo_path} />
                                        <p className="text-[10px] text-[#8b8476] mt-1">On file</p>
                                    </div>
                                    <div className="text-center">
                                        <PhotoThumb path={p.path} />
                                        <p className="text-[10px] text-[#8b8476] mt-1">New</p>
                                    </div>
                                </div>
                                <div className="flex-1 min-w-[160px]">
                                    <p className="font-medium text-[#2c2c2c]">{p.full_name}</p>
                                    <p className="text-xs text-[#8b8476]">{p.email} · {fmt(p.submitted_at)}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button disabled={busy} onClick={() => review(p, true)} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-60">Approve</button>
                                    <button disabled={busy} onClick={() => review(p, false)} className="px-4 py-2 rounded-lg border-2 border-red-300 text-red-700 text-sm font-medium disabled:opacity-60">Reject</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">Find a guardian</h3>
                <form onSubmit={search} className="flex gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Name or email"
                            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                        />
                    </div>
                    <button type="submit" className="px-5 py-2.5 bg-[#1a2b4a] text-white rounded-lg text-sm font-medium">Search</button>
                </form>

                {searched && !selected && results.length === 0 && <p className="text-sm text-[#8b8476]">No guardians found.</p>}
                {!selected && results.length > 0 && (
                    <div className="divide-y divide-gray-100">
                        {results.map((g) => (
                            <button key={g.id} onClick={() => openGuardian(g)} className="w-full flex items-center gap-3 py-3 text-left hover:bg-[#faf8f5] px-2 rounded-lg">
                                <PhotoThumb path={g.photo_status === "approved" ? g.photo_path : null} size="w-10 h-10" />
                                <div className="min-w-0">
                                    <p className="font-medium text-[#2c2c2c] truncate">{g.full_name}</p>
                                    <p className="text-xs text-[#8b8476] truncate">{g.email}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {selected && (
                    <div className="space-y-5">
                        <button onClick={() => setSelected(null)} className="text-sm text-[#6b6456] hover:text-[#1a2b4a]">← Back to results</button>
                        <div className="flex flex-wrap items-center gap-4">
                            <PhotoThumb path={selected.photo_status === "approved" ? selected.photo_path : null} size="w-28 h-28" />
                            <div className="flex-1 min-w-[180px]">
                                <p className="text-xl font-semibold text-[#1a2b4a]">{selected.full_name}</p>
                                <p className="text-sm text-[#6b6456]">{selected.email}{selected.phone ? ` · ${selected.phone}` : ""}</p>
                                <p className="text-xs mt-1 text-[#8b8476]">
                                    {selected.photo_status === "approved" ? "Approved pickup photo on file" : "No pickup photo on file"}
                                </p>
                            </div>
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => setCapture({ kind: "guardian", id: selected.id, name: selected.full_name })}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1a2b4a] text-white text-sm font-medium"
                                >
                                    <Camera className="w-4 h-4" /> {selected.photo_path ? "Replace photo" : "Take photo"}
                                </button>
                                {selected.photo_path && (
                                    <button
                                        disabled={busy}
                                        onClick={() => removeGuardianPhoto(selected)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-red-300 text-red-700 text-sm font-medium disabled:opacity-60"
                                    >
                                        <Trash2 className="w-4 h-4" /> Delete photo
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Account security */}
                        {status && (
                            status.locked ? (
                                <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-3">
                                    <div className="flex items-start gap-2">
                                        <Lock className="w-5 h-5 text-red-700 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="font-semibold text-red-800">Account locked down</p>
                                            <p className="text-sm text-red-700">{status.incident_reason} · since {fmt(status.incident_opened_at)}</p>
                                            <p className="text-xs text-red-700 mt-1">Sign-in is blocked and every pickup QR code is suspended. Check the guardian in person before restoring.</p>
                                        </div>
                                    </div>
                                    <button
                                        disabled={busy}
                                        onClick={() => restore(selected)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-60"
                                    >
                                        <Unlock className="w-4 h-4" /> Restore access (verified in person)
                                    </button>
                                </div>
                            ) : (
                                <div className="p-4 rounded-xl bg-[#faf8f5] border border-gray-200 flex flex-wrap items-center gap-3">
                                    <div className="flex-1 min-w-[200px] text-sm text-[#6b6456]">
                                        <p className="font-medium text-[#1a2b4a]">Account security</p>
                                        <p>
                                            {status.active_temporary_qrs} active temporary QR code(s)
                                            {status.must_change_password && " · must set a new password at next sign-in"}
                                        </p>
                                        <p className="text-xs text-[#8b8476] mt-1">Lost phone or suspicious activity? Lock down the account at once.</p>
                                    </div>
                                    <button
                                        disabled={busy}
                                        onClick={() => lockdown(selected)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-60"
                                    >
                                        <AlertTriangle className="w-4 h-4" /> Lock down account
                                    </button>
                                </div>
                            )
                        )}

                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2">Linked students</p>
                            <div className="space-y-2">
                                {selected.student_guardians.filter((l) => l.students).map((l) => {
                                    const s = l.students as LinkedStudent;
                                    const name = `${s.first_name} ${s.last_name}`;
                                    const suspended = l.access_status === "suspended";
                                    const rotated = status?.qr_rotated_at[l.id];
                                    return (
                                        <div key={l.id} className="p-3 bg-[#faf8f5] rounded-lg space-y-3">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <PhotoThumb path={s.photo_path} size="w-14 h-14" />
                                                <div className="flex-1 min-w-[150px]">
                                                    <p className="font-medium text-[#2c2c2c]">{name}</p>
                                                    <p className="text-xs text-[#8b8476]">
                                                        {s.grade_level} · {l.relationship ?? "Guardian"} · {s.status}
                                                        {suspended && <span className="ml-1 font-semibold text-red-600">· Pickup suspended</span>}
                                                    </p>
                                                    {rotated && <p className="text-[11px] text-[#8b8476]">QR code issued {fmt(rotated)}</p>}
                                                </div>
                                                <button
                                                    onClick={() => setCapture({ kind: "student", id: s.id, name })}
                                                    className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-[#1a2b4a] text-[#1a2b4a] text-sm font-medium"
                                                >
                                                    <Camera className="w-4 h-4" /> {s.photo_path ? "Replace" : "Take photo"}
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {suspended ? (
                                                    <button disabled={busy || status?.locked} onClick={() => setLinkAccess(l, name, "active")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium disabled:opacity-50">
                                                        <PlayCircle className="w-4 h-4" /> Re-activate pickup
                                                    </button>
                                                ) : (
                                                    <button disabled={busy} onClick={() => setLinkAccess(l, name, "suspended")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-xs font-medium disabled:opacity-50">
                                                        <PauseCircle className="w-4 h-4" /> Suspend pickup
                                                    </button>
                                                )}
                                                <button disabled={busy} onClick={() => rotateQr(l, name)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-[#1a2b4a] text-xs font-medium disabled:opacity-50">
                                                    <QrCode className="w-4 h-4" /> New QR code
                                                </button>
                                                <button disabled={busy} onClick={() => allowSecondPickup(s.id, name)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-[#1a2b4a] text-xs font-medium disabled:opacity-50">
                                                    <CalendarPlus className="w-4 h-4" /> Allow another pickup today
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Same-day overrides */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-1">
                    <CalendarPlus className="w-5 h-5 text-[#1a2b4a]" />
                    <h3 className="text-lg font-semibold text-[#1a2b4a]">Extra pickups allowed today</h3>
                </div>
                <p className="text-sm text-[#6b6456] mb-4">
                    A student can normally be picked up once per day. Allow one more from a guardian&apos;s linked students above.
                </p>
                {overrides.length === 0 ? (
                    <p className="text-sm text-[#8b8476]">None today.</p>
                ) : (
                    <div className="space-y-2">
                        {overrides.map((o) => (
                            <div key={o.student_id} className="flex items-center justify-between gap-3 p-3 bg-[#faf8f5] rounded-lg text-sm">
                                <span className="font-medium text-[#2c2c2c]">{o.student_name}</span>
                                <span className={o.used_at ? "text-[#8b8476]" : "text-green-700 font-medium"}>
                                    {o.used_at ? `Used ${new Date(o.used_at).toLocaleTimeString()}` : "Not used yet"}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Retention */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-5 h-5 text-[#1a2b4a]" />
                    <h3 className="text-lg font-semibold text-[#1a2b4a]">Photos to delete</h3>
                </div>
                <p className="text-sm text-[#6b6456] mb-4">
                    Guardians who still have a photo but none of whose children is currently active.
                    Under the Data Privacy Act these photos should no longer be kept.
                </p>
                {retention.length === 0 ? (
                    <p className="text-sm text-[#8b8476]">None.</p>
                ) : (
                    <div className="space-y-2">
                        {retention.map((g) => (
                            <div key={g.id} className="flex items-center gap-3 p-3 bg-[#faf8f5] rounded-lg">
                                <PhotoThumb path={g.photo_path} size="w-10 h-10" />
                                <p className="flex-1 text-sm font-medium text-[#2c2c2c]">{g.full_name}</p>
                                <button disabled={busy} onClick={() => removeGuardianPhoto(g)} className="flex items-center gap-1.5 text-sm text-red-700 disabled:opacity-60">
                                    <XCircle className="w-4 h-4" /> Delete
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {capture && (
                <PhotoCaptureModal
                    title={`Photo of ${capture.name}`}
                    note="Face clearly visible, plain background, no sunglasses or hat. The photo is resized to about 60 KB before upload."
                    onSave={saveCapture}
                    onClose={() => setCapture(null)}
                />
            )}
        </div>
    );
}
