import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Footprints } from "lucide-react";
import { supabase } from "../../supabase";
import { formatDateShort, formatTime12, travelLabel, type SelfDismissal } from "../../lib/selfDismissal";

// Registrar / admin: self-dismissal requests for students below the minimum grade (Phase 6A).

export function SelfDismissalApprovals() {
    const [items, setItems] = useState<SelfDismissal[]>([]);
    const [loading, setLoading] = useState(true);
    const [denying, setDenying] = useState<string | null>(null);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const fetchItems = () =>
        supabase.rpc("pending_self_dismissals").then(({ data }) => (data ?? []) as SelfDismissal[]);

    useEffect(() => {
        let cancelled = false;
        fetchItems().then((rows) => { if (!cancelled) { setItems(rows); setLoading(false); } });
        return () => { cancelled = true; };
    }, []);

    const decide = async (p: SelfDismissal, approve: boolean) => {
        if (!approve && !note.trim()) {
            setMessage({ ok: false, text: "Please write the reason for not approving; the parent will see it." });
            return;
        }
        setBusy(true);
        const { data, error } = await supabase.rpc("decide_self_dismissal", { p_id: p.id, p_approve: approve, p_note: note.trim() || null });
        setBusy(false);
        if (error || data?.error) {
            setMessage({ ok: false, text: "Couldn't save the decision. Please try again." });
            return;
        }
        setMessage({ ok: true, text: approve ? `Approved for ${p.student_name}. The parent was notified.` : `Not approved for ${p.student_name}. The parent was notified.` });
        setDenying(null);
        setNote("");
        setItems(await fetchItems());
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Self-Dismissal Requests</h1>
                <p className="text-[#6b6456]">
                    Parents asking that a younger student may leave school on their own. Approve only after checking
                    with the parent if anything is unclear.
                </p>
            </div>

            {message && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${message.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {message.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{message.text}</span>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Footprints className="w-5 h-5 text-[#1a2b4a]" />
                    <h3 className="text-lg font-semibold text-[#1a2b4a]">Waiting for approval</h3>
                </div>
                {loading && <p className="text-sm text-[#8b8476]">Loading…</p>}
                {!loading && items.length === 0 && <p className="text-sm text-[#8b8476]">No requests waiting.</p>}
                <div className="space-y-3">
                    {items.map((p) => (
                        <div key={p.id} className="p-4 bg-[#faf8f5] rounded-lg space-y-3">
                            <div>
                                <p className="font-medium text-[#2c2c2c]">{p.student_name} <span className="text-sm text-[#8b8476]">· {p.grade_level}</span></p>
                                <p className="text-sm text-[#6b6456]">
                                    {p.valid_from === p.valid_to ? formatDateShort(p.valid_from) : `${formatDateShort(p.valid_from)} – ${formatDateShort(p.valid_to)}`}
                                    {" · "}not before {formatTime12(p.earliest_release_time)} · {travelLabel(p.travel_mode)}
                                </p>
                                {p.travel_note && <p className="text-sm text-[#6b6456]">Note: {p.travel_note}</p>}
                                <p className="text-xs text-[#8b8476]">Requested by {p.guardian_name} on {new Date(p.created_at).toLocaleString()}</p>
                            </div>
                            {denying === p.id ? (
                                <div className="space-y-2">
                                    <textarea
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        rows={2}
                                        maxLength={500}
                                        placeholder="Reason (shown to the parent)"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                    />
                                    <div className="flex gap-2">
                                        <button disabled={busy} onClick={() => decide(p, false)} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-60">Confirm: not approved</button>
                                        <button disabled={busy} onClick={() => { setDenying(null); setNote(""); }} className="px-4 py-2 rounded-lg border-2 border-gray-200 text-[#1a2b4a] text-sm font-medium">Back</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <button disabled={busy} onClick={() => decide(p, true)} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-60">Approve</button>
                                    <button disabled={busy} onClick={() => { setDenying(p.id); setNote(""); setMessage(null); }} className="px-4 py-2 rounded-lg border-2 border-red-300 text-red-700 text-sm font-medium">Don&apos;t approve</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
