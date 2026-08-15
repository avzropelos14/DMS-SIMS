import { useState } from "react";
import { Lock, ArrowRight, AlertCircle, LogOut } from "lucide-react";
import schoolLogo from "./assets/dmgteLogo.jpg";
import { supabase } from "../supabase";

interface SetPasswordScreenProps {
    mode: "first-login" | "recovery";
    onDone: () => void;
    onSignOut: () => void;
}

export function SetPasswordScreen({ mode, onDone, onSignOut }: SetPasswordScreenProps) {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (password.length < 8) {
            setError("Password must be at least 8 characters long.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setIsSubmitting(true);
        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password,
                data: { password_set: true },
            });
            if (updateError) {
                setError(updateError.message || "Couldn't update your password. Please try again.");
                return;
            }
            onDone();
        } catch {
            setError("Couldn't reach the server. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#f8f6f2", fontFamily: "'Inter', sans-serif" }}>
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
                <div className="flex flex-col items-center text-center mb-8">
                    <div
                        className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
                        style={{ backgroundColor: "rgba(255,255,255,0.95)", border: "3px solid #1a2b4a" }}
                    >
                        <img src={schoolLogo} alt="Dumaguete Mission School seal" className="w-16 h-16 object-contain rounded-full" />
                    </div>
                    <h2 className="text-2xl text-[#1a2b4a] mb-2" style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 700 }}>
                        {mode === "first-login" ? "Create Your Password" : "Set a New Password"}
                    </h2>
                    <p className="text-[#6b6456] text-sm">
                        {mode === "first-login"
                            ? "For your account's security, please create your own password before continuing."
                            : "Enter a new password for your account."}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 text-[#000000]">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2">
                            New Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#8b8476" }} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="At least 8 characters"
                                required
                                className="w-full pl-11 pr-4 py-3.5 text-sm rounded-xl border-2 border-[#5c5c5b] focus:border-[#1a2b4a] focus:ring-2 focus:ring-[#1a2b4a]/10 outline-none transition-all bg-white"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2">
                            Confirm Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#8b8476" }} />
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Re-enter your password"
                                required
                                className="w-full pl-11 pr-4 py-3.5 text-sm rounded-xl border-2 border-[#5c5c5b] focus:border-[#1a2b4a] focus:ring-2 focus:ring-[#1a2b4a]/10 outline-none transition-all bg-white"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ backgroundColor: "#1a2b4a" }}
                    >
                        <span>{isSubmitting ? "Saving..." : "Save Password"}</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </form>

                <button
                    type="button"
                    onClick={onSignOut}
                    className="w-full flex items-center justify-center gap-2 mt-5 text-xs font-medium text-[#8b8476] hover:text-[#1a2b4a] transition-colors"
                >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign out</span>
                </button>

                <p className="text-xs text-[#8b8476] text-center mt-4">
                    Having trouble accessing your account? Contact the Registrar's office for help.
                </p>
            </div>
        </div>
    );
}
