import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle, ChevronLeft, ChevronRight, Footprints, Lock, Plus, X } from "lucide-react";
import { supabase } from "../../supabase";
import {
    CONSENT_TEXT, CONSENT_VERSION, STATUS_LABEL, TRAVEL_MODES, confirmPassword, formatDateShort, formatTime12,
    getPickupSettings, gradeNumber, manilaToday, travelLabel, type SelfDismissal, type TravelMode,
} from "../../lib/selfDismissal";

// Parent portal, Pickup page: allow a child to leave school on their own (Phase 6A).
// Grade >= the school's minimum: allowed at once. Younger: waits for the registrar.
// Every request needs the parent's password again (checked on the server).

interface Child {
    id: string;
    name: string;
    gradeLevel: string | null;
}

const ERRORS: Record<string, string> = {
    not_allowed: "You can't set this for this child (your pickup access may be suspended). Please contact the school office.",
    invalid_dates: "Please choose dates from today onward, ending on or after the start date (at most one year).",
    invalid_time: "Please choose a valid time.",
    invalid_travel_mode: "Please choose how your child goes home.",
    consent_required: "Please tick the consent box.",
    overlapping: "There is already a permission for these dates. Cancel it first to make a new one.",
    password_required: "Your password confirmation expired. Please enter your password again.",
};

const HISTORY_PREVIEW = 3;
const HISTORY_PAGE_SIZE = 10;

const STATUS_STYLE: Record<SelfDismissal["status"], string> = {
    active: "bg-green-100 text-green-700",
    pending_approval: "bg-amber-100 text-amber-700",
    denied: "bg-red-100 text-red-700",
    revoked: "bg-gray-100 text-gray-600",
};

export function SelfDismissalSection({ children }: { children: Child[] }) {
    const [items, setItems] = useState<SelfDismissal[]>([]);
    const [minGrade, setMinGrade] = useState(7);
    const [showForm, setShowForm] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [historyPage, setHistoryPage] = useState<number | null>(null); // null: normal view

    const fetchItems = () =>
        supabase.rpc("my_self_dismissals").then(({ data }) => (data ?? []) as SelfDismissal[]);

    useEffect(() => {
        let cancelled = false;
        fetchItems().then((rows) => { if (!cancelled) setItems(rows); });
        getPickupSettings().then((s) => { if (!cancelled && s) setMinGrade(s.self_dismissal_min_grade); });
        return () => { cancelled = true; };
    }, []);

    const reload = async () => setItems(await fetchItems());

    const revoke = async (p: SelfDismissal) => {
        const child = children.find((c) => c.id === p.student_id)?.name ?? "your child";
        setConfirmingId(null);
        const { data, error } = await supabase.rpc("revoke_self_dismissal", { p_id: p.id });
        if (error || data?.error) {
            setMessage({ ok: false, text: "Couldn't cancel. Please try again." });
            return;
        }
        setMessage({ ok: true, text: `Self-dismissal cancelled for ${child}.` });
        void reload();
    };

    // A permission ends by itself after its last day, so only running or waiting ones are
    // listed above; the rest is history (the last 30 days, from the server).
    const today = manilaToday();
    const isCurrent = (p: SelfDismissal) =>
        (p.status === "active" || p.status === "pending_approval") && p.valid_to >= today;
    const current = items.filter(isCurrent);
    const past = items.filter((p) => !isCurrent(p));
    const historyLabel = (p: SelfDismissal) =>
        p.status === "active" ? "Ended" : p.status === "pending_approval" ? "Expired (not reviewed)" : STATUS_LABEL[p.status];
    const endsText = (p: SelfDismissal) =>
        p.valid_to === today ? "Ends today" : `Ends ${formatDateShort(p.valid_to)}`;
    const historyRow = (p: SelfDismissal) => (
        <p key={p.id} className="text-xs text-[#6b6456]">
            {nameOf(p.student_id)} · {p.valid_from === p.valid_to ? formatDateShort(p.valid_from) : `${formatDateShort(p.valid_from)} – ${formatDateShort(p.valid_to)}`} · {historyLabel(p)}
            {p.decision_note ? ` (${p.decision_note})` : ""}
        </p>
    );

    // Full history: its own view with pages, so the Pickup page doesn't grow.
    if (historyPage !== null) {
        const pages = Math.max(1, Math.ceil(past.length / HISTORY_PAGE_SIZE));
        const page = Math.min(historyPage, pages - 1);
        const rows = past.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <button onClick={() => setHistoryPage(null)} className="flex items-center gap-2 text-sm text-[#6b6456] mb-3">
                    <ArrowLeft className="w-4 h-4" /> Back to self-dismissal
                </button>
                <div className="flex items-center gap-2 mb-1">
                    <Footprints className="w-5 h-5 text-[#1a5c38]" />
                    <h3 className="text-lg font-semibold text-[#1a2b4a]">Self-dismissal history</h3>
                </div>
                <p className="text-sm text-[#6b6456] mb-4">Permissions that ended, were cancelled or were not approved in the last 30 days.</p>
                <div className="space-y-2 divide-y divide-gray-100">{rows.map((p) => <div key={p.id} className="pt-2">{historyRow(p)}</div>)}</div>
                {pages > 1 && (
                    <div className="flex items-center justify-between mt-4 text-sm">
                        <button onClick={() => setHistoryPage(page - 1)} disabled={page === 0} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-[#1a2b4a] disabled:opacity-40">
                            <ChevronLeft className="w-4 h-4" /> Newer
                        </button>
                        <span className="text-[#6b6456]">Page {page + 1} of {pages}</span>
                        <button onClick={() => setHistoryPage(page + 1)} disabled={page >= pages - 1} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-[#1a2b4a] disabled:opacity-40">
                            Older <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        );
    }
    const nameOf = (id: string) => children.find((c) => c.id === id)?.name ?? id;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <Footprints className="w-5 h-5 text-[#1a5c38]" />
                        <h3 className="text-lg font-semibold text-[#1a2b4a]">Self-dismissal</h3>
                    </div>
                    <p className="text-sm text-[#6b6456] mt-1">
                        Allow your child to leave school on their own. Grade {minGrade} and up: allowed right away.
                        Younger students need the registrar&apos;s approval.
                    </p>
                </div>
                {!showForm && (
                    <button
                        onClick={() => { setShowForm(true); setMessage(null); }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1a5c38] text-white text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" /> New permission
                    </button>
                )}
            </div>

            {message && (
                <div className={`flex items-start gap-2 p-3 mb-4 rounded-lg text-sm border ${message.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {message.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{message.text}</span>
                </div>
            )}

            {showForm && (
                <SelfDismissalForm
                    children={children}
                    minGrade={minGrade}
                    onCancel={() => setShowForm(false)}
                    onDone={(text) => { setShowForm(false); setMessage({ ok: true, text }); void reload(); }}
                />
            )}

            {current.length === 0 && !showForm && (
                <p className="text-sm text-[#8b8476]">No self-dismissal permission. Your children must be picked up by an authorized guardian.</p>
            )}
            {current.length > 0 && (
                <div className="space-y-2">
                    {current.map((p) => (
                        <div key={p.id} className="flex flex-wrap items-center gap-3 p-3 bg-[#faf8f5] rounded-lg">
                            <div className="flex-1 min-w-[200px]">
                                <div className="flex items-center gap-2">
                                    <p className="font-medium text-[#2c2c2c]">{nameOf(p.student_id)}</p>
                                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                                </div>
                                <p className="text-xs text-[#6b6456] mt-0.5">
                                    {p.valid_from === p.valid_to ? formatDateShort(p.valid_from) : `${formatDateShort(p.valid_from)} – ${formatDateShort(p.valid_to)}`}
                                    {" · "}not before {formatTime12(p.earliest_release_time)} · {travelLabel(p.travel_mode)}
                                    {p.guardian_name ? ` · set by ${p.guardian_name}` : ""}
                                </p>
                                <p className="text-xs text-[#8b8476] mt-0.5">
                                    {endsText(p)}: it stops on its own after that day, so there&apos;s no need to cancel it.
                                </p>
                            </div>
                            {confirmingId === p.id ? (
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className="text-[#6b6456]">Cancel? {nameOf(p.student_id)} must then be picked up.</span>
                                    <button onClick={() => revoke(p)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-medium">Yes, cancel</button>
                                    <button onClick={() => setConfirmingId(null)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-[#1a2b4a] font-medium">Keep</button>
                                </div>
                            ) : (
                                <button onClick={() => setConfirmingId(p.id)} className="flex items-center gap-1 text-sm text-red-700 font-medium">
                                    <X className="w-4 h-4" /> Cancel
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {past.length > 0 && (
                <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#8b8476] mb-2">History</p>
                    <div className="space-y-1">
                        {past.slice(0, HISTORY_PREVIEW).map(historyRow)}
                    </div>
                    {past.length > HISTORY_PREVIEW && (
                        <button onClick={() => { setHistoryPage(0); setMessage(null); }} className="mt-2 text-xs font-medium text-[#1a5c38]">
                            View all history ({past.length})
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function SelfDismissalForm({ children, minGrade, onCancel, onDone }: {
    children: Child[];
    minGrade: number;
    onCancel: () => void;
    onDone: (message: string) => void;
}) {
    const today = manilaToday();
    const [studentId, setStudentId] = useState(children[0]?.id ?? "");
    const [range, setRange] = useState<"today" | "range">("today");
    const [from, setFrom] = useState(today);
    const [to, setTo] = useState(today);
    const [time, setTime] = useState("15:00");
    const [mode, setMode] = useState<TravelMode>("walk");
    const [note, setNote] = useState("");
    const [consent, setConsent] = useState(false);
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const child = children.find((c) => c.id === studentId);
    const needsApproval = gradeNumber(child?.gradeLevel) < minGrade;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!consent) { setError(ERRORS.consent_required); return; }
        if (!password) { setError("Please enter your password to confirm."); return; }
        setSaving(true);
        const pwError = await confirmPassword(password);
        if (pwError) { setSaving(false); setError(pwError); return; }
        const validFrom = range === "today" ? today : from;
        const validTo = range === "today" ? today : to;
        const { data, error: rpcError } = await supabase.rpc("request_self_dismissal", {
            p_student_id: studentId, p_valid_from: validFrom, p_valid_to: validTo, p_earliest_time: time,
            p_travel_mode: mode, p_travel_note: note.trim() || null, p_consent_version: CONSENT_VERSION,
        });
        setSaving(false);
        setPassword("");
        if (rpcError || data?.error) {
            setError(ERRORS[data?.error] ?? "Couldn't save the permission. Please try again.");
            return;
        }
        // Below the minimum grade: the admin and registrar get an email (in-app alerts are
        // written by the database). Best effort; the request is saved either way.
        if (data.status === "pending_approval" && data.id) {
            void supabase.functions.invoke("notify-office-request", { body: { kind: "self_dismissal", id: data.id } });
        }
        onDone(data.status === "active"
            ? `${child?.name ?? "Your child"} may now leave school on their own.`
            : `Request sent. The registrar will review it; you'll get a notification.`);
    };

    const input = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#1a5c38]/20 focus:border-[#1a5c38]";

    return (
        <form onSubmit={submit} className="space-y-4 p-4 mb-4 border border-gray-200 rounded-xl bg-[#faf8f5]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                    <span className="block text-sm font-medium text-[#1a2b4a] mb-1">Child</span>
                    <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className={input}>
                        {children.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.gradeLevel})</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="block text-sm font-medium text-[#1a2b4a] mb-1">May leave from (time)</span>
                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className={input} />
                </label>
            </div>

            <div>
                <span className="block text-sm font-medium text-[#1a2b4a] mb-1">When</span>
                <div className="flex gap-2 mb-2">
                    {(["today", "range"] as const).map((r) => (
                        <button key={r} type="button" onClick={() => setRange(r)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${range === r ? "bg-[#1a5c38] text-white border-[#1a5c38]" : "bg-white text-[#1a2b4a] border-gray-200"}`}>
                            {r === "today" ? "Today only" : "Date range"}
                        </button>
                    ))}
                </div>
                {range === "range" && (
                    <div className="grid grid-cols-2 gap-3">
                        <input type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} required className={input} aria-label="From" />
                        <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required className={input} aria-label="To" />
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                    <span className="block text-sm font-medium text-[#1a2b4a] mb-1">How they go home</span>
                    <select value={mode} onChange={(e) => setMode(e.target.value as TravelMode)} className={input}>
                        {TRAVEL_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="block text-sm font-medium text-[#1a2b4a] mb-1">Note for the guard (optional)</span>
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Walks with older sibling" className={input} />
                </label>
            </div>

            {needsApproval && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    {child?.name} is below Grade {minGrade}, so the registrar must approve this request first.
                </p>
            )}

            <label className="flex items-start gap-2 text-sm text-[#2c2c2c]">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
                <span>{CONSENT_TEXT}</span>
            </label>

            <label className="block">
                <span className="flex items-center gap-1.5 text-sm font-medium text-[#1a2b4a] mb-1"><Lock className="w-4 h-4" /> Your password (to confirm it's you)</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={input} />
            </label>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-lg bg-[#1a5c38] text-white text-sm font-semibold disabled:opacity-60">
                    {saving ? "Saving…" : needsApproval ? "Send request" : "Allow self-dismissal"}
                </button>
                <button type="button" onClick={onCancel} disabled={saving} className="px-5 py-2.5 rounded-lg border-2 border-gray-200 text-[#1a2b4a] text-sm font-medium">
                    Cancel
                </button>
            </div>
        </form>
    );
}
