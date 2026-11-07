import { useCallback, useEffect, useState } from "react";
import {
    AlertCircle, AlertTriangle, ArrowLeft, Bell, CheckCircle, Lock, Phone, Search, User, UserCheck,
} from "lucide-react";
import { supabase } from "../../supabase";
import { getPhotoUrl } from "../../lib/photo";
import { formatTime12 } from "../../lib/selfDismissal";

// Guard portal: late-pickup protocol (Phase 6B). Every active student's state today; students
// still on campus after the late-pickup time (device clock) are flagged. Staff phone parents
// from the call list, send a "still at school" notice, hand students over to the staff member
// on duty, mark absences, and close the day once everyone is accounted for.

type State = "on_campus" | "picked_up" | "self_dismissed" | "absent" | "handed_over" | "other_exit";

interface CampusStudent {
    student_id: string;
    student_name: string;
    grade_level: string | null;
    section: string | null;
    photo_path: string | null;
    state: State;
    state_at: string | null;
    detail: string | null;
    last_notice_at: string | null;
    notices: number;
}

interface CampusStatus {
    day: string;
    late_pickup_time: string;
    closed_at: string | null;
    closed_by: string | null;
    students: CampusStudent[];
}

interface Contact {
    name: string | null;
    relationship: string | null;
    phone: string | null;
    primary: boolean;
}

const STATE_LABEL: Record<State, string> = {
    on_campus: "On campus",
    picked_up: "Picked up",
    self_dismissed: "Left on own",
    absent: "Absent",
    handed_over: "With staff on duty",
    other_exit: "Left (other)",
};

const STATE_STYLE: Record<State, string> = {
    on_campus: "bg-amber-100 text-amber-800",
    picked_up: "bg-green-100 text-green-700",
    self_dismissed: "bg-green-100 text-green-700",
    absent: "bg-gray-100 text-gray-600",
    handed_over: "bg-blue-100 text-blue-700",
    other_exit: "bg-gray-100 text-gray-600",
};

const timeOf = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";

function Photo({ path }: { path: string | null }) {
    const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);
    useEffect(() => {
        let cancelled = false;
        if (!path) return;
        getPhotoUrl(path).then((u) => { if (!cancelled) setLoaded({ path, url: u }); });
        return () => { cancelled = true; };
    }, [path]);
    const url = path && loaded?.path === path ? loaded.url : null;
    return (
        <div className="w-12 h-12 rounded-xl bg-[#faf8f5] border border-[#eae7e0] overflow-hidden flex items-center justify-center shrink-0">
            {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <User className="w-6 h-6 text-gray-300" />}
        </div>
    );
}

// Minutes since midnight on the device clock, and of "HH:MM".
const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

type Panel = { id: string; kind: "calls" | "handover" | "other" } | null;

export function CampusTab({ onBack }: { onBack: () => void }) {
    const [status, setStatus] = useState<CampusStatus | null>(null);
    const [filter, setFilter] = useState<"open" | "done" | "all">("open");
    const [query, setQuery] = useState("");
    const [panel, setPanel] = useState<Panel>(null);
    const [contacts, setContacts] = useState<Record<string, Contact[]>>({});
    const [staffName, setStaffName] = useState("");
    const [note, setNote] = useState("");
    const [closeNote, setCloseNote] = useState("");
    const [confirmClose, setConfirmClose] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [minuteNow, setMinuteNow] = useState(nowMinutes());
    const [loadFailed, setLoadFailed] = useState(false);

    const fetchStatus = useCallback(
        () => supabase.rpc("campus_status_today").then(({ data, error }) => (error ? null : (data as CampusStatus))),
        [],
    );
    const reload = async () => { const s = await fetchStatus(); if (s) setStatus(s); setLoadFailed(!s); };

    useEffect(() => {
        let cancelled = false;
        const load = () => {
            setMinuteNow(nowMinutes());
            if (document.visibilityState !== "visible") return;
            fetchStatus().then((s) => {
                if (cancelled) return;
                if (s) setStatus(s);
                setLoadFailed(!s);
            });
        };
        load();
        const timer = window.setInterval(load, 60_000);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, [fetchStatus]);

    const flash = (ok: boolean, text: string) => setMessage({ ok, text });
    const openPanel = (id: string, kind: "calls" | "handover" | "other") => {
        setPanel(panel?.id === id && panel.kind === kind ? null : { id, kind });
        setStaffName("");
        setNote("");
        setMessage(null);
    };

    const showCalls = async (s: CampusStudent) => {
        openPanel(s.student_id, "calls");
        if (contacts[s.student_id]) return;
        const { data, error } = await supabase.rpc("student_call_list", { p_student_id: s.student_id });
        if (error) { flash(false, "Couldn't load the call list."); return; }
        setContacts((prev) => ({ ...prev, [s.student_id]: (data ?? []) as Contact[] }));
    };

    const notifyParent = async (s: CampusStudent) => {
        setBusy(true);
        const { data, error } = await supabase.rpc("notify_parent_late", { p_student_id: s.student_id });
        if (error || data?.error) {
            setBusy(false);
            flash(false, data?.error === "too_soon" ? "A notice was sent less than 10 minutes ago. Please call instead." : "Couldn't send the notice.");
            return;
        }
        // Email too, while the daily email budget allows (in-app notice is already saved).
        const { data: mail } = await supabase.functions.invoke("notify-late-pickup", { body: { notice_id: data.notice_id } });
        setBusy(false);
        flash(true, `Parents of ${s.student_name} were notified in the app` +
            (mail?.emailed > 0 ? ` and by email (${mail.emailed}).` : mail?.budget_reached ? ". Today's email limit is reached; please call." : "."));
        void reload();
    };

    const setDayStatus = async (s: CampusStudent, newStatus: "absent" | "handed_over" | "other_exit") => {
        setBusy(true);
        const { data, error } = await supabase.rpc("set_student_day_status", {
            p_student_id: s.student_id, p_status: newStatus, p_staff_name: staffName.trim() || null, p_note: note.trim() || null,
        });
        setBusy(false);
        if (error || data?.error) {
            const errors: Record<string, string> = {
                staff_required: "Enter the name of the staff member taking over.",
                note_required: "Write how the student left.",
                already_left: "This student was already picked up today.",
            };
            flash(false, errors[data?.error] ?? "Couldn't save. Please try again.");
            return;
        }
        setPanel(null);
        flash(true, newStatus === "handed_over"
            ? `${s.student_name} handed over to ${staffName.trim()}. Parents were notified.`
            : `${s.student_name} marked as ${STATE_LABEL[newStatus].toLowerCase()}.`);
        void reload();
    };

    const undo = async (s: CampusStudent) => {
        setBusy(true);
        await supabase.rpc("clear_student_day_status", { p_student_id: s.student_id });
        setBusy(false);
        void reload();
    };

    const closeDay = async () => {
        setBusy(true);
        const { data, error } = await supabase.rpc("close_dismissal_day", { p_note: closeNote.trim() || null });
        setBusy(false);
        setConfirmClose(false);
        if (error || data?.error) {
            flash(false, data?.error === "unaccounted"
                ? `Can't close: ${data.count} student(s) are still unaccounted for.`
                : data?.error === "already_closed" ? "Today is already closed." : "Couldn't close the day.");
            return;
        }
        flash(true, "Dismissal closed for today. Thank you!");
        void reload();
    };

    if (!status) {
        return (
            <div className="p-6">
                <button onClick={onBack} className="flex items-center gap-2 text-sm text-[#6b6456] mb-4"><ArrowLeft className="w-4 h-4" /> Back</button>
                {loadFailed ? (
                    <div className="text-center py-8 space-y-3">
                        <p className="text-[#6b6456]">Couldn't load the student list. Check the connection, or sign out and sign back in.</p>
                        <button onClick={() => void reload()} className="px-5 py-2.5 rounded-xl bg-[#1a2b4a] text-white text-sm font-semibold">Retry</button>
                    </div>
                ) : (
                    <p className="text-center text-[#6b6456] py-8">Loading…</p>
                )}
            </div>
        );
    }

    const isLate = minuteNow >= toMinutes(status.late_pickup_time);
    const onCampus = status.students.filter((s) => s.state === "on_campus");
    const withStaff = status.students.filter((s) => s.state === "handed_over");
    const q = query.trim().toLowerCase();
    const shown = status.students
        .filter((s) => filter === "all" || (filter === "open" ? s.state === "on_campus" || s.state === "handed_over" : s.state !== "on_campus" && s.state !== "handed_over"))
        .filter((s) => !q || s.student_name.toLowerCase().includes(q) || s.student_id.toLowerCase().includes(q));

    const input = "w-full px-3 py-2.5 border-2 border-[#eae7e0] rounded-xl text-sm text-black focus:outline-none focus:border-[#c9a961]";

    return (
        <div className="p-6 space-y-4">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-[#6b6456]"><ArrowLeft className="w-4 h-4" /> Back</button>
            <div>
                <h2 className="text-xl font-bold text-[#1a2b4a]">Students on Campus</h2>
                <p className="text-sm text-[#6b6456]">Late pickup after {formatTime12(status.late_pickup_time)}.</p>
            </div>

            {status.closed_at ? (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">
                    <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Dismissal closed at {timeOf(status.closed_at)}{status.closed_by ? ` by ${status.closed_by}` : ""}.</span>
                </div>
            ) : isLate && onCampus.length > 0 ? (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span><strong>{onCampus.length} student(s) not yet picked up</strong> after {formatTime12(status.late_pickup_time)}. Call the parents, then hand the students over to the staff member on duty.</span>
                </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2 text-center">
                <div className={`rounded-xl p-3 ${isLate && onCampus.length ? "bg-red-600 text-white" : "bg-amber-50 text-amber-800"}`}>
                    <div className="text-2xl font-bold">{onCampus.length}</div><div className="text-[11px]">On campus</div>
                </div>
                <div className="rounded-xl p-3 bg-blue-50 text-blue-800">
                    <div className="text-2xl font-bold">{withStaff.length}</div><div className="text-[11px]">With staff</div>
                </div>
                <div className="rounded-xl p-3 bg-green-50 text-green-800">
                    <div className="text-2xl font-bold">{status.students.length - onCampus.length - withStaff.length}</div><div className="text-[11px]">Gone / absent</div>
                </div>
            </div>

            {message && (
                <div className={`flex items-start gap-2 p-3 rounded-xl text-sm border ${message.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {message.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{message.text}</span>
                </div>
            )}

            <div className="flex gap-2">
                {([["open", "Still here"], ["done", "Accounted"], ["all", "All"]] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setFilter(v)}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 ${filter === v ? "bg-[#1a2b4a] text-white border-[#1a2b4a]" : "bg-white text-[#1a2b4a] border-[#eae7e0]"}`}>
                        {l}
                    </button>
                ))}
            </div>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search student name or ID" className={`${input} pl-9`} />
            </div>

            {shown.length === 0 && <p className="text-center text-[#6b6456] py-6">No students here.</p>}

            <div className="space-y-3">
                {shown.map((s) => {
                    const late = isLate && s.state === "on_campus";
                    const open = panel?.id === s.student_id ? panel.kind : null;
                    return (
                        <div key={s.student_id} className={`rounded-2xl p-4 border-2 ${late ? "border-red-300 bg-red-50/40" : "border-[#eae7e0] bg-white"}`}>
                            <div className="flex items-start gap-3">
                                <Photo path={s.photo_path} />
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-[#1a2b4a]">{s.student_name}</p>
                                    <p className="text-xs text-[#6b6456]">{s.grade_level}{s.section ? ` · ${s.section}` : ""} · {s.student_id}</p>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATE_STYLE[s.state]}`}>{late ? "LATE" : STATE_LABEL[s.state]}</span>
                                        {s.state_at && <span className="text-[11px] text-[#8b8476]">{timeOf(s.state_at)}</span>}
                                        {s.detail && <span className="text-[11px] text-[#8b8476]">· {s.detail}</span>}
                                    </div>
                                    {s.notices > 0 && <p className="text-[11px] text-[#8b8476] mt-0.5">Parents notified {s.notices}× (last {timeOf(s.last_notice_at)})</p>}
                                </div>
                            </div>

                            {s.state === "on_campus" && (
                                <div className="grid grid-cols-2 gap-2 mt-3">
                                    <button onClick={() => showCalls(s)} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#1a2b4a] text-white text-sm font-medium"><Phone className="w-4 h-4" /> Call list</button>
                                    <button disabled={busy} onClick={() => notifyParent(s)} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-[#1a2b4a] text-[#1a2b4a] text-sm font-medium disabled:opacity-50"><Bell className="w-4 h-4" /> Notify parent</button>
                                    <button onClick={() => openPanel(s.student_id, "handover")} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-blue-300 text-blue-700 text-sm font-medium"><UserCheck className="w-4 h-4" /> Hand over</button>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button disabled={busy} onClick={() => setDayStatus(s, "absent")} className="py-2.5 rounded-xl border-2 border-gray-200 text-[#6b6456] text-xs font-medium disabled:opacity-50">Absent</button>
                                        <button onClick={() => openPanel(s.student_id, "other")} className="py-2.5 rounded-xl border-2 border-gray-200 text-[#6b6456] text-xs font-medium">Other</button>
                                    </div>
                                </div>
                            )}
                            {s.state === "handed_over" && (
                                <div className="grid grid-cols-2 gap-2 mt-3">
                                    <button onClick={() => showCalls(s)} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#1a2b4a] text-white text-sm font-medium"><Phone className="w-4 h-4" /> Call list</button>
                                    <button disabled={busy} onClick={() => notifyParent(s)} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-[#1a2b4a] text-[#1a2b4a] text-sm font-medium disabled:opacity-50"><Bell className="w-4 h-4" /> Notify parent</button>
                                </div>
                            )}
                            {(s.state === "absent" || s.state === "handed_over" || s.state === "other_exit") && (
                                <button disabled={busy} onClick={() => undo(s)} className="mt-2 text-xs text-[#6b6456] underline disabled:opacity-50">Undo (back to on campus)</button>
                            )}

                            {open === "calls" && (
                                <div className="mt-3 space-y-2">
                                    {!contacts[s.student_id] && <p className="text-sm text-[#6b6456]">Loading…</p>}
                                    {contacts[s.student_id]?.length === 0 && <p className="text-sm text-[#6b6456]">No phone numbers on file. Ask the office.</p>}
                                    {contacts[s.student_id]?.map((c, i) => (
                                        <div key={i} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#faf8f5]">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-[#2c2c2c] truncate">{c.name ?? "—"}{c.primary ? " ★" : ""}</p>
                                                <p className="text-xs text-[#8b8476]">{c.relationship ?? "Contact"}{c.phone ? ` · ${c.phone}` : " · no phone"}</p>
                                            </div>
                                            {c.phone && (
                                                <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-green-600 text-white text-sm font-medium shrink-0">
                                                    <Phone className="w-4 h-4" /> Call
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {open === "handover" && (
                                <div className="mt-3 space-y-2">
                                    <input value={staffName} onChange={(e) => setStaffName(e.target.value)} maxLength={120} placeholder="Staff member on duty (full name)" className={input} />
                                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Where they wait, e.g. Faculty room (optional)" className={input} />
                                    <button disabled={busy} onClick={() => setDayStatus(s, "handed_over")} className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">Confirm hand-over</button>
                                </div>
                            )}
                            {open === "other" && (
                                <div className="mt-3 space-y-2">
                                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="How did the student leave? e.g. School service, released by office" className={input} />
                                    <button disabled={busy} onClick={() => setDayStatus(s, "other_exit")} className="w-full py-2.5 rounded-xl bg-[#1a2b4a] text-white text-sm font-semibold disabled:opacity-50">Save</button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {!status.closed_at && (
                <div className="rounded-2xl border-2 border-[#eae7e0] p-4 space-y-3">
                    <p className="font-semibold text-[#1a2b4a]">Close dismissal for today</p>
                    {onCampus.length > 0 ? (
                        <p className="text-sm text-[#6b6456]">
                            {onCampus.length} student(s) still unaccounted for. Each must be picked up, handed over to staff on duty, or marked absent before the day can be closed.
                        </p>
                    ) : confirmClose ? (
                        <>
                            <input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} maxLength={300} placeholder="Note (optional)" className={input} />
                            <div className="grid grid-cols-2 gap-2">
                                <button disabled={busy} onClick={closeDay} className="py-3 rounded-xl bg-green-600 text-white font-semibold disabled:opacity-50">Yes, close the day</button>
                                <button onClick={() => setConfirmClose(false)} className="py-3 rounded-xl border-2 border-gray-200 text-[#1a2b4a] font-medium">Cancel</button>
                            </div>
                        </>
                    ) : (
                        <button onClick={() => setConfirmClose(true)} className="w-full py-3 rounded-xl bg-[#1a2b4a] text-white font-semibold">Close the day</button>
                    )}
                </div>
            )}
        </div>
    );
}
