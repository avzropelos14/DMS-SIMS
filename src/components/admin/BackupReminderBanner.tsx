import { useState } from "react";
import { AlertCircle, X } from "lucide-react";

// Shown to admins in the 30 days before the current school year's end date, reminding
// them to back up data. Purely a UI reminder — the system never auto-deletes anything.
export function BackupReminderBanner({
    endDate,
    yearLabel,
}: {
    endDate: string | null;
    yearLabel: string | null;
}) {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed || !yearLabel) return null;

    if (!endDate) {
        return (
            <div className="mb-6 flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
                <p className="text-sm text-blue-800">
                    Set an end date for school year <strong>{yearLabel}</strong>{" "}
                    in System Settings to enable backup reminders.
                </p>
                <button
                    onClick={() => setDismissed(true)}
                    className="text-blue-600 hover:text-blue-800 shrink-0"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        );
    }

    const daysLeft = Math.ceil(
        (new Date(endDate).getTime() - Date.now()) / 86400000,
    );
    if (daysLeft > 30 || daysLeft < 0) return null;

    return (
        <div className="mb-6 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
            <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800">
                    <strong>
                        {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                    </strong>{" "}
                    in school year {yearLabel} — please back up all data before
                    it ends.
                </p>
            </div>
            <button
                onClick={() => setDismissed(true)}
                className="text-amber-600 hover:text-amber-800 shrink-0"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
