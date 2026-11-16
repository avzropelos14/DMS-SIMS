import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarOff, CheckCircle, CloudRain, Trash2 } from "lucide-react";
import { supabase } from "../../supabase";
import { formatDateShort, formatTime12, manilaToday } from "../../lib/selfDismissal";

// Admin / registrar: days without classes (typhoon, holiday) and suspensions from a time of
// day. Sundays, and Saturdays unless Saturday classes are on (System Settings), need nothing
// here. Declaring tells every parent in the app and by SMS (within the daily SMS cap).

interface NoClassDay {
    day: string;
    from_time: string | null;
    reason: string;
    declared_at: string;
    declared_by: string | null;
}

const ERRORS: Record<string, string> = {
    invalid_date: "Choose today or a later date.",
    invalid_reason: "Write the reason (at least 3 characters), e.g. Typhoon Signal No. 2.",
    invalid_time: "Choose the time classes are suspended from.",
    not_found: "That day was already cancelled or has passed.",
};

export function NoClassDaysSection() {
    const [days, setDays] = useState<NoClassDay[] | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [day, setDay] = useState(manilaToday());
    const [mode, setMode] = useState<"whole" | "suspend">("whole");
    const [fromTime, setFromTime] = useState("13:00");
    const [reason, setReason] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [cancelling, setCancelling] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const fetchDays = useCallback(
        () => supabase.rpc("list_no_class_days").then(({ data, error }) => (error ? null : ((data ?? []) as NoClassDay[]))),
        [],
    );

    useEffect(() => {
        let cancelled = false;
        fetchDays().then((rows) => {
            if (cancelled) return;
            setDays(rows);
            setLoadFailed(!rows);
        });
        return () => { cancelled = true; };
    }, [fetchDays]);

    const reload = async () => {
        const rows = await fetchDays();
        setDays(rows);
        setLoadFailed(!rows);
    };

    const declare = async () => {
        setBusy(true);
        setMessage(null);
        const { data, error } = await supabase.rpc("declare_no_classes", {
            p_day: day,
            p_from_time: mode === "suspend" ? fromTime : null,
            p_reason: reason.trim(),
        });
        if (error || data?.error) {
            setBusy(false);
            setConfirming(false);
            setMessage({ ok: false, text: ERRORS[data?.error] ?? "Couldn't save. Please try again." });
            return;
        }
        const { data: sms } = await supabase.functions.invoke("send-event-sms", { body: { kind: "closure", ref: day } });
        setBusy(false);
        setConfirming(false);
        setReason("");
        const smsText = sms?.sent > 0
            ? ` and by SMS (${sms.sent})`
            : sms?.reason === "daily_limit" ? "; today's SMS limit was reached, so some parents got no SMS" : "";
        setMessage({ ok: true, text: `Saved. ${data.notified} parent(s) were notified in the app${smsText}.` });
        void reload();
    };

    const cancel = async (d: string) => {
        setBusy(true);
        setMessage(null);
        const { data, error } = await supabase.rpc("cancel_no_classes", { p_day: d });
        setBusy(false);
        setCancelling(null);
        if (error || data?.error) {
            setMessage({ ok: false, text: ERRORS[data?.error] ?? "Couldn't cancel. Please try again." });
            return;
        }
        setMessage({ ok: true, text: `Cancelled. Classes on ${formatDateShort(d)} go ahead; parents were told in the app.` });
        void reload();
    };

    const today = manilaToday();
    const input = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]";
    const summary = mode === "whole"
        ? `No classes on ${formatDateShort(day)}`
        : `Classes ${day === today ? "today" : `on ${formatDateShort(day)}`} suspended from ${formatTime12(fromTime)}`;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">No-Class Days</h1>
                <p className="text-[#6b6456]">
                    Declare a day without classes (typhoon, holiday) or suspend classes from a time of day. Parents are told in
                    the app and by SMS, and the guard&apos;s Students on Campus follows it. Sundays, and Saturdays unless Saturday
                    classes are on, are already no-class days.
                </p>
            </div>

            {message && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${message.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {message.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{message.text}</span>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <CloudRain className="w-5 h-5 text-[#1a2b4a]" />
                    <h3 className="text-lg font-semibold text-[#1a2b4a]">Declare</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                        <span className="block text-sm font-medium text-[#1a2b4a] mb-1">Date</span>
                        <input type="date" value={day} min={today} onChange={(e) => { setDay(e.target.value); setConfirming(false); }} className={input} />
                    </label>
                    <div>
                        <span className="block text-sm font-medium text-[#1a2b4a] mb-1">What happens</span>
                        <div className="grid grid-cols-2 gap-2">
                            {([["whole", "No classes all day"], ["suspend", "Suspend from a time"]] as const).map(([v, l]) => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => { setMode(v); setConfirming(false); }}
                                    aria-pressed={mode === v}
                                    className={`px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${mode === v ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]" : "border-gray-200 text-[#6b6456] hover:border-[#c9a961]/50"}`}
                                >
                                    {l}
                                </button>
                            ))}
                        </div>
                    </div>
                    {mode === "suspend" && (
                        <label className="block">
                            <span className="block text-sm font-medium text-[#1a2b4a] mb-1">Suspended from</span>
                            <input type="time" value={fromTime} onChange={(e) => { setFromTime(e.target.value); setConfirming(false); }} className={input} />
                            <span className="block text-xs text-[#8b8476] mt-1">
                                Pickups start at this time. Every student must still be picked up or accounted for.
                            </span>
                        </label>
                    )}
                    <label className={`block ${mode === "suspend" ? "" : "sm:col-span-2"}`}>
                        <span className="block text-sm font-medium text-[#1a2b4a] mb-1">Reason (parents see this)</span>
                        <input value={reason} maxLength={120} onChange={(e) => { setReason(e.target.value); setConfirming(false); }} placeholder="e.g. Typhoon Signal No. 2" className={input} />
                    </label>
                </div>

                {confirming ? (
                    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 space-y-3">
                        <p className="text-sm text-amber-900">
                            <strong>{summary}</strong>: {reason.trim()}. Every parent will be told in the app and by SMS (about one
                            iProg credit each).
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setConfirming(false)} disabled={busy} className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium text-[#6b6456] bg-white disabled:opacity-60">
                                Cancel
                            </button>
                            <button onClick={() => { void declare(); }} disabled={busy} className="flex-1 px-4 py-2.5 bg-[#7d1935] text-white rounded-lg text-sm font-medium disabled:opacity-60">
                                {busy ? "Saving…" : "Yes, declare and notify"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => {
                            if (reason.trim().length < 3) { setMessage({ ok: false, text: ERRORS.invalid_reason }); return; }
                            setMessage(null);
                            setConfirming(true);
                        }}
                        className="px-5 py-2.5 bg-[#1a2b4a] text-white rounded-lg text-sm font-medium"
                    >
                        Declare
                    </button>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                    <CalendarOff className="w-5 h-5 text-[#1a2b4a]" />
                    <h3 className="text-lg font-semibold text-[#1a2b4a]">Declared days</h3>
                </div>
                {loadFailed ? (
                    <p className="text-sm text-red-600">Couldn't load the list.</p>
                ) : days === null ? (
                    <p className="text-sm text-[#8b8476]">Loading…</p>
                ) : days.length === 0 ? (
                    <p className="text-sm text-[#6b6456]">None declared.</p>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {days.map((d) => {
                            const past = d.day < today;
                            return (
                                <div key={d.day} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="text-sm">
                                        <p className="font-semibold text-[#1a2b4a]">
                                            {formatDateShort(d.day)}
                                            <span className="ml-2 font-normal text-[#6b6456]">
                                                {d.from_time ? `Suspended from ${formatTime12(d.from_time)}` : "No classes"}
                                            </span>
                                            {past && <span className="ml-2 text-xs text-[#8b8476]">(past)</span>}
                                        </p>
                                        <p className="text-[#6b6456]">{d.reason}</p>
                                        <p className="text-xs text-[#8b8476]">Declared by {d.declared_by ?? "—"}</p>
                                    </div>
                                    {!past && (
                                        cancelling === d.day ? (
                                            <div className="flex gap-2 shrink-0">
                                                <button onClick={() => setCancelling(null)} disabled={busy} className="px-3 py-1.5 border-2 border-gray-200 rounded-lg text-xs font-medium text-[#6b6456]">Keep</button>
                                                <button onClick={() => { void cancel(d.day); }} disabled={busy} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium disabled:opacity-60">
                                                    Yes, classes go ahead
                                                </button>
                                            </div>
                                        ) : (
                                            <button onClick={() => setCancelling(d.day)} className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-red-200 text-red-700 rounded-lg text-xs font-medium shrink-0">
                                                <Trash2 className="w-3.5 h-3.5" /> Cancel
                                            </button>
                                        )
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
