import { useEffect, useState } from "react";
import { Footprints } from "lucide-react";
import { supabase } from "../../supabase";
import { formatDateShort } from "../../lib/selfDismissal";

// Student portal: read-only self-dismissal status (Phase 6A). Shown only when a permission
// exists or is waiting for approval.

interface Status {
    status: "none" | "active" | "pending_approval";
    valid_from?: string;
    valid_to?: string;
    earliest_release_time?: string; // already "3:00 PM"
    today?: boolean;
}

export function SelfDismissalBadge() {
    const [status, setStatus] = useState<Status | null>(null);

    useEffect(() => {
        let cancelled = false;
        supabase.rpc("my_self_dismissal_status").then(({ data }) => { if (!cancelled) setStatus((data as Status) ?? null); });
        return () => { cancelled = true; };
    }, []);

    if (!status || status.status === "none") return null;
    const pending = status.status === "pending_approval";
    const dates = status.valid_from === status.valid_to
        ? formatDateShort(status.valid_from as string)
        : `${formatDateShort(status.valid_from as string)} – ${formatDateShort(status.valid_to as string)}`;

    return (
        <div className={`mb-6 flex items-start gap-3 rounded-xl border px-5 py-3 ${pending ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
            <Footprints className={`w-5 h-5 mt-0.5 shrink-0 ${pending ? "text-amber-600" : "text-green-700"}`} />
            <div className="text-sm">
                <p className={`font-semibold ${pending ? "text-amber-800" : "text-green-800"}`}>
                    {pending
                        ? "Self-dismissal requested: waiting for the registrar"
                        : status.today ? "You may leave school on your own today" : "Self-dismissal allowed"}
                </p>
                <p className={pending ? "text-amber-700" : "text-green-700"}>
                    {dates} · not before {status.earliest_release_time}. Show yourself to the guard at the gate before leaving.
                </p>
            </div>
        </div>
    );
}
