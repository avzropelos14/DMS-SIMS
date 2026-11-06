import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle, Clock, Footprints, Search, User } from "lucide-react";
import { supabase } from "../../supabase";
import { getPhotoUrl } from "../../lib/photo";
import { formatTime12, travelLabel, type SelfDismissal } from "../../lib/selfDismissal";

// Guard portal: students allowed to leave school on their own today (Phase 6A). The guard
// compares the student with the photo and taps "Confirm leaving"; the database re-checks the
// permission, the time window and today's pickups before logging it.

const ERRORS: Record<string, string> = {
    not_valid_today: "This permission is no longer valid today. The student must be picked up.",
    suspended: "The guardian's access is suspended. The student must be picked up; notify the office.",
    already_left: "This student was already picked up or left today.",
};

function StudentPhoto({ path }: { path: string | null | undefined }) {
    const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);
    useEffect(() => {
        let cancelled = false;
        if (!path) return;
        getPhotoUrl(path).then((u) => { if (!cancelled) setLoaded({ path, url: u }); });
        return () => { cancelled = true; };
    }, [path]);
    const url = path && loaded?.path === path ? loaded.url : null;
    return (
        <div className="w-16 h-16 rounded-xl bg-[#faf8f5] border border-[#eae7e0] overflow-hidden flex items-center justify-center shrink-0">
            {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-gray-300" />}
        </div>
    );
}

export function SelfDismissalTab({ onBack }: { onBack: () => void }) {
    const [items, setItems] = useState<SelfDismissal[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [confirming, setConfirming] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const fetchItems = () =>
        supabase.rpc("self_dismissal_today").then(({ data }) => (data ?? []) as SelfDismissal[]);

    useEffect(() => {
        let cancelled = false;
        fetchItems().then((rows) => { if (!cancelled) { setItems(rows); setLoading(false); } });
        return () => { cancelled = true; };
    }, []);

    const confirmLeaving = async (p: SelfDismissal) => {
        setBusy(true);
        const { data, error } = await supabase.rpc("confirm_self_dismissal", { p_id: p.id });
        setBusy(false);
        setConfirming(null);
        if (error || data?.error) {
            const text = data?.error === "too_early"
                ? `Too early: ${p.student_name} may leave from ${data.earliest} only.`
                : ERRORS[data?.error] ?? "Couldn't record this. Please try again or notify the office.";
            setMessage({ ok: false, text });
        } else {
            setMessage({ ok: true, text: `${p.student_name} left on their own. Recorded and parents notified.` });
        }
        setItems(await fetchItems());
    };

    const q = query.trim().toLowerCase();
    const shown = items.filter((p) => !q || (p.student_name ?? "").toLowerCase().includes(q) || p.student_id.toLowerCase().includes(q));

    return (
        <div className="p-6 space-y-4">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-[#6b6456]">
                <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div>
                <div className="flex items-center gap-2">
                    <Footprints className="w-6 h-6 text-[#1a2b4a]" />
                    <h2 className="text-xl font-bold text-[#1a2b4a]">Self-Dismissal Today</h2>
                </div>
                <p className="text-sm text-[#6b6456] mt-1">
                    Students allowed by their parent to leave on their own. Check the face against the photo before confirming.
                </p>
            </div>

            {message && (
                <div className={`flex items-start gap-2 p-3 rounded-xl text-sm border ${message.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {message.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{message.text}</span>
                </div>
            )}

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search student name or ID"
                    className="w-full pl-9 pr-3 py-3 border-2 border-[#eae7e0] rounded-xl text-sm text-black focus:outline-none focus:border-[#c9a961]"
                />
            </div>

            {loading && <p className="text-center text-[#6b6456] py-8">Loading…</p>}
            {!loading && shown.length === 0 && (
                <p className="text-center text-[#6b6456] py-8">No students with self-dismissal today.</p>
            )}

            <div className="space-y-3">
                {shown.map((p) => {
                    const left = Boolean(p.left_at);
                    return (
                        <div key={p.id} className={`rounded-2xl p-4 border-2 ${left ? "bg-[#faf8f5] border-[#eae7e0]" : "bg-white border-[#c9a961]/30"}`}>
                            <div className="flex items-start gap-3">
                                <StudentPhoto path={p.student_photo_path} />
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-[#1a2b4a]">{p.student_name}</p>
                                    <p className="text-xs text-[#6b6456]">{p.student_id} · {p.grade_level}</p>
                                    <p className="text-xs text-[#6b6456] mt-1 flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5" /> From {formatTime12(p.earliest_release_time)} · {travelLabel(p.travel_mode)}
                                    </p>
                                    {p.travel_note && <p className="text-xs text-[#6b6456]">Note: {p.travel_note}</p>}
                                    <p className="text-[11px] text-[#8b8476]">Allowed by {p.guardian_name ?? "guardian"}</p>
                                </div>
                            </div>
                            {left ? (
                                <p className="mt-3 text-sm font-medium text-green-700 flex items-center gap-1">
                                    <CheckCircle className="w-4 h-4" />
                                    Left at {new Date(p.left_at as string).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                            ) : confirming === p.id ? (
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <button disabled={busy} onClick={() => confirmLeaving(p)} className="py-3 rounded-xl bg-green-600 text-white font-semibold disabled:opacity-60">
                                        {busy ? "Saving…" : "Yes, leaving now"}
                                    </button>
                                    <button disabled={busy} onClick={() => setConfirming(null)} className="py-3 rounded-xl border-2 border-gray-200 text-[#1a2b4a] font-medium">
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => { setConfirming(p.id); setMessage(null); }} className="mt-3 w-full py-3 rounded-xl bg-[#1a2b4a] text-white font-semibold">
                                    Confirm leaving
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
