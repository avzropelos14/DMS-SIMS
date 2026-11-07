import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "../../supabase";

// Parent notifications (Phase 5D). The database writes them (pickups, suspensions, new QR
// codes, photo reviews, refused pickups); this bell reads them once a minute while the tab
// is visible, and right away when the tab comes back into view.

interface NotificationRow {
    id: number;
    kind: string;
    title: string;
    body: string;
    created_at: string;
    read_at: string | null;
}

const POLL_MS = 60_000;

const KIND_DOT: Record<string, string> = {
    pickup: "bg-green-500",
    pickup_reactivated: "bg-green-500",
    access_restored: "bg-green-500",
    photo_approved: "bg-green-500",
    pickup_suspended: "bg-red-500",
    pickup_refused: "bg-red-500",
    photo_rejected: "bg-amber-500",
    qr_replaced: "bg-amber-500",
    late_pickup: "bg-amber-500",
    self_dismissal: "bg-green-500",
    self_dismissal_revoked: "bg-amber-500",
    self_dismissal_denied: "bg-amber-500",
};

function timeAgo(iso: string): string {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    return new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
    const [items, setItems] = useState<NotificationRow[]>([]);
    const [open, setOpen] = useState(false);

    const fetchItems = useCallback(
        () => supabase.rpc("my_notifications", { p_limit: 30 }).then(({ data, error }) => (error ? null : ((data ?? []) as NotificationRow[]))),
        [],
    );

    useEffect(() => {
        let cancelled = false;
        const load = () => {
            if (document.visibilityState !== "visible") return;
            fetchItems().then((rows) => { if (!cancelled && rows) setItems(rows); });
        };
        load();
        const timer = window.setInterval(load, POLL_MS);
        document.addEventListener("visibilitychange", load);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", load);
        };
    }, [fetchItems]);

    const unread = items.filter((n) => !n.read_at).length;

    const markAllRead = async () => {
        if (unread === 0) return;
        const now = new Date().toISOString();
        setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
        await supabase.rpc("mark_my_notifications_read", { p_ids: null });
    };

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next) fetchItems().then((rows) => { if (rows) setItems(rows); });
    };

    return (
        <div className="relative">
            <button
                onClick={toggle}
                className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            >
                <Bell className="w-5 h-5 text-[#8b8476]" />
                {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}></div>
                    <div className="fixed sm:absolute inset-x-2 sm:inset-x-auto sm:right-0 top-16 sm:top-auto sm:mt-2 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-[70vh] flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <h3 className="font-semibold text-[#1a2b4a]">Notifications</h3>
                            {unread > 0 && (
                                <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-medium text-[#1a5c38] hover:underline">
                                    <CheckCheck className="w-4 h-4" /> Mark all as read
                                </button>
                            )}
                        </div>
                        <div className="overflow-y-auto">
                            {items.length === 0 ? (
                                <p className="p-6 text-sm text-center text-[#8b8476]">No notifications yet.</p>
                            ) : (
                                items.map((n) => (
                                    <div key={n.id} className={`flex gap-3 px-4 py-3 border-b border-gray-100 last:border-0 ${n.read_at ? "" : "bg-[#faf8f5]"}`}>
                                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read_at ? "bg-gray-300" : KIND_DOT[n.kind] ?? "bg-[#1a2b4a]"}`} />
                                        <div className="min-w-0">
                                            <p className={`text-sm ${n.read_at ? "text-[#2c2c2c]" : "font-semibold text-[#1a2b4a]"}`}>{n.title}</p>
                                            <p className="text-xs text-[#6b6456] mt-0.5">{n.body}</p>
                                            <p className="text-[11px] text-[#8b8476] mt-1">{timeAgo(n.created_at)}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
