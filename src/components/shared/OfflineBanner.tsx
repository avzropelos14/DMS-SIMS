import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

// "No internet" banner for every screen. The browser's offline flag only notices a dropped
// Wi-Fi link; when the Wi-Fi is still connected but the internet behind it is down, a tiny
// request to this site's own icon (no database, no cost) finds out. It only shows the
// banner: saving, signing in and scanning still go to the server and report their own errors.

const PROBE_EVERY_MS = 30_000;
const PROBE_TIMEOUT_MS = 6_000;
const FAILS_BEFORE_OFFLINE = 2; // one slow reply shouldn't flash the banner

async function reachable(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
        const res = await fetch(`${import.meta.env.BASE_URL}favicon.svg?online=${Date.now()}`, {
            method: "HEAD",
            cache: "no-store",
            signal: controller.signal,
        });
        return res.ok || res.status < 500;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

function useOnline(): boolean {
    const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

    useEffect(() => {
        let stopped = false;
        let fails = 0;
        let running = false;

        const check = async () => {
            if (running || stopped) return;
            if (!navigator.onLine) {
                fails = FAILS_BEFORE_OFFLINE;
                setOnline(false);
                return;
            }
            running = true;
            const ok = await reachable();
            running = false;
            if (stopped) return;
            if (ok) {
                fails = 0;
                setOnline(true);
            } else if (++fails >= FAILS_BEFORE_OFFLINE) {
                setOnline(false);
            }
        };

        const goOffline = () => { fails = FAILS_BEFORE_OFFLINE; setOnline(false); };
        const goOnline = () => { void check(); };
        const onVisible = () => { if (document.visibilityState === "visible") void check(); };

        window.addEventListener("offline", goOffline);
        window.addEventListener("online", goOnline);
        document.addEventListener("visibilitychange", onVisible);
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") void check();
        }, PROBE_EVERY_MS);
        void check();

        return () => {
            stopped = true;
            clearInterval(timer);
            window.removeEventListener("offline", goOffline);
            window.removeEventListener("online", goOnline);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    return online;
}

export function OfflineBanner({ role }: { role?: string | null }) {
    const online = useOnline();
    if (online) return null;

    const text = role === "guard"
        ? "No internet. QR codes can't be checked. Don't release students on the app: use the paper pickup log and check IDs by hand."
        : role
            ? "No internet. Don't reload or close this page: what you typed stays here. Press Save again once the connection is back."
            : "No internet. You can sign in once the connection is back.";

    return (
        <div
            role="alert"
            aria-live="assertive"
            className="fixed bottom-0 inset-x-0 z-[100] flex items-start sm:items-center justify-center gap-2 px-4 py-3 bg-red-700 text-white text-sm shadow-lg"
        >
            <WifiOff className="w-4 h-4 mt-0.5 sm:mt-0 shrink-0" />
            <span className="max-w-3xl">{text}</span>
        </div>
    );
}
