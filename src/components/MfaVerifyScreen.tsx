import { useState, useEffect, useRef } from "react";
import { ArrowRight, AlertCircle, ShieldCheck } from "lucide-react";
import schoolLogo from "./assets/dmgteLogo.jpg";
import { verifyMfaCode, sendMfaCode, type SendMfaCodeResult } from "../lib/mfa";
import { getSchoolSettings, DEFAULT_SCHOOL_SETTINGS } from "../lib/schoolSettings";

interface MfaVerifyScreenProps {
    userId: string;
    userEmail: string | null | undefined;
    onVerified: () => void;
    onCancel: () => void;
    // The "remember this device" checkbox lives on the login form (checked before
    // the password is even submitted) when this screen follows a fresh login —
    // in that case the parent controls the value and we don't show it here.
    // On session restore (e.g. a page refresh with an untrusted device) there's
    // no login form in play, so this screen manages and shows its own checkbox.
    rememberDevice?: boolean;
    showOwnRememberCheckbox?: boolean;
    // Start in recovery-code mode without emailing a code (e.g. arriving from a password
    // reset email, which already contains a recovery code).
    preferRecoveryCode?: boolean;
}

// Full-page email verification step, shown whenever a signed-in user's device
// isn't trusted yet — both right after password login and on session restore
// (e.g. a page refresh), so refreshing past the code screen can't skip MFA.
export function MfaVerifyScreen({
    userId,
    userEmail,
    onVerified,
    onCancel,
    rememberDevice: controlledRememberDevice,
    showOwnRememberCheckbox = false,
    preferRecoveryCode = false,
}: MfaVerifyScreenProps) {
    const [ownRememberDevice, setOwnRememberDevice] = useState(false);
    const rememberDevice = showOwnRememberCheckbox ? ownRememberDevice : (controlledRememberDevice ?? false);
    const [mfaCode, setMfaCode] = useState("");
    // Recovery mode: a one-time code from the school office replaces the emailed code.
    const [useRecoveryCode, setUseRecoveryCode] = useState(preferRecoveryCode);
    const [mfaError, setMfaError] = useState("");
    const [isVerifying, setIsVerifying] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [resendMessage, setResendMessage] = useState("");
    const [resendCooldown, setResendCooldown] = useState(0);
    const [schoolName, setSchoolName] = useState(DEFAULT_SCHOOL_SETTINGS.school_name);
    const [schoolMotto, setSchoolMotto] = useState(DEFAULT_SCHOOL_SETTINGS.school_motto);
    // Guards the on-open request against React StrictMode's double effect run in dev.
    const initialRequestMade = useRef(false);

    const applySendResult = (result: SendMfaCodeResult, resent: boolean) => {
        if (result.resendAvailableInSeconds !== undefined) {
            setResendCooldown(result.resendAvailableInSeconds);
        }
        if (result.error) {
            setMfaError(result.error);
        } else if (result.alreadySent) {
            setResendMessage("A code was already sent and is still valid. Check your inbox (and spam folder).");
        } else if (result.sent) {
            setResendMessage(resent ? "A new code has been sent to your email." : "");
        }
    };

    // The code is requested here, on the MFA screen, rather than at login or on page
    // refresh. A still-valid code is reused instead of sending another email. In
    // recovery-code mode nothing is sent until the user switches to the emailed code.
    useEffect(() => {
        if (useRecoveryCode || initialRequestMade.current) return;
        initialRequestMade.current = true;
        sendMfaCode(userId).then((result) => applySendResult(result, false));
    }, [userId, useRecoveryCode]);

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [resendCooldown]);

    useEffect(() => {
        let cancelled = false;
        getSchoolSettings().then((settings) => {
            if (!cancelled) {
                setSchoolName(settings.school_name);
                setSchoolMotto(settings.school_motto);
            }
        });
        return () => { cancelled = true; };
    }, []);

    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setMfaError("");
        setIsVerifying(true);
        try {
            const result = await verifyMfaCode(userId, mfaCode, rememberDevice, useRecoveryCode ? "recovery" : "email");
            if (!result.success) {
                setMfaError(result.error || "Incorrect code. Please try again.");
                return;
            }
            onVerified();
        } catch {
            setMfaError("Couldn't reach the server. Please try again.");
        } finally {
            setIsVerifying(false);
        }
    };

    const handleResendCode = async () => {
        setMfaError("");
        setResendMessage("");
        setIsResending(true);
        try {
            const result = await sendMfaCode(userId, { resend: true });
            applySendResult(result, true);
        } finally {
            setIsResending(false);
        }
    };

    return (
        <div className="min-h-screen flex" style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* ── Left panel: school identity ─────────────────────────── */}
            <div className="hidden lg:flex lg:w-[50%] flex-col pt-5" style={{ backgroundColor: "#1a2b4a" }}>
                <div
                    className="absolute inset-0 w-[50%] h-[100%] pointer-events-none"
                    style={{
                        backgroundImage: `repeating-linear-gradient(20deg, transparent, transparent 39px, rgba(255, 255, 255, 0.05) 39px, rgba(255, 255, 255, 0.05) 40px),
                            repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.03) 39px, rgba(255,255,255,0.03) 40px)`,
                    }}
                />
                <div className="relative z-10 flex flex-col h-full px-14 py-14 ">
                    <div className="flex-1 flex flex-col">
                        <div className="">
                            <h1
                                className="text-6xl text-center md:text-5xl leading-tight tracking-tight text-white"
                                style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 700 }}
                            >
                                {schoolName}
                            </h1>
                            <div className="flex items-center gap-4 mb-6 py-3">
                                <div className="h-px flex-1" style={{ backgroundColor: "rgba(201,169,97,0.4)" }} />
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#c9a961" }} />
                                <div className="h-px flex-1" style={{ backgroundColor: "rgba(201,169,97,0.4)" }} />
                            </div>
                        </div>
                        {schoolMotto && (
                            <div
                                className="rounded-xl px-6 py-5 mb-10 w-85 mx-auto"
                                style={{ backgroundColor: "rgba(255,255,255,0.05)", borderLeft: "5px solid #c9a961" }}
                            >
                                <p
                                    className="text-lg italic text-white/90 leading-snug"
                                    style={{ fontFamily: "'Libre Baskerville', Georgia, serif" }}
                                >
                                    "{schoolMotto}"
                                </p>
                            </div>
                        )}
                        <div className="space-y-3 mt-12">
                            {[
                                "Dumaguete Mission Student Information System",
                                "Academic Year 2025 – 2026",
                                "Secure Institutional Portal",
                            ].map((line) => (
                                <div key={line} className="flex items-center gap-x-3">
                                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "#c9a961" }} />
                                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                                        {line}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
                        © 2026 {schoolName}. All rights reserved.
                    </p>
                </div>
            </div>

            {/* ── Right panel: verification form ──────────────────────── */}
            <div className="flex-1 flex flex-col" style={{ backgroundColor: "#f8f6f2" }}>
                <div className="lg:hidden flex items-center gap-3 px-6 py-5" style={{ backgroundColor: "#1a2b4a" }}>
                    <div className="w-10 h-10 rounded-full bg-white/95 flex items-center justify-center">
                        <img src={schoolLogo} alt="DMS" className="w-8 h-8 object-contain rounded-full" />
                    </div>
                    <div>
                        <p className="text-white font-semibold text-sm">{schoolName}</p>
                        <p className="text-xs" style={{ color: "#ffffff" }}>Student Information System</p>
                    </div>
                </div>

                <div className="flex-1 flex flex-col justify-center px-8 sm:px-14 lg:px-20 py-14">
                    <div className="w-full max-w-md mx-auto">
                        <div className="mb-10">
                            <div
                                className="w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-8"
                                style={{ backgroundColor: "rgb(255, 255, 255)", border: "4px solid rgba(255, 255, 255, 0.75)" }}
                            >
                                <div
                                    className="w-[116px] h-[116px] rounded-full flex items-center justify-center"
                                    style={{ backgroundColor: "rgba(255,255,255,0.95)" }}
                                >
                                    <img src={schoolLogo} alt={`${schoolName} seal`} className="w-24 h-24 object-contain rounded-full" />
                                </div>
                            </div>
                            <h2
                                className="text-4xl text-[#1a2b4a] mb-10 text-center"
                                style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 700, color: "black" }}
                            >
                                Verify Your Identity
                            </h2>
                            <p className="text-[#6b6456] text-sm text-center">
                                {useRecoveryCode
                                    ? "Enter the recovery code given to you by the school office."
                                    : `Enter the 6-digit code sent to ${userEmail ?? "your email"}.`}
                            </p>
                        </div>

                        <form onSubmit={handleVerifyCode} className="space-y-5 text-[#000000]">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2 text-left">
                                    {useRecoveryCode ? "Recovery Code" : "Verification Code"}
                                </label>
                                <div className="relative">
                                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#8b8476" }} />
                                    <input
                                        key={useRecoveryCode ? "recovery" : "email"}
                                        type="text"
                                        inputMode={useRecoveryCode ? "text" : "numeric"}
                                        autoComplete={useRecoveryCode ? "off" : "one-time-code"}
                                        maxLength={useRecoveryCode ? 11 : 6}
                                        value={mfaCode}
                                        onChange={(e) => {
                                            setMfaCode(
                                                useRecoveryCode
                                                    ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "")
                                                    : e.target.value.replace(/\D/g, ""),
                                            );
                                            setMfaError("");
                                        }}
                                        placeholder={useRecoveryCode ? "XXXXX-XXXXX" : "Enter 6-digit code"}
                                        required
                                        autoFocus
                                        className={`w-full pl-11 pr-4 py-3.5 text-sm tracking-[0.3em] rounded-xl outline-none transition-all bg-white ${
                                            mfaError
                                                ? "border-2 border-red-400 ring-2 ring-red-100"
                                                : "border-2 border-[#5c5c5b] focus:border-[#1a2b4a] focus:ring-2 focus:ring-[#1a2b4a]/10"
                                        }`}
                                    />
                                </div>
                            </div>

                            {mfaError && (
                                <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>{mfaError}</span>
                                </div>
                            )}

                            {resendMessage && !mfaError && (
                                <p className="text-xs text-center text-[#1a2b4a]">{resendMessage}</p>
                            )}

                            {showOwnRememberCheckbox && (
                                <label className="flex items-center gap-2.5 justify-center pt-1 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={ownRememberDevice}
                                        onChange={(e) => setOwnRememberDevice(e.target.checked)}
                                        className="w-4 h-4 rounded border-2 border-[#5c5c5b] accent-[#1a2b4a]"
                                    />
                                    <span className="text-xs text-[#6b6456]">
                                        Remember this device for 30 days
                                    </span>
                                </label>
                            )}

                            <button
                                type="submit"
                                disabled={
                                    isVerifying ||
                                    (useRecoveryCode ? mfaCode.replace(/-/g, "").length !== 10 : mfaCode.length !== 6)
                                }
                                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99] mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                style={{ backgroundColor: "#1a2b4a" }}
                            >
                                <span>{isVerifying ? "Verifying..." : "Verify & Continue"}</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>

                            <div className="flex items-center justify-between pt-1 text-xs">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="text-[#6b6456] hover:text-[#1a2b4a] transition-colors"
                                >
                                    Back to login
                                </button>
                                {!useRecoveryCode && (
                                    <button
                                        type="button"
                                        onClick={handleResendCode}
                                        disabled={isResending || resendCooldown > 0}
                                        className="text-[#1a2b4a] font-semibold hover:opacity-70 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isResending
                                            ? "Sending..."
                                            : resendCooldown > 0
                                              ? `Resend code (${resendCooldown}s)`
                                              : "Resend code"}
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setUseRecoveryCode((v) => !v);
                                    setMfaCode("");
                                    setMfaError("");
                                    setResendMessage("");
                                }}
                                className="w-full text-center text-xs text-[#6b6456] hover:text-[#1a2b4a] transition-colors"
                            >
                                {useRecoveryCode ? "Use the emailed code instead" : "Didn't get an email? Use a recovery code"}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
