import { useState } from "react";
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle, ShieldCheck } from "lucide-react";

// A full page inside Guardian Security that confirms one action (lock down, restore, suspend,
// new QR code, extra pickup, delete photo) and collects its reason or note. Replaces the
// browser's own prompt/confirm pop-ups.

export interface GuardianAction {
    tone: "danger" | "normal" | "success";
    title: string;
    // Who the action is for, e.g. the guardian's or student's name.
    subject: string;
    intro: string;
    // What will happen, shown as a checklist.
    points: string[];
    // When set, a reason/note is required and passed to run().
    inputLabel?: string;
    placeholder?: string;
    confirmLabel: string;
    // Returns an error message to stay on the page, or null when done.
    run: (text: string) => Promise<string | null>;
}

const TONES = {
    danger: { icon: AlertTriangle, iconClass: "text-red-600", box: "bg-red-50 border-red-200", button: "bg-red-600 hover:bg-red-700" },
    normal: { icon: ShieldCheck, iconClass: "text-[#1a2b4a]", box: "bg-[#faf8f5] border-gray-200", button: "bg-[#1a2b4a] hover:bg-[#24385f]" },
    success: { icon: CheckCircle, iconClass: "text-green-600", box: "bg-green-50 border-green-200", button: "bg-green-600 hover:bg-green-700" },
} as const;

export function GuardianActionPage({ action, onCancel }: { action: GuardianAction; onCancel: () => void }) {
    const [text, setText] = useState("");
    const [error, setError] = useState("");
    const [working, setWorking] = useState(false);
    const tone = TONES[action.tone];
    const Icon = tone.icon;
    const needsText = Boolean(action.inputLabel);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (needsText && !text.trim()) {
            setError("Please fill this in before continuing.");
            return;
        }
        setWorking(true);
        setError("");
        const failure = await action.run(text.trim());
        setWorking(false);
        if (failure) setError(failure);
    };

    return (
        <div className="space-y-6">
            <button
                onClick={onCancel}
                disabled={working}
                className="flex items-center gap-2 text-sm text-[#6b6456] hover:text-[#1a2b4a] disabled:opacity-50"
            >
                <ArrowLeft className="w-4 h-4" /> Back to Guardian Security
            </button>

            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">{action.title}</h1>
                <p className="text-[#6b6456]">{action.subject}</p>
            </div>

            <form onSubmit={submit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5 max-w-2xl">
                <div className={`flex items-start gap-3 p-4 rounded-lg border ${tone.box}`}>
                    <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${tone.iconClass}`} />
                    <p className="text-sm text-[#2c2c2c]">{action.intro}</p>
                </div>

                {action.points.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2">What happens</p>
                        <ul className="space-y-1.5">
                            {action.points.map((p) => (
                                <li key={p} className="flex items-start gap-2 text-sm text-[#2c2c2c]">
                                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#c9a961]" />
                                    <span>{p}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {needsText && (
                    <div>
                        <label htmlFor="guardian-action-text" className="block text-sm font-medium text-[#1a2b4a] mb-1.5">
                            {action.inputLabel}
                        </label>
                        <textarea
                            id="guardian-action-text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder={action.placeholder}
                            maxLength={500}
                            rows={3}
                            autoFocus
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                        />
                        <p className="text-xs text-[#8b8476] mt-1">Saved in the audit log.</p>
                    </div>
                )}

                {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="flex flex-wrap gap-3">
                    <button
                        type="submit"
                        disabled={working}
                        className={`px-5 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-60 ${tone.button}`}
                    >
                        {working ? "Working…" : action.confirmLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={working}
                        className="px-5 py-2.5 rounded-lg border-2 border-gray-200 text-[#1a2b4a] text-sm font-medium disabled:opacity-60"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
}
