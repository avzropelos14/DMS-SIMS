import { useState, useEffect } from "react";
import {
    Search,
    Filter,
    AlertCircle,
    Edit,
    Eye,
    UserCheck,
    X,
    Printer,
    ChevronDown,
    QrCode,
    Receipt,
    BookOpen,
} from "lucide-react";
import { supabase } from "../../supabase";
import { getSchoolYearByLabel } from "../../lib/schoolYear";
import { listRooms, type Room } from "../../lib/rooms";
import { getSchoolSettings } from "../../lib/schoolSettings";
import { getSchoolLogoDataUrl } from "../../lib/pdfImages";
import { escapeHtml } from "../../lib/escapeHtml";
import { formatTimeLabel12hr, WEEK_DAYS } from "../../lib/timeFormat";
import {
    syncEnrollmentGradeSection,
    type StudentStatus,
    type Student,
    studentRowToStudent,
} from "../../lib/students";
import { StudentEditModal } from "./StudentEditModal";
import { StudentRequirements } from "./StudentRequirements";
import { PickupPassCard } from "./PickupPassCard";
import { getRequirementSummaries } from "../../lib/requirements";

export function StudentManagement({
    schoolYear,
    isRegistrar = false,
}: {
    schoolYear: string;
    isRegistrar?: boolean;
}) {
    const [activeTab, setActiveTab] = useState<StudentStatus | "ActiveOnly">(
        "Active",
    );
    const [showStatusDropdown, setShowStatusDropdown] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [showSubjectAssessmentModal, setShowSubjectAssessmentModal] =
        useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(
        null,
    );
    const [pendingStatus, setPendingStatus] = useState<StudentStatus>("Active");
    const [search, setSearch] = useState("");
    const [gradeFilter, setGradeFilter] = useState("All");
    // Requirements (Phase 7): summaries per student for the selected school year.
    const [rosterYearId, setRosterYearId] = useState<string | null>(null);
    const [reqSummaries, setReqSummaries] = useState<Record<string, { complete: number; total: number }>>({});
    const [incompleteOnly, setIncompleteOnly] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const [sectionCatalog, setSectionCatalog] = useState<
        { grade: string; section: string }[]
    >([]);

    const GRADE_OPTIONS = [
        "All",
        "Kinder 1",
        "Kinder 2",
        "Grade 1",
        "Grade 2",
        "Grade 3",
        "Grade 4",
        "Grade 5",
        "Grade 6",
        "Grade 7",
        "Grade 8",
        "Grade 9",
        "Grade 10",
    ];

    // Splits a "First Middle Last" name into a "Last Suffix, First Middle" display string
    const formatFamilyNameFirst = (fullName: string, suffix?: string) => {
        const base = suffix
            ? fullName.replace(
                  new RegExp(
                      `\\s+${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
                  ),
                  "",
              )
            : fullName;
        const parts = base.trim().split(/\s+/);
        if (parts.length < 2) return fullName;
        const family = parts[parts.length - 1];
        const given = parts.slice(0, -1).join(" ");
        return `${family}${suffix ? ` ${suffix}` : ""}, ${given}`;
    };

    const [students, setStudents] = useState<Student[]>([]);

    // Roster is driven off `enrollments` (one row per student per school year) rather than
    // `students.school_year_id` — that column is a single mutable pointer that gets
    // overwritten in place on re-enrollment, so filtering students by it directly would only
    // ever show whichever year each student's row was most recently moved to, leaving every
    // other year (including the just-activated new year, before re-enrollment upserts land)
    // looking empty. Enrollment rows are per-year and never overwritten, so they're the
    // source of truth for "who was enrolled in year X, and in what grade/section".
    const loadStudents = async () => {
        setLoading(true);
        setLoadError(null);
        const sy = await getSchoolYearByLabel(schoolYear);
        if (!sy) {
            setStudents([]);
            setRosterYearId(null);
            setReqSummaries({});
            setLoading(false);
            return;
        }
        setRosterYearId(sy.id);
        void getRequirementSummaries(sy.id).then(setReqSummaries);

        const { data, error } = await supabase
            .from("enrollments")
            .select(
                "student_id, grade_level, section, enrollment_type, created_at, students!inner(id, first_name, middle_name, last_name, suffix, status, email, phone, gpa, enrolled_date, guardian_name, guardian_relationship, guardian_phone, guardian_email)",
            )
            .eq("school_year_id", sy.id);
        if (error) {
            setLoadError(error.message);
            setLoading(false);
            return;
        }

        const rows = data ?? [];
        setStudents(
            rows.map((row: any) => {
                const student = row.students;
                const transferDate =
                    row.enrollment_type === "Transferee" && row.created_at
                        ? new Date(row.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                          })
                        : "";
                return studentRowToStudent(
                    {
                        ...student,
                        grade_level: row.grade_level,
                        section: row.section,
                    },
                    row.enrollment_type === "Transferee",
                    transferDate,
                );
            }),
        );
        setLoading(false);
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [{ data: cls }] = await Promise.all([
                supabase
                    .from("class_sections")
                    .select("grade_level, section_name"),
            ]);
            if (cancelled) return;
            setSectionCatalog(
                (cls ?? []).map((c) => ({
                    grade: c.grade_level,
                    section: c.section_name,
                })),
            );
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await loadStudents();
            if (cancelled) return;
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schoolYear]);

    const sectionOptionsForGrade = (grade: string) => {
        return Array.from(
            new Set(
                sectionCatalog
                    .filter((c) => c.grade === grade)
                    .map((c) => c.section),
            ),
        ).sort();
    };

    const tabConfig: Record<
        StudentStatus,
        { label: string; color: string; badge: string }
    > = {
        Active: {
            label: "Active",
            color: "bg-green-100 text-green-800",
            badge: "bg-green-500",
        },
        Graduate: {
            label: "Graduate",
            color: "bg-blue-100 text-blue-800",
            badge: "bg-blue-500",
        },
        Dropped: {
            label: "Dropped",
            color: "bg-red-100 text-red-800",
            badge: "bg-red-500",
        },
        Transferred: {
            label: "Transferred",
            color: "bg-purple-100 text-purple-800",
            badge: "bg-purple-500",
        },
        Archived: {
            label: "Archived",
            color: "bg-gray-200 text-gray-700",
            badge: "bg-gray-500",
        },
    };

    // Labels used only for the status tab/dropdown control — the "Active" tab is
    // presented to the admin as "All" but still maps to the underlying 'Active' status value.
    const TAB_LABELS: Record<StudentStatus | "ActiveOnly", string> = {
        Active: "All",
        ActiveOnly: "Active",
        Graduate: "Graduate",
        Dropped: "Dropped",
        Transferred: "Transferred",
        Archived: "Archived",
    };

    // Extracts the family (last) name for alphabetical sorting, e.g. "John Carlo Rivera" -> "Rivera"
    const familyName = (fullName: string) => {
        const parts = fullName.trim().split(/\s+/);
        return parts[parts.length - 1] || fullName;
    };

    const filtered = students
        .filter((s) =>
            activeTab === "Active"
                ? s.status !== "Archived"
                : activeTab === "ActiveOnly"
                  ? s.status === "Active"
                  : s.status === activeTab,
        )
        .filter((s) => gradeFilter === "All" || s.grade === gradeFilter)
        .filter((s) => !incompleteOnly || (reqSummaries[s.id] && reqSummaries[s.id].complete < reqSummaries[s.id].total))
        .filter(
            (s) =>
                !search ||
                s.name.toLowerCase().includes(search.toLowerCase()) ||
                s.id.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => familyName(a.name).localeCompare(familyName(b.name)));

    const counts: Record<StudentStatus, number> = {
        Active: students.filter((s) => s.status !== "Archived").length,
        Graduate: students.filter((s) => s.status === "Graduate").length,
        Dropped: students.filter((s) => s.status === "Dropped").length,
        Transferred: students.filter((s) => s.status === "Transferred").length,
        Archived: students.filter((s) => s.status === "Archived").length,
    };

    const changeStatus = async () => {
        if (!selectedStudent) return;
        const { error } = await supabase
            .from("students")
            .update({ status: pendingStatus })
            .eq("id", selectedStudent.id);
        if (error) {
            setEditError(error.message);
            return;
        }
        setStudents((prev) =>
            prev.map((s) =>
                s.id === selectedStudent.id
                    ? { ...s, status: pendingStatus }
                    : s,
            ),
        );
        setShowStatusModal(false);
        setShowViewModal(false);
    };

    const openStatusChange = (student: Student) => {
        setSelectedStudent(student);
        setPendingStatus(student.status);
        setShowStatusModal(true);
    };


    // Subject Assessment — the subjects assigned to the student's class section this school
    // year, each with its assigned teacher and schedule. Refetched whenever the view modal
    // opens for a student so it reflects any Class Management / Schedule edits made since.
    type StudentSubjectAssessment = {
        id: string;
        subject: string;
        teacher: string;
        teacherId: string | null;
        schedule: string | null;
        scheduleId: string | null;
        days: string[];
        startTime: string;
        endTime: string;
        room: string;
    };
    const [subjectAssessment, setSubjectAssessment] = useState<
        StudentSubjectAssessment[] | undefined
    >(undefined);
    const [subjectAssessmentError, setSubjectAssessmentError] = useState<
        string | null
    >(null);

    // Payment history — fetched fresh whenever the Student Details modal opens for a
    // student, and kept live via a realtime subscription while the Payment History page
    // is open so a payment processed elsewhere (e.g. Cashier) shows up immediately.
    type StudentPaymentHistoryRow = {
        id: string;
        receiptNumber: string | null;
        amount: number;
        method: string | null;
        category: string | null;
        paidAt: string | null;
    };
    const PAYMENT_CATEGORY_LABELS: Record<string, string> = {
        tuition: "Tuition Payment",
        enrollment_fee: "Enrollment Fee",
    };
    const formatPaymentCategory = (category: string | null) => {
        if (!category) return "Payment";
        return (
            PAYMENT_CATEGORY_LABELS[category] ??
            category
                .split("_")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ")
        );
    };
    const [showPaymentHistoryModal, setShowPaymentHistoryModal] =
        useState(false);
    const [paymentHistory, setPaymentHistory] = useState<
        StudentPaymentHistoryRow[] | undefined
    >(undefined);
    const [paymentHistoryError, setPaymentHistoryError] = useState<
        string | null
    >(null);
    const [paymentHistorySearch, setPaymentHistorySearch] = useState("");

    useEffect(() => {
        if (!showViewModal || !selectedStudent) {
            setPaymentHistory(undefined);
            setPaymentHistoryError(null);
            return;
        }
        let cancelled = false;
        const studentId = selectedStudent.id;
        const fetchHistory = async () => {
            const { data, error } = await supabase
                .from("payments")
                .select(
                    "id, receipt_number, amount, method, category, paid_at",
                )
                .eq("student_id", studentId)
                .order("paid_at", { ascending: false });
            if (cancelled) return;
            if (error) {
                setPaymentHistoryError(error.message);
                return;
            }
            setPaymentHistory(
                (data ?? []).map((r: any) => ({
                    id: r.id,
                    receiptNumber: r.receipt_number,
                    amount: Number(r.amount || 0),
                    method: r.method,
                    category: r.category,
                    paidAt: r.paid_at,
                })),
            );
        };
        setPaymentHistory(undefined);
        setPaymentHistoryError(null);
        fetchHistory();

        const channel = supabase
            .channel(`payments-history-${studentId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "payments",
                    filter: `student_id=eq.${studentId}`,
                },
                () => fetchHistory(),
            )
            .subscribe();
        return () => {
            cancelled = true;
            supabase.removeChannel(channel);
        };
    }, [showViewModal, selectedStudent]);

    const [subjectAssessmentSchoolYearId, setSubjectAssessmentSchoolYearId] =
        useState<string | null>(null);

    const loadSubjectAssessment = async (
        student: Student,
        cancelledRef?: { current: boolean },
    ) => {
        setSubjectAssessmentError(null);
        const { data: syRow } = await supabase
            .from("school_years")
            .select("id")
            .eq("label", schoolYear)
            .maybeSingle();
        const syId = syRow?.id ?? null;
        setSubjectAssessmentSchoolYearId(syId);
        if (!syId) {
            if (!cancelledRef?.current) setSubjectAssessment([]);
            return;
        }

        const { data: sectionRow, error: sectionError } = await supabase
            .from("class_sections")
            .select("id")
            .eq("school_year_id", syId)
            .eq("grade_level", student.grade)
            .eq("section_name", student.section)
            .maybeSingle();
        if (cancelledRef?.current) return;
        if (sectionError) {
            setSubjectAssessmentError(sectionError.message);
            return;
        }
        if (!sectionRow) {
            setSubjectAssessment([]);
            return;
        }

        const [{ data: cssRows, error: cssError }, { data: scheduleRows }] =
            await Promise.all([
                supabase
                    .from("class_section_subjects")
                    .select(
                        "id, archived, subjects(name), employees(id, full_name)",
                    )
                    .eq("class_section_id", sectionRow.id)
                    .eq("archived", false),
                supabase
                    .from("schedules")
                    .select("id, subject, days, time_label, room")
                    .eq("school_year_id", syId)
                    .eq("grade_level", student.grade)
                    .eq("section_name", student.section),
            ]);
        if (cancelledRef?.current) return;
        if (cssError) {
            setSubjectAssessmentError(cssError.message);
            return;
        }

        const scheduleRowFor = (subjectName: string) =>
            (scheduleRows ?? []).find(
                (s: any) =>
                    (s.subject || "").trim().toLowerCase() ===
                    subjectName.trim().toLowerCase(),
            ) ?? null;

        setSubjectAssessment(
            (cssRows ?? [])
                .map((r: any) => {
                    const subjectName =
                        r.subjects?.name ?? r.subjects?.[0]?.name ?? "";
                    const employee = r.employees?.[0] ?? r.employees ?? null;
                    const scheduleRow = scheduleRowFor(subjectName);
                    const [startTime, endTime] = (
                        scheduleRow?.time_label || ""
                    ).split("-");
                    const days = Array.isArray(scheduleRow?.days)
                        ? scheduleRow.days.join("/")
                        : "";
                    return {
                        id: r.id,
                        subject: subjectName,
                        teacher: employee?.full_name ?? "Unassigned",
                        teacherId: employee?.id ?? null,
                        schedule:
                            [
                                days,
                                formatTimeLabel12hr(
                                    scheduleRow?.time_label || "",
                                ),
                                scheduleRow?.room,
                            ]
                                .filter(Boolean)
                                .join(" • ") || null,
                        scheduleId: scheduleRow?.id ?? null,
                        days: scheduleRow?.days ?? [],
                        startTime: startTime || "",
                        endTime: endTime || "",
                        room: scheduleRow?.room || "",
                    };
                })
                .sort((a, b) => a.subject.localeCompare(b.subject)),
        );
    };

    useEffect(() => {
        if (!showViewModal || !selectedStudent) {
            setSubjectAssessment(undefined);
            setSubjectAssessmentError(null);
            return;
        }
        setSubjectAssessment(undefined);
        const cancelledRef = { current: false };
        loadSubjectAssessment(selectedStudent, cancelledRef);
        return () => {
            cancelledRef.current = true;
        };
    }, [showViewModal, selectedStudent, schoolYear]);

    // Active teacher roster for the Subject Assessment page's teacher reassignment dropdown.
    const [subjectAssessmentTeachers, setSubjectAssessmentTeachers] = useState<
        { id: string; name: string }[]
    >([]);
    useEffect(() => {
        if (!showSubjectAssessmentModal) return;
        let cancelled = false;
        supabase
            .from("employees")
            .select("id, full_name")
            .eq("status", "active")
            .eq("position", "Teacher")
            .is("deleted_at", null)
            .order("full_name")
            .then(({ data }) => {
                if (!cancelled)
                    setSubjectAssessmentTeachers(
                        (data ?? []).map((t: any) => ({
                            id: t.id,
                            name: t.full_name,
                        })),
                    );
            });
        return () => {
            cancelled = true;
        };
    }, [showSubjectAssessmentModal]);

    const [subjectAssessmentRooms, setSubjectAssessmentRooms] = useState<
        Room[]
    >([]);
    useEffect(() => {
        if (!showSubjectAssessmentModal) return;
        let cancelled = false;
        listRooms()
            .then((rows) => {
                if (!cancelled) setSubjectAssessmentRooms(rows);
            })
            .catch(() => {
                if (!cancelled) setSubjectAssessmentRooms([]);
            });
        return () => {
            cancelled = true;
        };
    }, [showSubjectAssessmentModal]);

    const updateSubjectAssessmentRow = (
        id: string,
        patch: Partial<StudentSubjectAssessment>,
    ) => {
        setSubjectAssessment((rows) =>
            rows?.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        );
    };
    const toggleSubjectAssessmentDay = (id: string, day: string) => {
        setSubjectAssessment((rows) =>
            rows?.map((r) =>
                r.id === id
                    ? {
                          ...r,
                          days: r.days.includes(day)
                              ? r.days.filter((d) => d !== day)
                              : [...r.days, day],
                      }
                    : r,
            ),
        );
    };
    const [savingSubjectRowId, setSavingSubjectRowId] = useState<
        string | null
    >(null);
    const [subjectRowSaveError, setSubjectRowSaveError] = useState<
        string | null
    >(null);

    const handleSaveSubjectAssessmentRow = async (
        row: StudentSubjectAssessment,
    ) => {
        if (!selectedStudent) return;
        setSavingSubjectRowId(row.id);
        setSubjectRowSaveError(null);
        try {
            const { error: teacherErr } = await supabase
                .from("class_section_subjects")
                .update({ teacher_id: row.teacherId })
                .eq("id", row.id);
            if (teacherErr) throw teacherErr;

            const teacherName =
                subjectAssessmentTeachers.find((t) => t.id === row.teacherId)
                    ?.name ?? row.teacher;
            const hasSchedule =
                row.days.length > 0 && !!row.startTime && !!row.endTime;
            if (hasSchedule && subjectAssessmentSchoolYearId) {
                const scheduleFields = {
                    school_year_id: subjectAssessmentSchoolYearId,
                    grade_level: selectedStudent.grade,
                    section_name: selectedStudent.section,
                    subject: row.subject,
                    teacher: teacherName,
                    days: row.days,
                    time_label: `${row.startTime}-${row.endTime}`,
                    room: row.room.trim() || null,
                };
                if (row.scheduleId) {
                    const { error: schedErr } = await supabase
                        .from("schedules")
                        .update(scheduleFields)
                        .eq("id", row.scheduleId);
                    if (schedErr) throw schedErr;
                } else {
                    const { error: schedErr } = await supabase
                        .from("schedules")
                        .insert(scheduleFields);
                    if (schedErr) throw schedErr;
                }
            } else if (row.scheduleId) {
                const { error: schedErr } = await supabase
                    .from("schedules")
                    .delete()
                    .eq("id", row.scheduleId);
                if (schedErr) throw schedErr;
            }

            await loadSubjectAssessment(selectedStudent);
        } catch (e: any) {
            setSubjectRowSaveError(
                e?.message || "Failed to save this subject's assignment.",
            );
        } finally {
            setSavingSubjectRowId(null);
        }
    };

    // Subject Assessment — its own page (not a modal) so subjects/teacher/schedule can be
    // edited inline, with every save immediately reflected here and in the Student Details view.
    if (showSubjectAssessmentModal && selectedStudent) {
        return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <button
                            onClick={() =>
                                setShowSubjectAssessmentModal(false)
                            }
                            className="flex items-center gap-1.5 text-base font-medium text-[#1a2b4a] hover:underline mb-2"
                        >
                            <ChevronDown className="w-5 h-5 rotate-90" />
                            Back to Student Management
                        </button>
                        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                            Subject Assessment
                        </h1>
                        <p className="text-[#6b6456]">
                            {selectedStudent.name} • {selectedStudent.grade}
                            {selectedStudent.section
                                ? ` - ${selectedStudent.section}`
                                : ""}
                        </p>
                    </div>
                    <button
                        onClick={async () => {
                            const rows = (subjectAssessment ?? [])
                                .map(
                                    (s) => `
                        <tr>
                          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(s.subject)}</td>
                          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(s.teacher)}</td>
                          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(s.schedule || "No schedule set")}</td>
                        </tr>`,
                                )
                                .join("");
                            const [logoDataUrl, schoolInfo] =
                                await Promise.all([
                                    getSchoolLogoDataUrl(),
                                    getSchoolSettings(),
                                ]);
                            const win = window.open("", "_blank");
                            if (!win) return;
                            win.document.write(`
                      <html>
                        <head>
                          <title>Subject Assessment — ${escapeHtml(selectedStudent.name)}</title>
                          <style>
                            body { font-family: Arial, sans-serif; color: #2c2c2c; padding: 24px; }
                            .school-header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #1a2b4a; padding-bottom: 12px; margin-bottom: 16px; }
                            .school-header img { width: 56px; height: 56px; object-fit: contain; }
                            .school-header h2 { font-size: 16px; margin: 0; color: #1a2b4a; }
                            .school-header p { font-size: 11px; color: #6b6456; margin: 2px 0 0; }
                            h1 { font-size: 18px; margin-bottom: 4px; }
                            p { font-size: 13px; color: #6b6456; margin-top: 0; }
                            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
                            th { text-align: left; padding: 8px; background: #f3f4f6; }
                          </style>
                        </head>
                        <body>
                          <div class="school-header">
                            <img src="${escapeHtml(logoDataUrl)}" alt="School logo" />
                            <div>
                              <h2>${escapeHtml(schoolInfo.school_name.toUpperCase())}</h2>
                              ${schoolInfo.school_address ? `<p>${escapeHtml(schoolInfo.school_address)}</p>` : ""}
                            </div>
                          </div>
                          <h1>Subject Assessment</h1>
                          <p>${escapeHtml(selectedStudent.name)} • ${escapeHtml(selectedStudent.grade)}${selectedStudent.section ? ` - ${escapeHtml(selectedStudent.section)}` : ""}</p>
                          <table>
                            <thead>
                              <tr><th>Subject</th><th>Teacher</th><th>Schedule</th></tr>
                            </thead>
                            <tbody>${rows}</tbody>
                          </table>
                        </body>
                      </html>
                    `);
                            win.document.close();
                            win.focus();
                            win.print();
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-2 border-gray-200 text-[#1a2b4a] hover:border-[#1a2b4a]/30 transition-all self-start"
                    >
                        <Printer className="w-3.5 h-3.5" />
                        Print
                    </button>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    {subjectRowSaveError && (
                        <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                            <AlertCircle className="w-4 h-4 shrink-0" />{" "}
                            {subjectRowSaveError}
                        </div>
                    )}
                    {subjectAssessment === undefined ? (
                        <p className="text-sm text-[#8b8476]">
                            Loading subjects…
                        </p>
                    ) : subjectAssessmentError ? (
                        <p className="text-sm text-red-500">
                            {subjectAssessmentError}
                        </p>
                    ) : subjectAssessment.length === 0 ? (
                        <p className="text-sm text-[#8b8476]">
                            No subjects are assigned to{" "}
                            {selectedStudent.grade}
                            {selectedStudent.section
                                ? ` - ${selectedStudent.section}`
                                : ""}{" "}
                            yet.
                        </p>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {subjectAssessment.map((s) => (
                                <div key={s.id} className="py-5 first:pt-0">
                                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                                        <h3 className="font-semibold text-[#1a2b4a] text-sm">
                                            {s.subject}
                                        </h3>
                                        <button
                                            onClick={() =>
                                                handleSaveSubjectAssessmentRow(
                                                    s,
                                                )
                                            }
                                            disabled={
                                                savingSubjectRowId === s.id
                                            }
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white hover:shadow-lg transition-all disabled:opacity-60"
                                        >
                                            {savingSubjectRowId === s.id
                                                ? "Saving…"
                                                : "Save"}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-[#6b6456] mb-1">
                                                Teacher
                                            </label>
                                            <select
                                                value={s.teacherId ?? ""}
                                                onChange={(e) =>
                                                    updateSubjectAssessmentRow(
                                                        s.id,
                                                        {
                                                            teacherId:
                                                                e.target
                                                                    .value ||
                                                                null,
                                                        },
                                                    )
                                                }
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                                            >
                                                <option value="">
                                                    Unassigned
                                                </option>
                                                {subjectAssessmentTeachers.map(
                                                    (t) => (
                                                        <option
                                                            key={t.id}
                                                            value={t.id}
                                                        >
                                                            {t.name}
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-[#6b6456] mb-1">
                                                Start Time
                                            </label>
                                            <input
                                                type="time"
                                                value={s.startTime}
                                                onChange={(e) =>
                                                    updateSubjectAssessmentRow(
                                                        s.id,
                                                        {
                                                            startTime:
                                                                e.target
                                                                    .value,
                                                        },
                                                    )
                                                }
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-[#6b6456] mb-1">
                                                End Time
                                            </label>
                                            <input
                                                type="time"
                                                value={s.endTime}
                                                onChange={(e) =>
                                                    updateSubjectAssessmentRow(
                                                        s.id,
                                                        {
                                                            endTime:
                                                                e.target
                                                                    .value,
                                                        },
                                                    )
                                                }
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-[#6b6456] mb-1">
                                                Room
                                            </label>
                                            <select
                                                value={s.room}
                                                onChange={(e) =>
                                                    updateSubjectAssessmentRow(
                                                        s.id,
                                                        {
                                                            room: e.target
                                                                .value,
                                                        },
                                                    )
                                                }
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                                            >
                                                <option value="">
                                                    Select a room…
                                                </option>
                                                {subjectAssessmentRooms.map(
                                                    (r) => (
                                                        <option
                                                            key={r.id}
                                                            value={r.name}
                                                        >
                                                            {r.name}
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                                        <span className="text-xs font-medium text-[#6b6456] mr-1">
                                            Days:
                                        </span>
                                        {WEEK_DAYS.map((day) => (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() =>
                                                    toggleSubjectAssessmentDay(
                                                        s.id,
                                                        day,
                                                    )
                                                }
                                                className={`px-2.5 py-1 rounded-full text-xs font-semibold border-2 transition-all ${
                                                    s.days.includes(day)
                                                        ? "bg-[#1a2b4a] border-[#1a2b4a] text-white"
                                                        : "border-gray-200 text-[#6b6456] hover:border-[#1a2b4a]/30"
                                                }`}
                                            >
                                                {day}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }
    if (
        showPaymentHistoryModal &&
        selectedStudent &&
        paymentHistory !== undefined
    ) {
        return (
                    <div className="space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <button
                                    onClick={() => {
                                        setShowPaymentHistoryModal(false);
                                        setPaymentHistorySearch("");
                                    }}
                                    className="flex items-center gap-1.5 text-base font-medium text-[#1a2b4a] hover:underline mb-2"
                                >
                                    <ChevronDown className="w-5 h-5 rotate-90" />
                                    Back to Student Details
                                </button>
                                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                                    Payment History
                                </h1>
                                <p className="text-[#6b6456]">
                                    {selectedStudent.name} •{" "}
                                    {selectedStudent.grade}
                                    {selectedStudent.section
                                        ? ` - ${selectedStudent.section}`
                                        : ""}
                                </p>
                            </div>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                            {paymentHistoryError ? (
                                <p className="text-sm text-red-500">
                                    {paymentHistoryError}
                                </p>
                            ) : paymentHistory.length === 0 ? (
                                <p className="text-sm text-[#8b8476]">
                                    No payments recorded for{" "}
                                    {selectedStudent.name} yet.
                                </p>
                            ) : (
                                <>
                                    <div className="mb-4 relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                                        <input
                                            type="text"
                                            value={paymentHistorySearch}
                                            onChange={(e) =>
                                                setPaymentHistorySearch(
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Search by receipt number..."
                                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4a4a]/20 text-black"
                                        />
                                    </div>
                                    <div className="mb-4 p-3 bg-[#faf8f5] border border-gray-200 rounded-lg flex items-center justify-between text-sm">
                                        <span className="text-[#8b8476]">
                                            Total Paid
                                        </span>
                                        <span className="font-bold text-[#1a2b4a]">
                                            ₱
                                            {paymentHistory
                                                .reduce(
                                                    (sum, p) => sum + p.amount,
                                                    0,
                                                )
                                                .toLocaleString(undefined, {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}
                                        </span>
                                    </div>
                                    {paymentHistory.filter((p) =>
                                        p.receiptNumber
                                            ?.toLowerCase()
                                            .includes(
                                                paymentHistorySearch
                                                    .trim()
                                                    .toLowerCase(),
                                            ),
                                    ).length === 0 &&
                                    paymentHistorySearch.trim() ? (
                                        <p className="text-sm text-[#8b8476] px-1">
                                            No payments match receipt number "
                                            {paymentHistorySearch}".
                                        </p>
                                    ) : (
                                    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 px-4">
                                        {paymentHistory
                                            .filter((p) =>
                                                paymentHistorySearch.trim()
                                                    ? (p.receiptNumber || "")
                                                          .toLowerCase()
                                                          .includes(
                                                              paymentHistorySearch
                                                                  .trim()
                                                                  .toLowerCase(),
                                                          )
                                                    : true,
                                            )
                                            .map((p) => (
                                            <div
                                                key={p.id}
                                                className="py-3 flex items-center justify-between gap-3 flex-wrap"
                                            >
                                                <div>
                                                    <p className="font-medium text-[#2c2c2c] text-sm">
                                                        {formatPaymentCategory(
                                                            p.category,
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-[#8b8476]">
                                                        {p.receiptNumber
                                                            ? `OR #${p.receiptNumber} • `
                                                            : ""}
                                                        {p.method || "—"}
                                                        {p.paidAt
                                                            ? ` • ${new Date(p.paidAt).toLocaleDateString()}`
                                                            : ""}
                                                    </p>
                                                </div>
                                                <p className="text-sm font-semibold text-[#1a2b4a]">
                                                    ₱
                                                    {p.amount.toLocaleString(
                                                        undefined,
                                                        {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2,
                                                        },
                                                    )}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
        );
    }

    if (showViewModal && selectedStudent) {
        return (
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <button
                                onClick={() => setShowViewModal(false)}
                                className="flex items-center gap-1.5 text-base font-medium text-[#1a2b4a] hover:underline mb-2"
                            >
                                <ChevronDown className="w-5 h-5 rotate-90" />
                                Back to Student Management
                            </button>
                            <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                                Student Details
                            </h1>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
                            <div className="flex items-start gap-5 pb-5 border-b border-gray-200">
                                <div className="w-16 h-16 bg-gradient-to-br from-[#1a2b4a] to-[#2d4263] rounded-xl flex items-center justify-center text-white text-xl font-bold shrink-0">
                                    {selectedStudent.name
                                        .split(" ")
                                        .map((n: string) => n[0])
                                        .join("")}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-xl font-bold text-[#1a2b4a]">
                                        {formatFamilyNameFirst(
                                            selectedStudent.name,
                                            selectedStudent.suffix,
                                        )}
                                    </h3>
                                    <p className="text-sm text-[#8b8476] font-mono">
                                        {selectedStudent.id}
                                    </p>
                                    <p className="text-sm text-[#6b6456] truncate">
                                        {selectedStudent.email}
                                    </p>
                                    <span
                                        className={`mt-2 inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${tabConfig[selectedStudent.status].color}`}
                                    >
                                        {selectedStudent.status}
                                    </span>
                                    {selectedStudent.isTransferee && (
                                        <span className="mt-2 ml-2 inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                                            Transferee
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="p-3 bg-[#faf8f5] rounded-lg text-center">
                                    <p className="text-xs text-[#8b8476] mb-1">
                                        Grade
                                    </p>
                                    <p className="font-bold text-[#1a2b4a]">
                                        {selectedStudent.grade}
                                    </p>
                                </div>
                            </div>
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                                <strong>Enrolled:</strong>{" "}
                                {selectedStudent.enrolled} &nbsp;&bull;&nbsp;{" "}
                                <strong>Phone:</strong> {selectedStudent.phone}
                                {selectedStudent.isTransferee &&
                                    selectedStudent.transferDate && (
                                        <>
                                            {" "}
                                            &nbsp;&bull;&nbsp;{" "}
                                            <strong>
                                                Transferred In:
                                            </strong>{" "}
                                            {selectedStudent.transferDate}
                                        </>
                                    )}
                            </div>

                            {/* Subject Assessment — subjects assigned to the student's class
                          section, their teachers, and schedule; reflects Class Management /
                          Schedule edits made since the modal was opened. Full details live in
                          a dedicated modal (opened via "View") to save space here. */}
                            <div className="border border-gray-200 rounded-xl p-5 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <BookOpen className="w-5 h-5 text-[#1a2b4a]" />
                                    <h3 className="text-sm font-semibold text-[#1a2b4a]">
                                        Subject Assessment
                                    </h3>
                                    {subjectAssessment !== undefined && (
                                        <span className="text-xs text-[#8b8476]">
                                            ({subjectAssessment.length}{" "}
                                            subject
                                            {subjectAssessment.length === 1
                                                ? ""
                                                : "s"}
                                            )
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() =>
                                        setShowSubjectAssessmentModal(true)
                                    }
                                    disabled={
                                        subjectAssessment === undefined ||
                                        !!subjectAssessmentError
                                    }
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 border-gray-200 text-[#1a2b4a] hover:border-[#1a2b4a]/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Eye className="w-3.5 h-3.5" />
                                    View
                                </button>
                            </div>

                            {/* Payment History — full record of the student's payments */}
                            <div className="border border-gray-200 rounded-xl p-5 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <Receipt className="w-5 h-5 text-[#1a2b4a]" />
                                    <h3 className="text-sm font-semibold text-[#1a2b4a]">
                                        Payment History
                                    </h3>
                                    {paymentHistory !== undefined && (
                                        <span className="text-xs text-[#8b8476]">
                                            ({paymentHistory.length} payment
                                            {paymentHistory.length === 1
                                                ? ""
                                                : "s"}
                                            )
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() =>
                                        setShowPaymentHistoryModal(true)
                                    }
                                    disabled={
                                        paymentHistory === undefined ||
                                        !!paymentHistoryError
                                    }
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 border-gray-200 text-[#1a2b4a] hover:border-[#1a2b4a]/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Eye className="w-3.5 h-3.5" />
                                    View
                                </button>
                            </div>

                            <StudentRequirements
                                studentId={selectedStudent.id}
                                schoolYearId={rosterYearId}
                                onChange={() => { if (rosterYearId) void getRequirementSummaries(rosterYearId).then(setReqSummaries); }}
                            />

                            <PickupPassCard studentId={selectedStudent.id} />

                            <div className="flex gap-3 pt-2 border-t border-gray-200">
                                <button
                                    onClick={() => {
                                        setShowViewModal(false);
                                        setShowEditModal(true);
                                    }}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all text-sm"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() =>
                                        openStatusChange(selectedStudent)
                                    }
                                    className="flex-1 px-4 py-2.5 border-2 border-blue-300 text-blue-700 rounded-lg font-medium hover:bg-blue-50 transition-all text-sm"
                                >
                                    Change Status
                                </button>
                                
                            </div>
                        </div>
                    </div>
        );
    }

    if (showEditModal && selectedStudent) {
        return (
                <StudentEditModal
                    student={selectedStudent}
                    gradeOptions={GRADE_OPTIONS.filter((g) => g !== "All")}
                    sectionOptionsForGrade={sectionOptionsForGrade}
                    saving={savingEdit}
                    error={editError}
                    schoolYear={schoolYear}
                    isRegistrar={isRegistrar}
                    onCancel={() => {
                        setShowEditModal(false);
                        setEditError(null);
                    }}
                    onChangeStatus={() => {
                        setShowEditModal(false);
                        setEditError(null);
                        openStatusChange(selectedStudent);
                    }}
                    onSave={async (form) => {
                        setSavingEdit(true);
                        setEditError(null);
                        const { error } = await supabase
                            .from("students")
                            .update({
                                first_name: form.firstName.trim(),
                                middle_name: form.middleName.trim() || null,
                                last_name: form.lastName.trim(),
                                suffix: form.suffix || null,
                                email: isRegistrar
                                    ? selectedStudent.email || null
                                    : form.email || null,
                                phone: form.phone || null,
                                grade_level: form.grade,
                                section: form.section || null,
                            })
                            .eq("id", selectedStudent.id);
                        if (error) {
                            setSavingEdit(false);
                            setEditError(error.message);
                            return;
                        }
                        try {
                            const sy = await getSchoolYearByLabel(schoolYear);
                            if (sy) {
                                await syncEnrollmentGradeSection(
                                    selectedStudent.id,
                                    sy.id,
                                    form.grade,
                                    form.section || null,
                                );
                            }
                        } catch (e: any) {
                            setSavingEdit(false);
                            setEditError(
                                e?.message ||
                                    "Failed to update the student's class roster.",
                            );
                            return;
                        }
                        setSavingEdit(false);
                        const name =
                            [
                                form.firstName.trim(),
                                form.middleName.trim(),
                                form.lastName.trim(),
                            ]
                                .filter(Boolean)
                                .join(" ") +
                            (form.suffix ? ` ${form.suffix}` : "");
                        setStudents((prev) =>
                            prev.map((s) =>
                                s.id === selectedStudent.id
                                    ? {
                                          ...s,
                                          name,
                                          firstName: form.firstName.trim(),
                                          middleName: form.middleName.trim(),
                                          lastName: form.lastName.trim(),
                                          suffix: form.suffix,
                                          email: form.email,
                                          phone: form.phone,
                                          grade: form.grade,
                                          section: form.section,
                                      }
                                    : s,
                            ),
                        );
                        setShowEditModal(false);
                    }}
                />
        );
    }


    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        Student Management
                    </h1>
                    <p className="text-[#6b6456]">
                        Manage student records • {schoolYear}
                    </p>
                </div>
            </div>

            {/* Status Tabs */}
            <div className="flex gap-2 flex-wrap items-start">
                <div className="relative">
                    <button
                        onClick={() => setShowStatusDropdown((prev) => !prev)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all border-[#1a2b4a] bg-[#1a2b4a] text-white"
                    >
                        <span>{TAB_LABELS[activeTab]}</span>
                        <ChevronDown
                            className={`w-4 h-4 transition-transform ${showStatusDropdown ? "rotate-180" : ""}`}
                        />
                    </button>
                    {showStatusDropdown && (
                        <div className="absolute z-10 mt-2 flex flex-col gap-2 p-2 bg-white rounded-lg shadow-lg border border-gray-200 min-w-full">
                            {(
                                [
                                    "Active",
                                    "ActiveOnly",
                                    "Graduate",
                                    "Dropped",
                                    "Transferred",
                                ] as (StudentStatus | "ActiveOnly")[]
                            ).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => {
                                        setActiveTab(tab);
                                        setShowStatusDropdown(false);
                                    }}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${activeTab === tab ? "border-[#1a2b4a] bg-[#1a2b4a] text-white" : "border-gray-200 text-[#6b6456] bg-white hover:border-[#1a2b4a]/30"}`}
                                >
                                    <span>{TAB_LABELS[tab]}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Search + Grade Filter */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8b8476]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name or student ID..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4a4a]/20 text-black"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-[#8b8476] shrink-0" />
                        <select
                            value={gradeFilter}
                            onChange={(e) => setGradeFilter(e.target.value)}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#2c2c2c] focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] bg-white"
                        >
                            {GRADE_OPTIONS.map((g) => (
                                <option key={g} value={g}>
                                    {g === "All" ? "All Grades" : g}
                                </option>
                            ))}
                        </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[#2c2c2c] whitespace-nowrap">
                        <input type="checkbox" checked={incompleteOnly} onChange={(e) => setIncompleteOnly(e.target.checked)} />
                        Incomplete requirements
                    </label>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="font-semibold text-[#1a2b4a]">
                        List of Students{" "}
                        <span className="text-sm font-normal text-[#8b8476]">
                            ({filtered.length})
                        </span>
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-[#faf8f5] border-b border-gray-200 text-center">
                            <tr>
                                <th className=" px-6 py-4 text-sm font-semibold text-[#1a2b4a]">
                                    Student
                                </th>
                                <th className=" px-6 py-4 text-sm font-semibold text-[#1a2b4a]">
                                    ID
                                </th>
                                <th className=" px-6 py-4 text-sm font-semibold text-[#1a2b4a]">
                                    Grade
                                </th>
                                <th className=" px-6 py-4 text-sm font-semibold text-[#1a2b4a]">
                                    Status
                                </th>
                                <th className=" px-6 py-4 text-sm font-semibold text-[#1a2b4a]">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-6 py-10 text-center text-[#8b8476] text-sm"
                                    >
                                        Loading students…
                                    </td>
                                </tr>
                            ) : loadError ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-6 py-10 text-center text-red-500 text-sm"
                                    >
                                        {loadError}
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-6 py-10 text-center text-[#8b8476] text-sm"
                                    >
                                        No{" "}
                                        {activeTab === "Active"
                                            ? ""
                                            : `${activeTab.toLowerCase()} `}
                                        students found.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((student) => (
                                    <tr
                                        key={student.id}
                                        className="hover:bg-[#faf8f5] transition-colors"
                                    >
                                        <td className="px-6 py-4">
                                            <div>
                                                <p className="font-medium text-[#2c2c2c]">
                                                    {formatFamilyNameFirst(
                                                        student.name,
                                                        student.suffix,
                                                    )}
                                                </p>
                                                <p className="text-xs text-[#8b8476]">
                                                    {student.email}
                                                </p>
                                                {reqSummaries[student.id] && reqSummaries[student.id].complete < reqSummaries[student.id].total && (
                                                    <span className="mt-1 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                                                        Incomplete requirements ({reqSummaries[student.id].complete}/{reqSummaries[student.id].total})
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-[#6b6456] font-mono">
                                            {student.id}
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm text-[#2c2c2c]">
                                                {student.grade}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${tabConfig[student.status].color}`}
                                            >
                                                {student.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => {
                                                        setSelectedStudent(
                                                            student,
                                                        );
                                                        setShowViewModal(true);
                                                    }}
                                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                                    title="View"
                                                >
                                                    <Eye className="w-4 h-4 text-[#8b8476]" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setSelectedStudent(
                                                            student,
                                                        );
                                                        setShowEditModal(true);
                                                    }}
                                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit className="w-4 h-4 text-[#8b8476]" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Change Status Modal */}
            {showStatusModal && selectedStudent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full">
                        <div className="bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <UserCheck className="w-5 h-5" />
                                <h2 className="text-lg font-semibold">
                                    Change Status
                                </h2>
                            </div>
                            <button
                                onClick={() => setShowStatusModal(false)}
                                className="p-1 hover:bg-white/20 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-[#6b6456]">
                                Update status for{" "}
                                <strong className="text-[#1a2b4a]">
                                    {selectedStudent.name}
                                </strong>
                                :
                            </p>
                            <div className="space-y-2">
                                {(
                                    [
                                        "Active",
                                        "Graduate",
                                        "Dropped",
                                        "Transferred",
                                    ] as StudentStatus[]
                                ).map((s) => (
                                    <label
                                        key={s}
                                        className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${pendingStatus === s ? "border-[#c9a961] bg-[#fdf9f0]" : "border-gray-200 hover:border-gray-300"}`}
                                    >
                                        <input
                                            type="radio"
                                            name="status"
                                            value={s}
                                            checked={pendingStatus === s}
                                            onChange={() => setPendingStatus(s)}
                                            className="accent-[#c9a961]"
                                        />
                                        <span
                                            className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${tabConfig[s].color}`}
                                        >
                                            {s}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <div className="flex gap-3 pt-2 border-t border-gray-200">
                                <button
                                    onClick={() => setShowStatusModal(false)}
                                    className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={changeStatus}
                                    disabled={
                                        pendingStatus === selectedStudent.status
                                    }
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50"
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
