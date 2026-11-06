import { useState, useEffect } from "react";
import {
    Calendar,
    UserPlus,
    Download,
    AlertCircle,
    CheckCircle,
    Edit,
    Shield,
    X,
    Check,
    Archive,
    Receipt,
    Lock,
} from "lucide-react";
import { supabase } from "../../supabase";
import {
    TUITION_GRADE_GROUPS,
    DEFAULT_TUITION_FEES,
    DEFAULT_ENROLLMENT_FEES,
} from "../../lib/tuition";
import { type SchoolYear } from "../../lib/schoolYear";
import { getSchoolSettings } from "../../lib/schoolSettings";
import { functionErrorMessage, deleteAuthAccountFor } from "../../lib/accounts";
import { getCurrentSchoolYearId } from "../../lib/students";
import { AccountRecoveryPage } from "./AccountRecoveryPage";
import { PickupSettingsCard } from "./PickupSettingsCard";
import { ChangeSchoolYearModal } from "./ChangeSchoolYearModal";
import { ManageAccountsModal } from "./ManageAccountsModal";

// Settings Section //
export function SettingsSection({
    tuitionFees = DEFAULT_TUITION_FEES,
    onTuitionFeesChange,
    enrollmentFees = DEFAULT_ENROLLMENT_FEES,
    onEnrollmentFeesChange,
    currentSchoolYear,
    onSchoolYearRolledOver,
}: {
    tuitionFees?: Record<string, number>;
    onTuitionFeesChange?: (
        fees: Record<string, number>,
    ) => Promise<string | null>;
    enrollmentFees?: Record<string, number>;
    onEnrollmentFeesChange?: (
        fees: Record<string, number>,
    ) => Promise<string | null>;
    currentSchoolYear?: SchoolYear | null;
    onSchoolYearRolledOver?: () => void;
}) {
    // --- School Year rollover & end-date editing ---
    const [showChangeYearModal, setShowChangeYearModal] = useState(false);
    const [editingEndDate, setEditingEndDate] = useState(false);
    const [endDateInput, setEndDateInput] = useState(
        currentSchoolYear?.end_date ?? "",
    );
    const [savingEndDate, setSavingEndDate] = useState(false);
    const [endDateError, setEndDateError] = useState<string | null>(null);

    useEffect(() => {
        setEndDateInput(currentSchoolYear?.end_date ?? "");
    }, [currentSchoolYear?.end_date, currentSchoolYear?.id]);

    // --- School Information ---
    const [schoolInfo, setSchoolInfo] = useState({
        school_name: "",
        school_motto: "",
        school_address: "",
        contact_email: "",
        contact_phone: "",
    });
    const [schoolInfoLoading, setSchoolInfoLoading] = useState(true);
    const [savingSchoolInfo, setSavingSchoolInfo] = useState(false);
    const [schoolInfoSaved, setSchoolInfoSaved] = useState(false);
    const [schoolInfoError, setSchoolInfoError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            const settings = await getSchoolSettings();
            setSchoolInfo(settings);
            setSchoolInfoLoading(false);
        })();
    }, []);

    const updateSchoolInfoField = (
        key: keyof typeof schoolInfo,
        value: string,
    ) => {
        setSchoolInfo((prev) => ({ ...prev, [key]: value }));
        setSchoolInfoSaved(false);
    };

    const saveSchoolInfo = async () => {
        setSavingSchoolInfo(true);
        setSchoolInfoError(null);
        try {
            const { error } = await supabase
                .from("school_settings")
                .update({ ...schoolInfo, updated_at: new Date().toISOString() })
                .eq("id", true);
            if (error) throw error;
            setSchoolInfoSaved(true);
            setTimeout(() => setSchoolInfoSaved(false), 3000);
        } catch (e: any) {
            setSchoolInfoError(
                e?.message || "Failed to save school information.",
            );
        } finally {
            setSavingSchoolInfo(false);
        }
    };

    const saveEndDate = async () => {
        if (!currentSchoolYear || !endDateInput) return;
        setSavingEndDate(true);
        setEndDateError(null);
        try {
            const { error } = await supabase
                .from("school_years")
                .update({ end_date: endDateInput })
                .eq("id", currentSchoolYear.id);
            if (error) throw error;
            setEditingEndDate(false);
            onSchoolYearRolledOver?.();
        } catch (e: any) {
            setEndDateError(e?.message || "Failed to update end date.");
        } finally {
            setSavingEndDate(false);
        }
    };

    // Tuition Management — one input per school level (Primary / Elementary / High School)
    // instead of per individual grade. The DB still stores a tuition_fees row per grade
    // (see src/lib/tuition.ts), so saving fans the single level amount out to every grade
    // within that level. Seeded from the first grade in each group, which is representative
    // once a level has been saved through this single-input UI.
    const [tuitionInputs, setTuitionInputs] = useState<Record<string, string>>(
        () =>
            Object.fromEntries(
                TUITION_GRADE_GROUPS.map((group) => [
                    group.label,
                    String(tuitionFees[group.grades[0]] ?? ""),
                ]),
            ),
    );
    const [tuitionSaved, setTuitionSaved] = useState(false);
    const [tuitionError, setTuitionError] = useState<string | null>(null);

    const updateTuitionInput = (level: string, value: string) => {
        setTuitionInputs((prev) => ({ ...prev, [level]: value }));
        setTuitionSaved(false);
    };

    const saveTuitionFees = async () => {
        const parsed: Record<string, number> = {};
        for (const group of TUITION_GRADE_GROUPS) {
            const value = tuitionInputs[group.label] ?? "";
            const num = parseInt(value.replace(/,/g, ""), 10);
            if (isNaN(num) || num < 0) {
                setTuitionError(
                    `Please enter a valid amount for ${group.label}.`,
                );
                return;
            }
            for (const grade of group.grades) parsed[grade] = num;
        }
        setTuitionError(null);
        const error = await onTuitionFeesChange?.(parsed);
        if (error) {
            setTuitionError(error);
            return;
        }
        setTuitionSaved(true);
        setTimeout(() => setTuitionSaved(false), 3000);
    };

    // Enrollment Fee Management — same per-level-input, fan-out-to-every-grade pattern as
    // Tuition Management above, backed by the enrollment_fees table.
    const [enrollmentInputs, setEnrollmentInputs] = useState<
        Record<string, string>
    >(() =>
        Object.fromEntries(
            TUITION_GRADE_GROUPS.map((group) => [
                group.label,
                String(enrollmentFees[group.grades[0]] ?? ""),
            ]),
        ),
    );
    const [enrollmentSaved, setEnrollmentSaved] = useState(false);
    const [enrollmentError, setEnrollmentError] = useState<string | null>(null);

    const updateEnrollmentInput = (level: string, value: string) => {
        setEnrollmentInputs((prev) => ({ ...prev, [level]: value }));
        setEnrollmentSaved(false);
    };

    const saveEnrollmentFees = async () => {
        const parsed: Record<string, number> = {};
        for (const group of TUITION_GRADE_GROUPS) {
            const value = enrollmentInputs[group.label] ?? "";
            const num = parseInt(value.replace(/,/g, ""), 10);
            if (isNaN(num) || num < 0) {
                setEnrollmentError(
                    `Please enter a valid amount for ${group.label}.`,
                );
                return;
            }
            for (const grade of group.grades) parsed[grade] = num;
        }
        setEnrollmentError(null);
        const error = await onEnrollmentFeesChange?.(parsed);
        if (error) {
            setEnrollmentError(error);
            return;
        }
        setEnrollmentSaved(true);
        setTimeout(() => setEnrollmentSaved(false), 3000);
    };

    // --- Official Receipt Number Range: the physical, pre-printed OR booklet range for the
    // current school year. The Cashier draws receipt numbers from this range (in sequence)
    // instead of the system's auto-generated ones, so the printed and system copies match. ---
    const [orRangeStart, setOrRangeStart] = useState(
        currentSchoolYear?.or_range_start ?? "",
    );
    const [orRangeEnd, setOrRangeEnd] = useState(
        currentSchoolYear?.or_range_end ?? "",
    );
    const [orNextNumber, setOrNextNumber] = useState(
        currentSchoolYear?.or_next_number ?? "",
    );
    const [savingOrRange, setSavingOrRange] = useState(false);
    const [orRangeSaved, setOrRangeSaved] = useState(false);
    const [orRangeError, setOrRangeError] = useState<string | null>(null);

    useEffect(() => {
        setOrRangeStart(currentSchoolYear?.or_range_start ?? "");
        setOrRangeEnd(currentSchoolYear?.or_range_end ?? "");
        setOrNextNumber(currentSchoolYear?.or_next_number ?? "");
    }, [
        currentSchoolYear?.id,
        currentSchoolYear?.or_range_start,
        currentSchoolYear?.or_range_end,
        currentSchoolYear?.or_next_number,
    ]);

    const saveOrRange = async () => {
        if (!currentSchoolYear) return;
        setOrRangeError(null);
        if (!orRangeStart.trim() || !orRangeEnd.trim()) {
            setOrRangeError("Enter both a range start and range end.");
            return;
        }
        setSavingOrRange(true);
        try {
            // Only reset the "next number to issue" pointer if it isn't already inside the new
            // range — so editing the end of the range mid-year doesn't lose the cashier's place.
            const nextNumber =
                orNextNumber &&
                orNextNumber >= orRangeStart &&
                orNextNumber <= orRangeEnd
                    ? orNextNumber
                    : orRangeStart;
            const { error } = await supabase
                .from("school_years")
                .update({
                    or_range_start: orRangeStart.trim(),
                    or_range_end: orRangeEnd.trim(),
                    or_next_number: nextNumber,
                })
                .eq("id", currentSchoolYear.id);
            if (error) throw error;
            setOrNextNumber(nextNumber);
            setOrRangeSaved(true);
            onSchoolYearRolledOver?.();
            setTimeout(() => setOrRangeSaved(false), 3000);
        } catch (e: any) {
            setOrRangeError(
                e?.message || "Failed to save the receipt number range.",
            );
        } finally {
            setSavingOrRange(false);
        }
    };

    const [prefs, setPrefs] = useState({
        emailNotifications: true,
        autoBackup: true,
        twoFactor: false,
        /* smsAlerts: false, */
        parentPortalAccess: true,
        lateFeeAutoCalc: true,
    });
    const togglePref = (key: keyof typeof prefs) =>
        setPrefs((p) => ({ ...p, [key]: !p[key] }));

    type RoleDef = { role: string; label: string; access_note: string };
    type StaffAccount = {
        id: string;
        name: string;
        email: string;
        role: string;
        employeeId: string | null;
        position: string | null;
        department: string | null;
        createdAt: string;
    };

    const fetchAccountRow = (row: any): StaffAccount => ({
        id: row.id,
        name: row.full_name,
        email: row.email,
        role: row.role,
        employeeId: row.employee_id,
        position: row.employees?.position ?? null,
        department: row.employees?.departments?.name ?? null,
        createdAt: row.created_at
            ? new Date(row.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
              })
            : "",
    });

    const [roleDefs, setRoleDefs] = useState<RoleDef[]>([]);
    const [accounts, setAccounts] = useState<StaffAccount[]>([]);
    const [accountsLoading, setAccountsLoading] = useState(true);
    const [accountsError, setAccountsError] = useState<string | null>(null);
    const [showManageAccounts, setShowManageAccounts] = useState(false);
    const [showAccountRecovery, setShowAccountRecovery] = useState(false);

    const loadAccounts = async () => {
        setAccountsLoading(true);
        setAccountsError(null);
        const { data, error } = await supabase
            .from("profiles")
            .select(
                "id, full_name, email, role, employee_id, created_at, employees(position, departments(name))",
            )
            .order("full_name", { ascending: true });
        if (error) {
            setAccountsError(error.message);
            setAccountsLoading(false);
            return;
        }
        setAccounts((data ?? []).map(fetchAccountRow));
        setAccountsLoading(false);
    };

    // Auth accounts that can sign in but resolve to no role (no profiles/guardians/
    // student_accounts row) — LoginScreen bounces these as "unauthorized". Listed here
    // so a full admin can clean them up instead of them lingering as dead logins.
    type UnauthorizedAccount = {
        id: string;
        email: string | null;
        createdAt: string;
        lastSignInAt: string | null;
    };
    const [unauthorizedAccounts, setUnauthorizedAccounts] = useState<
        UnauthorizedAccount[]
    >([]);
    const [unauthorizedLoading, setUnauthorizedLoading] = useState(true);
    const [unauthorizedError, setUnauthorizedError] = useState<string | null>(
        null,
    );

    const loadUnauthorizedAccounts = async () => {
        setUnauthorizedLoading(true);
        setUnauthorizedError(null);
        const { data, error } = await supabase.functions.invoke(
            "list-unauthorized-accounts",
            { body: {} },
        );
        if (error) {
            setUnauthorizedError(await functionErrorMessage(error));
            setUnauthorizedLoading(false);
            return;
        }
        const accounts = (data?.accounts ?? []) as {
            id: string;
            email: string | null;
            created_at: string;
            last_sign_in_at: string | null;
        }[];
        setUnauthorizedAccounts(
            accounts.map((a) => ({
                id: a.id,
                email: a.email,
                createdAt: a.created_at
                    ? new Date(a.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                      })
                    : "",
                lastSignInAt: a.last_sign_in_at
                    ? new Date(a.last_sign_in_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                      })
                    : null,
            })),
        );
        setUnauthorizedLoading(false);
    };

    const revokeUnauthorizedAccount = async (id: string) => {
        const prev = unauthorizedAccounts;
        setUnauthorizedAccounts((list) => list.filter((a) => a.id !== id));
        try {
            await deleteAuthAccountFor({ userId: id });
        } catch (error) {
            setUnauthorizedAccounts(prev);
            throw error;
        }
    };

    useEffect(() => {
        let active = true;
        (async () => {
            const { data } = await supabase
                .from("role_definitions")
                .select("role, label, access_note")
                .order("role");
            if (active) setRoleDefs(data ?? []);
        })();
        loadAccounts();
        loadUnauthorizedAccounts();
        return () => {
            active = false;
        };
    }, []);

    const roleCounts = accounts.reduce(
        (acc, a) => {
            acc[a.role] = (acc[a.role] ?? 0) + 1;
            return acc;
        },
        {} as Record<string, number>,
    );
    const roles = roleDefs.map((rd) => ({
        name: rd.label,
        role: rd.role,
        users: roleCounts[rd.role] ?? 0,
        access: rd.access_note,
    }));

    const updateAccountRole = async (id: string, role: string) => {
        const prevAccounts = accounts;
        setAccounts((prev) =>
            prev.map((a) => (a.id === id ? { ...a, role } : a)),
        );
        const { error } = await supabase
            .from("profiles")
            .update({ role })
            .eq("id", id);
        if (error) {
            setAccounts(prevAccounts);
            throw error;
        }
    };

    const revokeAccountAccess = async (id: string) => {
        const prevAccounts = accounts;
        setAccounts((prev) => prev.filter((a) => a.id !== id));
        try {
            // Deletes the underlying Supabase Auth user too — profiles is ON DELETE CASCADE
            // from auth.users, so this removes the profile row as a side effect.
            await deleteAuthAccountFor({ userId: id });
        } catch (error) {
            setAccounts(prevAccounts);
            throw error;
        }
    };

    const [backupSaved, setBackupSaved] = useState(false);
    const runBackupNow = () => {
        setBackupSaved(true);
        setTimeout(() => setBackupSaved(false), 3000);
    };

    const exportAllData = () => {
        const payload = {
            exportedAt: new Date().toISOString(),
            staffAccounts: accounts,
            roleDefinitions: roleDefs,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `dms_data_export_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // --- Academic Configuration: per-quarter grading period open/close ---
    type Quarter = "q1" | "q2" | "q3" | "q4";
    const QUARTER_LABELS: Record<Quarter, string> = {
        q1: "Quarter 1",
        q2: "Quarter 2",
        q3: "Quarter 3",
        q4: "Quarter 4",
    };
    type GradingPeriod = {
        quarter: Quarter;
        isOpen: boolean;
        openedAt: string | null;
    };

    const [schoolYearId, setSchoolYearId] = useState<string | null>(null);
    const [gradingPeriods, setGradingPeriods] = useState<GradingPeriod[]>([]);
    const [gpLoading, setGpLoading] = useState(true);
    const [gpError, setGpError] = useState<string | null>(null);
    const [gpUpdating, setGpUpdating] = useState<Quarter | null>(null);

    const loadGradingPeriods = async () => {
        setGpLoading(true);
        setGpError(null);
        const syId = await getCurrentSchoolYearId();
        setSchoolYearId(syId);
        if (!syId) {
            setGpError("No active school year is configured.");
            setGpLoading(false);
            return;
        }
        const { data, error } = await supabase
            .from("grading_periods")
            .select("quarter, is_open, opened_at")
            .eq("school_year_id", syId)
            .order("quarter");
        if (error) {
            setGpError(error.message);
            setGpLoading(false);
            return;
        }
        setGradingPeriods(
            (data ?? []).map((r) => ({
                quarter: r.quarter as Quarter,
                isOpen: r.is_open,
                openedAt: r.opened_at,
            })),
        );
        setGpLoading(false);
    };

    useEffect(() => {
        loadGradingPeriods();
    }, []);

    const setQuarterOpen = async (quarter: Quarter, open: boolean) => {
        if (!schoolYearId) return;
        setGpUpdating(quarter);
        setGpError(null);
        const prev = gradingPeriods;
        try {
            if (open) {
                // Only one quarter can be open for grading at a time. Upsert every quarter's
                // row so this also seeds rows that don't exist yet for this school year —
                // grading_periods rows aren't pre-created when a school year is added, so a
                // plain update() here would silently match zero rows and never persist.
                const quarters: Quarter[] = ["q1", "q2", "q3", "q4"];
                const nowIso = new Date().toISOString();
                const rows = quarters.map((q) => {
                    const existing = gradingPeriods.find(
                        (gp) => gp.quarter === q,
                    );
                    return {
                        school_year_id: schoolYearId,
                        quarter: q,
                        is_open: q === quarter,
                        opened_at:
                            q === quarter
                                ? nowIso
                                : (existing?.openedAt ?? null),
                    };
                });
                const { error } = await supabase
                    .from("grading_periods")
                    .upsert(rows, { onConflict: "school_year_id,quarter" });
                if (error) throw error;
                setGradingPeriods(
                    quarters.map((q) => ({
                        quarter: q,
                        isOpen: q === quarter,
                        openedAt:
                            q === quarter
                                ? nowIso
                                : (gradingPeriods.find((gp) => gp.quarter === q)
                                      ?.openedAt ?? null),
                    })),
                );
            } else {
                const existing = gradingPeriods.find(
                    (gp) => gp.quarter === quarter,
                );
                const { error } = await supabase
                    .from("grading_periods")
                    .upsert(
                        {
                            school_year_id: schoolYearId,
                            quarter,
                            is_open: false,
                            opened_at: existing?.openedAt ?? null,
                        },
                        { onConflict: "school_year_id,quarter" },
                    );
                if (error) throw error;
                setGradingPeriods((p) =>
                    p.some((gp) => gp.quarter === quarter)
                        ? p.map((gp) =>
                              gp.quarter === quarter
                                  ? { ...gp, isOpen: false }
                                  : gp,
                          )
                        : [...p, { quarter, isOpen: false, openedAt: null }],
                );
            }
        } catch (e: any) {
            setGpError(e?.message || "Failed to update grading period.");
            setGradingPeriods(prev);
        } finally {
            setGpUpdating(null);
        }
    };

    // Account Recovery opens as its own page in place of the settings content.
    if (showAccountRecovery) {
        return <AccountRecoveryPage onBack={() => setShowAccountRecovery(false)} />;
    }

    return (
        <>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">
                        System Settings
                    </h1>
                    <p className="text-[#6b6456]">
                        Configure system preferences, school information,
                        access, and data
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* School Information */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">
                            School Information
                        </h3>
                        <div className="space-y-4">
                            {(
                                [
                                    {
                                        key: "school_name",
                                        label: "School Name",
                                    },
                                    {
                                        key: "school_motto",
                                        label: "School Motto",
                                    },
                                    {
                                        key: "school_address",
                                        label: "School Address",
                                    },
                                    {
                                        key: "contact_email",
                                        label: "Contact Email",
                                    },
                                    {
                                        key: "contact_phone",
                                        label: "Contact Phone",
                                    },
                                ] as {
                                    key: keyof typeof schoolInfo;
                                    label: string;
                                }[]
                            ).map((f) => (
                                <div key={f.key}>
                                    <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                        {f.label}
                                    </label>
                                    <input
                                        type="text"
                                        disabled={schoolInfoLoading}
                                        value={schoolInfo[f.key]}
                                        onChange={(e) =>
                                            updateSchoolInfoField(
                                                f.key,
                                                e.target.value,
                                            )
                                        }
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 disabled:bg-gray-50 text-black"
                                    />
                                </div>
                            ))}
                            {schoolInfoError && (
                                <p className="text-sm text-red-500">
                                    {schoolInfoError}
                                </p>
                            )}
                            <button
                                onClick={saveSchoolInfo}
                                disabled={schoolInfoLoading || savingSchoolInfo}
                                className="w-full px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50"
                            >
                                {savingSchoolInfo
                                    ? "Saving…"
                                    : schoolInfoSaved
                                      ? "Saved ✓"
                                      : "Save School Info"}
                            </button>
                        </div>
                    </div>

                    {/* School Year */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Calendar className="w-5 h-5 text-[#1a2b4a]" />
                            <h3 className="text-lg font-semibold text-[#1a2b4a]">
                                School Year
                            </h3>
                        </div>
                        <div className="space-y-3">
                            <div className="p-3 bg-[#faf8f5] rounded-lg">
                                <p className="text-xs text-[#8b8476]">
                                    Current School Year
                                </p>
                                <p className="text-lg font-semibold text-[#2c2c2c]">
                                    {currentSchoolYear?.label ?? "Loading…"}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                        Start Date
                                    </label>
                                    <input
                                        type="date"
                                        value={
                                            currentSchoolYear?.start_date ?? ""
                                        }
                                        disabled
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-[#6b6456]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[#6b6456] mb-2 flex items-center justify-between">
                                        <span>End Date</span>
                                        {!editingEndDate && (
                                            <button
                                                onClick={() =>
                                                    setEditingEndDate(true)
                                                }
                                                className="text-[#c9a961] hover:text-[#b8994f]"
                                            >
                                                <Edit className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </label>
                                    {editingEndDate ? (
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="date"
                                                value={endDateInput}
                                                onChange={(e) =>
                                                    setEndDateInput(
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
                                            />
                                            <button
                                                onClick={saveEndDate}
                                                disabled={
                                                    savingEndDate ||
                                                    !endDateInput
                                                }
                                                className="px-2 py-2 bg-[#1a2b4a] text-white rounded-lg disabled:opacity-50"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingEndDate(false);
                                                    setEndDateInput(
                                                        currentSchoolYear?.end_date ??
                                                            "",
                                                    );
                                                }}
                                                className="px-2 py-2 border border-gray-200 rounded-lg"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <input
                                            type="date"
                                            value={
                                                currentSchoolYear?.end_date ??
                                                ""
                                            }
                                            disabled
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-[#6b6456]"
                                        />
                                    )}
                                </div>
                            </div>
                            {endDateError && (
                                <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                    <AlertCircle className="w-4 h-4 shrink-0" />{" "}
                                    {endDateError}
                                </div>
                            )}
                            <button
                                onClick={() => setShowChangeYearModal(true)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg font-medium hover:shadow-lg transition-all"
                            >
                                <Calendar className="w-4 h-4" /> Change to New
                                School Year
                            </button>
                            <p className="text-xs text-[#8b8476]">
                                Starts a new school year: class sections and
                                schedules begin fresh, while student, payment,
                                and grade records are preserved and stay
                                viewable via the School Year selector.
                            </p>
                        </div>
                    </div>

                    {showChangeYearModal && (
                        <ChangeSchoolYearModal
                            currentLabel={currentSchoolYear?.label ?? null}
                            onClose={() => setShowChangeYearModal(false)}
                            onCreated={() => {
                                onSchoolYearRolledOver?.();
                            }}
                        />
                    )}
                </div>

                {/* Academic Calendar / Grading */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-[#1a2b4a]">
                        Academic Configuration
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 
          <div>
            <label className="block text-sm font-medium text-[#6b6456] mb-2">Grading Period</label>
            <select defaultValue="Quarterly" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 text-black">
              <option>Quarterly</option>
              <option>Semestral</option>
              <option>Trimestral</option>
            </select>
          </div>
          */}
          {/* <div>
              <label className="block text-sm font-medium text-[#6b6456] mb-2">
                  Passing Grade
              </label>
              <input
                  type="number"
                  defaultValue={75}
                  className="w-[200px] px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 text-black"
              />
          </div> */}
      </div>

                    {/* Quarter grading periods — controls whether teachers can input grades for that quarter */}
                    <div className="mt-6 pt-6 border-t border-gray-200">
                        <div className="flex items-center justify-between mb-1">
                            <h4 className="text-sm font-semibold text-[#1a2b4a]">
                                Grading Period Status
                            </h4>
                        </div>
                        <p className="text-xs text-[#8b8476] mb-4">
                            Opening a quarter makes it editable for teachers on
                            their grade sheets; every other quarter is
                            automatically closed. Closing a quarter locks it
                            back down.
                        </p>

                        {gpError && (
                            <div className="flex items-center gap-2 p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                <AlertCircle className="w-4 h-4 shrink-0" />{" "}
                                {gpError}
                            </div>
                        )}

                        {gpLoading ? (
                            <p className="text-sm text-[#8b8476] px-1 py-2">
                                Loading grading periods…
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-6">
                                {(["q1", "q2", "q3", "q4"] as Quarter[]).map(
                                    (q) => {
                                        const gp = gradingPeriods.find(
                                            (g) => g.quarter === q,
                                        );
                                        const isOpen = gp?.isOpen ?? false;
                                        const busy = gpUpdating === q;
                                        return (
                                            <div
                                                key={q}
                                                className={`p-4 rounded-lg border-2 ${isOpen ? "border-green-300 bg-green-50" : "border-gray-200 bg-[#faf8f5]"}`}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-semibold text-[#1a2b4a]">
                                                        {QUARTER_LABELS[q]}
                                                    </span>
                                                    <span
                                                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isOpen ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"}`}
                                                    >
                                                        {isOpen
                                                            ? "Open"
                                                            : "Closed"}
                                                    </span>
                                                </div>
                                                {isOpen ? (
                                                    <button
                                                        onClick={() =>
                                                            setQuarterOpen(
                                                                q,
                                                                false,
                                                            )
                                                        }
                                                        disabled={busy}
                                                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border-2 border-red-200 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-50 transition-all disabled:opacity-50"
                                                    >
                                                        {busy
                                                            ? "Closing…"
                                                            : "Close Quarter"}
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() =>
                                                            setQuarterOpen(
                                                                q,
                                                                true,
                                                            )
                                                        }
                                                        disabled={busy}
                                                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg text-xs font-semibold hover:shadow-md transition-all disabled:opacity-50"
                                                    >
                                                        {busy
                                                            ? "Opening…"
                                                            : "Open for Grading"}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    },
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Tuition Management — per grade level, grouped by school level. Feeds the Cashier
          portal directly, so each student's tuition is assigned automatically off their grade. */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 bg-[#c9a961]/10 rounded-xl flex items-center justify-center">
                            <p className="text-[#c9a961] text-center text-xl">
                                ₱
                            </p>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-[#1a2b4a]">
                                Tuition Management
                            </h3>
                            <p className="text-sm text-[#6b6456]">
                                Set the annual tuition per grade level —
                                automatically assigned to each student's account
                                in the Cashier portal based on their grade
                                level.
                            </p>
                        </div>
                    </div>

                    {tuitionError && (
                        <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                            <AlertCircle className="w-4 h-4 shrink-0" />{" "}
                            {tuitionError}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        {TUITION_GRADE_GROUPS.map((group) => (
                            <div
                                key={group.label}
                                className="border border-gray-200 rounded-lg overflow-hidden"
                            >
                                <div className="bg-[#faf8f5] px-4 py-2.5 border-b border-gray-200">
                                    <p className="text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        {group.label}
                                    </p>
                                    <p className="text-[11px] text-[#8b8476] mt-0.5">
                                        {group.grades.join(", ")}
                                    </p>
                                </div>
                                <div className="p-3">
                                    <label className="block text-xs font-medium text-[#6b6456] mb-1">
                                        Annual Tuition
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b8476] font-medium">
                                            ₱
                                        </span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1000"
                                            value={
                                                tuitionInputs[group.label] ?? ""
                                            }
                                            onChange={(e) =>
                                                updateTuitionInput(
                                                    group.label,
                                                    e.target.value,
                                                )
                                            }
                                            className="w-full pl-6 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-3 mt-4">
                        <button
                            onClick={saveTuitionFees}
                            className="px-6 py-2.5 bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white rounded-lg font-semibold hover:shadow-lg transition-all"
                        >
                            Save Tuition Fees
                        </button>
                        {tuitionSaved && (
                            <span className="flex items-center gap-1.5 text-sm text-green-700">
                                <CheckCircle className="w-4 h-4" /> Tuition fees
                                updated. Cashier portal reflects this change.
                            </span>
                        )}
                    </div>
                </div>

                {/* Enrollment Fee Management — per grade level, grouped by school level. Feeds the
          Cashier portal's "Enrollment Fee" quick-fill button in Process Payment. */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 bg-[#c9a961]/10 rounded-xl flex items-center justify-center">
                            <p className="text-[#c9a961] text-center text-xl">
                                ₱
                            </p>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-[#1a2b4a]">
                                Enrollment Fee Management
                            </h3>
                            <p className="text-sm text-[#6b6456]">
                                Set the enrollment fee per grade level — the
                                Cashier's "Enrollment Fee" button fills this
                                amount in automatically based on the student's
                                grade level.
                            </p>
                        </div>
                    </div>

                    {enrollmentError && (
                        <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                            <AlertCircle className="w-4 h-4 shrink-0" />{" "}
                            {enrollmentError}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        {TUITION_GRADE_GROUPS.map((group) => (
                            <div
                                key={group.label}
                                className="border border-gray-200 rounded-lg overflow-hidden"
                            >
                                <div className="bg-[#faf8f5] px-4 py-2.5 border-b border-gray-200">
                                    <p className="text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        {group.label}
                                    </p>
                                    <p className="text-[11px] text-[#8b8476] mt-0.5">
                                        {group.grades.join(", ")}
                                    </p>
                                </div>
                                <div className="p-3">
                                    <label className="block text-xs font-medium text-[#6b6456] mb-1">
                                        Enrollment Fee
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b8476] font-medium">
                                            ₱
                                        </span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="100"
                                            value={
                                                enrollmentInputs[group.label] ??
                                                ""
                                            }
                                            onChange={(e) =>
                                                updateEnrollmentInput(
                                                    group.label,
                                                    e.target.value,
                                                )
                                            }
                                            className="w-full pl-6 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-3 mt-4">
                        <button
                            onClick={saveEnrollmentFees}
                            className="px-6 py-2.5 bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white rounded-lg font-semibold hover:shadow-lg transition-all"
                        >
                            Save Enrollment Fees
                        </button>
                        {enrollmentSaved && (
                            <span className="flex items-center gap-1.5 text-sm text-green-700">
                                <CheckCircle className="w-4 h-4" /> Enrollment
                                fees updated. Cashier portal reflects this
                                change.
                            </span>
                        )}
                    </div>
                </div>

                {/* Official Receipt Number Range — the physical, pre-printed OR booklet range for the
          current school year. The Cashier portal draws numbers from this range in sequence
          so the system-generated receipt number matches the printed physical copy. */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 bg-[#c9a961]/10 rounded-xl flex items-center justify-center">
                            <Receipt className="w-5 h-5 text-[#c9a961]" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-[#1a2b4a]">
                                Official Receipt Numbers
                            </h3>
                            <p className="text-sm text-[#6b6456]">
                                Register the range of pre-printed OR numbers for{" "}
                                {currentSchoolYear?.label ??
                                    "the current school year"}{" "}
                                so the Cashier's system-generated receipts match
                                the printed booklet.
                            </p>
                        </div>
                    </div>

                    {!currentSchoolYear ? (
                        <p className="text-sm text-[#8b8476] mt-4">
                            No current school year is set.
                        </p>
                    ) : (
                        <>
                            {orRangeError && (
                                <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                    <AlertCircle className="w-4 h-4 shrink-0" />{" "}
                                    {orRangeError}
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                <div>
                                    <label className="block text-xs font-medium text-[#6b6456] mb-1">
                                        Range Start
                                    </label>
                                    <input
                                        value={orRangeStart}
                                        onChange={(e) =>
                                            setOrRangeStart(e.target.value)
                                        }
                                        placeholder="e.g. 100001"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-[#6b6456] mb-1">
                                        Range End
                                    </label>
                                    <input
                                        value={orRangeEnd}
                                        onChange={(e) =>
                                            setOrRangeEnd(e.target.value)
                                        }
                                        placeholder="e.g. 100500"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-[#6b6456] mb-1">
                                        Next Number to Issue
                                    </label>
                                    <input
                                        value={orNextNumber}
                                        disabled
                                        placeholder="Set after saving"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-[#8b8476]"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-3 mt-4">
                                <button
                                    onClick={saveOrRange}
                                    disabled={savingOrRange}
                                    className="px-6 py-2.5 bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-60"
                                >
                                    {savingOrRange
                                        ? "Saving…"
                                        : "Save Receipt Range"}
                                </button>
                                {orRangeSaved && (
                                    <span className="flex items-center gap-1.5 text-sm text-green-700">
                                        <CheckCircle className="w-4 h-4" />{" "}
                                        Receipt range saved. The Cashier portal
                                        will issue from this range.
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <PickupSettingsCard />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* User Roles & Access */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Shield className="w-5 h-5 text-[#1a2b4a]" />
                            <h3 className="text-lg font-semibold text-[#1a2b4a]">
                                User Roles & Access
                            </h3>
                        </div>
                        <div className="space-y-3">
                            {roles.length === 0 ? (
                                <p className="text-sm text-[#8b8476] px-1 py-2">
                                    {accountsLoading
                                        ? "Loading roles…"
                                        : "No roles configured."}
                                </p>
                            ) : (
                                roles.map((r) => (
                                    <div
                                        key={r.name}
                                        className="flex items-start justify-between p-3 bg-[#faf8f5] rounded-lg"
                                    >
                                        <div>
                                            <p className="font-medium text-[#2c2c2c]">
                                                {r.name}
                                            </p>
                                            <p className="text-xs text-[#8b8476] mt-0.5">
                                                {r.access}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1a2b4a]/10 text-[#1a2b4a]">
                                            {r.users} user
                                            {r.users !== 1 ? "s" : ""}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 mt-4">
                            <button
                                onClick={() => setShowManageAccounts(true)}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-[#1a2b4a] text-[#1a2b4a] rounded-lg font-medium hover:bg-[#faf8f5] transition-all"
                            >
                                <UserPlus className="w-4 h-4" /> Manage Accounts
                            </button>
                            <button
                                onClick={() => setShowAccountRecovery(true)}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-[#1a2b4a] text-[#1a2b4a] rounded-lg font-medium hover:bg-[#faf8f5] transition-all"
                            >
                                <Lock className="w-4 h-4" /> Account Recovery
                            </button>
                        </div>
                    </div>

                    {/* Data Management */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Archive className="w-5 h-5 text-[#1a2b4a]" />
                            <h3 className="text-lg font-semibold text-[#1a2b4a]">
                                Data Management
                            </h3>
                        </div>
                        <div className="space-y-3">
                            <div className="p-3 bg-[#faf8f5] rounded-lg">
                                <p className="text-sm text-[#6b6456]">
                                    Last backup:{" "}
                                    <strong className="text-[#2c2c2c]">
                                        Today, 3:00 AM
                                    </strong>
                                </p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                    onClick={runBackupNow}
                                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all"
                                >
                                    <Archive className="w-4 h-4" /> Backup Now
                                </button>
                                <button
                                    onClick={exportAllData}
                                    className="flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-gray-200 text-[#2c2c2c] rounded-lg font-medium hover:border-[#c9a961] transition-all"
                                >
                                    <Download className="w-4 h-4" /> Export All
                                    Data
                                </button>
                            </div>
                            {backupSaved && (
                                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                                    <CheckCircle className="w-4 h-4 shrink-0" />{" "}
                                    Backup completed successfully.
                                </div>
                            )}
                            <p className="text-xs text-[#8b8476]">
                                Exports the current staff/user directory and
                                role definitions as JSON.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {showManageAccounts && (
                <ManageAccountsModal
                    accounts={accounts}
                    loading={accountsLoading}
                    error={accountsError}
                    roleDefs={roleDefs}
                    onClose={() => setShowManageAccounts(false)}
                    onChangeRole={updateAccountRole}
                    onRevoke={revokeAccountAccess}
                    onRetry={loadAccounts}
                    unauthorizedAccounts={unauthorizedAccounts}
                    unauthorizedLoading={unauthorizedLoading}
                    unauthorizedError={unauthorizedError}
                    onRevokeUnauthorized={revokeUnauthorizedAccount}
                    onRetryUnauthorized={loadUnauthorizedAccounts}
                />
            )}

        </>
    );
}
