import { useState, useEffect } from "react";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import {
    Search,
    Download,
    AlertCircle,
    Edit,
    Eye,
    Printer,
    ArrowLeft,
} from "lucide-react";
import { supabase } from "../../supabase";
import {
    getSchoolSettings,
    type SchoolSettings,
} from "../../lib/schoolSettings";
import {
    getSchoolLogoDataUrl,
    imageFormatFromDataUrl,
} from "../../lib/pdfImages";

// --- Transcript of Records PDF export helpers --------------------------------

type TorSubjectGrade = {
    subject: string;
    q1: number | null;
    q2: number | null;
    q3: number | null;
    q4: number | null;
    grade: number | null;
};
type TorYearRecord = {
    schoolYear: string;
    gradeLevel: string;
    subjects: TorSubjectGrade[];
};
type TorStudent = {
    id: string;
    name: string;
    birthdate: string;
    address: string;
    guardianName: string;
    currentGrade: string;
    currentSection: string;
};

const TOR_NAVY: [number, number, number] = [26, 43, 74];

function buildTorPdf(
    doc: jsPDF,
    student: TorStudent,
    history: TorYearRecord[],
    logoDataUrl: string,
    schoolInfo: SchoolSettings,
) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let y = 15;

    const logoSize = 20;
    doc.addImage(
        logoDataUrl,
        imageFormatFromDataUrl(logoDataUrl),
        margin,
        y,
        logoSize,
        logoSize,
    );

    doc.setTextColor(...TOR_NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(schoolInfo.school_name.toUpperCase(), pageWidth / 2, y + 6, {
        align: "center",
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    if (schoolInfo.school_address)
        doc.text(schoolInfo.school_address, pageWidth / 2, y + 12, {
            align: "center",
        });
    const contactLine = [schoolInfo.contact_phone, schoolInfo.contact_email]
        .filter(Boolean)
        .join("   •   ");
    if (contactLine)
        doc.text(contactLine, pageWidth / 2, y + 17, { align: "center" });

    y += logoSize + 6;
    doc.setDrawColor(...TOR_NAVY);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...TOR_NAVY);
    doc.text("TRANSCRIPT OF RECORDS", pageWidth / 2, y, { align: "center" });
    y += 10;

    const infoLeftX = margin;
    const infoRightX = pageWidth / 2 + 5;
    const infoRow = (label: string, value: string, x: number, rowY: number) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120, 115, 105);
        doc.text(label.toUpperCase(), x, rowY);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(44, 44, 44);
        doc.text(value || "—", x, rowY + 4.5, {
            maxWidth: pageWidth / 2 - margin - 5,
        });
    };
    infoRow("Student Name", student.name, infoLeftX, y);
    infoRow("Student No.", student.id, infoRightX, y);
    y += 12;
    infoRow("Date of Birth", student.birthdate || "—", infoLeftX, y);
    infoRow(
        "Current Grade & Section",
        `${student.currentGrade} — ${student.currentSection}`,
        infoRightX,
        y,
    );
    y += 12;
    infoRow("Address", student.address || "—", infoLeftX, y);
    infoRow("Parent/Guardian", student.guardianName || "—", infoRightX, y);
    y += 14;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    history.forEach((yr) => {
        if (y > pageHeight - 40) {
            doc.addPage();
            y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...TOR_NAVY);
        doc.text(`${yr.gradeLevel}   •   S.Y. ${yr.schoolYear}`, margin, y);
        y += 4;

        autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [["Subject", "Q1", "Q2", "Q3", "Q4", "Final"]],
            body: yr.subjects.length
                ? yr.subjects.map((s) => [
                      s.subject,
                      s.q1 ?? "—",
                      s.q2 ?? "—",
                      s.q3 ?? "—",
                      s.q4 ?? "—",
                      s.grade ?? "—",
                  ])
                : [["No grades recorded yet.", "", "", "", "", ""]],
            styles: { fontSize: 8.5, cellPadding: 2, textColor: [44, 44, 44] },
            headStyles: {
                fillColor: TOR_NAVY,
                textColor: [255, 255, 255],
                fontStyle: "bold",
            },
            columnStyles: {
                1: { halign: "right", cellWidth: 16 },
                2: { halign: "right", cellWidth: 16 },
                3: { halign: "right", cellWidth: 16 },
                4: { halign: "right", cellWidth: 16 },
                5: { halign: "right", cellWidth: 18, fontStyle: "bold" },
            },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
    });

    const finalGrades = history
        .flatMap((yr) => yr.subjects.map((s) => s.grade))
        .filter((g): g is number => g !== null);
    const finalGPA = finalGrades.length
        ? finalGrades.reduce((a, b) => a + b, 0) / finalGrades.length
        : null;

    if (y > pageHeight - 50) {
        doc.addPage();
        y = 20;
    }
    doc.setDrawColor(...TOR_NAVY);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, pageWidth - margin * 2, 12, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TOR_NAVY);
    doc.text("FINAL GPA (GENERAL AVERAGE)", margin + 4, y + 7.5);
    doc.text(
        finalGPA !== null ? finalGPA.toFixed(2) : "—",
        pageWidth - margin - 4,
        y + 7.5,
        { align: "right" },
    );
    y += 24;

    const sigY = Math.max(y, pageHeight - 35);
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.2);
    doc.line(margin, sigY, margin + 60, sigY);
    doc.line(pageWidth - margin - 60, sigY, pageWidth - margin, sigY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text("Prepared By", margin, sigY + 5);
    doc.text("School Registrar", pageWidth - margin, sigY + 5, {
        align: "right",
    });
    doc.setFontSize(7);
    doc.text(
        `Generated on ${new Date().toLocaleDateString()}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" },
    );
}

// Grade Records (Transcript of Records) Section (Registrar)
export function GradeRecordsSection({ schoolYear }: { schoolYear: string }) {
    type SubjectGrade = {
        subject: string;
        q1: number | null;
        q2: number | null;
        q3: number | null;
        q4: number | null;
        grade: number | null;
    };
    type YearRecord = {
        schoolYear: string;
        gradeLevel: string;
        subjects: SubjectGrade[];
    };
    type TORStudent = {
        id: string;
        name: string;
        firstName: string;
        middleName: string;
        lastName: string;
        suffix: string;
        birthdate: string;
        address: string;
        guardianName: string;
        currentGrade: string;
        currentSection: string;
    };

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

    const [students, setStudents] = useState<TORStudent[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<TORStudent | null>(null);
    const [history, setHistory] = useState<YearRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({
        birthdate: "",
        address: "",
        guardianName: "",
    });
    const [torGenerating, setTorGenerating] = useState<"print" | "download" | null>(null);
    const [torError, setTorError] = useState<string | null>(null);

    const generateTorPdf = async () => {
        if (!selected) return null;
        const [logoDataUrl, schoolInfo] = await Promise.all([
            getSchoolLogoDataUrl(),
            getSchoolSettings(),
        ]);
        const doc = new jsPDF({ unit: "mm", format: "a4" });
        buildTorPdf(doc, selected, history, logoDataUrl, schoolInfo);
        return doc;
    };

    const handlePrintTor = async () => {
        if (!selected || torGenerating) return;
        setTorGenerating("print");
        setTorError(null);
        try {
            const doc = await generateTorPdf();
            if (!doc) return;
            doc.autoPrint();
            window.open(doc.output("bloburl"), "_blank");
        } catch (e) {
            setTorError(
                "Failed to prepare the Transcript of Records for printing. Please try again.",
            );
        } finally {
            setTorGenerating(null);
        }
    };

    const handleDownloadTor = async () => {
        if (!selected || torGenerating) return;
        setTorGenerating("download");
        setTorError(null);
        try {
            const doc = await generateTorPdf();
            if (!doc) return;
            doc.save(
                `TOR_${selected.id}_${selected.name.replace(/\s+/g, "_")}.pdf`,
            );
        } catch (e) {
            setTorError(
                "Failed to generate the Transcript of Records PDF. Please try again.",
            );
        } finally {
            setTorGenerating(null);
        }
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from("students")
                .select(
                    "id, first_name, middle_name, last_name, suffix, date_of_birth, home_address, guardian_name, grade_level, section",
                )
                .order("last_name");
            if (cancelled) return;
            if (error) {
                console.error("Failed to load students", error);
                setStudents([]);
            } else {
                setStudents(
                    (data ?? []).map((s: any) => ({
                        id: s.id,
                        name: [s.first_name, s.middle_name, s.last_name]
                            .filter(Boolean)
                            .join(" "),
                        firstName: s.first_name ?? "",
                        middleName: s.middle_name ?? "",
                        lastName: s.last_name ?? "",
                        suffix: s.suffix ?? "",
                        birthdate: s.date_of_birth ?? "",
                        address: s.home_address ?? "",
                        guardianName: s.guardian_name ?? "",
                        currentGrade: s.grade_level ?? "",
                        currentSection: s.section ?? "",
                    })),
                );
            }
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!selected) {
            setHistory([]);
            return;
        }
        let cancelled = false;
        (async () => {
            setHistoryLoading(true);
            const { data: enrollments, error: enrError } = await supabase
                .from("enrollments")
                .select("grade_level, school_years(id, label, start_date)")
                .eq("student_id", selected.id)
                .eq("status", "confirmed");

            const { data: grades, error: gradeError } = await supabase
                .from("grades")
                .select(
                    "school_year_id, q1, q2, q3, q4, final_grade, class_section_subjects(subjects(name))",
                )
                .eq("student_id", selected.id);

            if (cancelled) return;
            if (enrError)
                console.error("Failed to load enrollment history", enrError);
            if (gradeError)
                console.error("Failed to load grade history", gradeError);

            const years = (enrollments ?? [])
                .map((e: any) => ({
                    yearId: e.school_years?.id ?? e.school_years?.[0]?.id,
                    label:
                        e.school_years?.label ??
                        e.school_years?.[0]?.label ??
                        "Unknown Year",
                    startDate:
                        e.school_years?.start_date ??
                        e.school_years?.[0]?.start_date ??
                        "",
                    gradeLevel: e.grade_level,
                }))
                .sort((a: any, b: any) =>
                    (a.startDate || "").localeCompare(b.startDate || ""),
                );

            const built: YearRecord[] = years.map((yr: any) => {
                const subjects: SubjectGrade[] = (grades ?? [])
                    .filter((g: any) => g.school_year_id === yr.yearId)
                    .map((g: any) => ({
                        subject:
                            g.class_section_subjects?.subjects?.name ??
                            g.class_section_subjects?.[0]?.subjects?.[0]
                                ?.name ??
                            g.class_section_subjects?.[0]?.subjects?.name ??
                            "Subject",
                        q1: g.q1 != null ? Number(g.q1) : null,
                        q2: g.q2 != null ? Number(g.q2) : null,
                        q3: g.q3 != null ? Number(g.q3) : null,
                        q4: g.q4 != null ? Number(g.q4) : null,
                        grade:
                            g.final_grade != null
                                ? Number(g.final_grade)
                                : null,
                    }))
                    .sort((a: SubjectGrade, b: SubjectGrade) =>
                        a.subject.localeCompare(b.subject),
                    );
                return {
                    schoolYear: yr.label,
                    gradeLevel: yr.gradeLevel,
                    subjects,
                };
            });

            setHistory(built);
            setHistoryLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [selected]);

    const results = students
        .filter(
            (s) =>
                !search ||
                familyName(s.name)
                    .toLowerCase()
                    .includes(search.toLowerCase()) ||
                s.id.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => familyName(a.name).localeCompare(familyName(b.name)));

    const openEdit = () => {
        if (!selected) return;
        setEditForm({
            birthdate: selected.birthdate,
            address: selected.address,
            guardianName: selected.guardianName,
        });
        setShowEditModal(true);
    };

    const saveEdit = async () => {
        if (!selected) return;
        const { error } = await supabase
            .from("students")
            .update({
                date_of_birth: editForm.birthdate || null,
                home_address: editForm.address,
                guardian_name: editForm.guardianName,
            })
            .eq("id", selected.id);
        if (error) {
            console.error("Failed to save student info", error);
            return;
        }
        const updated = { ...selected, ...editForm };
        setStudents((prev) =>
            prev.map((s) => (s.id === selected.id ? updated : s)),
        );
        setSelected(updated);
        setShowEditModal(false);
    };

    // Edit Student Info page (grades are never editable here)
    if (selected && showEditModal) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => setShowEditModal(false)}
                    className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] font-medium"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Transcript of Records</span>
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        Edit Student Info
                    </h1>
                    <p className="text-[#6b6456]">
                        Update the personal details printed on{" "}
                        {selected.name}'s Transcript of Records.
                    </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4 w-full">
                    {/* Row 1: name breakdown (read only) */}
                    <div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {[
                                { label: "Last Name", value: selected.lastName },
                                { label: "First Name", value: selected.firstName },
                                {
                                    label: "Middle Initial",
                                    value: selected.middleName
                                        ? `${selected.middleName.trim().charAt(0).toUpperCase()}.`
                                        : "",
                                },
                                { label: "Suffix", value: selected.suffix },
                            ].map((field) => (
                                <div key={field.label}>
                                    <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                        {field.label}
                                    </label>
                                    <input
                                        value={field.value || "—"}
                                        disabled
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-[#8b8476]"
                                    />
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-[#8b8476] mt-1">
                            Edit the student's name from Student Management.
                        </p>
                    </div>
                    {/* Row 2: birthdate and address */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-[#6b6456] mb-1">
                            Birthdate
                        </label>
                        <input
                            type="date"
                            value={editForm.birthdate}
                            onChange={(e) =>
                                setEditForm((f) => ({
                                    ...f,
                                    birthdate: e.target.value,
                                }))
                            }
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 text-black"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-[#6b6456] mb-1">
                            Address
                        </label>
                        <input
                            value={editForm.address}
                            onChange={(e) =>
                                setEditForm((f) => ({
                                    ...f,
                                    address: e.target.value,
                                }))
                            }
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 text-black"
                        />
                    </div>
                    </div>
                    {/* Row 3: guardian name */}
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-[#6b6456] mb-1">
                            Guardian Name
                        </label>
                        <input
                            value={editForm.guardianName}
                            onChange={(e) =>
                                setEditForm((f) => ({
                                    ...f,
                                    guardianName: e.target.value,
                                }))
                            }
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 text-black"
                        />
                    </div>
                    <p className="text-xs text-[#8b8476] italic">
                        Subject grades cannot be modified from here.
                    </p>
                    <div className="flex gap-3 pt-2 border-t border-gray-200">
                        <button
                            onClick={() => setShowEditModal(false)}
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={saveEdit}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white rounded-lg font-medium hover:shadow-lg transition-all"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (selected) {
        return (
                <div className="space-y-6">
                    <button
                        onClick={() => {
                            setShowEditModal(false);
                            setSelected(null);
                        }}
                        className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] font-medium"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span>Back to Grade Records</span>
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                            Transcript of Records
                        </h1>
                        <p className="text-[#6b6456]">
                            Preview the student's grade history before printing
                            or downloading the TOR.
                        </p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-200">
                                <div>
                                    <p className="text-xs text-[#8b8476]">
                                        Full Name
                                    </p>
                                    <p className="font-semibold text-[#1a2b4a]">
                                        {selected.name}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#8b8476]">
                                        Student ID
                                    </p>
                                    <p className="font-mono text-sm text-[#2c2c2c]">
                                        {selected.id}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#8b8476]">
                                        Birthdate
                                    </p>
                                    <p className="text-sm text-[#2c2c2c]">
                                        {selected.birthdate
                                            ? new Date(
                                                  selected.birthdate,
                                              ).toLocaleDateString("en-US", {
                                                  year: "numeric",
                                                  month: "long",
                                                  day: "numeric",
                                              })
                                            : "—"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#8b8476]">
                                        Address
                                    </p>
                                    <p className="text-sm text-[#2c2c2c]">
                                        {selected.address}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#8b8476]">
                                        Guardian
                                    </p>
                                    <p className="text-sm text-[#2c2c2c]">
                                        {selected.guardianName}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#8b8476]">
                                        Current Grade & Section
                                    </p>
                                    <p className="text-sm text-[#2c2c2c]">
                                        {selected.currentGrade} —{" "}
                                        {selected.currentSection}
                                    </p>
                                </div>
                            </div>

                            {/* Grade history — read only */}
                            <div className="space-y-4">
                                {historyLoading ? (
                                    <p className="text-sm text-[#8b8476] text-center py-4">
                                        Loading grade history...
                                    </p>
                                ) : history.length === 0 ? (
                                    <p className="text-sm text-[#8b8476] text-center py-4">
                                        No confirmed enrollment history found
                                        for this student.
                                    </p>
                                ) : (
                                    history.map((yr, i) => (
                                        <div
                                            key={i}
                                            className="border border-gray-200 rounded-lg overflow-hidden"
                                        >
                                            <div className="bg-[#faf8f5] px-4 py-2 flex items-center justify-between">
                                                <p className="text-sm font-semibold text-[#1a2b4a]">
                                                    {yr.gradeLevel} • S.Y.{" "}
                                                    {yr.schoolYear}
                                                </p>
                                            </div>
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="border-b border-gray-100">
                                                        <th className="px-4 py-1.5 text-left text-[10px] font-semibold text-[#8b8476] uppercase tracking-wide">
                                                            Subject
                                                        </th>
                                                        <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-[#8b8476] uppercase tracking-wide w-14">
                                                            Q1
                                                        </th>
                                                        <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-[#8b8476] uppercase tracking-wide w-14">
                                                            Q2
                                                        </th>
                                                        <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-[#8b8476] uppercase tracking-wide w-14">
                                                            Q3
                                                        </th>
                                                        <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-[#8b8476] uppercase tracking-wide w-14">
                                                            Q4
                                                        </th>
                                                        <th className="px-4 py-1.5 text-right text-[10px] font-semibold text-[#8b8476] uppercase tracking-wide w-16">
                                                            Final
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {yr.subjects.length ===
                                                    0 ? (
                                                        <tr>
                                                            <td
                                                                className="px-4 py-2 text-sm text-[#8b8476] italic"
                                                                colSpan={6}
                                                            >
                                                                No grades
                                                                recorded yet.
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        yr.subjects.map(
                                                            (sub, j) => (
                                                                <tr key={j}>
                                                                    <td className="px-4 py-2 text-sm text-[#2c2c2c]">
                                                                        {
                                                                            sub.subject
                                                                        }
                                                                    </td>
                                                                    <td className="px-2 py-2 text-sm text-right text-[#6b6456]">
                                                                        {sub.q1 ??
                                                                            "—"}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-sm text-right text-[#6b6456]">
                                                                        {sub.q2 ??
                                                                            "—"}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-sm text-right text-[#6b6456]">
                                                                        {sub.q3 ??
                                                                            "—"}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-sm text-right text-[#6b6456]">
                                                                        {sub.q4 ??
                                                                            "—"}
                                                                    </td>
                                                                    <td className="px-4 py-2 text-sm text-right font-semibold text-[#1a2b4a]">
                                                                        {sub.grade ??
                                                                            "—"}
                                                                    </td>
                                                                </tr>
                                                            ),
                                                        )
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))
                                )}
                                {/* <p className="text-xs text-[#8b8476] italic">Grades shown above are locked and cannot be edited from this section.</p> */}

                                {!historyLoading &&
                                    history.length > 0 &&
                                    (() => {
                                        const finalGrades = history
                                            .flatMap((yr) =>
                                                yr.subjects.map((s) => s.grade),
                                            )
                                            .filter(
                                                (g): g is number => g !== null,
                                            );
                                        const finalGPA =
                                            finalGrades.length > 0
                                                ? finalGrades.reduce(
                                                      (a, b) => a + b,
                                                      0,
                                                  ) / finalGrades.length
                                                : null;
                                        return (
                                            <div className="flex items-center justify-between px-4 py-3 bg-[#1a2b4a]/5 border-2 border-[#1a2b4a]/20 rounded-lg">
                                                <p className="text-sm font-semibold text-[#1a2b4a]">
                                                    Final GPA (General Average)
                                                </p>
                                                <p className="text-lg font-bold text-[#1a2b4a]">
                                                    {finalGPA !== null
                                                        ? finalGPA.toFixed(2)
                                                        : "—"}
                                                </p>
                                            </div>
                                        );
                                    })()}
                            </div>

                            {torError && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                    <AlertCircle className="w-4 h-4 shrink-0" /> {torError}
                                </div>
                            )}
                            <div className="flex gap-3 pt-2 border-t border-gray-200">
                                <button
                                    onClick={openEdit}
                                    className="flex-1 px-4 py-2.5 border-2 border-[#c9a961] text-[#1a2b4a] rounded-lg font-medium hover:bg-[#fdf9f0] transition-all text-sm flex items-center justify-center gap-1.5"
                                >
                                    <Edit className="w-4 h-4" /> Edit Student Info
                                </button>
                                <button
                                    onClick={handlePrintTor}
                                    disabled={torGenerating !== null}
                                    className="flex-1 px-4 py-2.5 border-2 border-gray-200 text-[#6b6456] rounded-lg font-medium hover:bg-[#faf8f5] transition-all text-sm flex items-center justify-center gap-1.5 text-black disabled:opacity-50"
                                >
                                    <Printer className="w-4 h-4" />{" "}
                                    {torGenerating === "print" ? "Preparing…" : "Print"}
                                </button>
                                <button
                                    onClick={handleDownloadTor}
                                    disabled={torGenerating !== null}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                    <Download className="w-4 h-4" />{" "}
                                    {torGenerating === "download" ? "Generating…" : "Download"}
                                </button>
                            </div>
                    </div>
                </div>
        );
    }
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                    Grade Records (TOR)
                </h1>
                <p className="text-[#6b6456]">
                    Look up a student's grade history and prepare Transcript of
                    Records requests • {schoolYear}
                </p>
            </div>

            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8b8476]" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by family name or student ID..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4a4a]/20  text-[15px] text-[#000000]"
                    />
                </div>
            </div>

            {/* Results */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="font-semibold text-[#1a2b4a]">
                        Students{" "}
                        <span className="text-sm font-normal text-[#8b8476]">
                            ({results.length})
                        </span>
                    </h3>
                </div>
                <div className="divide-y divide-gray-200">
                    {loading ? (
                        <div className="px-6 py-10 text-center text-[#8b8476] text-sm">
                            Loading students...
                        </div>
                    ) : results.length === 0 ? (
                        <div className="px-6 py-10 text-center text-[#8b8476] text-sm">
                            No students found.
                        </div>
                    ) : (
                        results.map((s) => (
                            <div
                                key={s.id}
                                className="px-6 py-3 flex items-center justify-between hover:bg-[#faf8f5] transition-colors"
                            >
                                <div>
                                    <p className="text-sm font-medium text-[#2c2c2c]">
                                        {formatFamilyNameFirst(s.name)}
                                    </p>
                                    <p className="text-xs text-[#8b8476] font-mono">
                                        {s.id} • {s.currentGrade} —{" "}
                                        {s.currentSection}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setSelected(s)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-[#6b6456] rounded-lg text-xs font-medium hover:border-[#1a2b4a] hover:bg-white transition-all"
                                >
                                    <Eye className="w-3.5 h-3.5" /> Preview TOR
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
