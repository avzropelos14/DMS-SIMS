import { useState, useEffect } from "react";
import {
    GraduationCap,
    UserPlus,
    Search,
    Edit,
    Trash2,
    Eye,
    UserCheck,
    X,
    Check,
    ChevronDown,
    Plus,
    ClipboardList,
    LayoutGrid,
    List,
    ArrowLeft,
} from "lucide-react";
import { supabase } from "../../supabase";
import {
    listSubjects,
    curriculumForGrade,
    getOrCreateSubjectId,
    type Subject,
} from "../../lib/subjects";
import { listRooms, type Room } from "../../lib/rooms";
import { syncEnrollmentGradeSection } from "../../lib/students";

type SubjectAssignment = {
    id: string;
    subject: string;
    teacher: string;
    teacherId: string | null;
};

type ClassSection = {
    id: string;
    grade: string;
    section: string;
    adviser: string;
    adviserId: string | null;
    room: string;
    subjects: SubjectAssignment[];
};

// Class Management Section (Admin) — grade-level tabs, section rosters, and student assignment
export function ClassManagementSection({
    schoolYear,
    isArchivedYear = false,
    user,
}: {
    schoolYear: string;
    isArchivedYear?: boolean;
    user?: any;
}) {
    type RosterStudent = {
        id: string;
        name: string;
        grade: string;
        section: string;
    };
    // Every active student, regardless of whether they already have a grade/section —
    // enrollment already assigns a default grade/section, so the assign panel must be
    // able to move a student who's already sectioned into a different class, not just
    // students with none at all.
    type AssignableStudent = {
        id: string;
        name: string;
        grade: string;
        section: string;
    };

    const CLASS_GRADE_OPTIONS = [
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

    // Grade filter dropdown offers "All" on top of the real grades used when creating a
    // class (CLASS_GRADE_OPTIONS itself must stay real grades only).
    const GRADE_FILTER_OPTIONS = ["All", ...CLASS_GRADE_OPTIONS];

    const familyName = (fullName: string) => {
        const parts = fullName.trim().split(/\s+/);
        return parts[parts.length - 1] || fullName;
    };
    const formatFamilyNameFirst = (fullName: string) => {
        const parts = fullName.trim().split(/\s+/);
        if (parts.length < 2) return fullName;
        const family = parts[parts.length - 1];
        const given = parts.slice(0, -1).join(" ");
        return `${family}, ${given}`;
    };

    const [classSections, setClassSections] = useState<ClassSection[]>([]);
    const [assignedStudents, setAssignedStudents] = useState<RosterStudent[]>(
        [],
    );
    const [allStudents, setAllStudents] = useState<AssignableStudent[]>([]);
    const [teachers, setTeachers] = useState<{ id: string; name: string }[]>(
        [],
    );
    const [schoolYearId, setSchoolYearId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [classFormError, setClassFormError] = useState<string | null>(null);
    const [creatingClass, setCreatingClass] = useState(false);
    const [savingSection, setSavingSection] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const [assignError, setAssignError] = useState<string | null>(null);

    // Teachers' requests to reopen a locked grade quarter for a student (see TeacherDashboard's
    // "Request Edit"), surfaced here so the admin can approve or deny them.
    type ReopenRequest = {
        id: string;
        studentName: string;
        className: string;
        teacherName: string;
        quarter: string;
        requestedAt: string;
        status?: string;
        resolvedAt?: string | null;
        notes?: string | null;
    };
    const [showReopenRequestsModal, setShowReopenRequestsModal] =
        useState(false);
    const [requestsModalTab, setRequestsModalTab] = useState<
        "pending" | "history"
    >("pending");
    const [reopenRequests, setReopenRequests] = useState<ReopenRequest[]>([]);
    const [reopenRequestsLoading, setReopenRequestsLoading] = useState(false);
    const [reopenRequestsError, setReopenRequestsError] = useState<
        string | null
    >(null);
    const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(
        null,
    );
    // Red-dot badge on the "Grade Edit Requests" button — count of requests still
    // awaiting the admin's decision, kept fresh independently of the modal being open.
    const [pendingReopenCount, setPendingReopenCount] = useState(0);
    const [reopenHistory, setReopenHistory] = useState<ReopenRequest[]>([]);
    const [reopenHistoryLoading, setReopenHistoryLoading] = useState(false);
    const [reopenHistoryError, setReopenHistoryError] = useState<
        string | null
    >(null);

    const QUARTER_LABELS: Record<string, string> = {
        q1: "Quarter 1",
        q2: "Quarter 2",
        q3: "Quarter 3",
        q4: "Quarter 4",
    };

    const loadReopenRequests = async () => {
        if (!schoolYearId) {
            setReopenRequests([]);
            return;
        }
        setReopenRequestsLoading(true);
        setReopenRequestsError(null);
        const { data, error } = await supabase
            .from("grade_reopen_requests")
            .select(
                "id, quarter, requested_at, notes, students(first_name, last_name), class_section_subjects(class_sections(grade_level, section_name), subjects(name)), employees(full_name)",
            )
            .eq("school_year_id", schoolYearId)
            .eq("status", "pending")
            .order("requested_at", { ascending: false });
        if (error) {
            setReopenRequestsError(error.message);
            setReopenRequestsLoading(false);
            return;
        }
        setReopenRequests(
            (data ?? []).map((r: any) => ({
                id: r.id,
                notes: r.notes,
                studentName: r.students
                    ? `${r.students.first_name} ${r.students.last_name}`
                    : "Unknown Student",
                className: r.class_section_subjects
                    ? `${r.class_section_subjects.class_sections?.grade_level ?? ""} ${r.class_section_subjects.class_sections?.section_name ?? ""} — ${r.class_section_subjects.subjects?.name ?? ""}`
                    : "—",
                teacherName: r.employees?.full_name || "Unknown Teacher",
                quarter: QUARTER_LABELS[r.quarter] || r.quarter,
                requestedAt: r.requested_at,
            })),
        );
        setReopenRequestsLoading(false);
    };

    const refreshPendingReopenCount = async () => {
        if (!schoolYearId) {
            setPendingReopenCount(0);
            return;
        }
        const { count } = await supabase
            .from("grade_reopen_requests")
            .select("id", { count: "exact", head: true })
            .eq("school_year_id", schoolYearId)
            .eq("status", "pending");
        setPendingReopenCount(count ?? 0);
    };

    useEffect(() => {
        refreshPendingReopenCount();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schoolYearId]);

    const loadReopenHistory = async () => {
        if (!schoolYearId) {
            setReopenHistory([]);
            return;
        }
        setReopenHistoryLoading(true);
        setReopenHistoryError(null);
        const { data, error } = await supabase
            .from("grade_reopen_requests")
            .select(
                "id, quarter, requested_at, resolved_at, status, notes, students(first_name, last_name), class_section_subjects(class_sections(grade_level, section_name), subjects(name)), employees(full_name)",
            )
            .eq("school_year_id", schoolYearId)
            .neq("status", "pending")
            .order("resolved_at", { ascending: false, nullsFirst: false });
        if (error) {
            setReopenHistoryError(error.message);
            setReopenHistoryLoading(false);
            return;
        }
        setReopenHistory(
            (data ?? []).map((r: any) => ({
                id: r.id,
                studentName: r.students
                    ? `${r.students.first_name} ${r.students.last_name}`
                    : "Unknown Student",
                className: r.class_section_subjects
                    ? `${r.class_section_subjects.class_sections?.grade_level ?? ""} ${r.class_section_subjects.class_sections?.section_name ?? ""} — ${r.class_section_subjects.subjects?.name ?? ""}`
                    : "—",
                teacherName: r.employees?.full_name || "Unknown Teacher",
                quarter: QUARTER_LABELS[r.quarter] || r.quarter,
                requestedAt: r.requested_at,
                resolvedAt: r.resolved_at,
                status: r.status,
                notes: r.notes,
            })),
        );
        setReopenHistoryLoading(false);
    };

    const openReopenRequestsModal = () => {
        setShowReopenRequestsModal(true);
        setRequestsModalTab("pending");
        loadReopenRequests();
        loadReopenHistory();
    };

    const resolveReopenRequest = async (id: string, approve: boolean) => {
        setResolvingRequestId(id);
        const { error } = await supabase
            .from("grade_reopen_requests")
            .update({
                status: approve ? "approved" : "denied",
                resolved_at: new Date().toISOString(),
                resolved_by: user?.id || null,
            })
            .eq("id", id);
        setResolvingRequestId(null);
        if (error) {
            setReopenRequestsError(error.message);
            return;
        }
        setReopenRequests((prev) => prev.filter((r) => r.id !== id));
        refreshPendingReopenCount();
        loadReopenHistory();
    };

    const studentDisplayName = (r: any) =>
        [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ") +
        (r.suffix ? ` ${r.suffix}` : "");

    const loadAll = async () => {
        setLoading(true);
        setLoadError(null);
        const { data: syRow } = await supabase
            .from("school_years")
            .select("id")
            .eq("label", schoolYear)
            .maybeSingle();
        const syId = syRow?.id ?? null;
        setSchoolYearId(syId);

        const [{ data: teacherRows }, classResult, studentResult] =
            await Promise.all([
                supabase
                    .from("employees")
                    .select("id, full_name")
                    .eq("status", "active")
                    .eq("position", "Teacher")
                    .is("deleted_at", null)
                    .order("full_name"),
                syId
                    ? supabase
                          .from("class_sections")
                          .select(
                              "id, grade_level, section_name, adviser_id, room, employees(full_name), class_section_subjects(id, teacher_id, archived, subjects(name), employees(full_name))",
                          )
                          .eq("school_year_id", syId)
                    : Promise.resolve({ data: [] as any[], error: null }),
                supabase
                    .from("students")
                    .select(
                        "id, first_name, middle_name, last_name, suffix, grade_level, section, status, school_years!inner(label)",
                    )
                    .eq("status", "Active")
                    .eq("school_years.label", schoolYear),
            ]);

        setTeachers(
            (teacherRows ?? []).map((t: any) => ({
                id: t.id,
                name: t.full_name,
            })),
        );

        if (classResult.error) {
            setLoadError(classResult.error.message);
            setLoading(false);
            return;
        }
        if (studentResult.error) {
            setLoadError(studentResult.error.message);
            setLoading(false);
            return;
        }

        setClassSections(
            (classResult.data ?? []).map((c: any) => ({
                id: c.id,
                grade: c.grade_level,
                section: c.section_name,
                adviser: c.employees?.full_name || "",
                adviserId: c.adviser_id,
                room: c.room || "",
                subjects: (c.class_section_subjects ?? [])
                    .filter((s: any) => !s.archived)
                    .map((s: any) => ({
                        id: s.id,
                        subject: s.subjects?.name || "",
                        teacher: s.employees?.full_name || "",
                        teacherId: s.teacher_id,
                    })),
            })),
        );

        const studentRows = studentResult.data ?? [];
        setAssignedStudents(
            studentRows
                .filter((r: any) => r.section)
                .map((r: any) => ({
                    id: r.id,
                    name: studentDisplayName(r),
                    grade: r.grade_level,
                    section: r.section,
                })),
        );
        setAllStudents(
            studentRows.map((r: any) => ({
                id: r.id,
                name: studentDisplayName(r),
                grade: r.grade_level,
                section: r.section || "",
            })),
        );
        setLoading(false);
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await loadAll();
            if (cancelled) return;
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schoolYear]);

    const [selectedGrade, setSelectedGrade] = useState<string>(
        CLASS_GRADE_OPTIONS[2],
    ); // default: Grade 1
    const [editingSection, setEditingSection] = useState<ClassSection | null>(
        null,
    );
    const [sectionForm, setSectionForm] = useState<{
        adviserId: string;
        room: string;
        subjects: SubjectAssignment[];
    }>({ adviserId: "", room: "", subjects: [] });
    const [viewStudentsClass, setViewStudentsClass] =
        useState<ClassSection | null>(null);

    const [showAddClassModal, setShowAddClassModal] = useState(false);
    const [newClassForm, setNewClassForm] = useState<{
        grade: string;
        section: string;
        adviserId: string;
        room: string;
        subjects: SubjectAssignment[];
    }>({
        grade: CLASS_GRADE_OPTIONS[2],
        section: "",
        adviserId: "",
        room: "",
        subjects: [],
    });
    const [adviserSearch, setAdviserSearch] = useState("");
    const [showAdviserResults, setShowAdviserResults] = useState(false);

    const [showAssignPanel, setShowAssignPanel] = useState(false);
    const [assignTargetClass, setAssignTargetClass] =
        useState<ClassSection | null>(null);
    const [assignSearch, setAssignSearch] = useState("");
    const [pickedStudentId, setPickedStudentId] = useState("");

    const [sectionSearch, setSectionSearch] = useState("");
    const [sectionViewMode, setSectionViewMode] = useState<'table' | 'card'>('table');

    const sectionsForSelectedGrade = classSections
        .filter((c) => selectedGrade === "All" || c.grade === selectedGrade)
        .sort((a, b) => {
            if (selectedGrade === "All" && a.grade !== b.grade) {
                return (
                    CLASS_GRADE_OPTIONS.indexOf(a.grade) -
                    CLASS_GRADE_OPTIONS.indexOf(b.grade)
                );
            }
            return a.section.localeCompare(b.section);
        })
        .filter((c) => {
            const q = sectionSearch.trim().toLowerCase();
            if (!q) return true;
            return (
                c.section.toLowerCase().includes(q) ||
                (c.adviser || "").toLowerCase().includes(q) ||
                c.subjects.some((s) => s.subject.toLowerCase().includes(q))
            );
        });

    // Subject catalog, used to render the subject dropdown in the Add Class / Edit Section
    // modals instead of a free-text input — see Subject Management in the Teacher Portal,
    // which is where these are created. Filtered client-side per-form by the grade's
    // curriculum (see subjectOptionsForGrade below) so switching the grade dropdown in
    // "Add Class" narrows the subject choices without another round trip.
    const [subjectCatalog, setSubjectCatalog] = useState<Subject[]>([]);
    useEffect(() => {
        let active = true;
        listSubjects()
            .then((rows) => {
                if (active) setSubjectCatalog(rows);
            })
            .catch(() => {
                if (active) setSubjectCatalog([]);
            });
        return () => {
            active = false;
        };
    }, []);

    const subjectOptionsForGrade = (grade: string): Subject[] => {
        const curriculum = curriculumForGrade(grade);
        // Subjects with no curriculum ("All Grade Levels" in Subject Management) apply to every grade.
        return subjectCatalog.filter((s) => !s.curriculum || !curriculum || s.curriculum === curriculum);
    };

    // Room catalog, used to render the room dropdown in the Add Class / Edit Section
    // modals instead of a free-text input — see Room Management under Class Management.
    const [roomCatalog, setRoomCatalog] = useState<Room[]>([]);
    useEffect(() => {
        let active = true;
        listRooms()
            .then((rows) => {
                if (active) setRoomCatalog(rows);
            })
            .catch(() => {
                if (active) setRoomCatalog([]);
            });
        return () => {
            active = false;
        };
    }, []);

    const rosterCount = (grade: string, section: string) =>
        assignedStudents.filter(
            (s) => s.grade === grade && s.section === section,
        ).length;

    const rosterForClass = (cls: ClassSection) =>
        assignedStudents
            .filter((s) => s.grade === cls.grade && s.section === cls.section)
            .sort((a, b) =>
                familyName(a.name).localeCompare(familyName(b.name)),
            );

    const openSectionEditor = (cls: ClassSection) => {
        setEditingSection(cls);
        setClassFormError(null);
        setSectionForm({
            adviserId: cls.adviserId || "",
            room: cls.room,
            subjects: cls.subjects.map((s) => ({ ...s })),
        });
    };

    const addSubjectRow = () => {
        setSectionForm((f) => ({
            ...f,
            subjects: [
                ...f.subjects,
                {
                    id: `S${f.subjects.length + 1}-${Date.now()}`,
                    subject: "",
                    teacher: "",
                    teacherId: null,
                },
            ],
        }));
    };
    const updateSubjectRow = (
        id: string,
        key: "subject" | "teacherId",
        value: string,
    ) => {
        setSectionForm((f) => ({
            ...f,
            subjects: f.subjects.map((row) =>
                row.id === id
                    ? key === "teacherId"
                        ? {
                              ...row,
                              teacherId: value || null,
                              teacher:
                                  teachers.find((t) => t.id === value)?.name ||
                                  "",
                          }
                        : { ...row, subject: value }
                    : row,
            ),
        }));
    };
    const removeSubjectRow = (id: string) => {
        setSectionForm((f) => ({
            ...f,
            subjects: f.subjects.filter((row) => row.id !== id),
        }));
    };
    const saveSectionAssignments = async () => {
        if (isArchivedYear || !editingSection) return;
        setSavingSection(true);
        setClassFormError(null);
        try {
            const { error: updErr } = await supabase
                .from("class_sections")
                .update({
                    adviser_id: sectionForm.adviserId || null,
                    room: sectionForm.room.trim() || null,
                })
                .eq("id", editingSection.id);
            if (updErr) throw updErr;

            // Diff against the rows that existed when the editor opened, instead of blindly
            // deleting and recreating every row: grades reference class_section_subjects.id,
            // so recreating a row that still has the same subject/teacher breaks that FK.
            const originalIds = new Set(
                editingSection.subjects.map((s) => s.id),
            );
            const validSubjects = sectionForm.subjects.filter(
                (s) => s.subject.trim() && s.teacherId,
            );
            const keptIds = new Set(
                validSubjects
                    .filter((s) => originalIds.has(s.id))
                    .map((s) => s.id),
            );
            const removedIds = editingSection.subjects
                .map((s) => s.id)
                .filter((id) => !keptIds.has(id));

            if (removedIds.length > 0) {
                const { error: delErr } = await supabase
                    .from("class_section_subjects")
                    .delete()
                    .in("id", removedIds);
                if (delErr) {
                    // 23503 = foreign key violation: grades already recorded against one of these
                    // rows. Archive instead of hard-deleting so those grades stay intact and viewable,
                    // while the subject disappears from active class-management/teaching views.
                    if (delErr.code === "23503") {
                        const { error: archiveErr } = await supabase
                            .from("class_section_subjects")
                            .update({ archived: true })
                            .in("id", removedIds);
                        if (archiveErr) throw archiveErr;
                    } else {
                        throw delErr;
                    }
                }
            }

            const finalRows: {
                id: string;
                subject: string;
                teacherId: string;
            }[] = [];
            for (const s of validSubjects) {
                const subjectId = await getOrCreateSubjectId(s.subject);
                if (originalIds.has(s.id)) {
                    const { error: updSubErr } = await supabase
                        .from("class_section_subjects")
                        .update({
                            subject_id: subjectId,
                            teacher_id: s.teacherId,
                        })
                        .eq("id", s.id);
                    if (updSubErr) throw updSubErr;
                    finalRows.push({
                        id: s.id,
                        subject: s.subject,
                        teacherId: s.teacherId!,
                    });
                } else {
                    const { data, error: insErr } = await supabase
                        .from("class_section_subjects")
                        .insert({
                            class_section_id: editingSection.id,
                            subject_id: subjectId,
                            teacher_id: s.teacherId,
                        })
                        .select("id")
                        .single();
                    if (insErr) throw insErr;
                    finalRows.push({
                        id: data.id,
                        subject: s.subject,
                        teacherId: s.teacherId!,
                    });
                }
            }

            const adviserName =
                teachers.find((t) => t.id === sectionForm.adviserId)?.name ||
                "";
            setClassSections((prev) =>
                prev.map((c) =>
                    c.id === editingSection.id
                        ? {
                              ...c,
                              adviser: adviserName,
                              adviserId: sectionForm.adviserId || null,
                              room: sectionForm.room,
                              subjects: finalRows.map((s) => ({
                                  id: s.id,
                                  subject: s.subject,
                                  teacher:
                                      teachers.find((t) => t.id === s.teacherId)
                                          ?.name || "",
                                  teacherId: s.teacherId,
                              })),
                          }
                        : c,
                ),
            );
            setEditingSection(null);
        } catch (e: any) {
            setClassFormError(e?.message || "Failed to save changes.");
        } finally {
            setSavingSection(false);
        }
    };

    // Builds the default subject rows for a grade level, one per subject in that grade's
    // curriculum, with no teacher assigned yet. Used to auto-populate "Add Class" so the
    // admin only has to pick teachers — the Add Subject / Remove buttons stay available
    // for manual edits on top of this default set.
    const buildDefaultSubjectRows = (grade: string) =>
        subjectOptionsForGrade(grade).map((s, i) => ({
            id: `S${i + 1}-${Date.now()}-${s.id}`,
            subject: s.name,
            teacher: "",
            teacherId: null as string | null,
        }));

    // Add Class modal — creates a brand-new grade/section with its adviser & subject-teacher assignments
    const openAddClassModal = () => {
        setClassFormError(null);
        const initialGrade = selectedGrade === "All" ? CLASS_GRADE_OPTIONS[2] : selectedGrade;
        setNewClassForm({
            grade: initialGrade,
            section: "",
            adviserId: "",
            room: "",
            subjects: buildDefaultSubjectRows(initialGrade),
        });
        setAdviserSearch("");
        setShowAdviserResults(false);
        setShowAddClassModal(true);
    };
    const addNewClassSubjectRow = () => {
        setNewClassForm((f) => ({
            ...f,
            subjects: [
                ...f.subjects,
                {
                    id: `S${f.subjects.length + 1}-${Date.now()}`,
                    subject: "",
                    teacher: "",
                    teacherId: null,
                },
            ],
        }));
    };
    const updateNewClassSubjectRow = (
        id: string,
        key: "subject" | "teacherId",
        value: string,
    ) => {
        setNewClassForm((f) => ({
            ...f,
            subjects: f.subjects.map((row) =>
                row.id === id
                    ? key === "teacherId"
                        ? {
                              ...row,
                              teacherId: value || null,
                              teacher:
                                  teachers.find((t) => t.id === value)?.name ||
                                  "",
                          }
                        : { ...row, subject: value }
                    : row,
            ),
        }));
    };
    const removeNewClassSubjectRow = (id: string) => {
        setNewClassForm((f) => ({
            ...f,
            subjects: f.subjects.filter((row) => row.id !== id),
        }));
    };
    const createClass = async () => {
        if (
            isArchivedYear ||
            !newClassForm.grade ||
            !newClassForm.section.trim() ||
            !schoolYearId
        )
            return;
        setCreatingClass(true);
        setClassFormError(null);
        try {
            const { data: inserted, error } = await supabase
                .from("class_sections")
                .insert({
                    school_year_id: schoolYearId,
                    grade_level: newClassForm.grade,
                    section_name: newClassForm.section.trim(),
                    adviser_id: newClassForm.adviserId || null,
                    room: newClassForm.room.trim() || null,
                })
                .select("id")
                .single();
            if (error) throw error;

            const validSubjects = newClassForm.subjects.filter(
                (s) => s.subject.trim() && s.teacherId,
            );
            let insertedRows: any[] = [];
            if (validSubjects.length > 0) {
                const subjectRows = [];
                for (const s of validSubjects) {
                    const subjectId = await getOrCreateSubjectId(s.subject);
                    subjectRows.push({
                        class_section_id: inserted.id,
                        subject_id: subjectId,
                        teacher_id: s.teacherId,
                    });
                }
                const { data, error: subErr } = await supabase
                    .from("class_section_subjects")
                    .insert(subjectRows)
                    .select("id");
                if (subErr) throw subErr;
                insertedRows = data ?? [];
            }

            const adviserName =
                teachers.find((t) => t.id === newClassForm.adviserId)?.name ||
                "";
            setClassSections((prev) => [
                ...prev,
                {
                    id: inserted.id,
                    grade: newClassForm.grade,
                    section: newClassForm.section.trim(),
                    adviser: adviserName,
                    adviserId: newClassForm.adviserId || null,
                    room: newClassForm.room.trim(),
                    subjects: validSubjects.map((s, i) => ({
                        id: insertedRows[i]?.id || `local-${i}-${Date.now()}`,
                        subject: s.subject,
                        teacher:
                            teachers.find((t) => t.id === s.teacherId)?.name ||
                            "",
                        teacherId: s.teacherId,
                    })),
                },
            ]);
            setSelectedGrade(newClassForm.grade);
            setShowAddClassModal(false);
        } catch (e: any) {
            setClassFormError(e?.message || "Failed to create class.");
        } finally {
            setCreatingClass(false);
        }
    };

    const assignSearchResults = !assignSearch.trim()
        ? []
        : allStudents
              .filter(
                  (s) =>
                      assignTargetClass && s.grade === assignTargetClass.grade,
              )
              .filter(
                  (s) =>
                      !(
                          assignTargetClass &&
                          s.grade === assignTargetClass.grade &&
                          s.section === assignTargetClass.section
                      ),
              )
              .filter(
                  (s) =>
                      s.name
                          .toLowerCase()
                          .includes(assignSearch.toLowerCase()) ||
                      s.id.toLowerCase().includes(assignSearch.toLowerCase()),
              )
              .sort((a, b) =>
                  familyName(a.name).localeCompare(familyName(b.name)),
              );

    const openAssignPanel = (cls: ClassSection) => {
        setAssignTargetClass(cls);
        setAssignSearch("");
        setPickedStudentId("");
        setAssignError(null);
        setShowAssignPanel(true);
    };

    const confirmAssign = async () => {
        if (isArchivedYear || !assignTargetClass) return;
        const student = allStudents.find((s) => s.id === pickedStudentId);
        if (!student) return;
        setAssigning(true);
        setAssignError(null);
        try {
            const { error } = await supabase
                .from("students")
                .update({
                    grade_level: assignTargetClass.grade,
                    section: assignTargetClass.section,
                })
                .eq("id", student.id);
            if (error) throw error;
            if (schoolYearId) {
                await syncEnrollmentGradeSection(
                    student.id,
                    schoolYearId,
                    assignTargetClass.grade,
                    assignTargetClass.section,
                );
            }
            // Move the student into the roster for this grade/section — this may be a move
            // from a different class (assigned at enrollment or previously), not just from
            // the unassigned pool, so drop any prior roster entry for them first.
            setAssignedStudents((prev) => [
                ...prev.filter((s) => s.id !== student.id),
                {
                    id: student.id,
                    name: student.name,
                    grade: assignTargetClass.grade,
                    section: assignTargetClass.section,
                },
            ]);
            setAllStudents((prev) =>
                prev.map((s) =>
                    s.id === student.id
                        ? {
                              ...s,
                              grade: assignTargetClass.grade,
                              section: assignTargetClass.section,
                          }
                        : s,
                ),
            );
            setPickedStudentId("");
            setAssignSearch("");
        } catch (e: any) {
            setAssignError(e?.message || "Failed to assign student.");
        } finally {
            setAssigning(false);
        }
    };

    if (showAddClassModal) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => setShowAddClassModal(false)}
                    className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] font-medium"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Class Management</span>
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        Class Details
                    </h1>
                    <p className="text-[#6b6456]">
                        Create a new class section, assign an adviser and
                        room, and set up its subjects.
                    </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Grade Level *
                            </label>
                            <select
                                value={newClassForm.grade}
                                onChange={(e) =>
                                    setNewClassForm((f) => ({
                                        ...f,
                                        grade: e.target.value,
                                        subjects: buildDefaultSubjectRows(
                                            e.target.value,
                                        ),
                                    }))
                                }
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] bg-white text-black"
                            >
                                {CLASS_GRADE_OPTIONS.map((g) => (
                                    <option key={g} value={g}>
                                        {g}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Section *
                            </label>
                            <input
                                value={newClassForm.section}
                                onChange={(e) =>
                                    setNewClassForm((f) => ({
                                        ...f,
                                        section: e.target.value,
                                    }))
                                }
                                placeholder="e.g. Section A"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="relative">
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Adviser
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black" />
                                <input
                                    type="text"
                                    value={
                                        newClassForm.adviserId
                                            ? (teachers.find(
                                                  (t) =>
                                                      t.id ===
                                                      newClassForm.adviserId,
                                              )?.name ?? adviserSearch)
                                            : adviserSearch
                                    }
                                    onChange={(e) => {
                                        setAdviserSearch(e.target.value);
                                        setShowAdviserResults(true);
                                        if (newClassForm.adviserId)
                                            setNewClassForm((f) => ({
                                                ...f,
                                                adviserId: "",
                                            }));
                                    }}
                                    onFocus={() =>
                                        setShowAdviserResults(true)
                                    }
                                    onBlur={() =>
                                        setTimeout(
                                            () =>
                                                setShowAdviserResults(false),
                                            150,
                                        )
                                    }
                                    placeholder="Search teacher name…"
                                    className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                                />
                                {newClassForm.adviserId && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewClassForm((f) => ({
                                                ...f,
                                                adviserId: "",
                                            }));
                                            setAdviserSearch("");
                                        }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full"
                                        title="Clear adviser"
                                    >
                                        <X className="w-3.5 h-3.5 text-[#8b8476]" />
                                    </button>
                                )}
                            </div>
                            {showAdviserResults &&
                                !newClassForm.adviserId && (
                                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg divide-y divide-gray-100">
                                        {teachers.filter((t) =>
                                            t.name
                                                .toLowerCase()
                                                .includes(
                                                    adviserSearch
                                                        .trim()
                                                        .toLowerCase(),
                                                ),
                                        ).length === 0 ? (
                                            <p className="text-xs text-[#8b8476] italic text-center py-3">
                                                No matching teachers found.
                                            </p>
                                        ) : (
                                            teachers
                                                .filter((t) =>
                                                    t.name
                                                        .toLowerCase()
                                                        .includes(
                                                            adviserSearch
                                                                .trim()
                                                                .toLowerCase(),
                                                        ),
                                                )
                                                .map((t) => (
                                                    <button
                                                        key={t.id}
                                                        type="button"
                                                        onMouseDown={(e) =>
                                                            e.preventDefault()
                                                        }
                                                        onClick={() => {
                                                            setNewClassForm(
                                                                (f) => ({
                                                                    ...f,
                                                                    adviserId:
                                                                        t.id,
                                                                }),
                                                            );
                                                            setAdviserSearch(
                                                                "",
                                                            );
                                                            setShowAdviserResults(
                                                                false,
                                                            );
                                                        }}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#faf8f5] transition-colors"
                                                    >
                                                        {t.name}
                                                    </button>
                                                ))
                                        )}
                                    </div>
                                )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Room
                            </label>
                            <select
                                value={newClassForm.room}
                                onChange={(e) =>
                                    setNewClassForm((f) => ({
                                        ...f,
                                        room: e.target.value,
                                    }))
                                }
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            >
                                <option value="">Select a room…</option>
                                {roomCatalog.map((r) => (
                                    <option key={r.id} value={r.name}>
                                        {r.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-[#6b6456]">
                                Subjects & Assigned Teachers
                            </label>
                            <button
                                onClick={addNewClassSubjectRow}
                                className="flex items-center gap-1 text-xs font-semibold text-[#1a2b4a] hover:underline"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add Subject
                            </button>
                        </div>
                        <div className="space-y-2">
                            {newClassForm.subjects.length === 0 ? (
                                <p className="text-xs text-[#8b8476] italic py-2">
                                    No subjects yet — click "Add Subject" to
                                    assign one.
                                </p>
                            ) : (
                                newClassForm.subjects.map((row) => (
                                    <div
                                        key={row.id}
                                        className="flex items-center gap-2"
                                    >
                                        <select
                                            value={row.subject}
                                            onChange={(e) =>
                                                updateNewClassSubjectRow(
                                                    row.id,
                                                    "subject",
                                                    e.target.value,
                                                )
                                            }
                                            className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] bg-white text-black"
                                        >
                                            <option value="">
                                                Select subject
                                            </option>
                                            {subjectOptionsForGrade(
                                                newClassForm.grade,
                                            ).map((s) => (
                                                <option
                                                    key={s.id}
                                                    value={s.name}
                                                >
                                                    {s.name}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            value={row.teacherId || ""}
                                            onChange={(e) =>
                                                updateNewClassSubjectRow(
                                                    row.id,
                                                    "teacherId",
                                                    e.target.value,
                                                )
                                            }
                                            className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] bg-white text-black"
                                        >
                                            <option value="">
                                                Select teacher
                                            </option>
                                            {teachers.map((t) => (
                                                <option
                                                    key={t.id}
                                                    value={t.id}
                                                >
                                                    {t.name}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() =>
                                                removeNewClassSubjectRow(
                                                    row.id,
                                                )
                                            }
                                            className="p-2 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                                            title="Remove"
                                        >
                                            <Trash2 className="w-4 h-4 text-red-400" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                        {subjectOptionsForGrade(newClassForm.grade).length ===
                            0 && (
                            <p className="text-xs text-amber-600 mt-2">
                                No subjects configured for this grade level
                                yet. Add some under Subject Management in the
                                Teacher Portal.
                            </p>
                        )}
                    </div>

                    {classFormError && (
                        <p className="text-sm text-red-500">
                            {classFormError}
                        </p>
                    )}

                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                        <button
                            onClick={() => setShowAddClassModal(false)}
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={createClass}
                            disabled={
                                !newClassForm.section.trim() || creatingClass
                            }
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {creatingClass ? "Creating…" : "Create Class"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (viewStudentsClass) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => setViewStudentsClass(null)}
                    className="flex items-center gap-2 text-[#1a2b4a] hover:text-[#2d4263] font-medium"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Class Management</span>
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        {viewStudentsClass.grade} — {viewStudentsClass.section}
                    </h1>
                    <p className="text-[#6b6456]">
                        Adviser, subjects, and the students currently
                        assigned to this section.
                    </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
                    <div>
                        <p className="text-xs font-semibold text-[#8b8476] uppercase tracking-wide mb-1.5">
                            Adviser
                        </p>
                        <div className="flex items-center gap-1.5 text-sm">
                            <UserCheck className="w-4 h-4 text-[#c9a961] shrink-0" />
                            <span className="font-semibold text-[#2c2c2c]">
                                {viewStudentsClass.adviser || "—"}
                            </span>
                        </div>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-[#8b8476] uppercase tracking-wide mb-1.5">
                            Subjects & Teachers
                        </p>
                        {viewStudentsClass.subjects.length === 0 ? (
                            <p className="text-xs text-[#8b8476] italic">
                                No subjects assigned yet.
                            </p>
                        ) : (
                            <div className="space-y-1.5">
                                {viewStudentsClass.subjects.map((sub) => (
                                    <div
                                        key={sub.id}
                                        className="flex items-center justify-between text-sm px-2.5 py-1.5 bg-[#faf8f5] rounded-lg gap-3"
                                    >
                                        <span className="text-[#2c2c2c] font-medium">
                                            {sub.subject}
                                        </span>
                                        <span className="text-[#6b6456] text-xs">
                                            {sub.teacher}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-xs font-semibold text-[#8b8476] uppercase tracking-wide mb-1.5">
                        Students
                    </p>
                    {rosterForClass(viewStudentsClass).length === 0 ? (
                        <p className="text-sm text-[#8b8476] italic text-center py-6">
                            No students assigned to{" "}
                            {viewStudentsClass.grade} —{" "}
                            {viewStudentsClass.section} yet.
                        </p>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {rosterForClass(viewStudentsClass).map((s) => (
                                <div
                                    key={s.id}
                                    className="py-2.5 flex items-center justify-between"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-[#2c2c2c]">
                                            {formatFamilyNameFirst(s.name)}
                                        </p>
                                        <p className="text-xs text-[#8b8476] font-mono">
                                            {s.id}
                                        </p>
                                    </div>
                                    <span className="text-xs font-semibold text-[#1a2b4a] bg-[#1a2b4a]/10 px-2.5 py-1 rounded-full">
                                        {s.section}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (showAssignPanel && assignTargetClass) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => setShowAssignPanel(false)}
                    className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] font-medium"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Class Management</span>
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        Assign Student — {assignTargetClass.grade}{" "}
                        {assignTargetClass.section}
                    </h1>
                    <p className="text-[#6b6456]">
                        Search for a student and move them into this
                        section.
                    </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[#6b6456] mb-1">
                            Search Student (Name or Student ID)
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                            <input
                                type="text"
                                value={assignSearch}
                                onChange={(e) =>
                                    setAssignSearch(e.target.value)
                                }
                                placeholder={`Type a name or student ID (${assignTargetClass.grade} students)...`}
                                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7d1935]/20 text-black"
                            />
                        </div>
                    </div>

                    <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                        {assignSearchResults.length === 0 ? (
                            <p className="text-xs text-[#8b8476] italic text-center py-4">
                                {!assignSearch.trim()
                                    ? `Start typing to search ${assignTargetClass.grade} students.`
                                    : "No matching students found."}
                            </p>
                        ) : (
                            assignSearchResults.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => setPickedStudentId(s.id)}
                                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors ${pickedStudentId === s.id ? "bg-[#fdf9f0]" : "hover:bg-[#faf8f5]"}`}
                                >
                                    <div>
                                        <p className="text-sm font-medium text-[#2c2c2c]">
                                            {formatFamilyNameFirst(s.name)}
                                        </p>
                                        <p className="text-xs text-[#8b8476] font-mono">
                                            {s.id}
                                        </p>
                                        {s.section && (
                                            <p className="text-xs text-[#8b8476]">
                                                Currently: {s.grade} —{" "}
                                                {s.section}
                                            </p>
                                        )}
                                    </div>
                                    {pickedStudentId === s.id && (
                                        <Check className="w-4 h-4 text-[#7d1935]" />
                                    )}
                                </button>
                            ))
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Grade Level
                            </label>
                            <input
                                value={assignTargetClass.grade}
                                disabled
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Section
                            </label>
                            <input
                                value={assignTargetClass.section}
                                disabled
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400"
                            />
                        </div>
                    </div>
                    <p className="text-xs text-[#8b8476]">
                        Once assigned, this student moves into the{" "}
                        {assignTargetClass.grade} — {assignTargetClass.section}{" "}
                        roster (out of any prior class).
                    </p>
                    {assignError && (
                        <p className="text-sm text-red-500">{assignError}</p>
                    )}

                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                        <button
                            onClick={() => setShowAssignPanel(false)}
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmAssign}
                            disabled={!pickedStudentId || assigning}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {assigning ? "Assigning…" : "Assign"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (editingSection) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => setEditingSection(null)}
                    className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] font-medium"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Class Management</span>
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        {editingSection.grade} — {editingSection.section}
                    </h1>
                    <p className="text-[#6b6456]">
                        Edit this section's adviser, room, and subject
                        assignments.
                    </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Adviser
                            </label>
                            <select
                                value={sectionForm.adviserId}
                                onChange={(e) =>
                                    setSectionForm((f) => ({
                                        ...f,
                                        adviserId: e.target.value,
                                    }))
                                }
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] bg-white text-black"
                            >
                                <option value="">No adviser assigned</option>
                                {teachers.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Room
                            </label>
                            <select
                                value={sectionForm.room}
                                onChange={(e) =>
                                    setSectionForm((f) => ({
                                        ...f,
                                        room: e.target.value,
                                    }))
                                }
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            >
                                <option value="">Select a room…</option>
                                {roomCatalog.map((r) => (
                                    <option key={r.id} value={r.name}>
                                        {r.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-[#6b6456]">
                                Subjects & Assigned Teachers
                            </label>
                            <button
                                onClick={addSubjectRow}
                                className="flex items-center gap-1 text-xs font-semibold text-[#1a2b4a] hover:underline"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add Subject
                            </button>
                        </div>
                        <div className="space-y-2">
                            {sectionForm.subjects.length === 0 ? (
                                <p className="text-xs text-[#8b8476] italic py-2">
                                    No subjects yet — click "Add Subject" to
                                    assign one.
                                </p>
                            ) : (
                                sectionForm.subjects.map((row) => (
                                    <div
                                        key={row.id}
                                        className="flex items-center gap-2"
                                    >
                                        <select
                                            value={row.subject}
                                            onChange={(e) =>
                                                updateSubjectRow(
                                                    row.id,
                                                    "subject",
                                                    e.target.value,
                                                )
                                            }
                                            className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] bg-white text-black"
                                        >
                                            <option value="">
                                                Select subject
                                            </option>
                                            {subjectOptionsForGrade(
                                                editingSection?.grade ??
                                                    selectedGrade,
                                            ).map((s) => (
                                                <option
                                                    key={s.id}
                                                    value={s.name}
                                                >
                                                    {s.name}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            value={row.teacherId || ""}
                                            onChange={(e) =>
                                                updateSubjectRow(
                                                    row.id,
                                                    "teacherId",
                                                    e.target.value,
                                                )
                                            }
                                            className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] bg-white text-black"
                                        >
                                            <option value="">
                                                Select teacher
                                            </option>
                                            {teachers.map((t) => (
                                                <option
                                                    key={t.id}
                                                    value={t.id}
                                                >
                                                    {t.name}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() =>
                                                removeSubjectRow(row.id)
                                            }
                                            className="p-2 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                                            title="Remove"
                                        >
                                            <Trash2 className="w-4 h-4 text-red-400" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {classFormError && (
                        <p className="text-sm text-red-500">
                            {classFormError}
                        </p>
                    )}

                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                        <button
                            onClick={() => setEditingSection(null)}
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={saveSectionAssignments}
                            disabled={savingSection}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60"
                        >
                            {savingSection ? "Saving…" : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (showReopenRequestsModal) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => setShowReopenRequestsModal(false)}
                    className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] font-medium"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Class Management</span>
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        Grade Edit Requests
                    </h1>
                    <p className="text-[#6b6456]">
                        Teachers requesting to reopen a locked grade quarter
                        for a student.
                    </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 pt-4 flex items-center gap-2 border-b border-gray-200">
                        <button
                            onClick={() => setRequestsModalTab("pending")}
                            className={`px-3 py-2 text-sm font-semibold border-b-2 transition-all ${
                                requestsModalTab === "pending"
                                    ? "border-[#7d1935] text-[#7d1935]"
                                    : "border-transparent text-[#8b8476] hover:text-[#1a2b4a]"
                            }`}
                        >
                            Pending
                            {pendingReopenCount > 0
                                ? ` (${pendingReopenCount})`
                                : ""}
                        </button>
                        <button
                            onClick={() => setRequestsModalTab("history")}
                            className={`px-3 py-2 text-sm font-semibold border-b-2 transition-all ${
                                requestsModalTab === "history"
                                    ? "border-[#7d1935] text-[#7d1935]"
                                    : "border-transparent text-[#8b8476] hover:text-[#1a2b4a]"
                            }`}
                        >
                            History
                        </button>
                    </div>
                    <div className="p-6 space-y-3">
                        {requestsModalTab === "pending" ? (
                            <>
                                <p className="text-sm text-[#6b6456]">
                                    Teachers requesting to reopen a locked
                                    grade quarter for a student. Approving
                                    lets the teacher re-enter that quarter's
                                    grade; denying leaves it locked.
                                </p>
                                {reopenRequestsError && (
                                    <p className="text-sm text-red-500">
                                        {reopenRequestsError}
                                    </p>
                                )}
                                {reopenRequestsLoading ? (
                                    <div className="text-center text-sm text-[#8b8476] py-10">
                                        Loading requests…
                                    </div>
                                ) : reopenRequests.length === 0 ? (
                                    <div className="text-center text-sm text-[#8b8476] py-10">
                                        No pending grade edit requests.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {reopenRequests.map((req) => (
                                            <div
                                                key={req.id}
                                                className="border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4"
                                            >
                                                <div>
                                                    <p className="font-semibold text-[#1a2b4a] text-sm">
                                                        {req.studentName} —{" "}
                                                        {req.quarter}
                                                    </p>
                                                    <p className="text-xs text-[#6b6456] mt-0.5">
                                                        {req.className}
                                                    </p>
                                                    <p className="text-xs text-[#8b8476] mt-0.5">
                                                        Requested by{" "}
                                                        {req.teacherName} •{" "}
                                                        {new Date(
                                                            req.requestedAt,
                                                        ).toLocaleString(
                                                            "en-US",
                                                            {
                                                                month: "short",
                                                                day: "numeric",
                                                                year: "numeric",
                                                                hour: "numeric",
                                                                minute: "2-digit",
                                                            },
                                                        )}
                                                    </p>
                                                    {req.notes && (
                                                        <p className="text-xs text-[#2c2c2c] mt-1.5 bg-[#faf8f5] rounded-lg px-2.5 py-1.5">
                                                            "{req.notes}"
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        onClick={() =>
                                                            resolveReopenRequest(
                                                                req.id,
                                                                false,
                                                            )
                                                        }
                                                        disabled={
                                                            resolvingRequestId ===
                                                            req.id
                                                        }
                                                        className="px-3 py-2 rounded-lg text-xs font-semibold border-2 border-gray-200 text-[#6b6456] hover:border-red-300 hover:text-red-600 transition-all disabled:opacity-50"
                                                    >
                                                        Deny
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            resolveReopenRequest(
                                                                req.id,
                                                                true,
                                                            )
                                                        }
                                                        disabled={
                                                            resolvingRequestId ===
                                                            req.id
                                                        }
                                                        className="px-3 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white hover:shadow-lg transition-all disabled:opacity-50"
                                                    >
                                                        Approve
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-[#6b6456]">
                                    A log of past grade edit requests and how
                                    they were resolved, most recent first.
                                </p>
                                {reopenHistoryError && (
                                    <p className="text-sm text-red-500">
                                        {reopenHistoryError}
                                    </p>
                                )}
                                {reopenHistoryLoading ? (
                                    <div className="text-center text-sm text-[#8b8476] py-10">
                                        Loading history…
                                    </div>
                                ) : reopenHistory.length === 0 ? (
                                    <div className="text-center text-sm text-[#8b8476] py-10">
                                        No resolved grade edit requests yet.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {reopenHistory.map((req) => (
                                            <div
                                                key={req.id}
                                                className="border border-gray-200 rounded-xl p-4"
                                            >
                                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                                    <p className="font-semibold text-[#1a2b4a] text-sm">
                                                        {req.studentName} —{" "}
                                                        {req.quarter}
                                                    </p>
                                                    <span
                                                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                                            req.status ===
                                                            "approved"
                                                                ? "bg-green-100 text-green-700"
                                                                : req.status ===
                                                                    "denied"
                                                                  ? "bg-red-100 text-red-600"
                                                                  : "bg-gray-100 text-gray-600"
                                                        }`}
                                                    >
                                                        {req.status}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-[#6b6456] mt-0.5">
                                                    {req.className}
                                                </p>
                                                <p className="text-xs text-[#8b8476] mt-0.5">
                                                    Requested by{" "}
                                                    {req.teacherName} •{" "}
                                                    {new Date(
                                                        req.requestedAt,
                                                    ).toLocaleString(
                                                        "en-US",
                                                        {
                                                            month: "short",
                                                            day: "numeric",
                                                            year: "numeric",
                                                            hour: "numeric",
                                                            minute: "2-digit",
                                                        },
                                                    )}
                                                </p>
                                                {req.resolvedAt && (
                                                    <p className="text-xs text-[#8b8476] mt-0.5">
                                                        Resolved{" "}
                                                        {new Date(
                                                            req.resolvedAt,
                                                        ).toLocaleString(
                                                            "en-US",
                                                            {
                                                                month: "short",
                                                                day: "numeric",
                                                                year: "numeric",
                                                                hour: "numeric",
                                                                minute: "2-digit",
                                                            },
                                                        )}
                                                    </p>
                                                )}
                                                {req.notes && (
                                                    <p className="text-xs text-[#2c2c2c] mt-1.5 bg-[#faf8f5] rounded-lg px-2.5 py-1.5">
                                                        "{req.notes}"
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        Class Management
                    </h1>
                    <p className="text-[#6b6456]">
                        Grade levels, sections, advisers & subject assignments •{" "}
                        {schoolYear}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={openReopenRequestsModal}
                        className="relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 border-gray-200 text-[#1a2b4a] bg-white hover:border-[#1a2b4a]/30 transition-all"
                    >
                        <ClipboardList className="w-4 h-4" />
                        <span>Grade Edit Requests</span>
                        {pendingReopenCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white" />
                        )}
                    </button>
                    <button
                        onClick={openAddClassModal}
                        disabled={isArchivedYear}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Add Class</span>
                    </button>
                </div>
            </div>

            {/* Grade level dropdown */}
            <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-[#6b6456]">
                    Grade Level:
                </label>
                <div className="relative">
                    <select
                        value={selectedGrade}
                        onChange={(e) => setSelectedGrade(e.target.value)}
                        className="appearance-none pl-4 pr-9 py-2.5 rounded-lg text-sm font-semibold border-2 border-gray-200 text-[#1a2b4a] bg-white hover:border-[#1a2b4a]/30 focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 transition-all"
                    >
                        {GRADE_FILTER_OPTIONS.map((g) => (
                            <option key={g} value={g}>
                                {g === "All" ? "All Grade Levels" : g}
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-[#8b8476] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
            </div>

            {/* Expanded panel for the selected grade level */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 pb-4 flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="font-semibold text-[#1a2b4a] text-lg">
                        {selectedGrade === "All" ? "All Grade Levels" : selectedGrade} Sections
                    </h3>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                            <input
                                type="text"
                                value={sectionSearch}
                                onChange={(e) => setSectionSearch(e.target.value)}
                                placeholder="Search section, adviser, or subject..."
                                className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black w-64"
                            />
                        </div>
                        <div className="flex items-center border-2 border-gray-200 rounded-lg overflow-hidden">
                            <button
                                onClick={() => setSectionViewMode('table')}
                                title="Table view"
                                className={`p-2 transition-colors ${sectionViewMode === 'table' ? 'bg-[#1a2b4a] text-white' : 'bg-white text-[#8b8476] hover:bg-gray-50'}`}
                            >
                                <List className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setSectionViewMode('card')}
                                title="Card view"
                                className={`p-2 transition-colors ${sectionViewMode === 'card' ? 'bg-[#1a2b4a] text-white' : 'bg-white text-[#8b8476] hover:bg-gray-50'}`}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {sectionViewMode === 'table' ? (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-[#faf8f5] border-b border-gray-200">
                            <tr>
                                <th className="text-left px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Section</th>
                                <th className="text-left px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Room</th>
                                <th className="text-left px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Adviser</th>
                                <th className="text-left px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Subjects & Teachers</th>
                                <th className="text-center px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Students</th>
                                <th className="text-center px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="text-center text-sm text-[#8b8476] py-10">
                                        Loading classes…
                                    </td>
                                </tr>
                            ) : loadError ? (
                                <tr>
                                    <td colSpan={6} className="text-center text-sm text-red-500 py-10">
                                        {loadError}
                                    </td>
                                </tr>
                            ) : sectionsForSelectedGrade.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="text-center text-sm text-[#8b8476] py-10">
                                        {sectionSearch
                                            ? `No sections match "${sectionSearch}".`
                                            : `No sections found${selectedGrade === "All" ? "" : ` for ${selectedGrade}`} yet. Click "Add Class" to create one.`}
                                    </td>
                                </tr>
                            ) : (
                                sectionsForSelectedGrade.map((cls) => {
                                    const enrolled = rosterCount(
                                        cls.grade,
                                        cls.section,
                                    );
                                    return (
                                        <tr key={cls.id} className="hover:bg-[#faf8f5] transition-colors align-top">
                                            <td className="px-6 py-4">
                                                <p className="font-bold text-[#1a2b4a] text-sm">
                                                    {cls.section}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-[#6b6456]">
                                                {cls.room || "—"}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1.5 text-sm">
                                                    <UserCheck className="w-4 h-4 text-[#c9a961] shrink-0" />
                                                    <span className="font-semibold text-[#2c2c2c]">
                                                        {cls.adviser || "—"}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {cls.subjects.length === 0 ? (
                                                    <p className="text-xs text-[#8b8476] italic">
                                                        No subjects assigned yet.
                                                    </p>
                                                ) : (
                                                    <div className="space-y-1.5 min-w-[220px] max-w-[280px]">
                                                        {cls.subjects.slice(0, 3).map((sub) => (
                                                            <div
                                                                key={sub.id}
                                                                className="flex items-center justify-between text-sm px-2.5 py-1.5 bg-[#faf8f5] rounded-lg gap-3 min-w-0"
                                                            >
                                                                <span className="text-[#2c2c2c] font-medium truncate" title={sub.subject}>
                                                                    {sub.subject}
                                                                </span>
                                                                <span className="text-[#6b6456] text-xs shrink-0 truncate max-w-[100px]" title={sub.teacher}>
                                                                    {sub.teacher}
                                                                </span>
                                                            </div>
                                                        ))}
                                                        {cls.subjects.length > 3 && (
                                                            <button
                                                                onClick={() => setViewStudentsClass(cls)}
                                                                className="text-xs font-semibold text-[#1a2b4a] hover:underline px-2.5"
                                                            >
                                                                +{cls.subjects.length - 3} more — View
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#1a2b4a]/10 text-[#1a2b4a] whitespace-nowrap">
                                                    <GraduationCap className="w-3 h-3" />{" "}
                                                    {enrolled} students
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() =>
                                                            setViewStudentsClass(cls)
                                                        }
                                                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-2 border-gray-200 text-[#6b6456] bg-white hover:border-[#1a2b4a]/30 transition-all whitespace-nowrap"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                        <span>View</span>
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            openAssignPanel(cls)
                                                        }
                                                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white hover:shadow-lg transition-all whitespace-nowrap"
                                                    >
                                                        <UserPlus className="w-3.5 h-3.5" />
                                                        <span>Assign</span>
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            openSectionEditor(cls)
                                                        }
                                                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                                                        title="Edit Section"
                                                    >
                                                        <Edit className="w-4 h-4 text-[#8b8476]" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                ) : (
                <div className="p-6 pt-0">
                    {loading ? (
                        <p className="text-center text-sm text-[#8b8476] py-10">Loading classes…</p>
                    ) : loadError ? (
                        <p className="text-center text-sm text-red-500 py-10">{loadError}</p>
                    ) : sectionsForSelectedGrade.length === 0 ? (
                        <p className="text-center text-sm text-[#8b8476] py-10">
                            {sectionSearch
                                ? `No sections match "${sectionSearch}".`
                                : `No sections found${selectedGrade === "All" ? "" : ` for ${selectedGrade}`} yet. Click "Add Class" to create one.`}
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {sectionsForSelectedGrade.map((cls) => {
                                const enrolled = rosterCount(cls.grade, cls.section);
                                return (
                                    <div key={cls.id} className="border-2 border-gray-200 rounded-xl p-4 hover:border-[#1a2b4a]/30 transition-all">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <p className="font-bold text-[#1a2b4a] text-sm">{cls.grade} — {cls.section}</p>
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#1a2b4a]/10 text-[#1a2b4a] whitespace-nowrap shrink-0">
                                                <GraduationCap className="w-3 h-3" /> {enrolled} students
                                            </span>
                                        </div>
                                        <p className="text-sm text-[#6b6456] mb-1">Room: {cls.room || "—"}</p>
                                        <div className="flex items-center gap-1.5 text-sm mb-3">
                                            <UserCheck className="w-4 h-4 text-[#c9a961] shrink-0" />
                                            <span className="font-semibold text-[#2c2c2c]">{cls.adviser || "—"}</span>
                                        </div>
                                        {cls.subjects.length === 0 ? (
                                            <p className="text-xs text-[#8b8476] italic mb-3">No subjects assigned yet.</p>
                                        ) : (
                                            <div className="space-y-1.5 mb-3">
                                                {cls.subjects.slice(0, 3).map((sub) => (
                                                    <div key={sub.id} className="flex items-center justify-between text-sm px-2.5 py-1.5 bg-[#faf8f5] rounded-lg gap-3 min-w-0">
                                                        <span className="text-[#2c2c2c] font-medium truncate" title={sub.subject}>{sub.subject}</span>
                                                        <span className="text-[#6b6456] text-xs shrink-0 truncate max-w-[100px]" title={sub.teacher}>{sub.teacher}</span>
                                                    </div>
                                                ))}
                                                {cls.subjects.length > 3 && (
                                                    <button
                                                        onClick={() => setViewStudentsClass(cls)}
                                                        className="text-xs font-semibold text-[#1a2b4a] hover:underline px-2.5"
                                                    >
                                                        +{cls.subjects.length - 3} more — View
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                                            <button
                                                onClick={() => setViewStudentsClass(cls)}
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-2 border-gray-200 text-[#6b6456] bg-white hover:border-[#1a2b4a]/30 transition-all whitespace-nowrap"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                                <span>View</span>
                                            </button>
                                            <button
                                                onClick={() => openAssignPanel(cls)}
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white hover:shadow-lg transition-all whitespace-nowrap"
                                            >
                                                <UserPlus className="w-3.5 h-3.5" />
                                                <span>Assign</span>
                                            </button>
                                            <button
                                                onClick={() => openSectionEditor(cls)}
                                                className="p-2 hover:bg-gray-200 rounded-lg transition-colors shrink-0"
                                                title="Edit Section"
                                            >
                                                <Edit className="w-4 h-4 text-[#8b8476]" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                )}
            </div>
        </div>
    );
}
