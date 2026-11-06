import { useEffect, useState } from "react";
import { AlertCircle, Camera, CheckCircle, Search, ShieldCheck, Trash2, User, XCircle } from "lucide-react";
import { supabase } from "../../supabase";
import { PhotoCaptureModal } from "../shared/PhotoCaptureModal";
import { deletePhoto, getPhotoUrl, photoFileName, safeFolder, uploadPhoto } from "../../lib/photo";

// Guardian Security (Phase 5B): pickup-verification photos. The office approves photos
// parents submit, takes photos at the desk, and removes photos it no longer needs to keep
// (Data Privacy Act: delete a guardian's photo once none of their children is enrolled).
// Phase 5C adds suspension, QR cancellation and lockdown to this page.

interface LinkedStudent {
    id: string;
    first_name: string;
    last_name: string;
    grade_level: string | null;
    status: string;
    photo_path: string | null;
}

interface GuardianRow {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    photo_path: string | null;
    photo_status: string;
    student_guardians: { relationship: string | null; access_status: string; students: LinkedStudent | null }[];
}

interface PendingPhoto {
    guardian_id: string;
    full_name: string;
    email: string | null;
    path: string;
    submitted_at: string;
    current_photo_path: string | null;
}

const GUARDIAN_SELECT =
    "id, full_name, email, phone, photo_path, photo_status, student_guardians(relationship, access_status, students(id, first_name, last_name, grade_level, status, photo_path))";

function PhotoThumb({ path, size = "w-20 h-20" }: { path: string | null | undefined; size?: string }) {
    // Remembers which path the loaded URL belongs to, so a changed path never shows a stale photo.
    const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);
    useEffect(() => {
        let cancelled = false;
        if (!path) return;
        getPhotoUrl(path).then((u) => { if (!cancelled) setLoaded({ path, url: u }); });
        return () => { cancelled = true; };
    }, [path]);
    const url = path && loaded?.path === path ? loaded.url : null;
    return (
        <div className={`${size} rounded-xl bg-[#faf8f5] border border-gray-200 overflow-hidden flex items-center justify-center shrink-0`}>
            {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <User className="w-1/2 h-1/2 text-gray-300" />}
        </div>
    );
}

type CaptureTarget = { kind: "guardian"; id: string; name: string } | { kind: "student"; id: string; name: string };

export function GuardianSecuritySection() {
    const [pending, setPending] = useState<PendingPhoto[]>([]);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<GuardianRow[]>([]);
    const [searched, setSearched] = useState(false);
    const [selected, setSelected] = useState<GuardianRow | null>(null);
    const [retention, setRetention] = useState<GuardianRow[]>([]);
    const [capture, setCapture] = useState<CaptureTarget | null>(null);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const fetchPending = () =>
        supabase.rpc("pending_guardian_photos").then(({ data }) => (data ?? []) as PendingPhoto[]);

    // Guardians still holding a photo although none of their children is active.
    const fetchRetention = () =>
        supabase.from("guardians").select(GUARDIAN_SELECT).not("photo_path", "is", null).then(({ data }) =>
            ((data ?? []) as unknown as GuardianRow[]).filter(
                (g) => !g.student_guardians.some((l) => l.students?.status === "Active"),
            ),
        );

    const loadPending = async () => setPending(await fetchPending());
    const loadRetention = async () => setRetention(await fetchRetention());

    const refreshSelected = async (id: string) => {
        const { data } = await supabase.from("guardians").select(GUARDIAN_SELECT).eq("id", id).maybeSingle();
        setSelected((data as unknown as GuardianRow) ?? null);
    };

    useEffect(() => {
        let cancelled = false;
        fetchPending().then((rows) => { if (!cancelled) setPending(rows); });
        fetchRetention().then((rows) => { if (!cancelled) setRetention(rows); });
        return () => { cancelled = true; };
    }, []);

    const search = async (e: React.FormEvent) => {
        e.preventDefault();
        // Characters that would break the PostgREST "or" filter are dropped.
        const q = query.trim().replace(/[,()*%\\]/g, " ").trim();
        if (!q) return;
        const { data } = await supabase
            .from("guardians")
            .select(GUARDIAN_SELECT)
            .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
            .order("full_name")
            .limit(20);
        setResults((data ?? []) as unknown as GuardianRow[]);
        setSearched(true);
        setSelected(null);
    };

    const flash = (ok: boolean, text: string) => setMessage({ ok, text });

    const review = async (p: PendingPhoto, approve: boolean) => {
        setBusy(true);
        const { data, error } = await supabase.rpc("review_guardian_photo", { p_guardian_id: p.guardian_id, p_approve: approve });
        setBusy(false);
        if (error || data?.error) {
            flash(false, "Couldn't update that photo. Please try again.");
            return;
        }
        await deletePhoto(data?.delete_path);
        flash(true, approve ? `Photo approved for ${p.full_name}.` : `Photo rejected for ${p.full_name}.`);
        void loadPending();
        void loadRetention();
        if (selected?.id === p.guardian_id) void refreshSelected(p.guardian_id);
    };

    const saveCapture = async (blob: Blob): Promise<string | null> => {
        if (!capture) return null;
        const path = capture.kind === "guardian"
            ? `guardians/${capture.id}/${photoFileName()}`
            : `students/${safeFolder(capture.id)}/${photoFileName()}`;
        const uploadError = await uploadPhoto(path, blob);
        if (uploadError) return `Upload failed: ${uploadError}`;
        const { data, error } = capture.kind === "guardian"
            ? await supabase.rpc("set_guardian_photo", { p_guardian_id: capture.id, p_path: path })
            : await supabase.rpc("set_student_photo", { p_student_id: capture.id, p_path: path });
        if (error) {
            await deletePhoto(path);
            return "Couldn't save the photo. Please try again.";
        }
        await deletePhoto(data?.delete_path);
        flash(true, `Photo saved for ${capture.name}.`);
        setCapture(null);
        if (selected) void refreshSelected(selected.id);
        void loadRetention();
        return null;
    };

    const removeGuardianPhoto = async (g: GuardianRow) => {
        if (!window.confirm(`Delete the pickup photo of ${g.full_name}?`)) return;
        setBusy(true);
        const { data, error } = await supabase.rpc("remove_guardian_photo", { p_guardian_id: g.id });
        setBusy(false);
        if (error) {
            flash(false, "Couldn't delete that photo. Please try again.");
            return;
        }
        await deletePhoto(data?.delete_path);
        flash(true, `Photo deleted for ${g.full_name}.`);
        void loadRetention();
        if (selected?.id === g.id) void refreshSelected(g.id);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Guardian Security</h1>
                <p className="text-[#6b6456]">
                    Pickup-verification photos for guardians and students. Photos are private and only
                    shown to guards at pickup and to the school office.
                </p>
            </div>

            {message && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${message.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {message.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{message.text}</span>
                </div>
            )}

            {/* Pending approvals */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-1">Photos awaiting approval</h3>
                <p className="text-sm text-[#6b6456] mb-4">Submitted by parents from the Parent Portal. Compare with the photo on file or their ID.</p>
                {pending.length === 0 ? (
                    <p className="text-sm text-[#8b8476]">Nothing to review.</p>
                ) : (
                    <div className="space-y-3">
                        {pending.map((p) => (
                            <div key={p.guardian_id} className="flex flex-wrap items-center gap-4 p-3 bg-[#faf8f5] rounded-lg">
                                <div className="flex items-center gap-2">
                                    <div className="text-center">
                                        <PhotoThumb path={p.current_photo_path} />
                                        <p className="text-[10px] text-[#8b8476] mt-1">On file</p>
                                    </div>
                                    <div className="text-center">
                                        <PhotoThumb path={p.path} />
                                        <p className="text-[10px] text-[#8b8476] mt-1">New</p>
                                    </div>
                                </div>
                                <div className="flex-1 min-w-[160px]">
                                    <p className="font-medium text-[#2c2c2c]">{p.full_name}</p>
                                    <p className="text-xs text-[#8b8476]">{p.email} · {new Date(p.submitted_at).toLocaleString()}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button disabled={busy} onClick={() => review(p, true)} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-60">Approve</button>
                                    <button disabled={busy} onClick={() => review(p, false)} className="px-4 py-2 rounded-lg border-2 border-red-300 text-red-700 text-sm font-medium disabled:opacity-60">Reject</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">Find a guardian</h3>
                <form onSubmit={search} className="flex gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Name or email"
                            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                        />
                    </div>
                    <button type="submit" className="px-5 py-2.5 bg-[#1a2b4a] text-white rounded-lg text-sm font-medium">Search</button>
                </form>

                {searched && results.length === 0 && <p className="text-sm text-[#8b8476]">No guardians found.</p>}
                {!selected && results.length > 0 && (
                    <div className="divide-y divide-gray-100">
                        {results.map((g) => (
                            <button key={g.id} onClick={() => setSelected(g)} className="w-full flex items-center gap-3 py-3 text-left hover:bg-[#faf8f5] px-2 rounded-lg">
                                <PhotoThumb path={g.photo_status === "approved" ? g.photo_path : null} size="w-10 h-10" />
                                <div className="min-w-0">
                                    <p className="font-medium text-[#2c2c2c] truncate">{g.full_name}</p>
                                    <p className="text-xs text-[#8b8476] truncate">{g.email}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {selected && (
                    <div className="space-y-5">
                        <button onClick={() => setSelected(null)} className="text-sm text-[#6b6456] hover:text-[#1a2b4a]">← Back to results</button>
                        <div className="flex flex-wrap items-center gap-4">
                            <PhotoThumb path={selected.photo_status === "approved" ? selected.photo_path : null} size="w-28 h-28" />
                            <div className="flex-1 min-w-[180px]">
                                <p className="text-xl font-semibold text-[#1a2b4a]">{selected.full_name}</p>
                                <p className="text-sm text-[#6b6456]">{selected.email}{selected.phone ? ` · ${selected.phone}` : ""}</p>
                                <p className="text-xs mt-1 text-[#8b8476]">
                                    {selected.photo_status === "approved" ? "Approved pickup photo on file" : "No pickup photo on file"}
                                </p>
                            </div>
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => setCapture({ kind: "guardian", id: selected.id, name: selected.full_name })}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1a2b4a] text-white text-sm font-medium"
                                >
                                    <Camera className="w-4 h-4" /> {selected.photo_path ? "Replace photo" : "Take photo"}
                                </button>
                                {selected.photo_path && (
                                    <button
                                        disabled={busy}
                                        onClick={() => removeGuardianPhoto(selected)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-red-300 text-red-700 text-sm font-medium disabled:opacity-60"
                                    >
                                        <Trash2 className="w-4 h-4" /> Delete photo
                                    </button>
                                )}
                            </div>
                        </div>

                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2">Linked students</p>
                            <div className="space-y-2">
                                {selected.student_guardians.filter((l) => l.students).map((l) => {
                                    const s = l.students as LinkedStudent;
                                    const name = `${s.first_name} ${s.last_name}`;
                                    return (
                                        <div key={s.id} className="flex flex-wrap items-center gap-3 p-3 bg-[#faf8f5] rounded-lg">
                                            <PhotoThumb path={s.photo_path} size="w-14 h-14" />
                                            <div className="flex-1 min-w-[150px]">
                                                <p className="font-medium text-[#2c2c2c]">{name}</p>
                                                <p className="text-xs text-[#8b8476]">
                                                    {s.grade_level} · {l.relationship ?? "Guardian"} · {s.status}
                                                    {l.access_status === "suspended" && <span className="ml-1 font-semibold text-red-600">· Pickup suspended</span>}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setCapture({ kind: "student", id: s.id, name })}
                                                className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-[#1a2b4a] text-[#1a2b4a] text-sm font-medium"
                                            >
                                                <Camera className="w-4 h-4" /> {s.photo_path ? "Replace" : "Take photo"}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Retention */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-5 h-5 text-[#1a2b4a]" />
                    <h3 className="text-lg font-semibold text-[#1a2b4a]">Photos to delete</h3>
                </div>
                <p className="text-sm text-[#6b6456] mb-4">
                    Guardians who still have a photo but none of whose children is currently active.
                    Under the Data Privacy Act these photos should no longer be kept.
                </p>
                {retention.length === 0 ? (
                    <p className="text-sm text-[#8b8476]">None.</p>
                ) : (
                    <div className="space-y-2">
                        {retention.map((g) => (
                            <div key={g.id} className="flex items-center gap-3 p-3 bg-[#faf8f5] rounded-lg">
                                <PhotoThumb path={g.photo_path} size="w-10 h-10" />
                                <p className="flex-1 text-sm font-medium text-[#2c2c2c]">{g.full_name}</p>
                                <button disabled={busy} onClick={() => removeGuardianPhoto(g)} className="flex items-center gap-1.5 text-sm text-red-700 disabled:opacity-60">
                                    <XCircle className="w-4 h-4" /> Delete
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {capture && (
                <PhotoCaptureModal
                    title={`Photo of ${capture.name}`}
                    note="Face clearly visible, plain background, no sunglasses or hat. The photo is resized to about 60 KB before upload."
                    onSave={saveCapture}
                    onClose={() => setCapture(null)}
                />
            )}
        </div>
    );
}
