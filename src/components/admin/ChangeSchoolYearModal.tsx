import { useState } from "react";
import { Calendar, AlertCircle, X } from "lucide-react";
import { supabase } from "../../supabase";

// Starts a new school year: inserts a new school_years row and flips is_current from the
// old year to the new one. Nothing is copied or wiped — class sections, schedules, and
// enrollments are all scoped by school_year_id, so a brand-new year is empty by construction
// while every existing student/payment/grade record stays exactly where it is.
export function ChangeSchoolYearModal({
    currentLabel,
    onClose,
    onCreated,
}: {
    currentLabel: string | null;
    onClose: () => void;
    onCreated: (newLabel: string) => void;
}) {
    const [label, setLabel] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConfirm = async () => {
        if (!label.trim() || !startDate || !endDate) return;
        setSubmitting(true);
        setError(null);
        try {
            const { data: newYear, error: insErr } = await supabase
                .from("school_years")
                .insert({
                    label: label.trim(),
                    start_date: startDate,
                    end_date: endDate,
                    is_current: false,
                })
                .select("id, label")
                .single();
            if (insErr) throw insErr;

            const { error: clearErr } = await supabase
                .from("school_years")
                .update({ is_current: false })
                .eq("is_current", true);
            if (clearErr) throw clearErr;

            const { error: setErr } = await supabase
                .from("school_years")
                .update({ is_current: true })
                .eq("id", newYear.id);
            if (setErr) {
                setError(
                    "School year was created but the switch may be incomplete — please check System Settings / Supabase before continuing.",
                );
                throw setErr;
            }

            onCreated(newYear.label);
            onClose();
        } catch (e: any) {
            setError(
                (prev) =>
                    prev || e?.message || "Failed to start new school year.",
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
                <div className="sticky top-0 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Calendar className="w-6 h-6" />
                        <h2 className="text-xl font-semibold">
                            Change to New School Year
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {currentLabel && (
                        <p className="text-sm text-[#6b6456]">
                            Current school year:{" "}
                            <strong className="text-[#2c2c2c]">
                                {currentLabel}
                            </strong>
                        </p>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                            New School Year Label *
                        </label>
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="e.g. 2026-2027"
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 text-black"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                Start Date *
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                End Date *
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 text-black"
                            />
                        </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800">
                            Class sections, subject assignments, and schedules
                            will start fresh for the new year. Student records,
                            payments, and grades are preserved and remain
                            accessible by selecting the old year from the School
                            Year selector. Students and parents will need
                            re-enrollment confirmed by the Registrar before
                            regaining portal access.
                        </p>
                    </div>
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                        </div>
                    )}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 text-[#2c2c2c] rounded-lg font-medium hover:bg-gray-50 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={
                                submitting ||
                                !label.trim() ||
                                !startDate ||
                                !endDate
                            }
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60"
                        >
                            {submitting
                                ? "Starting…"
                                : "Confirm & Start New Year"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
