import { useState, useEffect } from "react";
import { ArrowRight, Mail, Lock, AlertCircle } from "lucide-react";
import type { UserRole } from "../App";
import schoolLogo from "./assets/dmgteLogo.jpg";
import { supabase } from './../supabase';
import { resolveIdentity } from '../lib/resolveRole';
import { getSchoolSettings, DEFAULT_SCHOOL_SETTINGS } from '../lib/schoolSettings';

interface LoginScreenProps {
    onLogin: (role: UserRole, userData: any, authUser?: { user_metadata?: Record<string, any> }) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [schoolName, setSchoolName] = useState(DEFAULT_SCHOOL_SETTINGS.school_name);
    const [schoolMotto, setSchoolMotto] = useState(DEFAULT_SCHOOL_SETTINGS.school_motto);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsSubmitting(true);

        try {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError || !data.user) {
                setError("Invalid email or password. Please try again.");
                return;
            }

            const identity = await resolveIdentity(data.user.id);
            if (!identity) {
                await supabase.auth.signOut();
                setError(
                    "Email is unauthorized. Contact an administrator.",
                );
                return;
            }

            onLogin(identity.role, identity.userData, data.user);
        } catch {
            setError("Couldn't reach the server. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className="min-h-screen flex"
            style={{ fontFamily: "'Inter', sans-serif" }}
        >
            {/* ── Left panel: school identity ─────────────────────────── */}
            <div
                className="hidden lg:flex lg:w-[50%] flex-col pt-5"
                style={{ backgroundColor: "#1a2b4a" }}
            >
                {/* Subtle cross-hatch texture overlay */}
                <div
                    className="absolute inset-0 w-[50%] h-[100%] pointer-events-none"
                    style={{
                        backgroundImage: `repeating-linear-gradient(20deg, transparent, transparent 39px, rgba(255, 255, 255, 0.05) 39px, rgba(255, 255, 255, 0.05) 40px),
                            repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.03) 39px, rgba(255,255,255,0.03) 40px)`,
                    }}
                />

                <div className="relative z-10 flex flex-col h-full px-14 py-14 ">
                    {/* Top: Logo + School name */}
                    <div className="flex-1 flex flex-col">
                        {/* Logo medallion */}
                        <div className="">
                            <h1
                                className="text-6xl text-center md:text-5xl leading-tight tracking-tight text-white"
                                style={{
                                    fontFamily:
                                        "'Libre Baskerville', Georgia, serif",
                                    fontWeight: 700,
                                }}
                            >
                                {schoolName}
                            </h1>

                            {/* Divider rule */}
                            <div className="flex items-center gap-4 mb-6 py-3">
                                <div
                                    className="h-px flex-1"
                                    style={{
                                        backgroundColor: "rgba(201,169,97,0.4)",
                                    }}
                                />
                                <div
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: "#c9a961" }}
                                />
                                <div
                                    className="h-px flex-1"
                                    style={{
                                        backgroundColor: "rgba(201,169,97,0.4)",
                                    }}
                                />
                            </div>
                        </div>

                        {/* Motto block */}
                        {schoolMotto && (
                            <div
                                className="rounded-xl px-6 py-5 mb-10 w-85 mx-auto"
                                style={{
                                    backgroundColor: "rgba(255,255,255,0.05)",
                                    borderLeft: "5px solid #c9a961",
                                }}
                            >
                                <p
                                    className="text-lg italic text-white/90 leading-snug"
                                    style={{
                                        fontFamily:
                                            "'Libre Baskerville', Georgia, serif",
                                    }}
                                >
                                    "{schoolMotto}"
                                </p>
                            </div>
                        )}

                        {/* System info */}
                        <div className="space-y-3 mt-12">
                            {[
                                "Dumaguete Mission Student Information System",
                                "Academic Year 2025 – 2026",
                                "Secure Institutional Portal",
                            ].map((line) => (
                                <div
                                    key={line}
                                    className="flex items-center gap-x-3"
                                >
                                    <div
                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{ backgroundColor: "#c9a961" }}
                                    />
                                    <span
                                        className="text-xs"
                                        style={{
                                            color: "rgba(255,255,255,0.55)",
                                        }}
                                    >
                                        {line}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Bottom: copyright */}
                    <p
                        className="text-xs text-center"
                        style={{ color: "rgba(255,255,255,0.3)" }}
                    >
                        © 2026 {schoolName}. All rights reserved.
                    </p>
                </div>
            </div>

            {/* ── Right panel: login form ──────────────────────────────── */}
            <div
                className="flex-1 flex flex-col"
                style={{ backgroundColor: "#f8f6f2" }}
            >
                {/* Mobile header */}
                <div
                    className="lg:hidden flex items-center gap-3 px-6 py-5"
                    style={{ backgroundColor: "#1a2b4a" }}
                >
                    <div className="w-10 h-10 rounded-full bg-white/95 flex items-center justify-center">
                        <img
                            src={schoolLogo}
                            alt="DMS"
                            className="w-8 h-8 object-contain rounded-full"
                        />
                    </div>
                    <div>
                        <p className="text-white font-semibold text-sm">
                            {schoolName}
                        </p>
                        <p className="text-xs" style={{ color: "#ffffff" }}>
                            Student Information System
                        </p>
                    </div>
                </div>

                <div className="flex-1 flex flex-col justify-center px-8 sm:px-14 lg:px-20 py-14">
                    <div className="w-full max-w-md mx-auto">
                        {/* Heading */}
                        <div className="mb-10">
                            <div
                                className="w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-8"
                                style={{
                                    backgroundColor: "rgb(255, 255, 255)",
                                    border: "4px solid rgba(255, 255, 255, 0.75)",
                                }}
                            >
                                <div
                                    className="w-[116px] h-[116px] rounded-full flex items-center justify-center"
                                    style={{
                                        backgroundColor:
                                            "rgba(255,255,255,0.95)",
                                    }}
                                >
                                    <img
                                        src={schoolLogo}
                                        alt={`${schoolName} seal`}
                                        className="w-24 h-24 object-contain rounded-full"
                                    />
                                </div>
                            </div>

                            <h2
                                className="text-4xl text-[#1a2b4a] mb-10 text-center"
                                style={{
                                    fontFamily:
                                        "'Libre Baskerville', Georgia, serif",
                                    fontWeight: 700,
                                    color: "black",
                                }}
                            >
                                Welcome Back
                            </h2>
                            <p className="text-[#6b6456] text-sm text-center">
                                Sign in with your school-issued email.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5 text-[#000000]">
                            {/* Email */}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2 text-left">
                                    School Email Address
                                </label>
                                <div className="relative">
                                    <Mail
                                        className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
                                        style={{ color: "#8b8476" }}
                                    />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => {
                                            setEmail(e.target.value);
                                            setError("");
                                        }}
                                        placeholder="Enter your School Email"
                                        required
                                        className={`w-full pl-11 pr-4 py-3.5 text-sm rounded-xl outline-none transition-all bg-white ${
                                            error
                                                ? "border-2 border-red-400 ring-2 ring-red-100"
                                                : "border-2 border-[#5c5c5b] focus:border-[#1a2b4a] focus:ring-2 focus:ring-[#1a2b4a]/10"
                                        }`}
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#1a2b4a]">
                                        Password
                                    </label>
                                </div>
                                <div className="relative">
                                    <Lock
                                        className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
                                        style={{ color: "#8b8476" }}
                                    />
                                    <input
                                        type={
                                            showPassword ? "text" : "password"
                                        }
                                        value={password}
                                        onChange={(e) =>
                                            setPassword(e.target.value)
                                        }
                                        placeholder="Enter your Password"
                                        required
                                        className="w-full pl-11 pr-12 py-3.5 text-sm rounded-xl border-2 border-[#5c5c5b] focus:border-[#1a2b4a] focus:ring-2 focus:ring-[#1a2b4a]/10 outline-none transition-all bg-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowPassword((v) => !v)
                                        }
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8b8476] text-xs font-medium hover:text-[#1a2b4a] transition-colors"
                                    >
                                        {showPassword ? "Hide" : "Show"}
                                    </button>
                                </div>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99] mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                style={{ backgroundColor: "#1a2b4a" }}
                            >
                                <span>{isSubmitting ? "Signing In..." : "Sign In to Portal"}</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </form>

                        {/* Security */}
                        {/* 
                          <div
                            className="mt-8 flex items-center justify-center gap-2 py-3 rounded-xl border"
                            style={{
                                borderColor: "#ddd8cf",
                                backgroundColor: "white",
                            }}
                        >
                            <Shield
                                className="w-3.5 h-3.5"
                                style={{ color: "#8b8476" }}
                            />
                            <span className="text-xs text-[#8b8476]">
                                End-to-end encrypted · Institutional access only
                            </span>
                        </div>
                        */}
                    </div>
                </div>
            </div>
        </div>
    );
}
