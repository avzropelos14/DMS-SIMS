import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Footprints } from "lucide-react";
import { supabase } from "../../supabase";
import { getPickupSettings } from "../../lib/selfDismissal";

// System Settings: pickup rules (Phase 6). Full admin only (checked by the database).

const GRADE_OPTIONS = [
    ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Grade ${i + 1} and up` })),
    { value: 13, label: "Registrar always approves" },
];

export function PickupSettingsCard() {
    const [minGrade, setMinGrade] = useState(7);
    const [lateTime, setLateTime] = useState("17:00");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        getPickupSettings().then((s) => {
            if (cancelled || !s) return;
            setMinGrade(s.self_dismissal_min_grade);
            setLateTime(s.late_pickup_time);
        });
        return () => { cancelled = true; };
    }, []);

    const save = async () => {
        setSaving(true);
        setMessage(null);
        const { error } = await supabase.rpc("set_pickup_settings", { p_min_grade: minGrade, p_late_time: lateTime });
        setSaving(false);
        setMessage(error ? { ok: false, text: "Couldn't save the pickup settings." } : { ok: true, text: "Pickup settings saved." });
    };

    const input = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]";

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-1">
                <Footprints className="w-5 h-5 text-[#1a2b4a]" />
                <h3 className="text-lg font-semibold text-[#1a2b4a]">Pickup Rules</h3>
            </div>
            <p className="text-sm text-[#6b6456] mb-4">Self-dismissal and late pickup.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                    <span className="block text-sm font-medium text-[#1a2b4a] mb-1">Parents may allow self-dismissal from</span>
                    <select value={minGrade} onChange={(e) => setMinGrade(Number(e.target.value))} className={input}>
                        {GRADE_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                    <span className="block text-xs text-[#8b8476] mt-1">Younger students need the registrar&apos;s approval.</span>
                </label>
                <label className="block">
                    <span className="block text-sm font-medium text-[#1a2b4a] mb-1">Late pickup after</span>
                    <input type="time" value={lateTime} onChange={(e) => setLateTime(e.target.value)} className={input} />
                    <span className="block text-xs text-[#8b8476] mt-1">Students still on campus after this time are flagged for the guard.</span>
                </label>
            </div>
            {message && (
                <div className={`flex items-start gap-2 p-3 mt-4 rounded-lg text-sm border ${message.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {message.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{message.text}</span>
                </div>
            )}
            <button onClick={save} disabled={saving} className="mt-4 px-5 py-2.5 bg-[#1a2b4a] text-white rounded-lg text-sm font-medium disabled:opacity-60">
                {saving ? "Saving…" : "Save pickup rules"}
            </button>
        </div>
    );
}
