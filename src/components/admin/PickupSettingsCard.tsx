import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Footprints } from "lucide-react";
import { supabase } from "../../supabase";
import { getPickupSettings } from "../../lib/selfDismissal";

// System Settings: pickup rules (Phase 6) and the dismissal schedule (two dismissals a day).
// Full admin only (checked by the database).

const ALL_GRADES = ["Kinder 1", "Kinder 2", ...Array.from({ length: 10 }, (_, i) => `Grade ${i + 1}`)];

const SCHEDULE_ERRORS: Record<string, string> = {
    invalid_time: "Please enter all three times.",
    out_of_order: "The times must go in order: day starts, then lunch dismissal, then afternoon dismissal.",
    after_late_time: "The afternoon dismissal must start before (or at) the late pickup time.",
    invalid_grade: "One of the half-day grades isn't valid.",
};

const GRADE_OPTIONS = [
    ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Grade ${i + 1} and up` })),
    { value: 13, label: "Registrar always approves" },
];

export function PickupSettingsCard() {
    const [minGrade, setMinGrade] = useState(7);
    const [lateTime, setLateTime] = useState("17:00");
    const [dayStart, setDayStart] = useState("07:00");
    const [lunchTime, setLunchTime] = useState("11:30");
    const [afternoonTime, setAfternoonTime] = useState("16:00");
    const [halfDay, setHalfDay] = useState<string[]>([]);
    const [saturday, setSaturday] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        getPickupSettings().then((s) => {
            if (cancelled || !s) return;
            setMinGrade(s.self_dismissal_min_grade);
            setLateTime(s.late_pickup_time);
            if (s.day_start_time) setDayStart(s.day_start_time);
            if (s.lunch_dismissal_time) setLunchTime(s.lunch_dismissal_time);
            if (s.afternoon_dismissal_time) setAfternoonTime(s.afternoon_dismissal_time);
            setHalfDay(s.half_day_grades ?? []);
            setSaturday(Boolean(s.saturday_classes));
        });
        return () => { cancelled = true; };
    }, []);

    const save = async () => {
        setSaving(true);
        setMessage(null);
        const { error } = await supabase.rpc("set_pickup_settings", { p_min_grade: minGrade, p_late_time: lateTime });
        if (error) {
            setSaving(false);
            setMessage({ ok: false, text: "Couldn't save the pickup settings." });
            return;
        }
        const { data, error: sError } = await supabase.rpc("set_dismissal_schedule", {
            p_day_start: dayStart, p_lunch: lunchTime, p_afternoon: afternoonTime, p_half_day_grades: halfDay,
            p_saturday_classes: saturday,
        });
        setSaving(false);
        if (sError || data?.error) {
            setMessage({ ok: false, text: SCHEDULE_ERRORS[data?.error] ?? "The pickup rules were saved, but the dismissal schedule wasn't." });
            return;
        }
        setMessage({ ok: true, text: "Pickup settings saved." });
    };

    const input = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]";

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-1">
                <Footprints className="w-5 h-5 text-[#1a2b4a]" />
                <h3 className="text-lg font-semibold text-[#1a2b4a]">Pickup Rules</h3>
            </div>
            <p className="text-sm text-[#6b6456] mb-4">Self-dismissal, late pickup, and the two daily dismissals (Philippine time).</p>
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
                <label className="block">
                    <span className="block text-sm font-medium text-[#1a2b4a] mb-1">School day starts</span>
                    <input type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} className={input} />
                    <span className="block text-xs text-[#8b8476] mt-1">Before this the guard&apos;s Students on Campus shows &quot;not started&quot;.</span>
                </label>
                <label className="block">
                    <span className="block text-sm font-medium text-[#1a2b4a] mb-1">Lunch dismissal from</span>
                    <input type="time" value={lunchTime} onChange={(e) => setLunchTime(e.target.value)} className={input} />
                    <span className="block text-xs text-[#8b8476] mt-1">Pickups from here until the afternoon dismissal count as lunch pickups.</span>
                </label>
                <label className="block">
                    <span className="block text-sm font-medium text-[#1a2b4a] mb-1">Afternoon dismissal from</span>
                    <input type="time" value={afternoonTime} onChange={(e) => setAfternoonTime(e.target.value)} className={input} />
                    <span className="block text-xs text-[#8b8476] mt-1">Students out for lunch count as back on campus from this time.</span>
                </label>
            </div>
            <div className="mt-4">
                <span className="block text-sm font-medium text-[#1a2b4a] mb-1">Half-day grades (go home for good at lunch)</span>
                <div className="flex flex-wrap gap-2">
                    {ALL_GRADES.map((g) => {
                        const on = halfDay.includes(g);
                        return (
                            <button
                                key={g}
                                type="button"
                                onClick={() => setHalfDay((prev) => (on ? prev.filter((x) => x !== g) : [...prev, g]))}
                                aria-pressed={on}
                                className={`px-3 py-1.5 rounded-lg border-2 text-xs font-medium transition-all ${on ? "border-[#c9a961] bg-[#c9a961]/10 text-[#1a2b4a]" : "border-gray-200 text-[#6b6456] hover:border-[#c9a961]/50"}`}
                            >
                                {g}
                            </button>
                        );
                    })}
                </div>
                <span className="block text-xs text-[#8b8476] mt-1">
                    Students in other grades who are picked up at lunch are &quot;out for lunch&quot; and expected back for the afternoon.
                </span>
            </div>
            <label className="mt-4 flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={saturday} onChange={(e) => setSaturday(e.target.checked)} className="mt-1 w-4 h-4 accent-[#1a2b4a]" />
                <span>
                    <span className="block text-sm font-medium text-[#1a2b4a]">Saturday classes</span>
                    <span className="block text-xs text-[#8b8476]">
                        Off: Saturdays are no-class days, like Sundays. Typhoons and holidays are declared under No-Class Days.
                    </span>
                </span>
            </label>
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
