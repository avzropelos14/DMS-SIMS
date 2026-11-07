import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, ClipboardList, FileCheck, FileX, Undo2 } from "lucide-react";
import { supabase } from "../../supabase";
import { getRequirementCatalog, type CatalogItem, type StudentRequirement } from "../../lib/requirements";

// Requirements checklist for one student and school year (Phase 7).
// Office (admin/registrar): mark received (date; who is recorded by the database), waive with a
// required note, or undo. Parents: read-only. Students enrolled before this feature have no
// record: shown as "No requirements record", never as "all missing".

interface Props {
    studentId: string;
    schoolYearId: string | null;
    readOnly?: boolean;
    onChange?: () => void;
}

type Panel = { key: string; kind: "receive" | "waive" } | null;

const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function StudentRequirements({ studentId, schoolYearId, readOnly = false, onChange }: Props) {
    const [catalog, setCatalog] = useState<CatalogItem[]>([]);
    const [rows, setRows] = useState<StudentRequirement[] | null>(null);
    const [names, setNames] = useState<Record<string, string>>({});
    const [panel, setPanel] = useState<Panel>(null);
    const [date, setDate] = useState(todayIso());
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const fetchRows = async () => {
        if (!schoolYearId) return { list: [] as StudentRequirement[], people: {} as Record<string, string> };
        const { data } = await supabase
            .from("student_requirements")
            .select("requirement_key, status, received_at, verified_by, notes, updated_at")
            .eq("student_id", studentId)
            .eq("school_year_id", schoolYearId);
        const list = (data ?? []) as StudentRequirement[];
        // Staff names for "received by" (parents can't read profiles; they just see the date).
        const ids = [...new Set(list.map((r) => r.verified_by).filter(Boolean))] as string[];
        let people: Record<string, string> = {};
        if (ids.length && !readOnly) {
            const { data: rows } = await supabase.from("profiles").select("id, full_name").in("id", ids);
            people = Object.fromEntries(((rows ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? ""]));
        }
        return { list, people };
    };

    useEffect(() => {
        let cancelled = false;
        getRequirementCatalog().then((c) => { if (!cancelled) setCatalog(c); });
        fetchRows().then((r) => { if (!cancelled) { setRows(r.list); setNames(r.people); } });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, schoolYearId]);

    const reload = async () => { const r = await fetchRows(); setRows(r.list); setNames(r.people); onChange?.(); };

    const save = async (key: string, values: Partial<StudentRequirement>) => {
        if (!schoolYearId) return;
        setBusy(true);
        setError("");
        const { error: err } = await supabase
            .from("student_requirements")
            .update(values)
            .eq("student_id", studentId)
            .eq("school_year_id", schoolYearId)
            .eq("requirement_key", key);
        setBusy(false);
        if (err) { setError("Couldn't save. Please try again."); return; }
        setPanel(null);
        setNote("");
        void reload();
    };

    const startChecklist = async () => {
        if (!schoolYearId) return;
        setBusy(true);
        const { error: err } = await supabase.from("student_requirements").upsert(
            catalog.map((c) => ({ student_id: studentId, school_year_id: schoolYearId, requirement_key: c.key, status: "missing" })),
            { onConflict: "student_id,school_year_id,requirement_key", ignoreDuplicates: true },
        );
        setBusy(false);
        if (err) { setError("Couldn't create the checklist."); return; }
        void reload();
    };

    const openPanel = (key: string, kind: "receive" | "waive") => {
        setPanel(panel?.key === key && panel.kind === kind ? null : { key, kind });
        setDate(todayIso());
        setNote("");
        setError("");
    };

    const labelOf = (key: string) => catalog.find((c) => c.key === key)?.label ?? key;
    const order = (key: string) => catalog.find((c) => c.key === key)?.sort_order ?? 99;
    const sorted = [...(rows ?? [])].sort((a, b) => order(a.requirement_key) - order(b.requirement_key));
    const complete = sorted.filter((r) => r.status !== "missing").length;

    return (
        <div className="border border-gray-200 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-[#1a2b4a]" />
                    <h3 className="text-sm font-semibold text-[#1a2b4a]">Requirements</h3>
                </div>
                {sorted.length > 0 && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${complete === sorted.length ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
                        {complete} of {sorted.length} complete
                    </span>
                )}
            </div>

            {rows === null && <p className="text-sm text-[#8b8476]">Loading…</p>}
            {rows !== null && sorted.length === 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-[#8b8476]">No requirements record for this school year.</p>
                    {!readOnly && schoolYearId && (
                        <button disabled={busy} onClick={startChecklist} className="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 border-gray-200 text-[#1a2b4a] disabled:opacity-50">
                            Start checklist
                        </button>
                    )}
                </div>
            )}

            {sorted.length > 0 && (
                <>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-3">
                        <div className="h-full bg-green-500" style={{ width: `${(complete / sorted.length) * 100}%` }} />
                    </div>
                    <div className="space-y-2">
                        {sorted.map((r) => {
                            const open = panel?.key === r.requirement_key ? panel.kind : null;
                            return (
                                <div key={r.requirement_key} className={`p-3 rounded-lg ${r.status === "missing" ? "bg-amber-50 border border-amber-200" : "bg-[#faf8f5]"}`}>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {r.status === "missing"
                                            ? <FileX className="w-4 h-4 text-amber-600 shrink-0" />
                                            : <FileCheck className="w-4 h-4 text-green-600 shrink-0" />}
                                        <div className="flex-1 min-w-[160px]">
                                            <p className={`text-sm ${r.status === "missing" ? "font-semibold text-amber-900" : "text-[#2c2c2c]"}`}>{labelOf(r.requirement_key)}</p>
                                            <p className="text-xs text-[#8b8476]">
                                                {r.status === "missing" && "Missing"}
                                                {r.status === "submitted" && `Received${r.received_at ? ` ${fmtDate(r.received_at)}` : ""}${r.verified_by && names[r.verified_by] ? ` · by ${names[r.verified_by]}` : ""}`}
                                                {r.status === "waived" && `Waived${r.verified_by && names[r.verified_by] ? ` by ${names[r.verified_by]}` : ""}${r.notes ? `: ${r.notes}` : ""}`}
                                            </p>
                                        </div>
                                        {!readOnly && r.status === "missing" && (
                                            <div className="flex gap-1.5">
                                                <button disabled={busy} onClick={() => openPanel(r.requirement_key, "receive")} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white disabled:opacity-50">Mark received</button>
                                                <button disabled={busy} onClick={() => openPanel(r.requirement_key, "waive")} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-[#1a2b4a] disabled:opacity-50">Waive</button>
                                            </div>
                                        )}
                                        {!readOnly && r.status !== "missing" && (
                                            <button disabled={busy} onClick={() => save(r.requirement_key, { status: "missing", notes: null })} className="flex items-center gap-1 text-xs text-[#6b6456] disabled:opacity-50">
                                                <Undo2 className="w-3.5 h-3.5" /> Undo
                                            </button>
                                        )}
                                    </div>
                                    {open === "receive" && (
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <label className="text-xs text-[#6b6456]">Date received</label>
                                            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-black" />
                                            <button disabled={busy || !date} onClick={() => save(r.requirement_key, { status: "submitted", received_at: date, notes: null })} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white disabled:opacity-50">Save</button>
                                            <button onClick={() => setPanel(null)} className="text-xs text-[#6b6456]">Cancel</button>
                                        </div>
                                    )}
                                    {open === "waive" && (
                                        <div className="mt-2 space-y-2">
                                            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Why is it waived? (required)" className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-black" />
                                            <div className="flex gap-2">
                                                <button disabled={busy || !note.trim()} onClick={() => save(r.requirement_key, { status: "waived", notes: note.trim() })} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a2b4a] text-white disabled:opacity-50">Waive</button>
                                                <button onClick={() => setPanel(null)} className="text-xs text-[#6b6456]">Cancel</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {error && (
                <div className="flex items-start gap-2 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}
            {readOnly && sorted.length > 0 && complete < sorted.length && (
                <p className="flex items-start gap-1.5 mt-3 text-xs text-amber-800">
                    <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    Please bring the missing documents to the Registrar&apos;s Office.
                </p>
            )}
        </div>
    );
}
