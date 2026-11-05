import { useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle, KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "../../supabase";
import { functionErrorMessage } from "../../lib/accounts";

// Account recovery, by email only. The admin types an account's email address; the system
// emails the account holder directly. No password or code is ever shown here, so a
// compromised admin portal can only send these emails to the real owners.
// The server decides who may be helped (admin: anyone except another admin; registrar:
// parents and students only) and keeps a daily limit on security emails.

interface EmailActionPanelProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    whatTheyGet: string[];
    functionName: "admin-reset-password" | "mfa-issue-recovery-code";
    buttonLabel: string;
    sendingLabel: string;
    successMessage: (sentTo: string) => string;
}

function EmailActionPanel({
    icon,
    title,
    description,
    whatTheyGet,
    functionName,
    buttonLabel,
    sendingLabel,
    successMessage,
}: EmailActionPanelProps) {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
    const [message, setMessage] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus("sending");
        setMessage("");
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        // No automatic retry: each call sends an email and counts against the daily limit.
        const { data, error } = await supabase.functions.invoke(functionName, {
            body: { email: email.trim() },
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });
        if (error || data?.error || !data?.success) {
            setStatus("error");
            setMessage(error ? await functionErrorMessage(error) : data?.error || "Couldn't send the email.");
            return;
        }
        setStatus("sent");
        setMessage(successMessage(data.sent_to ?? "the account holder"));
        setEmail("");
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
                {icon}
                <h3 className="text-lg font-semibold text-[#1a2b4a]">{title}</h3>
            </div>
            <p className="text-sm text-[#6b6456] mb-4">{description}</p>

            <div className="p-4 bg-[#faf8f5] rounded-lg mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2">
                    The account holder receives
                </p>
                <ul className="space-y-1.5">
                    {whatTheyGet.map((line) => (
                        <li key={line} className="flex items-start gap-2 text-sm text-[#2c2c2c]">
                            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#c9a961]" />
                            <span>{line}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-auto">
                <div>
                    <label className="block text-xs font-medium text-[#6b6456] mb-1">Account Email Address</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                if (status !== "sending") setStatus("idle");
                            }}
                            placeholder="parent@example.com"
                            required
                            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                        />
                    </div>
                </div>

                {status === "sent" && (
                    <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                        <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{message}</span>
                    </div>
                )}
                {status === "error" && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{message}</span>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={status === "sending"}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    <Mail className="w-4 h-4" />
                    {status === "sending" ? sendingLabel : buttonLabel}
                </button>
            </form>
        </div>
    );
}

export function AccountRecoveryPage({ onBack }: { onBack: () => void }) {
    return (
        <div className="space-y-6">
            <div>
                <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-sm font-medium text-[#6b6456] hover:text-[#1a2b4a] transition-colors mb-3"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to System Settings
                </button>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Account Recovery</h1>
                <p className="text-[#6b6456]">
                    Help someone back into their account. Everything is emailed straight to the
                    account holder; passwords and codes are never shown here.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <EmailActionPanel
                    icon={<Lock className="w-5 h-5 text-[#1a2b4a]" />}
                    title="Reset Password"
                    description="For someone who forgot their password or whose account may be compromised."
                    whatTheyGet={[
                        "A link to choose a new password",
                        "A one-time recovery code (valid 24 hours) for the verification step",
                        "They are signed out on every device right away",
                    ]}
                    functionName="admin-reset-password"
                    buttonLabel="Send Reset Email"
                    sendingLabel="Sending…"
                    successMessage={(to) => `A password reset email was sent to ${to}.`}
                />
                <EmailActionPanel
                    icon={<KeyRound className="w-5 h-5 text-[#1a2b4a]" />}
                    title="Sign-in Recovery Code"
                    description="For someone who knows their password but can't get past the verification step (for example, verification is temporarily locked)."
                    whatTheyGet={[
                        "A one-time recovery code, valid for 24 hours",
                        "Their password and sessions are not changed",
                    ]}
                    functionName="mfa-issue-recovery-code"
                    buttonLabel="Send Recovery Code"
                    sendingLabel="Sending…"
                    successMessage={(to) => `A recovery code was emailed to ${to}.`}
                />
            </div>

            <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200 text-sm text-[#6b6456]">
                <ShieldCheck className="w-5 h-5 shrink-0 text-[#1a2b4a]" />
                <p>
                    Registrars can help parent and student accounts; administrators can help any account
                    except another administrator. Accounts with generated school addresses (no real inbox)
                    can't receive these emails. Every request is recorded in the audit log, and security
                    emails are limited to 20 per day.
                </p>
            </div>
        </div>
    );
}
