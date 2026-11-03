import { useState, useEffect } from "react";
import {
    Users,
    Calendar,
    UserPlus,
    Search,
    AlertCircle,
    Edit,
    Trash2,
    X,
    Plus,
    ArrowLeft,
} from "lucide-react";
import { supabase } from "../../supabase";
import { listRooms, type Room } from "../../lib/rooms";
import { WEEK_DAYS } from "../../lib/timeFormat";

// Academics / Schedule Section

export function AcademicsSection({
    schoolYear,
    isArchivedYear = false,
    subPage = "list",
    onViewCalendar,
}: {
    schoolYear: string;
    isArchivedYear?: boolean;
    subPage?: "list" | "teacher-schedule";
    onViewCalendar?: () => void;
}) {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEventModal, setShowEventModal] = useState(false);
    const [editingTeacherName, setEditingTeacherName] = useState<string | null>(
        null,
    );

    // Room catalog, used to render the room dropdown in the Create/Edit Schedule
    // modal instead of a free-text input — see Room Management under Class Management.
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

    // A schedule is created individually per teacher; a teacher may carry several
    // subjects, each with its own class/days/time/room, hence the slots array.
    // Each slot maps 1:1 to a row in the real `schedules` table (grouped client-side by teacher).
    type SubjectSlot = {
        id: string;
        classSectionKey: string;
        subject: string;
        days: string[];
        startTime: string;
        endTime: string;
        room: string;
    };
    type TeacherSchedule = { teacher: string; slots: SubjectSlot[] };

    const [teacherSchedules, setTeacherSchedules] = useState<TeacherSchedule[]>(
        [],
    );
    const [classSections, setClassSections] = useState<
        { grade: string; section: string }[]
    >([]);
    // Subjects assigned to each class section (via class_section_subjects), keyed by
    // classSectionKey(grade, section) — each entry also carries the teacher that subject
    // is actually assigned to, so the Subject dropdown in Create Schedule can be narrowed
    // to what the selected teacher is assigned to teach in that class, not every subject
    // the class offers.
    const [subjectsByClassKey, setSubjectsByClassKey] = useState<
        Record<string, { subject: string; teacherName: string | null }[]>
    >({});
    const subjectOptionsForSlot = (classKey: string, teacherName: string) => {
        const entries = subjectsByClassKey[classKey] ?? [];
        const normalizedTeacher = teacherName.trim().toLowerCase();
        const matches = normalizedTeacher
            ? entries.filter(
                  (e) =>
                      (e.teacherName ?? "").trim().toLowerCase() ===
                      normalizedTeacher,
              )
            : entries;
        return Array.from(new Set(matches.map((e) => e.subject))).sort(
            (a, b) => a.localeCompare(b),
        );
    };
    const [teacherDirectory, setTeacherDirectory] = useState<
        { id: string; name: string; majorSubject: string | null }[]
    >([]);
    // "[Last Name], [First Name] - [Major Subject]" — the Create Schedule teacher option format.
    // The underlying value used to match/store schedules stays the plain employees.full_name.
    const teacherOptionLabel = (t: {
        name: string;
        majorSubject: string | null;
    }) => {
        const parts = t.name.trim().split(/\s+/);
        const lastFirst =
            parts.length < 2
                ? t.name
                : `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
        return t.majorSubject ? `${lastFirst} - ${t.majorSubject}` : lastFirst;
    };
    const [schoolYearId, setSchoolYearId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [scheduleConflicts, setScheduleConflicts] = useState<
        string[] | null
    >(null);

    const classSectionKey = (grade: string, section: string) =>
        `${grade}::${section}`;

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
        if (!syId) {
            setTeacherSchedules([]);
            setClassSections([]);
            setLoading(false);
            return;
        }

        const [
            { data: sectionRows },
            { data: scheduleRows, error },
            { data: teacherRows },
            { data: cssRows },
        ] = await Promise.all([
            supabase
                .from("class_sections")
                .select("grade_level, section_name")
                .eq("school_year_id", syId),
            supabase
                .from("schedules")
                .select(
                    "id, grade_level, section_name, subject, teacher, days, time_label, room",
                )
                .eq("school_year_id", syId)
                .order("teacher"),
            supabase
                .from("employees")
                .select("id, full_name, departments(name)")
                .eq("status", "active")
                .eq("position", "Teacher")
                .is("deleted_at", null)
                .order("full_name"),
            supabase
                .from("class_section_subjects")
                .select(
                    "subjects(name), employees(full_name), class_sections!inner(grade_level, section_name, school_year_id)",
                )
                .eq("class_sections.school_year_id", syId)
                .eq("archived", false),
        ]);
        if (error) {
            setLoadError(error.message);
            setLoading(false);
            return;
        }

        setTeacherDirectory(
            (teacherRows ?? []).map((t: any) => ({
                id: t.id,
                name: t.full_name,
                majorSubject:
                    t.departments?.name ?? t.departments?.[0]?.name ?? null,
            })),
        );
        setClassSections(
            (sectionRows ?? []).map((r: any) => ({
                grade: r.grade_level,
                section: r.section_name,
            })),
        );

        const subjectsMap: Record<
            string,
            { subject: string; teacherName: string | null }[]
        > = {};
        for (const row of (cssRows ?? []) as any[]) {
            const grade = row.class_sections?.grade_level;
            const section = row.class_sections?.section_name;
            const subjectName = row.subjects?.name;
            if (!grade || !section || !subjectName) continue;
            const teacherName =
                row.employees?.full_name ??
                row.employees?.[0]?.full_name ??
                null;
            const key = classSectionKey(grade, section);
            if (!subjectsMap[key]) subjectsMap[key] = [];
            subjectsMap[key].push({ subject: subjectName, teacherName });
        }
        setSubjectsByClassKey(subjectsMap);

        const grouped = new Map<string, SubjectSlot[]>();
        for (const r of scheduleRows ?? []) {
            const [startTime, endTime] = (r.time_label || "").split("-");
            const slot: SubjectSlot = {
                id: r.id,
                classSectionKey: classSectionKey(r.grade_level, r.section_name),
                subject: r.subject,
                days: r.days || [],
                startTime: startTime || "",
                endTime: endTime || "",
                room: r.room || "",
            };
            const existing = grouped.get(r.teacher) || [];
            existing.push(slot);
            grouped.set(r.teacher, existing);
        }
        setTeacherSchedules(
            Array.from(grouped.entries()).map(([teacher, slots]) => ({
                teacher,
                slots,
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

    type EventItem = {
        id: number;
        title: string;
        type: string;
        date: string;
        location: string;
        audience: string;
    };
    const [events, setEvents] = useState<EventItem[]>([
        {
            id: 1,
            title: "School Mass",
            type: "Religious/Spiritual",
            date: "Mar 20, 2026",
            location: "Chapel",
            audience: "All Grades",
        },
        {
            id: 2,
            title: "Quarter 3 Exams",
            type: "Academic",
            date: "Mar 15-19, 2026",
            location: "Classrooms",
            audience: "All Grades",
        },
        {
            id: 3,
            title: "Parent-Teacher Conference",
            type: "Parent Meeting",
            date: "Mar 25, 2026",
            location: "Gymnasium",
            audience: "All Parents",
        },
    ]);

    const makeEmptySlot = (): SubjectSlot => ({
        id: `SL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        classSectionKey: "",
        subject: "",
        days: [],
        startTime: "",
        endTime: "",
        room: "",
    });
    const emptyForm = { teacher: "", slots: [makeEmptySlot()] };
    const [form, setForm] = useState<{ teacher: string; slots: SubjectSlot[] }>(
        emptyForm,
    );
    const [showTeacherSuggestions, setShowTeacherSuggestions] = useState(false);
    const teacherSuggestions = teacherDirectory
        .filter(
            (t) =>
                t.name
                    .toLowerCase()
                    .includes(form.teacher.trim().toLowerCase()) &&
                t.name !== form.teacher.trim(),
        )
        .slice(0, 8);

    const emptyEvent = {
        title: "",
        type: "",
        date: "",
        location: "",
        audience: "All Grades",
    };
    const [eventForm, setEventForm] = useState(emptyEvent);

    // Schedule & Classes has two sidebar sub-pages: the Teacher Schedules list
    // and the Calendar (weekly calendar view of one teacher) — driven by
    // which sub-page the registrar picked in the sidebar, not an in-page tab.
    const scheduleView = subPage === "teacher-schedule" ? "grid" : "list";
    const [calendarTeacherName, setCalendarTeacherName] = useState<
        string | null
    >(null);
    const activeTeacherName =
        calendarTeacherName ?? teacherSchedules[0]?.teacher ?? null;
    const activeSchedule =
        teacherSchedules.find((t) => t.teacher === activeTeacherName) || null;

    const CALENDAR_START_HOUR = 6;
    const CALENDAR_END_HOUR = 18;
    const HOUR_HEIGHT = 56;
    const calendarHours = Array.from(
        { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR },
        (_, i) => CALENDAR_START_HOUR + i,
    );

    const timeToMinutes = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m;
    };
    const formatTime12 = (t: string) => {
        if (!t) return "";
        const [h, m] = t.split(":").map(Number);
        const period = h >= 12 ? "PM" : "AM";
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
    };
    const formatHourLabel = (h: number) => {
        const period = h >= 12 ? "PM" : "AM";
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        return `${hour12}:00 ${period}`;
    };
    const SLOT_COLORS = [
        "#1a2b4a",
        "#7d1935",
        "#0f766e",
        "#b45309",
        "#4338ca",
        "#be185d",
        "#065f46",
    ];
    const colorForSubject = (subject: string) => {
        let hash = 0;
        for (let i = 0; i < subject.length; i++)
            hash = (hash * 31 + subject.charCodeAt(i)) | 0;
        return SLOT_COLORS[Math.abs(hash) % SLOT_COLORS.length];
    };
    const blocksForDay = (day: string) => {
        if (!activeSchedule) return [];
        return activeSchedule.slots
            .filter((s) => s.days.includes(day) && s.startTime && s.endTime)
            .map((s) => {
                const startMin = Math.max(
                    timeToMinutes(s.startTime),
                    CALENDAR_START_HOUR * 60,
                );
                const endMin = Math.min(
                    timeToMinutes(s.endTime),
                    CALENDAR_END_HOUR * 60,
                );
                const top =
                    ((startMin - CALENDAR_START_HOUR * 60) / 60) * HOUR_HEIGHT;
                const height = Math.max(
                    ((endMin - startMin) / 60) * HOUR_HEIGHT,
                    22,
                );
                return { slot: s, top, height };
            });
    };

    const addSlot = () =>
        setForm((f) => ({ ...f, slots: [...f.slots, makeEmptySlot()] }));
    const updateSlot = (
        id: string,
        key: "subject" | "startTime" | "endTime" | "room" | "classSectionKey",
        value: string,
    ) => {
        setForm((f) => ({
            ...f,
            // Changing the class invalidates whatever subject was previously picked,
            // since the dropdown options depend on the selected class section.
            slots: f.slots.map((s) =>
                s.id === id
                    ? {
                          ...s,
                          [key]: value,
                          ...(key === "classSectionKey" ? { subject: "" } : {}),
                      }
                    : s,
            ),
        }));
    };
    const toggleSlotDay = (id: string, day: string) => {
        setForm((f) => ({
            ...f,
            slots: f.slots.map((s) =>
                s.id === id
                    ? {
                          ...s,
                          days: s.days.includes(day)
                              ? s.days.filter((d) => d !== day)
                              : [...s.days, day],
                      }
                    : s,
            ),
        }));
    };
    // Changing the teacher invalidates whatever subjects were previously picked, since
    // the Subject dropdown options depend on which subjects that teacher is assigned to.
    const setTeacher = (teacher: string) => {
        setForm((f) => ({
            ...f,
            teacher,
            slots: f.slots.map((s) => ({ ...s, subject: "" })),
        }));
    };
    const removeSlot = (id: string) => {
        setForm((f) =>
            f.slots.length <= 1
                ? f
                : { ...f, slots: f.slots.filter((s) => s.id !== id) },
        );
    };

    const handleOpen = (schedule?: TeacherSchedule) => {
        setSaveError(null);
        setScheduleConflicts(null);
        if (schedule) {
            setForm({
                teacher: schedule.teacher,
                slots: schedule.slots.map((s) => ({ ...s })),
            });
            setEditingTeacherName(schedule.teacher);
        } else {
            setForm({ teacher: "", slots: [makeEmptySlot()] });
            setEditingTeacherName(null);
        }
        setShowCreateModal(true);
    };

    // Detects schedule conflicts among the slots about to be saved: the same teacher,
    // class section, or room double-booked on an overlapping day/time. Existing rows
    // belonging to the teacher being edited are excluded since handleSave replaces them.
    const timesOverlap = (
        aStart: string,
        aEnd: string,
        bStart: string,
        bEnd: string,
    ) =>
        timeToMinutes(aStart) < timeToMinutes(bEnd) &&
        timeToMinutes(bStart) < timeToMinutes(aEnd);
    const daysOverlap = (a: string[], b: string[]) =>
        a.some((d) => b.includes(d));

    const findScheduleConflicts = (validSlots: SubjectSlot[]): string[] => {
        const conflicts: string[] = [];
        const teacherTrim = form.teacher.trim();
        const existingRows = teacherSchedules
            .filter((t) => t.teacher !== editingTeacherName)
            .flatMap((t) => t.slots.map((s) => ({ ...s, teacher: t.teacher })));

        validSlots.forEach((newSlot) => {
            existingRows.forEach((exist) => {
                if (!daysOverlap(newSlot.days, exist.days)) return;
                if (
                    !timesOverlap(
                        newSlot.startTime,
                        newSlot.endTime,
                        exist.startTime,
                        exist.endTime,
                    )
                )
                    return;
                if (
                    exist.teacher.trim().toLowerCase() ===
                    teacherTrim.toLowerCase()
                ) {
                    conflicts.push(
                        `${teacherTrim} is already scheduled to teach ${exist.subject} at this time.`,
                    );
                } else if (
                    exist.classSectionKey === newSlot.classSectionKey
                ) {
                    const [grade, section] =
                        newSlot.classSectionKey.split("::");
                    conflicts.push(
                        `${grade} - ${section} already has ${exist.subject} with ${exist.teacher} at this time.`,
                    );
                } else if (
                    newSlot.room &&
                    exist.room &&
                    newSlot.room.trim().toLowerCase() ===
                        exist.room.trim().toLowerCase()
                ) {
                    conflicts.push(
                        `Room ${newSlot.room} is already in use by ${exist.teacher} for ${exist.subject} at this time.`,
                    );
                }
            });
        });

        // Check the slots being submitted against each other too (e.g. two subjects
        // for the same teacher scheduled at an overlapping time).
        for (let i = 0; i < validSlots.length; i++) {
            for (let j = i + 1; j < validSlots.length; j++) {
                const a = validSlots[i];
                const b = validSlots[j];
                if (!daysOverlap(a.days, b.days)) continue;
                if (
                    !timesOverlap(
                        a.startTime,
                        a.endTime,
                        b.startTime,
                        b.endTime,
                    )
                )
                    continue;
                conflicts.push(
                    `${a.subject || "This subject"} and ${b.subject || "this subject"} overlap on the same day/time in this schedule.`,
                );
            }
        }

        return Array.from(new Set(conflicts));
    };

    const handleSave = async () => {
        if (isArchivedYear || !schoolYearId) return;
        const validSlots = form.slots.filter(
            (s) =>
                s.subject.trim() &&
                s.classSectionKey &&
                s.days.length > 0 &&
                s.startTime &&
                s.endTime,
        );
        if (!form.teacher.trim() || validSlots.length === 0) return;
        const conflicts = findScheduleConflicts(validSlots);
        if (conflicts.length > 0) {
            setScheduleConflicts(conflicts);
            return;
        }
        setSaving(true);
        setSaveError(null);
        try {
            // Sync strategy matches the rest of this codebase's class/subject editors:
            // replace this teacher's rows for the year wholesale rather than diffing.
            if (editingTeacherName) {
                const { error: delErr } = await supabase
                    .from("schedules")
                    .delete()
                    .eq("school_year_id", schoolYearId)
                    .eq("teacher", editingTeacherName);
                if (delErr) throw delErr;
            }
            const rows = validSlots.map((s) => {
                const [grade, section] = s.classSectionKey.split("::");
                return {
                    school_year_id: schoolYearId,
                    grade_level: grade,
                    section_name: section,
                    subject: s.subject.trim(),
                    teacher: form.teacher.trim(),
                    days: s.days,
                    time_label: `${s.startTime}-${s.endTime}`,
                    room: s.room.trim() || null,
                };
            });
            const { error: insErr } = await supabase
                .from("schedules")
                .insert(rows);
            if (insErr) throw insErr;
            await loadAll();
            setCalendarTeacherName(form.teacher.trim());
            setShowCreateModal(false);
        } catch (e: any) {
            setSaveError(e?.message || "Failed to save schedule.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (teacher: string) => {
        if (isArchivedYear || !schoolYearId) return;
        const { error } = await supabase
            .from("schedules")
            .delete()
            .eq("school_year_id", schoolYearId)
            .eq("teacher", teacher);
        if (error) {
            setLoadError(error.message);
            return;
        }
        setTeacherSchedules((prev) =>
            prev.filter((t) => t.teacher !== teacher),
        );
        if (calendarTeacherName === teacher) setCalendarTeacherName(null);
    };

    const handleSaveEvent = () => {
        if (
            !eventForm.title ||
            !eventForm.type ||
            !eventForm.date ||
            !eventForm.location
        )
            return;
        setEvents((prev) => [...prev, { id: Date.now(), ...eventForm }]);
        setEventForm(emptyEvent);
        setShowEventModal(false);
    };

    const handleDeleteEvent = (id: number) => {
        setEvents((prev) => prev.filter((e) => e.id !== id));
    };
    if (showCreateModal) {
        return (
                <div className="space-y-6">
                    <button
                        onClick={() => setShowCreateModal(false)}
                        className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] font-medium"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span>Back to Schedules</span>
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                            {editingTeacherName
                                ? "Edit Schedule"
                                : "Create Schedule"}
                        </h1>
                        <p className="text-[#6b6456]">
                            {editingTeacherName
                                ? `Update ${editingTeacherName}'s subjects, classes, rooms, and time slots.`
                                : "Assign a teacher to subjects, classes, rooms, and time slots."}{" "}
                            • {schoolYear}
                        </p>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full">
                        <div className="p-6 space-y-5">
                            <div className="relative">
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                    Name of Teacher{" "}
                                    <span className="text-red-400">*</span>
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                                    <input
                                        value={form.teacher}
                                        onChange={(e) => {
                                            setTeacher(e.target.value);
                                            setShowTeacherSuggestions(true);
                                        }}
                                        onFocus={() =>
                                            setShowTeacherSuggestions(true)
                                        }
                                        onBlur={() =>
                                            setTimeout(
                                                () =>
                                                    setShowTeacherSuggestions(
                                                        false,
                                                    ),
                                                150,
                                            )
                                        }
                                        placeholder="Search teacher by name..."
                                        autoComplete="off"
                                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                                    />
                                </div>
                                {showTeacherSuggestions &&
                                    form.teacher.trim() &&
                                    teacherSuggestions.length > 0 && (
                                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto divide-y divide-gray-100">
                                            {teacherSuggestions.map((t) => (
                                                <button
                                                    type="button"
                                                    key={t.id}
                                                    onMouseDown={(e) =>
                                                        e.preventDefault()
                                                    }
                                                    onClick={() => {
                                                        setTeacher(t.name);
                                                        setShowTeacherSuggestions(
                                                            false,
                                                        );
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-sm text-[#2c2c2c] hover:bg-[#faf8f5] transition-colors"
                                                >
                                                    {teacherOptionLabel(t)}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                            </div>

                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-[#6b6456]">
                                    Subjects, Days & Time{" "}
                                    <span className="text-red-400">*</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={addSlot}
                                    className="flex items-center gap-1 text-xs font-semibold text-[#1a2b4a] hover:underline"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Add Another
                                    Subject
                                </button>
                            </div>

                            <div className="space-y-4">
                                {form.slots.map((slot, idx) => (
                                    <div
                                        key={slot.id}
                                        className="border border-gray-200 rounded-xl p-4 space-y-3 relative"
                                    >
                                        {form.slots.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    removeSlot(slot.id)
                                                }
                                                className="absolute top-3 right-3 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Remove Subject"
                                            >
                                                <Trash2 className="w-4 h-4 text-red-400" />
                                            </button>
                                        )}
                                        <p className="text-xs font-semibold text-[#8b8476] uppercase tracking-wide">
                                            Subject {idx + 1}
                                        </p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="col-span-2">
                                                <label className="block text-xs font-medium text-[#6b6456] mb-1">
                                                    Class{" "}
                                                    <span className="text-red-400">
                                                        *
                                                    </span>
                                                </label>
                                                <select
                                                    value={slot.classSectionKey}
                                                    onChange={(e) =>
                                                        updateSlot(
                                                            slot.id,
                                                            "classSectionKey",
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 bg-white text-black"
                                                >
                                                    <option value="">
                                                        Select class…
                                                    </option>
                                                    {classSections.map((cs) => (
                                                        <option
                                                            key={classSectionKey(
                                                                cs.grade,
                                                                cs.section,
                                                            )}
                                                            value={classSectionKey(
                                                                cs.grade,
                                                                cs.section,
                                                            )}
                                                        >
                                                            {cs.grade} -{" "}
                                                            {cs.section}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-2 sm:col-span-1">
                                                <label className="block text-xs font-medium text-[#6b6456] mb-1">
                                                    Subject
                                                </label>
                                                <select
                                                    value={slot.subject}
                                                    onChange={(e) =>
                                                        updateSlot(
                                                            slot.id,
                                                            "subject",
                                                            e.target.value,
                                                        )
                                                    }
                                                    disabled={
                                                        !slot.classSectionKey
                                                    }
                                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 bg-white text-black disabled:bg-gray-50 disabled:text-[#8b8476]"
                                                >
                                                    <option value="">
                                                        {slot.classSectionKey
                                                            ? "Select subject…"
                                                            : "Select a class first"}
                                                    </option>
                                                    {subjectOptionsForSlot(
                                                        slot.classSectionKey,
                                                        form.teacher,
                                                    ).map((name) => (
                                                        <option
                                                            key={name}
                                                            value={name}
                                                        >
                                                            {name}
                                                        </option>
                                                    ))}
                                                </select>
                                                {slot.classSectionKey &&
                                                    subjectOptionsForSlot(
                                                        slot.classSectionKey,
                                                        form.teacher,
                                                    ).length === 0 && (
                                                        <p className="text-[10px] text-[#8b8476] mt-1">
                                                            {form.teacher.trim()
                                                                ? "This teacher isn't assigned to any subject in this class."
                                                                : "No subjects assigned to this class yet."}
                                                        </p>
                                                    )}
                                            </div>
                                            <div className="col-span-2 sm:col-span-1">
                                                <label className="block text-xs font-medium text-[#6b6456] mb-1">
                                                    Room
                                                </label>
                                                <select
                                                    value={slot.room}
                                                    onChange={(e) =>
                                                        updateSlot(
                                                            slot.id,
                                                            "room",
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                                                >
                                                    <option value="">Select a room…</option>
                                                    {roomCatalog.map((r) => (
                                                        <option key={r.id} value={r.name}>{r.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-[#6b6456] mb-1">
                                                    Start Time
                                                </label>
                                                <input
                                                    type="time"
                                                    value={slot.startTime}
                                                    onChange={(e) =>
                                                        updateSlot(
                                                            slot.id,
                                                            "startTime",
                                                            e.target.value,
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
                                                    value={slot.endTime}
                                                    onChange={(e) =>
                                                        updateSlot(
                                                            slot.id,
                                                            "endTime",
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-[#6b6456] mb-2">
                                                Days
                                            </label>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {WEEK_DAYS.map((d) => (
                                                    <button
                                                        key={d}
                                                        type="button"
                                                        onClick={() =>
                                                            toggleSlotDay(
                                                                slot.id,
                                                                d,
                                                            )
                                                        }
                                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                                                            slot.days.includes(
                                                                d,
                                                            )
                                                                ? "bg-[#1a2b4a] border-[#1a2b4a] text-white"
                                                                : "bg-white border-gray-200 text-[#6b6456] hover:border-[#1a2b4a]/40"
                                                        }`}
                                                    >
                                                        {d}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Schedule Conflict Notice — blocks saving until the conflicting slot is fixed */}
                            {scheduleConflicts && scheduleConflicts.length > 0 && (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                                            <AlertCircle className="w-4 h-4 shrink-0" />
                                            Schedule Conflict
                                        </div>
                                        <button
                                            onClick={() => setScheduleConflicts(null)}
                                            className="p-1 text-red-400 hover:text-red-600 rounded"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <ul className="space-y-1 list-disc pl-6">
                                        {scheduleConflicts.map((c, i) => (
                                            <li key={i} className="text-sm text-red-700">
                                                {c}
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="text-xs text-[#8b8476]">
                                        Adjust the day, time, room, or class before
                                        saving this schedule.
                                    </p>
                                </div>
                            )}
                            {saveError && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                    <AlertCircle className="w-4 h-4 shrink-0" />{" "}
                                    {saveError}
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-gray-200 flex gap-3">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1 px-6 py-3 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-60"
                            >
                                {saving
                                    ? "Saving…"
                                    : editingTeacherName
                                      ? "Save Changes"
                                      : "Create Schedule"}
                            </button>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="flex-1 px-6 py-3 border-2 border-gray-200 text-[#2c2c2c] rounded-xl font-medium hover:border-[#c9a961] transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
        );
    }


    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        {subPage === "teacher-schedule"
                            ? "Calendar"
                            : "Teacher Schedules"}
                    </h1>
                    <p className="text-[#6b6456]">
                        {subPage === "teacher-schedule"
                            ? "Weekly calendar view of a teacher's schedule"
                            : "Manage class schedules"}{" "}
                        • {schoolYear}
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {/* <button
            onClick={() => setShowEventModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white rounded-xl hover:shadow-lg transition-all font-medium"
          >
            <Calendar className="w-5 h-5" />
            <span>Create Event</span>
          </button> */}
                    <button
                        onClick={() => handleOpen()}
                        disabled={isArchivedYear}
                        className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-xl hover:shadow-lg transition-all font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <UserPlus className="w-5 h-5" />
                        <span>Create Schedule</span>
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {loadError}
                </div>
            )}
            {loading && (
                <p className="text-sm text-[#8b8476] px-1">
                    Loading schedules…
                </p>
            )}

            {/* Weekly Calendar — Google Calendar-style view of one teacher's individual schedule */}
            {scheduleView === "grid" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-end gap-3 flex-wrap">
                    {/* <h3 className="text-lg font-semibold text-[#1a2b4a]">
                        Calendar
                    </h3> */}
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-[#8b8476]" />
                        <select
                            value={activeTeacherName ?? ""}
                            onChange={(e) =>
                                setCalendarTeacherName(e.target.value)
                            }
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#2c2c2c] focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 bg-white"
                        >
                            {teacherSchedules.length === 0 && (
                                <option value="">
                                    No teachers scheduled yet
                                </option>
                            )}
                            {teacherSchedules.map((t) => (
                                <option key={t.teacher} value={t.teacher}>
                                    {t.teacher}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {!activeSchedule ? (
                    <div className="px-6 py-14 text-center text-sm text-[#8b8476]">
                        No teacher schedules yet. Click "Create Schedule" to add
                        one.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <div style={{ minWidth: "760px" }}>
                            {/* Day header row */}
                            <div
                                className="grid"
                                style={{
                                    gridTemplateColumns: "70px repeat(5, 1fr)",
                                }}
                            >
                                <div className="border-b border-gray-200" />
                                {WEEK_DAYS.map((d) => (
                                    <div
                                        key={d}
                                        className="text-center text-sm font-semibold text-[#1a2b4a] py-2.5 border-b border-l border-gray-200 bg-[#faf8f5]"
                                    >
                                        {d}
                                    </div>
                                ))}
                            </div>
                            {/* Grid body */}
                            <div
                                className="grid"
                                style={{
                                    gridTemplateColumns: "70px repeat(5, 1fr)",
                                }}
                            >
                                <div>
                                    {calendarHours.map((h) => (
                                        <div
                                            key={h}
                                            style={{ height: HOUR_HEIGHT }}
                                            className="text-[11px] text-[#8b8476] text-right pr-2 pt-0.5 border-t border-gray-100"
                                        >
                                            {formatHourLabel(h)}
                                        </div>
                                    ))}
                                </div>
                                {WEEK_DAYS.map((day) => (
                                    <div
                                        key={day}
                                        className="relative border-l border-gray-200"
                                    >
                                        {calendarHours.map((h) => (
                                            <div
                                                key={h}
                                                style={{ height: HOUR_HEIGHT }}
                                                className="border-t border-gray-100"
                                            />
                                        ))}
                                        {blocksForDay(day).map(
                                            ({ slot, top, height }) => (
                                                <div
                                                    key={slot.id}
                                                    className="absolute left-1 right-1 rounded-lg px-2 py-1 overflow-hidden text-white shadow-sm"
                                                    style={{
                                                        top,
                                                        height,
                                                        backgroundColor:
                                                            colorForSubject(
                                                                slot.subject,
                                                            ),
                                                    }}
                                                    title={`${slot.subject} • ${formatTime12(slot.startTime)} – ${formatTime12(slot.endTime)}${slot.room ? " • " + slot.room : ""}`}
                                                >
                                                    <p className="text-[11px] font-semibold truncate leading-tight">
                                                        {slot.subject}
                                                    </p>
                                                    <p className="text-[10px] opacity-90 truncate leading-tight">
                                                        {formatTime12(
                                                            slot.startTime,
                                                        )}{" "}
                                                        –{" "}
                                                        {formatTime12(
                                                            slot.endTime,
                                                        )}
                                                    </p>
                                                    {slot.room && (
                                                        <p className="text-[10px] opacity-80 truncate leading-tight">
                                                            {slot.room}
                                                        </p>
                                                    )}
                                                </div>
                                            ),
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            )}

            {/* Teacher Schedules — manage each teacher's individually-created schedule */}
            {scheduleView === "list" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-[#1a2b4a]">
                        Teacher Schedules
                    </h3>
                </div> */}
                <div className="divide-y divide-gray-200">
                    {teacherSchedules.length === 0 ? (
                        <div className="px-6 py-10 text-center text-sm text-[#8b8476]">
                            No schedules created yet.
                        </div>
                    ) : (
                        teacherSchedules.map((t) => (
                            <div
                                key={t.teacher}
                                className="px-6 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                            >
                                <div className="flex-1">
                                    <p className="font-semibold text-[#1a2b4a]">
                                        {t.teacher}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {t.slots.map((s) => (
                                            <span
                                                key={s.id}
                                                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-[#faf8f5] border border-gray-200 text-[#2c2c2c]"
                                            >
                                                <span
                                                    className="w-2 h-2 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            colorForSubject(
                                                                s.subject,
                                                            ),
                                                    }}
                                                />
                                                <span className="font-medium">
                                                    {s.subject}
                                                </span>
                                                <span className="text-[#8b8476]">
                                                    •{" "}
                                                    {s.classSectionKey.replace(
                                                        "::",
                                                        " - ",
                                                    )}{" "}
                                                    • {s.days.join("/")} •{" "}
                                                    {formatTime12(s.startTime)}–
                                                    {formatTime12(s.endTime)}
                                                    {s.room
                                                        ? ` • ${s.room}`
                                                        : ""}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => {
                                            setCalendarTeacherName(t.teacher);
                                            onViewCalendar?.();
                                        }}
                                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                        title="View on Calendar"
                                    >
                                        <Calendar className="w-4 h-4 text-[#8b8476]" />
                                    </button>
                                    <button
                                        onClick={() => handleOpen(t)}
                                        disabled={isArchivedYear}
                                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        title="Edit"
                                    >
                                        <Edit className="w-4 h-4 text-[#8b8476]" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(t.teacher)}
                                        disabled={isArchivedYear}
                                        className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4 text-red-400" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
            )}

            {/* Events List */}
            {/* <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-[#1a2b4a]">Upcoming School Events</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {events.map(ev => (
            <div key={ev.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#faf8f5] transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[#c9a961]/10 rounded-lg flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5 text-[#c9a961]" />
                </div>
                <div>
                  <p className="font-semibold text-[#1a2b4a]">{ev.title}</p>
                  <p className="text-sm text-[#6b6456]">{ev.type} • {ev.date} • {ev.location}</p>
                  <p className="text-xs text-[#8b8476] mt-0.5">Audience: {ev.audience}</p>
                </div>
              </div>
              <button onClick={() => handleDeleteEvent(ev.id)} className="p-2 hover:bg-red-50 rounded-lg transition-colors self-start sm:self-center" title="Remove">
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </div>
          ))}
          {events.length === 0 && (
            <div className="px-6 py-10 text-center text-[#8b8476] text-sm">No events scheduled yet.</div>
          )}
        </div>
      </div> */}

            {/* Create Event Modal */}
            {showEventModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Calendar className="w-6 h-6" />
                                <h3 className="text-xl font-semibold">
                                    Create School Event
                                </h3>
                            </div>
                            <button
                                onClick={() => setShowEventModal(false)}
                                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                    Event Title{" "}
                                    <span className="text-red-400">*</span>
                                </label>
                                <input
                                    value={eventForm.title}
                                    onChange={(e) =>
                                        setEventForm((f) => ({
                                            ...f,
                                            title: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. School Mass"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                    Event Type{" "}
                                    <span className="text-red-400">*</span>
                                </label>
                                <select
                                    value={eventForm.type}
                                    onChange={(e) =>
                                        setEventForm((f) => ({
                                            ...f,
                                            type: e.target.value,
                                        }))
                                    }
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
                                >
                                    <option value="">Select type</option>
                                    <option>Academic</option>
                                    <option>Religious/Spiritual</option>
                                    <option>Sports & Athletics</option>
                                    <option>Cultural</option>
                                    <option>Parent Meeting</option>
                                    <option>Holiday/Break</option>
                                    <option>Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                    Date <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={eventForm.date}
                                    onChange={(e) =>
                                        setEventForm((f) => ({
                                            ...f,
                                            date: e.target.value,
                                        }))
                                    }
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                    Location{" "}
                                    <span className="text-red-400">*</span>
                                </label>
                                <input
                                    value={eventForm.location}
                                    onChange={(e) =>
                                        setEventForm((f) => ({
                                            ...f,
                                            location: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. Chapel, Gymnasium"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                    Target Audience
                                </label>
                                <select
                                    value={eventForm.audience}
                                    onChange={(e) =>
                                        setEventForm((f) => ({
                                            ...f,
                                            audience: e.target.value,
                                        }))
                                    }
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
                                >
                                    <option>All Grades</option>
                                    <option>Grade 1</option>
                                    <option>Grade 2</option>
                                    <option>Grade 3</option>
                                    <option>Grade 4</option>
                                    <option>Grade 5</option>
                                    <option>Grade 6</option>
                                    <option>All Parents</option>
                                    <option>All Faculty & Staff</option>
                                </select>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-200 flex gap-3">
                            <button
                                onClick={handleSaveEvent}
                                className="flex-1 px-6 py-3 bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white rounded-xl font-medium hover:shadow-lg transition-all"
                            >
                                Create Event
                            </button>
                            <button
                                onClick={() => setShowEventModal(false)}
                                className="flex-1 px-6 py-3 border-2 border-gray-200 text-[#2c2c2c] rounded-xl font-medium hover:border-[#c9a961] transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
