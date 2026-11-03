import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle, X, KeyRound } from "lucide-react";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../../supabase";
import { checkPasswordPolicy, MIN_PASSWORD_LENGTH } from "../../lib/passwordPolicy";

interface ChangePasswordModalProps {
    onClose: () => void;
}

// Checks the current password on a throwaway client that never stores a session,
// so the signed-in session on the main client is never touched by the check.
async function verifyCurrentPassword(email: string, password: string): Promise<"ok" | "wrong" | "rate-limited"> {
    const verifier = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: "sims-password-check",
        },
    });
    const { error } = await verifier.auth.signInWithPassword({ email, password });
    if (error) {
        if (error.status === 429) return "rate-limited";
        if (error.status === 400) return "wrong";
        throw error;
    }
    // End the session the check just created; signOut({ scope: "others" }) below would too.
    await verifier.auth.signOut({ scope: "local" }).catch(() => {});
    return "ok";
}

function PasswordField({
    label,
    value,
    onChange,
    placeholder,
    autoComplete,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    autoComplete: string;
}) {
    const [visible, setVisible] = useState(false);
    return (
        <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2">
                {label}
            </label>
            <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#8b8476" }} />
                <input
                    type={visible ? "text" : "password"}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    required
                    className="w-full pl-11 pr-12 py-3.5 text-sm rounded-xl border-2 border-[#5c5c5b] focus:border-[#1a2b4a] focus:ring-2 focus:ring-[#1a2b4a]/10 outline-none transition-all bg-white text-black"
                />
                <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#8b8476] hover:text-[#1a2b4a] hover:bg-gray-100 transition-colors"
                >
                    {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}

export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [othersSignedOut, setOthersSignedOut] = useState(true);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (newPassword !== confirmPassword) {
            setError("New passwords do not match.");
            return;
        }
        if (newPassword === currentPassword) {
            setError("Your new password must be different from your current password.");
            return;
        }

        setIsSubmitting(true);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const user = sessionData.session?.user;
            if (!user?.email) {
                setError("Your session has expired. Please sign in again.");
                return;
            }

            const policyError = await checkPasswordPolicy(newPassword, {
                email: user.email,
                names: [user.user_metadata?.full_name],
            });
            if (policyError) {
                setError(policyError);
                return;
            }

            const check = await verifyCurrentPassword(user.email, currentPassword);
            if (check === "wrong") {
                setError("Your current password is incorrect.");
                return;
            }
            if (check === "rate-limited") {
                setError("Too many attempts. Please wait a few minutes and try again.");
                return;
            }

            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword,
                data: { password_set: true },
            });
            if (updateError) {
                setError(updateError.message || "Couldn't update your password. Please try again.");
                return;
            }

            // Keep this session, end every other one (e.g. a phone left signed in).
            const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
            setOthersSignedOut(!signOutError);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setDone(true);
        } catch {
            setError("Couldn't reach the server. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
            <div
                className="w-full max-w-md bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
                style={{ fontFamily: "'Inter', sans-serif" }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="change-password-title"
            >
                <div className="flex items-start justify-between gap-3 p-6 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1a2b4a]/10">
                            <KeyRound className="w-5 h-5 text-[#1a2b4a]" />
                        </div>
                        <div>
                            <h3 id="change-password-title" className="text-lg font-bold text-[#1a2b4a]">
                                Change Password
                            </h3>
                            <p className="text-xs text-[#8b8476] mt-0.5">
                                Other devices will be signed out. This one stays signed in.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="p-2 hover:bg-gray-100 rounded-lg shrink-0"
                    >
                        <X className="w-5 h-5 text-[#8b8476]" />
                    </button>
                </div>

                <div className="p-6">
                    {done ? (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2.5 p-3.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>
                                    Your password has been changed.
                                    {othersSignedOut
                                        ? " Any other devices signed in to your account have been signed out."
                                        : " We couldn't sign out your other devices; they will be signed out when their sessions expire."}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                                style={{ backgroundColor: "#1a2b4a" }}
                            >
                                Done
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <PasswordField
                                label="Current Password"
                                value={currentPassword}
                                onChange={setCurrentPassword}
                                placeholder="Enter your current password"
                                autoComplete="current-password"
                            />
                            <PasswordField
                                label="New Password"
                                value={newPassword}
                                onChange={setNewPassword}
                                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                                autoComplete="new-password"
                            />
                            <PasswordField
                                label="Confirm New Password"
                                value={confirmPassword}
                                onChange={setConfirmPassword}
                                placeholder="Re-enter your new password"
                                autoComplete="new-password"
                            />

                            {error && (
                                <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
                                style={{ backgroundColor: "#1a2b4a" }}
                            >
                                {isSubmitting ? "Saving..." : "Change Password"}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
