import { useState } from "react";
import { AlertCircle, CheckCircle, Mail, Copy, Check } from "lucide-react";
import { supabase } from "../../supabase";
import { functionErrorMessage } from "../../lib/accounts";

// One-time sign-in recovery code: lets an account holder pass the verification step
// without the emailed code (e.g. the day's email budget is used up, or the account has
// no real inbox). Valid 24 hours, single use, replaces any earlier code for the account.
// The server applies the same rules as Reset Password; an administrator account is
// recovered from the Supabase SQL Editor instead.
export function MfaRecoveryCodeSection() {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState("");
    const [result, setResult] = useState<{ email: string; code: string; expiresAt: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const handleIssue = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus("sending");
        setErrorMessage("");
        setCopied(false);
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        const { data, error } = await supabase.functions.invoke("mfa-issue-recovery-code", {
            body: { email: email.trim() },
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });
        if (error || data?.error || !data?.code) {
            setStatus("error");
            setErrorMessage(
                error ? await functionErrorMessage(error) : data?.error || "Couldn't issue a recovery code.",
            );
            return;
        }
        setResult({ email: email.trim(), code: data.code, expiresAt: data.expires_at });
        setStatus("sent");
        setEmail("");
    };

    const copyCode = async () => {
        if (!result) return;
        try {
            await navigator.clipboard.writeText(result.code);
            setCopied(true);
        } catch {
            // Clipboard blocked: the code is still visible to copy by hand.
        }
    };

    return (
        <div className="max-w-md">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-[#1a2b4a]">Sign-in Recovery Code</h3>
                    <p className="text-xs text-[#8b8476] mt-1">
                        For an account holder who can't receive the emailed verification code.
                        The code works once and expires in 24 hours.
                    </p>
                </div>

                <div className="p-6">
                    {status === "sent" && result ? (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2.5 p-3.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>Recovery code issued for {result.email}.</span>
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2">
                                    Recovery Code (shown once)
                                </p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 px-4 py-3 rounded-xl border-2 border-[#5c5c5b] bg-[#faf8f5] text-sm font-mono tracking-widest text-black select-all break-all">
                                        {result.code}
                                    </code>
                                    <button
                                        type="button"
                                        onClick={copyCode}
                                        className="p-3 rounded-xl border-2 border-[#1a2b4a] text-[#1a2b4a] hover:bg-[#1a2b4a]/5 transition-all"
                                        aria-label="Copy recovery code"
                                    >
                                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-xs text-[#8b8476] mt-2">
                                    Give this to the account holder in person. Valid until{" "}
                                    {new Date(result.expiresAt).toLocaleString()}. They enter it after
                                    choosing "Use a recovery code" on the verification screen.
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
                                Issue Another Code
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleIssue} className="space-y-4">
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
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
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
                                {status === "sending" ? "Issuing..." : "Issue Recovery Code"}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
