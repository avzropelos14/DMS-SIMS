import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle, MessageSquare, RefreshCw } from "lucide-react";
import { supabase } from "../../supabase";
import { functionErrorMessage } from "../../lib/accounts";

// System Settings: SMS through iProg SMS (late pickup, refused pickup, tuition reminders).
// Shows whether the token is set, credits left, and today's count against the daily cap,
// and sends a test SMS to the admin's own phone. Full admin only (checked by the function).

interface SmsStatus {
    configured: boolean;
    balance: number | null;
    sent_today: number;
    daily_limit: string | null;
}

export function SmsSettingsCard() {
    const [status, setStatus] = useState<SmsStatus | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [testing, setTesting] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const fetchStatus = useCallback(
        () =>
            supabase.functions
                .invoke("send-event-sms", { body: { kind: "status" } })
                .then(({ data, error }) => (error ? null : (data as SmsStatus))),
        [],
    );

    useEffect(() => {
        let cancelled = false;
        fetchStatus().then((s) => {
            if (cancelled) return;
            setStatus(s);
            setLoadFailed(!s);
        });
        return () => { cancelled = true; };
    }, [fetchStatus]);

    const refresh = async () => {
        const s = await fetchStatus();
        setStatus(s);
        setLoadFailed(!s);
    };

    const sendTest = async () => {
        setTesting(true);
        setMessage(null);
        const { data, error } = await supabase.functions.invoke("send-event-sms", { body: { kind: "test" } });
        setTesting(false);
        if (error) {
            setMessage({ ok: false, text: await functionErrorMessage(error) });
        } else if (data?.reason === "not_configured") {
            setMessage({ ok: false, text: "The iProg SMS token isn't set yet. Add IPROG_SMS_API_TOKEN to the Supabase Edge Function secrets." });
        } else if (data?.reason === "no_phone") {
            setMessage({ ok: false, text: "Your employee record has no valid mobile number (09XXXXXXXXX). Add one in Staff & Teachers first." });
        } else if (data?.reason === "daily_limit") {
            setMessage({ ok: false, text: "Today's SMS limit is reached. The test can be sent again tomorrow." });
        } else if (data?.sent > 0) {
            setMessage({ ok: true, text: "Test SMS sent to your phone. It may take a minute to arrive." });
        } else {
            setMessage({ ok: false, text: "iProg didn't accept the SMS. Check the token and your credits, then try again." });
        }
        void refresh();
    };

    const limitLabel = status?.daily_limit === "unlimited" ? "no limit" : `${status?.daily_limit ?? "—"} per day`;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between gap-3 mb-1">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-[#1a2b4a]" />
                    <h3 className="text-lg font-semibold text-[#1a2b4a]">SMS Alerts (iProg SMS)</h3>
                </div>
                <button onClick={() => { void refresh(); }} className="flex items-center gap-1 text-sm text-[#6b6456] hover:text-[#1a2b4a]">
                    <RefreshCw className="w-4 h-4" /> Refresh
                </button>
            </div>
            <p className="text-sm text-[#6b6456] mb-4">
                Parents get an SMS when their child is still at school after the late-pickup time, when a guard refuses a
                pickup made with their QR code, and in the last 5 days before a monthly tuition installment is due while it
                is unpaid. Each SMS uses about one iProg credit.
            </p>

            {loadFailed ? (
                <p className="text-sm text-red-600">Couldn't load the SMS status.</p>
            ) : !status ? (
                <p className="text-sm text-[#8b8476]">Loading…</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    <div className="bg-[#faf8f5] rounded-lg p-3">
                        <p className="text-xs font-semibold text-[#8b8476] uppercase tracking-wide mb-1">Connection</p>
                        <p className={`text-sm font-medium ${status.configured ? "text-green-700" : "text-amber-700"}`}>
                            {status.configured ? "Token set" : "Token not set"}
                        </p>
                    </div>
                    <div className="bg-[#faf8f5] rounded-lg p-3">
                        <p className="text-xs font-semibold text-[#8b8476] uppercase tracking-wide mb-1">Credits left</p>
                        <p className="text-sm font-medium text-[#1a2b4a]">{status.balance ?? "—"}</p>
                    </div>
                    <div className="bg-[#faf8f5] rounded-lg p-3">
                        <p className="text-xs font-semibold text-[#8b8476] uppercase tracking-wide mb-1">Sent today</p>
                        <p className="text-sm font-medium text-[#1a2b4a]">{status.sent_today} ({limitLabel})</p>
                    </div>
                </div>
            )}

            {message && (
                <div className={`flex items-start gap-2 p-3 mb-4 rounded-lg text-sm border ${message.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {message.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{message.text}</span>
                </div>
            )}

            <button
                onClick={() => { void sendTest(); }}
                disabled={testing}
                className="px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all disabled:opacity-60"
            >
                {testing ? "Sending…" : "Send test SMS to my phone"}
            </button>
            <p className="text-xs text-[#8b8476] mt-2">
                Smart and TNT numbers receive SMS only once iProg approves a custom sender name for the school.
            </p>
        </div>
    );
}
