// Converts a 24-hour "HH:MM" time into 12-hour "h:mm AM/PM" for display.
function formatTime12hr(t: string): string {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return t;
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

// Converts a stored "HH:MM-HH:MM" schedules.time_label into a 12-hour range
// (e.g. "08:00-09:00" -> "8:00 AM - 9:00 AM"); anything else is returned as-is.
export function formatTimeLabel12hr(timeLabel: string): string {
    if (!timeLabel) return timeLabel;
    const parts = timeLabel.split("-");
    if (parts.length !== 2) return timeLabel;
    const [start, end] = parts;
    if (!/^\d{1,2}:\d{2}$/.test(start.trim()) || !/^\d{1,2}:\d{2}$/.test(end.trim()))
        return timeLabel;
    return `${formatTime12hr(start.trim())} - ${formatTime12hr(end.trim())}`;
}

export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
