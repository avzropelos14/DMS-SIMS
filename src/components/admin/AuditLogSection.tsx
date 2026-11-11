import { Fragment, useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, Download, RefreshCw, ScrollText, Search } from "lucide-react";
import { supabase } from "../../supabase";

// Admin: read-only view of public.audit_log (Phase 2 evidence trail). The table is append-only:
// nothing here can change or delete an entry. Names are looked up from profiles (staff),
// guardians (parents), student_accounts (students) and students (student ids in details).

interface AuditRow {
    id: number;
    created_at: string;
    actor_id: string | null;
    actor_role: string | null;
    action: string;
    target_user_id: string | null;
    details: Record<string, unknown> | null;
}

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
    password_reset: "Password reset",
    password_reset_email_sent: "Password reset email sent",
    password_reset_email_failed: "Password reset email failed",
    password_reset_denied: "Password reset refused",
    mfa_recovery_code_issued: "Sign-in recovery code issued",
    mfa_recovery_code_emailed: "Sign-in recovery code emailed",
    mfa_recovery_code_email_failed: "Recovery code email failed",
    mfa_recovery_code_denied: "Recovery code request refused",
    mfa_recovery_code_used: "Sign-in recovery code used",
    mfa_locked: "Sign-in locked after failed codes",
    student_account_created: "Student account created",
    guardian_photo_approved: "Parent photo approved",
    guardian_photo_captured: "Parent photo taken at the desk",
    guardian_photo_rejected: "Parent photo not approved",
    guardian_photo_removed: "Parent photo removed",
    guardian_lockdown: "Parent account locked down",
    guardian_access_restored: "Parent access restored",
    pickup_link_suspended: "Pickup QR suspended",
    pickup_link_reactivated: "Pickup QR reactivated",
    pickup_qr_replaced: "Pickup QR replaced",
    pickup_override_granted: "Second pickup allowed today",
    pickup_pass_printed: "Printed pickup pass issued",
    pickup_rejected: "Pickup rejected at the gate",
    pickup_settings_changed: "Pickup settings changed",
    call_list_viewed: "Emergency call list viewed",
    dismissal_status_cleared: "Dismissal status cleared",
    dismissal_status_absent: "Marked absent at dismissal",
    dismissal_status_handed_over: "Handed over to staff",
    dismissal_day_closed: "Dismissal day closed",
    late_pickup_notice: "Late pickup notice sent",
    self_dismissal_requested: "Self-dismissal requested",
    self_dismissal_approved: "Self-dismissal approved",
    self_dismissal_denied: "Self-dismissal not approved",
    self_dismissal_revoked: "Self-dismissal withdrawn",
    housekeeping_purge: "Nightly clean-up",
};

// Category filter: each lists the action names it covers (a prefix ends with "_").
const CATEGORIES: { id: string; label: string; match: string[] }[] = [
    { id: "accounts", label: "Accounts & sign-in", match: ["password_", "mfa_", "student_account_"] },
    { id: "guardian", label: "Parent security", match: ["guardian_", "pickup_link_", "pickup_qr_"] },
    { id: "pickup", label: "Pickup & dismissal", match: ["pickup_override_", "pickup_pass_", "pickup_rejected", "call_list_", "dismissal_", "late_pickup_"] },
    { id: "selfdismissal", label: "Self-dismissal", match: ["self_dismissal_"] },
    { id: "settings", label: "Settings", match: ["pickup_settings_"] },
    { id: "system", label: "System", match: ["housekeeping_"] },
];

const ROLE_LABELS: Record<string, string> = {
    full_admin: "Admin",
    registrar: "Registrar",
    guard: "Guard",
    cashier: "Cashier",
    teacher: "Teacher",
    parent: "Parent",
    student: "Student",
    system: "System",
};

// Detail keys that are internal ids; shown only in the expanded "technical" view.
const TECHNICAL_KEYS = new Set(["link_id", "incident_id", "notice_id", "permission_id", "auth_id"]);

const humanize = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const actionLabel = (a: string) => ACTION_LABELS[a] ?? humanize(a);
const roleLabel = (r: string | null) => (r ? ROLE_LABELS[r] ?? humanize(r) : "—");

const categoryOf = (action: string) =>
    CATEGORIES.find((c) => c.match.some((m) => (m.endsWith("_") ? action.startsWith(m) : action === m)));

const CATEGORY_STYLES: Record<string, string> = {
    accounts: "bg-blue-50 text-blue-700 border-blue-200",
    guardian: "bg-amber-50 text-amber-800 border-amber-200",
    pickup: "bg-green-50 text-green-700 border-green-200",
    selfdismissal: "bg-purple-50 text-purple-700 border-purple-200",
    settings: "bg-gray-100 text-gray-700 border-gray-300",
    system: "bg-gray-50 text-gray-500 border-gray-200",
};

const dateTimeFmt = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
});

function formatValue(v: unknown): string {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
}

interface Names {
    users: Map<string, string>;
    students: Map<string, string>;
}

// Looks up any names not already known, adding them to the maps in place.
async function resolveNames(rows: AuditRow[], names: Names) {
    const userIds = [...new Set(rows.flatMap((r) => [r.actor_id, r.target_user_id]).filter((id): id is string => !!id && !names.users.has(id)))];
    const studentIds = [...new Set(rows.map((r) => r.details?.student_id).filter((id): id is string => typeof id === "string" && !names.students.has(id)))];

    if (userIds.length) {
        const [staff, guardians, studentAccts] = await Promise.all([
            supabase.from("profiles").select("id, full_name, email").in("id", userIds),
            supabase.from("guardians").select("id, full_name, email").in("id", userIds),
            supabase.from("student_accounts").select("auth_user_id, students(first_name, last_name)").in("auth_user_id", userIds),
        ]);
        for (const p of (staff.data ?? []) as { id: string; full_name: string | null; email: string | null }[])
            names.users.set(p.id, p.full_name || p.email || "Staff member");
        for (const g of (guardians.data ?? []) as { id: string; full_name: string | null; email: string | null }[])
            if (!names.users.has(g.id)) names.users.set(g.id, g.full_name || g.email || "Parent");
        for (const s of (studentAccts.data ?? []) as unknown as { auth_user_id: string; students: { first_name: string; last_name: string } | null }[])
            if (!names.users.has(s.auth_user_id) && s.students) names.users.set(s.auth_user_id, `${s.students.first_name} ${s.students.last_name}`);
    }
    if (studentIds.length) {
        const { data } = await supabase.from("students").select("id, first_name, last_name").in("id", studentIds);
        for (const s of (data ?? []) as { id: string; first_name: string; last_name: string }[])
            names.students.set(s.id, `${s.first_name} ${s.last_name}`);
    }
}

export function AuditLogSection() {
    const [rows, setRows] = useState<AuditRow[]>([]);
    // Which filters the shown rows belong to; while it differs from the current filters, the page is loading.
    const [loadedFor, setLoadedFor] = useState<{ key: string; failed: boolean } | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [moreFailed, setMoreFailed] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [expanded, setExpanded] = useState<number | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    // The ref caches lookups across pages; the state copy is what renders.
    const nameCache = useRef<Names>({ users: new Map(), students: new Map() });
    const [names, setNames] = useState<Names>({ users: new Map(), students: new Map() });

    const [category, setCategory] = useState("");
    const [role, setRole] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [search, setSearch] = useState("");
    const queryKey = JSON.stringify([category, role, from, to, reloadKey]);
    const loading = loadedFor?.key !== queryKey;
    const failed = (!loading && loadedFor.failed) || moreFailed;

    const fetchPage = async (offset: number) => {
        let q = supabase
            .from("audit_log")
            .select("id, created_at, actor_id, actor_role, action, target_user_id, details")
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + PAGE_SIZE);
        const cat = CATEGORIES.find((c) => c.id === category);
        if (cat) q = q.or(cat.match.map((m) => (m.endsWith("_") ? `action.like.${m}*` : `action.eq.${m}`)).join(","));
        if (role) q = q.eq("actor_role", role);
        if (from) q = q.gte("created_at", `${from}T00:00:00+08:00`);
        if (to) q = q.lte("created_at", `${to}T23:59:59.999+08:00`);
        const { data, error } = await q;
        if (error) throw error;
        const page = (data ?? []) as AuditRow[];
        await resolveNames(page, nameCache.current);
        setNames({ users: new Map(nameCache.current.users), students: new Map(nameCache.current.students) });
        // One extra row was asked for, only to tell whether another page exists.
        return { page: page.slice(0, PAGE_SIZE), more: page.length > PAGE_SIZE };
    };

    useEffect(() => {
        let cancelled = false;
        fetchPage(0)
            .then(({ page, more }) => {
                if (cancelled) return;
                setRows(page);
                setHasMore(more);
                setExpanded(null);
                setLoadedFor({ key: queryKey, failed: false });
            })
            .catch(() => {
                if (cancelled) return;
                setRows([]);
                setHasMore(false);
                setLoadedFor({ key: queryKey, failed: true });
            });
        return () => { cancelled = true; };
        // queryKey covers every filter fetchPage reads; fetchPage itself is recreated each render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryKey]);

    const loadMore = async () => {
        setLoadingMore(true);
        setMoreFailed(false);
        try {
            const { page, more } = await fetchPage(rows.length);
            setRows((prev) => [...prev, ...page]);
            setHasMore(more);
        } catch {
            setMoreFailed(true);
        } finally {
            setLoadingMore(false);
        }
    };

    const userName = (id: string | null, r?: string | null) => {
        if (!id) return r === "system" || !r ? "System" : "—";
        return names.users.get(id) ?? "Removed account";
    };
    const studentName = (row: AuditRow) => {
        const sid = row.details?.student_id;
        return typeof sid === "string" ? names.students.get(sid) ?? sid : null;
    };

    // Plain-language details, without the internal ids.
    const summary = (row: AuditRow) =>
        Object.entries(row.details ?? {})
            .filter(([k, v]) => !TECHNICAL_KEYS.has(k) && k !== "student_id" && v !== null && v !== "")
            .map(([k, v]) => `${humanize(k)}: ${formatValue(v)}`)
            .join(" · ");

    const term = search.trim().toLowerCase();
    const visible = term
        ? rows.filter((r) =>
            [actionLabel(r.action), userName(r.actor_id, r.actor_role), r.target_user_id ? userName(r.target_user_id) : "", studentName(r) ?? "", summary(r)]
                .join(" ").toLowerCase().includes(term))
        : rows;

    const downloadCsv = () => {
        const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
        const lines = [
            ["When (Manila)", "Who", "Role", "Action", "Account affected", "Student", "Details", "Entry #"].map(cell).join(","),
            ...visible.map((r) => [
                dateTimeFmt.format(new Date(r.created_at)),
                userName(r.actor_id, r.actor_role),
                roleLabel(r.actor_role),
                actionLabel(r.action),
                r.target_user_id ? userName(r.target_user_id) : "",
                studentName(r) ?? "",
                JSON.stringify(r.details ?? {}),
                String(r.id),
            ].map(cell).join(",")),
        ];
        const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-log-${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date())}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const filtersActive = category || role || from || to || search;
    const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961] bg-white";

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Audit Log</h1>
                <p className="text-[#6b6456]">
                    A permanent record of security and safety actions: password resets, parent lockdowns, pickup QR
                    changes, gate decisions and settings changes. Entries can't be edited or deleted. Times are
                    Philippine time.
                </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="relative lg:col-span-1 sm:col-span-2">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search names, actions, reasons"
                            aria-label="Search the loaded entries"
                            className={`${inputClass} pl-9`}
                        />
                    </div>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Type of action" className={inputClass}>
                        <option value="">All actions</option>
                        {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Done by" className={inputClass}>
                        <option value="">Anyone</option>
                        {Object.entries(ROLE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-sm text-[#6b6456]">
                        <span className="shrink-0">From</span>
                        <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[#6b6456]">
                        <span className="shrink-0">To</span>
                        <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputClass} />
                    </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                    <p className="text-xs text-[#8b8476]">
                        {loading ? "Loading…" : `Showing ${visible.length} ${visible.length === 1 ? "entry" : "entries"}${hasMore ? " (more below)" : ""}`}
                        {term && !loading ? " · search covers the entries loaded so far" : ""}
                    </p>
                    <div className="flex gap-2">
                        {filtersActive && (
                            <button
                                onClick={() => { setCategory(""); setRole(""); setFrom(""); setTo(""); setSearch(""); }}
                                className="px-3 py-1.5 text-sm text-[#6b6456] hover:text-[#1a2b4a]"
                            >
                                Clear filters
                            </button>
                        )}
                        <button
                            onClick={() => { setMoreFailed(false); setReloadKey((k) => k + 1); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-[#faf8f5] text-[#1a2b4a]"
                        >
                            <RefreshCw className="w-4 h-4" /> Refresh
                        </button>
                        <button
                            onClick={downloadCsv}
                            disabled={loading || visible.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#1a2b4a] text-white rounded-lg hover:bg-[#2a3b5a] disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" /> Download CSV
                        </button>
                    </div>
                </div>
            </div>

            {failed && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg text-sm border bg-red-50 border-red-200 text-red-700">
                    <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> Couldn't load the audit log.</span>
                    <button onClick={() => { setMoreFailed(false); setReloadKey((k) => k + 1); }} className="font-medium underline">Retry</button>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {loading ? (
                    <p className="p-6 text-sm text-[#8b8476]">Loading…</p>
                ) : visible.length === 0 ? (
                    <div className="p-10 text-center">
                        <ScrollText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-[#6b6456]">{filtersActive ? "No entries match these filters." : "No entries yet."}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-[#faf8f5] text-left text-xs uppercase tracking-wide text-[#6b6456]">
                                <tr>
                                    <th className="px-4 py-3 w-8"><span className="sr-only">Expand</span></th>
                                    <th className="px-4 py-3 whitespace-nowrap">When</th>
                                    <th className="px-4 py-3">Who</th>
                                    <th className="px-4 py-3">Action</th>
                                    <th className="px-4 py-3">About</th>
                                    <th className="px-4 py-3">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {visible.map((r) => {
                                    const cat = categoryOf(r.action);
                                    const student = studentName(r);
                                    const target = r.target_user_id ? userName(r.target_user_id) : null;
                                    const open = expanded === r.id;
                                    return (
                                        <Fragment key={r.id}>
                                            <tr className="hover:bg-[#faf8f5] cursor-pointer align-top" onClick={() => setExpanded(open ? null : r.id)}>
                                                <td className="px-4 py-3 text-gray-400">
                                                    <button aria-label={open ? "Hide details" : "Show details"} aria-expanded={open}>
                                                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-[#1a2b4a]">{dateTimeFmt.format(new Date(r.created_at))}</td>
                                                <td className="px-4 py-3">
                                                    <div className="text-[#1a2b4a] font-medium">{userName(r.actor_id, r.actor_role)}</div>
                                                    <div className="text-xs text-[#8b8476]">{roleLabel(r.actor_role)}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${CATEGORY_STYLES[cat?.id ?? "settings"]}`}>
                                                        {actionLabel(r.action)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-[#1a2b4a]">
                                                    {target && <div>{target}</div>}
                                                    {student && <div className={target ? "text-xs text-[#8b8476]" : ""}>Student: {student}</div>}
                                                    {!target && !student && <span className="text-[#8b8476]">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-[#6b6456] max-w-md wrap-break-word">{summary(r) || "—"}</td>
                                            </tr>
                                            {open && (
                                                <tr className="bg-[#faf8f5]">
                                                    <td></td>
                                                    <td colSpan={5} className="px-4 pb-4 pt-1">
                                                        <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-xs">
                                                            <dt className="text-[#8b8476]">Entry #</dt><dd className="text-[#1a2b4a] font-mono">{r.id}</dd>
                                                            <dt className="text-[#8b8476]">Action code</dt><dd className="text-[#1a2b4a] font-mono">{r.action}</dd>
                                                            <dt className="text-[#8b8476]">Done by (account id)</dt><dd className="text-[#1a2b4a] font-mono break-all">{r.actor_id ?? "—"}</dd>
                                                            <dt className="text-[#8b8476]">Account affected (id)</dt><dd className="text-[#1a2b4a] font-mono break-all">{r.target_user_id ?? "—"}</dd>
                                                            {Object.entries(r.details ?? {}).map(([k, v]) => (
                                                                <Fragment key={k}>
                                                                    <dt className="text-[#8b8476]">{humanize(k)}</dt>
                                                                    <dd className="text-[#1a2b4a] break-all">{formatValue(v)}</dd>
                                                                </Fragment>
                                                            ))}
                                                        </dl>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {!loading && hasMore && (
                    <div className="p-4 border-t border-gray-100 text-center">
                        <button
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-[#faf8f5] text-[#1a2b4a] disabled:opacity-50"
                        >
                            {loadingMore ? "Loading…" : `Load ${PAGE_SIZE} more`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
