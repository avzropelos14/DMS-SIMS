import { useState, useEffect } from "react";
import { Search, Eye, ArrowLeft } from "lucide-react";
import { supabase } from "../../supabase";

// Teachers List (Admin, Class Management) — for each teacher, the subjects they're assigned
// to teach this school year and the students enrolled in each of those classes.
export function TeachersListSection({ schoolYear }: { schoolYear: string }) {
    type TeacherRow = { id: string; name: string };
    type StudentRow = { id: string; name: string };
    type SubjectAssignment = {
        id: string;
        subject: string;
        grade: string;
        section: string;
        students: StudentRow[];
    };

    const [teachers, setTeachers] = useState<TeacherRow[]>([]);
    const [loadingTeachers, setLoadingTeachers] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);

    const [assignments, setAssignments] = useState<SubjectAssignment[]>([]);
    const [loadingAssignments, setLoadingAssignments] = useState(false);
    const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
    const [viewStudentsFor, setViewStudentsFor] = useState<SubjectAssignment | null>(null);

    useEffect(() => {
        let active = true;
        setLoadingTeachers(true);
        setLoadError(null);
        supabase
            .from("employees")
            .select("id, full_name")
            .eq("status", "active")
            .eq("position", "Teacher")
            .is("deleted_at", null)
            .order("full_name")
            .then(({ data, error }) => {
                if (!active) return;
                if (error) {
                    setLoadError(error.message);
                } else {
                    setTeachers(
                        (data ?? []).map((t: any) => ({ id: t.id, name: t.full_name })),
                    );
                }
                setLoadingTeachers(false);
            });
        return () => {
            active = false;
        };
    }, []);

    const filteredTeachers = teachers.filter(
        (t) => !search.trim() || t.name.toLowerCase().includes(search.trim().toLowerCase()),
    );

    useEffect(() => {
        if (!selectedTeacherId) {
            setAssignments([]);
            return;
        }
        let active = true;
        setLoadingAssignments(true);
        setAssignmentsError(null);
        (async () => {
            const { data: syRow } = await supabase
                .from("school_years")
                .select("id")
                .eq("label", schoolYear)
                .maybeSingle();
            const syId = syRow?.id ?? null;
            if (!syId) {
                if (active) {
                    setAssignments([]);
                    setLoadingAssignments(false);
                }
                return;
            }

            const { data: assignRows, error: assignError } = await supabase
                .from("class_section_subjects")
                .select(
                    "id, subjects(name), class_sections!inner(grade_level, section_name, school_year_id)",
                )
                .eq("teacher_id", selectedTeacherId)
                .eq("archived", false)
                .eq("class_sections.school_year_id", syId);

            if (!active) return;
            if (assignError) {
                setAssignmentsError(assignError.message);
                setLoadingAssignments(false);
                return;
            }

            const rows = (assignRows ?? []) as any[];
            const grades = Array.from(
                new Set(rows.map((r) => r.class_sections?.grade_level).filter(Boolean)),
            );

            const { data: studentRows, error: studentError } = grades.length
                ? await supabase
                      .from("students")
                      .select(
                          "id, first_name, middle_name, last_name, suffix, grade_level, section, status, school_years!students_school_year_id_fkey!inner(label)",
                      )
                      .eq("status", "Active")
                      .eq("school_years.label", schoolYear)
                      .in("grade_level", grades)
                : { data: [] as any[], error: null };

            if (!active) return;
            if (studentError) {
                setAssignmentsError(studentError.message);
                setLoadingAssignments(false);
                return;
            }

            const studentsFor = (grade: string, section: string): StudentRow[] =>
                (studentRows ?? [])
                    .filter((s: any) => s.grade_level === grade && s.section === section)
                    .map((s: any) => ({
                        id: s.id,
                        name:
                            [s.first_name, s.middle_name, s.last_name]
                                .filter(Boolean)
                                .join(" ") + (s.suffix ? ` ${s.suffix}` : ""),
                    }))
                    .sort((a: StudentRow, b: StudentRow) => a.name.localeCompare(b.name));

            setAssignments(
                rows
                    .map((r) => ({
                        id: r.id,
                        subject: r.subjects?.name || "",
                        grade: r.class_sections?.grade_level || "",
                        section: r.class_sections?.section_name || "",
                        students: studentsFor(
                            r.class_sections?.grade_level || "",
                            r.class_sections?.section_name || "",
                        ),
                    }))
                    .sort(
                        (a, b) =>
                            a.grade.localeCompare(b.grade) ||
                            a.section.localeCompare(b.section) ||
                            a.subject.localeCompare(b.subject),
                    ),
            );
            setLoadingAssignments(false);
        })();
        return () => {
            active = false;
        };
    }, [selectedTeacherId, schoolYear]);

    const selectedTeacher = teachers.find((t) => t.id === selectedTeacherId) || null;

    if (selectedTeacher) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => {
                        setSelectedTeacherId(null);
                        setViewStudentsFor(null);
                    }}
                    className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] font-medium"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Teachers List</span>
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        {selectedTeacher.name}
                    </h1>
                    <p className="text-[#6b6456]">
                        Subjects assigned to this teacher and the students
                        enrolled in each class • {schoolYear}
                    </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="divide-y divide-gray-200">
                        {loadingAssignments ? (
                            <p className="px-6 py-8 text-center text-sm text-[#8b8476]">
                                Loading assignments…
                            </p>
                        ) : assignmentsError ? (
                            <p className="px-6 py-8 text-center text-sm text-red-500">
                                {assignmentsError}
                            </p>
                        ) : assignments.length === 0 ? (
                            <p className="px-6 py-8 text-center text-sm text-[#8b8476]">
                                This teacher isn't assigned to any subjects
                                this school year.
                            </p>
                        ) : (
                            assignments.map((a) => {
                                const expanded = viewStudentsFor?.id === a.id;
                                return (
                                    <div key={a.id} className="px-6 py-4">
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-medium text-[#2c2c2c]">
                                                    {a.subject}
                                                </span>
                                                <span className="text-sm text-[#8b8476]">
                                                    {a.grade} — {a.section}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() =>
                                                    setViewStudentsFor(
                                                        expanded ? null : a,
                                                    )
                                                }
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 border-gray-200 text-[#1a2b4a] hover:border-[#1a2b4a]/30 transition-all shrink-0"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                                {expanded
                                                    ? "Hide Students"
                                                    : `View Students (${a.students.length})`}
                                            </button>
                                        </div>
                                        {expanded && (
                                            <div className="mt-3 bg-[#faf8f5] border border-gray-200 rounded-lg p-4">
                                                {a.students.length === 0 ? (
                                                    <p className="text-sm text-[#8b8476] italic">
                                                        No students enrolled
                                                        in this class yet.
                                                    </p>
                                                ) : (
                                                    <ul className="divide-y divide-gray-200">
                                                        {a.students.map(
                                                            (s) => (
                                                                <li
                                                                    key={s.id}
                                                                    className="text-sm text-[#2c2c2c] py-2"
                                                                >
                                                                    {s.name}
                                                                </li>
                                                            ),
                                                        )}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">Teachers List</h1>
                <p className="text-[#6b6456]">
                    See every subject a teacher is assigned to and the students in each class •{" "}
                    {schoolYear}
                </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search teachers..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 focus:border-transparent"
                        />
                    </div>
                </div>
                <div className="divide-y divide-gray-200 max-h-[32rem] overflow-y-auto">
                    {loadingTeachers ? (
                        <p className="px-4 py-8 text-center text-sm text-[#8b8476]">
                            Loading teachers…
                        </p>
                    ) : loadError ? (
                        <p className="px-4 py-8 text-center text-sm text-red-500">
                            {loadError}
                        </p>
                    ) : filteredTeachers.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-[#8b8476]">
                            No teachers found.
                        </p>
                    ) : (
                        filteredTeachers.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setSelectedTeacherId(t.id)}
                                className="w-full text-left px-4 py-3 text-sm transition-colors hover:bg-[#faf8f5] text-[#2c2c2c]"
                            >
                                {t.name}
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
