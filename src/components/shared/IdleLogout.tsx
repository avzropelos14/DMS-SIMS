import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import {
    IDLE_WARNING_SECONDS,
    readLastActivity,
    writeLastActivity,
} from "../../lib/idleTimeout";

// Signs the account out after a stretch with no mouse, keyboard, touch or scroll activity,
// with an in-page warning a minute before. The last-activity time is shared across this
// browser's tabs, and is checked on wake, so a laptop closed past the limit signs out on opening.

interface IdleLogoutProps {
    limitMinutes: number;
    onTimeout: () => void;
}

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;
// Writes to shared storage at most this often; mouse movement fires many events a second.
const WRITE_EVERY_MS = 5000;

export function IdleLogout({ limitMinutes, onTimeout }: IdleLogoutProps) {
    const limitMs = limitMinutes * 60_000;
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
    const lastLocal = useRef(0);
    const lastWritten = useRef(0);
    const warning = useRef(false);
    const timedOut = useRef(false);
    const onTimeoutRef = useRef(onTimeout);

    useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

    useEffect(() => {
        // A session restored after the tab or browser sat closed past the limit times out
        // on the first check; with nothing stored yet, the clock starts now.
        const stored = readLastActivity();
        lastLocal.current = stored ?? Date.now();
        if (stored === null) writeLastActivity(lastLocal.current);

        const markActive = (force = false) => {
            // While the warning shows, only the button (or a key press) keeps the session.
            if (warning.current && !force) return;
            const now = Date.now();
            lastLocal.current = now;
            if (force || now - lastWritten.current > WRITE_EVERY_MS) {
                lastWritten.current = now;
                writeLastActivity(now);
            }
        };
        const onActivity = () => markActive();
        const onKey = () => markActive(true);

        const check = () => {
            if (timedOut.current) return;
            const last = Math.max(lastLocal.current, readLastActivity() ?? 0);
            const left = last + limitMs - Date.now();
            if (left <= 0) {
                timedOut.current = true;
                setSecondsLeft(null);
                onTimeoutRef.current();
                return;
            }
            const showWarning = left <= IDLE_WARNING_SECONDS * 1000;
            warning.current = showWarning;
            setSecondsLeft(showWarning ? Math.ceil(left / 1000) : null);
        };

        for (const e of ACTIVITY_EVENTS) {
            if (e === "keydown") window.addEventListener(e, onKey, { passive: true });
            else window.addEventListener(e, onActivity, { passive: true, capture: true });
        }
        const onVisible = () => { if (document.visibilityState === "visible") check(); };
        document.addEventListener("visibilitychange", onVisible);
        const interval = window.setInterval(check, 1000);
        check();

        return () => {
            for (const e of ACTIVITY_EVENTS) {
                if (e === "keydown") window.removeEventListener(e, onKey);
                else window.removeEventListener(e, onActivity, { capture: true });
            }
            document.removeEventListener("visibilitychange", onVisible);
            window.clearInterval(interval);
        };
    }, [limitMs]);

    const staySignedIn = () => {
        const now = Date.now();
        warning.current = false;
        lastLocal.current = now;
        lastWritten.current = now;
        writeLastActivity(now);
        setSecondsLeft(null);
    };

    if (secondsLeft === null) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-desc">
            <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 max-w-sm w-full text-center">
                <div className="w-12 h-12 rounded-full bg-[#c9a961]/15 flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-6 h-6 text-[#c9a961]" />
                </div>
                <h2 id="idle-title" className="text-lg font-semibold text-[#1a2b4a] mb-1">Are you still there?</h2>
                <p id="idle-desc" className="text-sm text-[#6b6456] mb-5">
                    For your security you'll be signed out in{" "}
                    <strong className="text-[#1a2b4a]">{secondsLeft} {secondsLeft === 1 ? "second" : "seconds"}</strong>{" "}
                    because there's been no activity for a while.
                </p>
                <button
                    onClick={staySignedIn}
                    autoFocus
                    className="w-full px-4 py-2.5 bg-[#1a2b4a] text-white rounded-lg font-medium hover:bg-[#2a3b5a]"
                >
                    Stay signed in
                </button>
            </div>
        </div>
    );
}
