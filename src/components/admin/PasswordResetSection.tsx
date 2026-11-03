import { useState } from "react";
import { AlertCircle, CheckCircle, Mail, Copy, Check } from "lucide-react";
import { supabase } from "../../supabase";
import { functionErrorMessage } from "../../lib/accounts";

// Admin password reset: issues a random temporary password for an account by email.
// The server decides who may be reset (admin: anyone except another admin; registrar:
// parents and students only), signs the account out everywhere, clears its remembered
// devices, logs the reset, and emails the owner a notice. The owner must choose a new
// password at their next sign-in.
export function PasswordResetSection() {
    const [resetEmail, setResetEmail] = useState("");
    const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
        "idle",
    );
    const [errorMessage, setErrorMessage] = useState("");
    const [result, setResult] = useState<{
        email: string;
        temporaryPassword: string;
        noticeEmailed: boolean;
    } | null>(null);
    const [copied, setCopied] = useState(false);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus("sending");
        setErrorMessage("");
        setCopied(false);
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        // No automatic retry: every call issues a new temporary password, so a retry
        // after a timeout would silently replace the one shown to the admin.
        const { data, error } = await supabase.functions.invoke(
            "admin-reset-password",
            {
                body: { email: resetEmail.trim() },
                headers: accessToken
                    ? { Authorization: `Bearer ${accessToken}` }
                    : undefined,
            },
        );
        if (error || data?.error || !data?.temporary_password) {
            setStatus("error");
            setErrorMessage(
                error
                    ? await functionErrorMessage(error)
                    : data?.error ||
                          "Couldn't confirm the password reset. Please check with the account holder before trying again.",
            );
            return;
        }
        setResult({
            email: resetEmail.trim(),
            temporaryPassword: data.temporary_password,
            noticeEmailed: !!data.notice_emailed,
        });
        setStatus("sent");
        setResetEmail("");
    };

    const copyPassword = async () => {
        if (!result) return;
        try {
            await navigator.clipboard.writeText(result.temporaryPassword);
            setCopied(true);
        } catch {
            // Clipboard blocked: the password is still visible to copy by hand.
        }
    };

    return (
        <div className="max-w-md">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-[#1a2b4a]">
                        Reset Password
                    </h3>
                    <p className="text-xs text-[#8b8476] mt-1">
                        Issue a temporary password for a staff, parent, or
                        student account. The account is signed out everywhere
                        and must choose a new password at its next sign-in.
                    </p>
                </div>

                <div className="p-6">
                    {status === "sent" && result ? (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2.5 p-3.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>
                                    Password reset for {result.email}.
                                    {result.noticeEmailed
                                        ? " A notice was emailed to the account holder."
                                        : " No notice email was sent (no real inbox on file)."}
                                </span>
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2">
                                    Temporary Password (shown once)
                                </p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 px-4 py-3 rounded-xl border-2 border-[#5c5c5b] bg-[#faf8f5] text-sm font-mono text-black select-all break-all">
                                        {result.temporaryPassword}
                                    </code>
                                    <button
                                        type="button"
                                        onClick={copyPassword}
                                        className="p-3 rounded-xl border-2 border-[#1a2b4a] text-[#1a2b4a] hover:bg-[#1a2b4a]/5 transition-all"
                                        aria-label="Copy temporary password"
                                    >
                                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-xs text-[#8b8476] mt-2">
                                    Give this to the account holder in person.
                                    It will not be shown again.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setResult(null);
                                    setStatus("idle");
                                }}
                                className="w-full py-3 rounded-xl text-sm font-semibold border-2 border-[#1a2b4a] text-[#1a2b4a] hover:bg-[#1a2b4a]/5 transition-all"
                            >
                                Reset Another Password
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleReset} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2">
                                    Account Email Address
                                </label>
                                <div className="relative">
                                    <Mail
                                        className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
                                        style={{ color: "#8b8476" }}
                                    />
                                    <input
                                        type="email"
                                        value={resetEmail}
                                        onChange={(e) =>
                                            setResetEmail(e.target.value)
                                        }
                                        placeholder="someone@missionschool.edu.ph"
                                        required
                                        className="w-full pl-11 pr-4 py-3 text-sm rounded-xl border-2 border-[#5c5c5b] focus:border-[#1a2b4a] focus:ring-2 focus:ring-[#1a2b4a]/10 outline-none transition-all bg-white text-black"
                                    />
                                </div>
                            </div>

                            {status === "error" && (
                                <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>{errorMessage}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={status === "sending"}
                                className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                                style={{ backgroundColor: "#1a2b4a" }}
                            >
                                {status === "sending"
                                    ? "Resetting..."
                                    : "Reset Password"}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
