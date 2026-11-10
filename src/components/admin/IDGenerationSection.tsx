import { useState, useRef, useEffect } from "react";
import schoolLogo from "../assets/dmgteLogo.jpg";
import { jsPDF } from "jspdf";
import {
    Search,
    Filter,
    AlertCircle,
    Edit,
    Eye,
    X,
    Printer,
    User,
    Plus,
    ArrowLeft,
} from "lucide-react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { supabase } from "../../supabase";
import { getSchoolYearByLabel } from "../../lib/schoolYear";
import {
    getSchoolSettings,
    DEFAULT_SCHOOL_SETTINGS,
    type SchoolSettings,
} from "../../lib/schoolSettings";
import {
    getSchoolLogoDataUrl,
    imageFormatFromDataUrl,
} from "../../lib/pdfImages";
import {
    syncEnrollmentGradeSection,
    splitStudentName,
} from "../../lib/students";

// --- ID Card PDF export helpers ---------------------------------------------

const ID_CARD_PAGE: [number, number] = [60, 80]; // mm, matches the on-screen 3:4 card
const ID_GREEN: [number, number, number] = [26, 107, 69];
const ID_NAVY: [number, number, number] = [26, 43, 74];
const ID_GRAY: [number, number, number] = [107, 100, 86];

type IDCardPerson = {
    id: string;
    name: string;
    displayName: string;
    cardName: string;
    grade: string;
    section: string;
    photo?: string;
    dob?: string;
    address?: string;
    guardianName?: string;
    emergencyContact?: string;
};

function drawIdCardFront(
    doc: jsPDF,
    student: IDCardPerson,
    schoolYear: string,
    logoDataUrl: string,
    schoolInfo: SchoolSettings,
) {
    const [w, h] = ID_CARD_PAGE;
    doc.setFillColor(...ID_GREEN);
    doc.rect(0, 0, w, 3, "F");

    const logoSize = 13;
    doc.addImage(logoDataUrl, "PNG", (w - logoSize) / 2, 6, logoSize, logoSize);

    doc.setTextColor(...ID_GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(schoolInfo.school_name.toUpperCase(), w / 2, 22.5, { align: "center" });
    doc.setFontSize(4.5);
    doc.text("STUDENT IDENTIFICATION CARD", w / 2, 25.5, { align: "center" });

    doc.setDrawColor(...ID_GREEN);
    doc.setLineWidth(0.15);
    doc.line(6, 28, w - 6, 28);

    const photoW = 16,
        photoH = 20,
        photoX = (w - photoW) / 2,
        photoY = 31;
    doc.setDrawColor(...ID_GREEN);
    doc.setLineWidth(0.5);
    doc.setFillColor(244, 250, 246);
    doc.rect(photoX, photoY, photoW, photoH, "FD");
    if (student.photo) {
        try {
            doc.addImage(
                student.photo,
                imageFormatFromDataUrl(student.photo),
                photoX,
                photoY,
                photoW,
                photoH,
            );
        } catch {
            /* unreadable photo, skip */
        }
    }

    doc.setTextColor(...ID_GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(student.cardName.toUpperCase(), w / 2, photoY + photoH + 6, {
        align: "center",
    });

    const rowsTop = h - 15;
    doc.setDrawColor(...ID_GREEN);
    doc.setLineWidth(0.15);
    doc.line(6, rowsTop, w - 6, rowsTop);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...ID_GRAY);
    doc.text("Student No.", 6, rowsTop + 3.2);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...ID_GREEN);
    doc.text(student.id, w - 6, rowsTop + 3.2, { align: "right" });

    doc.setDrawColor(...ID_GREEN);
    doc.line(6, rowsTop + 5, w - 6, rowsTop + 5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...ID_GRAY);
    doc.text("Grade", 6, rowsTop + 8.2);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...ID_GREEN);
    doc.text(student.grade, w - 6, rowsTop + 8.2, { align: "right" });

    doc.setFillColor(...ID_GREEN);
    doc.rect(0, h - 6, w, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(`SCHOOL YEAR ${schoolYear}`, w / 2, h - 2.3, { align: "center" });
}

function drawIdCardBack(
    doc: jsPDF,
    student: IDCardPerson,
    schoolYear: string,
    qrDataUrl: string,
    schoolInfo: SchoolSettings,
) {
    const [w, h] = ID_CARD_PAGE;
    doc.setFillColor(...ID_GREEN);
    doc.rect(0, 0, w, 3, "F");

    doc.setTextColor(...ID_GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("STUDENT & EMERGENCY", w / 2, 8, { align: "center" });
    doc.text("INFORMATION", w / 2, 11, { align: "center" });

    // Every element below is positioned from a running cursor (never a hardcoded
    // absolute offset) so the blocks can never overlap regardless of font metrics.
    const fields: [string, string][] = [
        ["Date of Birth", student.dob || "—"],
        ["Address", student.address || "—"],
        ["Parent / Guardian", student.guardianName || "—"],
        ["Emergency Contact", student.emergencyContact || "—"],
    ];
    const rowH = 6.75;
    let y = 15;
    fields.forEach(([label, value]) => {
        doc.setDrawColor(...ID_GREEN);
        doc.setLineWidth(0.12);
        doc.line(6, y, w - 6, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(4.5);
        doc.setTextColor(...ID_GRAY);
        doc.text(label.toUpperCase(), 6, y + 2.2);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(...ID_NAVY);
        doc.text(value, 6, y + 5.2, { maxWidth: w - 12 });
        y += rowH;
    });

    doc.setDrawColor(...ID_GREEN);
    doc.setLineWidth(0.15);
    doc.line(6, y, w - 6, y);
    y += 2;

    const qrTop = y;
    const qrSize = 12;
    doc.setDrawColor(...ID_GREEN);
    doc.setLineWidth(0.3);
    doc.rect(6, qrTop, qrSize, qrSize, "S");
    if (qrDataUrl) {
        try {
            doc.addImage(
                qrDataUrl,
                "PNG",
                6.5,
                qrTop + 0.5,
                qrSize - 1,
                qrSize - 1,
            );
        } catch {
            /* skip if unavailable */
        }
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.2);
    doc.setTextColor(...ID_GREEN);
    doc.text(student.id, 6 + qrSize / 2, qrTop + qrSize + 2.3, {
        align: "center",
    });

    const sigX1 = 22,
        sigX2 = w - 6;
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.15);
    doc.line(sigX1, qrTop + 4, sigX2, qrTop + 4);
    doc.setFontSize(4.2);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...ID_NAVY);
    doc.text("STUDENT SIGNATURE", (sigX1 + sigX2) / 2, qrTop + 5.8, {
        align: "center",
    });

    doc.line(sigX1, qrTop + 8.5, sigX2, qrTop + 8.5);
    doc.text("AUTHORIZED SCHOOL SIGNATURE", (sigX1 + sigX2) / 2, qrTop + 10.3, {
        align: "center",
    });

    y = Math.max(qrTop + qrSize + 2.3, qrTop + 10.3) + 2.5;

    doc.setDrawColor(...ID_GREEN);
    doc.setLineWidth(0.15);
    doc.line(6, y, w - 6, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.2);
    doc.setTextColor(...ID_NAVY);
    doc.text(schoolInfo.school_address || "—", w / 2, y + 2.6, {
        align: "center",
    });
    doc.setFont("helvetica", "normal");
    doc.text(schoolInfo.contact_phone || "", w / 2, y + 4.9, { align: "center" });
    doc.setFontSize(3.8);
    doc.setTextColor(...ID_GRAY);
    const disclaimer = doc.splitTextToSize(
        `This card is non-transferable and remains the property of ${schoolInfo.school_name.toUpperCase()}. If found, please return it to the school.`,
        w - 14,
    );
    doc.text(disclaimer, w / 2, y + 7.4, {
        align: "center",
        lineHeightFactor: 1.35,
    });

    doc.setFillColor(...ID_GREEN);
    doc.rect(0, h - 6, w, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(`VALID FOR S.Y. ${schoolYear}`, w / 2, h - 2.3, {
        align: "center",
    });
}

// ID Generation Section
// ID Generation Section
export function IDGenerationSection({ schoolYear }: { schoolYear: string }) {
    const [schoolInfo, setSchoolInfo] = useState<SchoolSettings>(DEFAULT_SCHOOL_SETTINGS);
    useEffect(() => {
        let cancelled = false;
        getSchoolSettings().then((settings) => {
            if (!cancelled) setSchoolInfo(settings);
        });
        return () => { cancelled = true; };
    }, []);

    type IDStudent = {
        id: string;
        name: string;
        displayName: string;
        cardName: string;
        grade: string;
        section: string;
        idPrinted: boolean;
        idIssued: string | null;
        photo?: string;
        dob?: string;
        dobRaw?: string;
        address?: string;
        guardianName?: string;
        emergencyContact?: string;
    };

    const GRADE_LEVELS = [
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
    const gradeOrder = GRADE_LEVELS.filter((g) => g !== "All");

    const [idStudents, setIdStudents] = useState<IDStudent[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [schoolYearId, setSchoolYearId] = useState<string | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editSaveError, setEditSaveError] = useState<string | null>(null);

    const studentDisplayName = (r: any) =>
        [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ") +
        (r.suffix ? ` ${r.suffix}` : "");
    // "{last_name} {suffix}, {first_name} {middle_name}" — the format shown throughout this section.
    const formatLastNameFirst = (r: any) =>
        `${r.last_name}${r.suffix ? ` ${r.suffix}` : ""}, ${[r.first_name, r.middle_name].filter(Boolean).join(" ")}`;
    // "{first_name} {middle_initial}. {last_name}" — the format printed on the physical ID card.
    const formatCardName = (r: any) =>
        `${r.first_name} ${r.middle_name ? `${r.middle_name.trim().charAt(0)}. ` : ""}${r.last_name}`;
    // guardian_name is stored as "Last, First Middle" (see splitGuardianFullName in EnrollmentSection) —
    // reformat to "{first_name} {middle_initial}. {last_name}" to match the student's card name format.
    const formatGuardianCardName = (fullName?: string | null) => {
        if (!fullName) return fullName || undefined;
        const [lastRaw, restRaw] = fullName.split(",");
        if (restRaw === undefined) return fullName;
        const last = lastRaw.trim();
        const restWords = restRaw.trim().split(/\s+/).filter(Boolean);
        const first = restWords[0] || "";
        const middle = restWords.slice(1).join(" ");
        return `${first}${middle ? ` ${middle.trim().charAt(0)}.` : ""} ${last}`.trim();
    };
    const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });

    const loadStudents = async () => {
        setLoading(true);
        setLoadError(null);
        const { data: syRow } = await supabase
            .from("school_years")
            .select("id")
            .eq("label", schoolYear)
            .maybeSingle();
        const syId = syRow?.id ?? null;
        setSchoolYearId(syId);
        const { data, error } = await supabase
            .from("students")
            .select(
                "id, first_name, middle_name, last_name, suffix, grade_level, section, status, date_of_birth, home_address, guardian_name, guardian_phone, school_years!students_school_year_id_fkey!inner(label), student_id_cards(printed, issued_date, school_year_id)",
            )
            .eq("status", "Active")
            .eq("school_years.label", schoolYear);
        if (error) {
            setLoadError(error.message);
            setLoading(false);
            return;
        }
        setIdStudents(
            (data ?? []).map((r: any) => {
                const card = (r.student_id_cards ?? []).find(
                    (c: any) => c.school_year_id === syId,
                );
                return {
                    id: r.id,
                    name: studentDisplayName(r),
                    displayName: formatLastNameFirst(r),
                    cardName: formatCardName(r),
                    grade: r.grade_level,
                    section: r.section || "",
                    idPrinted: !!card?.printed,
                    idIssued: card?.issued_date
                        ? formatDate(card.issued_date)
                        : null,
                    dob: r.date_of_birth
                        ? formatDate(r.date_of_birth)
                        : undefined,
                    dobRaw: r.date_of_birth || undefined,
                    address: r.home_address || undefined,
                    guardianName: formatGuardianCardName(r.guardian_name),
                    emergencyContact: r.guardian_phone || undefined,
                };
            }),
        );
        setLoading(false);
    };

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

    const [gradeFilter, setGradeFilter] = useState("All");
    const [search, setSearch] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [showEditStudentModal, setShowEditStudentModal] = useState(false);
    const [editingStudent, setEditingStudent] = useState<IDStudent | null>(
        null,
    );
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewStudent, setPreviewStudent] = useState<IDStudent | null>(
        null,
    );
    const [previewSide, setPreviewSide] = useState<"front" | "back">("front");

    // Photos aren't backed by a database column or storage bucket yet, so uploads
    // stay in local component state only — they don't survive a page reload.
    const handlePhotoUpload = (file: File | null) => {
        if (!file || !previewStudent) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            setIdStudents((prev) =>
                prev.map((s) =>
                    s.id === previewStudent.id ? { ...s, photo: dataUrl } : s,
                ),
            );
            setPreviewStudent((prev) =>
                prev ? { ...prev, photo: dataUrl } : prev,
            );
        };
        reader.readAsDataURL(file);
    };

    const filtered = idStudents
        .filter((s) => gradeFilter === "All" || s.grade === gradeFilter)
        .filter(
            (s) =>
                !search ||
                s.name.toLowerCase().includes(search.toLowerCase()) ||
                s.id.toLowerCase().includes(search.toLowerCase()),
        )
        .sort(
            (a, b) =>
                gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade) ||
                a.name.localeCompare(b.name),
        );

    const todayLabel = () =>
        new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });

    const buildIdQRPayload = (student: IDStudent) =>
        JSON.stringify({
            type: "STUDENT_ID_CARD",
            studentId: student.id,
            name: student.name,
            grade: student.grade,
            section: student.section,
        });

    const upsertIdCardPrinted = async (studentId: string) => {
        if (!schoolYearId) return;
        const { data: existing } = await supabase
            .from("student_id_cards")
            .select("id, printed, issued_date")
            .eq("student_id", studentId)
            .eq("school_year_id", schoolYearId)
            .maybeSingle();
        if (existing) {
            if (!existing.printed) {
                await supabase
                    .from("student_id_cards")
                    .update({
                        printed: true,
                        issued_date:
                            existing.issued_date ||
                            new Date().toISOString().slice(0, 10),
                    })
                    .eq("id", existing.id);
            }
        } else {
            await supabase
                .from("student_id_cards")
                .insert({
                    student_id: studentId,
                    school_year_id: schoolYearId,
                    printed: true,
                    issued_date: new Date().toISOString().slice(0, 10),
                });
        }
    };

    const printOne = async (id: string) => {
        setIdStudents((prev) =>
            prev.map((s) =>
                s.id === id
                    ? {
                          ...s,
                          idPrinted: true,
                          idIssued: s.idIssued || todayLabel(),
                      }
                    : s,
            ),
        );
        try {
            await upsertIdCardPrinted(id);
        } catch {
            /* best-effort — UI already reflects the print */
        }
    };

    const markSelectedPrinted = async () => {
        const ids = selectedIds;
        setIdStudents((prev) =>
            prev.map((s) =>
                ids.includes(s.id)
                    ? {
                          ...s,
                          idPrinted: true,
                          idIssued: s.idIssued || todayLabel(),
                      }
                    : s,
            ),
        );
        setSelectedIds([]);
        await Promise.all(
            ids.map((id) => upsertIdCardPrinted(id).catch(() => {})),
        );
    };

    // --- PDF export ---
    // The QR image can't be generated headlessly, so a QRCodeCanvas is mounted
    // off-screen for whichever student is currently being exported; we wait a
    // couple of frames for it to paint, then read it back out as a PNG.
    const [pdfExportStudent, setPdfExportStudent] = useState<IDStudent | null>(
        null,
    );
    const [pdfGeneratingIds, setPdfGeneratingIds] = useState<string[]>([]);
    const [pdfError, setPdfError] = useState<string | null>(null);
    const pdfQrCanvasRef = useRef<HTMLCanvasElement>(null);

    const waitForNextPaint = () =>
        new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

    // A canvas that hasn't painted its QR modules yet still yields a well-formed
    // (non-trivial) blank PNG, so byte length can't tell painted apart from blank.
    // Check actual pixel data for a dark pixel instead, and retry until it's there.
    const canvasHasDarkPixel = (canvas: HTMLCanvasElement): boolean => {
        const ctx = canvas.getContext("2d");
        if (!ctx) return false;
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] < 128 && data[i + 3] > 0) return true;
        }
        return false;
    };

    const readQrDataUrl = async (): Promise<string> => {
        for (let attempt = 0; attempt < 10; attempt++) {
            await waitForNextPaint();
            const canvas = pdfQrCanvasRef.current;
            if (canvas && canvasHasDarkPixel(canvas))
                return canvas.toDataURL("image/png");
        }
        // The QR never painted — better to fail loudly than ship an ID card with a blank QR.
        throw new Error(
            "The ID card's QR code didn't render in time. Please try again.",
        );
    };

    const buildIdCardsPdf = async (students: IDStudent[]) => {
        const logoDataUrl = await getSchoolLogoDataUrl();
        const schoolInfo = await getSchoolSettings();
        const doc = new jsPDF({ unit: "mm", format: ID_CARD_PAGE });
        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            setPdfExportStudent(student);
            const qrDataUrl = await readQrDataUrl();
            if (i > 0) doc.addPage(ID_CARD_PAGE);
            drawIdCardFront(doc, student, schoolYear, logoDataUrl, schoolInfo);
            doc.addPage(ID_CARD_PAGE);
            drawIdCardBack(doc, student, schoolYear, qrDataUrl, schoolInfo);
        }
        setPdfExportStudent(null);
        return doc;
    };

    const downloadIdPdf = async (student: IDStudent): Promise<boolean> => {
        setPdfGeneratingIds((prev) => [...prev, student.id]);
        setPdfError(null);
        try {
            const doc = await buildIdCardsPdf([student]);
            doc.save(`${student.id}_ID_Card.pdf`);
            await printOne(student.id);
            return true;
        } catch (e: any) {
            setPdfError(
                e?.message ||
                    "Failed to generate the ID card PDF. Please try again.",
            );
            return false;
        } finally {
            setPdfGeneratingIds((prev) =>
                prev.filter((id) => id !== student.id),
            );
        }
    };

    const downloadSelectedIdsPdf = async () => {
        const targets = idStudents.filter((s) => selectedIds.includes(s.id));
        if (targets.length === 0) return;
        setPdfGeneratingIds((prev) => [...prev, ...targets.map((s) => s.id)]);
        setPdfError(null);
        try {
            const doc = await buildIdCardsPdf(targets);
            doc.save(
                `ID_Cards_${targets.length}_${new Date().toISOString().slice(0, 10)}.pdf`,
            );
            await markSelectedPrinted();
        } catch (e: any) {
            setPdfError(
                e?.message ||
                    "Failed to generate the ID cards PDF. Please try again.",
            );
        } finally {
            setPdfGeneratingIds((prev) =>
                prev.filter((id) => !targets.some((s) => s.id === id)),
            );
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filtered.length) setSelectedIds([]);
        else setSelectedIds(filtered.map((s) => s.id));
    };

    const printedCount = idStudents.filter((s) => s.idPrinted).length;
    const notPrintedCount = idStudents.length - printedCount;

    if (showEditStudentModal && editingStudent) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => {
                        setShowEditStudentModal(false);
                        setEditSaveError(null);
                    }}
                    className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] font-medium"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to ID Generation</span>
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        Edit Student Information
                    </h1>
                    <p className="text-[#6b6456]">
                        Update the student's ID card details • {schoolYear}
                    </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Full Name
                            </label>
                            <input
                                type="text"
                                value={editingStudent.name}
                                onChange={(e) =>
                                    setEditingStudent({
                                        ...editingStudent,
                                        name: e.target.value,
                                    })
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Student ID
                            </label>
                            <input
                                type="text"
                                value={editingStudent.id}
                                disabled
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 font-mono text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Grade Level
                            </label>
                            <select
                                value={editingStudent.grade}
                                onChange={(e) =>
                                    setEditingStudent({
                                        ...editingStudent,
                                        grade: e.target.value,
                                    })
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            >
                                {gradeOrder.map((g) => (
                                    <option key={g}>{g}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Date of Birth
                            </label>
                            <input
                                type="date"
                                value={editingStudent.dobRaw ?? ""}
                                onChange={(e) =>
                                    setEditingStudent({
                                        ...editingStudent,
                                        dobRaw: e.target.value,
                                    })
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Emergency Contact
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. 09171112222"
                                value={editingStudent.emergencyContact ?? ""}
                                onChange={(e) =>
                                    setEditingStudent({
                                        ...editingStudent,
                                        emergencyContact: e.target.value,
                                    })
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Address
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Tapon Norte, San Jose"
                                value={editingStudent.address ?? ""}
                                onChange={(e) =>
                                    setEditingStudent({
                                        ...editingStudent,
                                        address: e.target.value,
                                    })
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Parent / Guardian
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Analisa A. Cabal"
                                value={editingStudent.guardianName ?? ""}
                                onChange={(e) =>
                                    setEditingStudent({
                                        ...editingStudent,
                                        guardianName: e.target.value,
                                    })
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Student Photo
                            </label>
                            <div className="flex items-center gap-3">
                                <div className="w-14 h-16 rounded-lg border-2 border-[#1a6b45] overflow-hidden bg-[#f4faf6] flex items-center justify-center shrink-0">
                                    {editingStudent.photo ? (
                                        <img
                                            src={editingStudent.photo}
                                            alt={editingStudent.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <User className="w-6 h-6 text-[#1a6b45]/40" />
                                    )}
                                </div>
                                <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-[#1a6b45] text-[#1a6b45] rounded-lg text-sm font-medium hover:bg-[#f4faf6] transition-all cursor-pointer">
                                    <Plus className="w-4 h-4" />
                                    {editingStudent.photo
                                        ? "Replace Photo"
                                        : "Upload Photo"}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            const reader = new FileReader();
                                            reader.onload = () =>
                                                setEditingStudent((prev) =>
                                                    prev
                                                        ? {
                                                              ...prev,
                                                              photo: reader.result as string,
                                                          }
                                                        : prev,
                                                );
                                            reader.readAsDataURL(file);
                                        }}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                    {editSaveError && (
                        <p className="text-sm text-red-500">
                            {editSaveError}
                        </p>
                    )}
                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                        <button
                            onClick={() => {
                                setShowEditStudentModal(false);
                                setEditSaveError(null);
                            }}
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={async () => {
                                setSavingEdit(true);
                                setEditSaveError(null);
                                const { firstName, lastName } =
                                    splitStudentName(editingStudent.name);
                                const { error } = await supabase
                                    .from("students")
                                    .update({
                                        first_name: firstName,
                                        last_name: lastName,
                                        grade_level: editingStudent.grade,
                                        section: editingStudent.section,
                                        date_of_birth:
                                            editingStudent.dobRaw || null,
                                        home_address:
                                            editingStudent.address || null,
                                        guardian_name:
                                            editingStudent.guardianName ||
                                            null,
                                        guardian_phone:
                                            editingStudent.emergencyContact ||
                                            null,
                                    })
                                    .eq("id", editingStudent.id);
                                if (error) {
                                    setSavingEdit(false);
                                    setEditSaveError(error.message);
                                    return;
                                }
                                try {
                                    const sy = await getSchoolYearByLabel(
                                        schoolYear,
                                    );
                                    if (sy) {
                                        await syncEnrollmentGradeSection(
                                            editingStudent.id,
                                            sy.id,
                                            editingStudent.grade,
                                            editingStudent.section,
                                        );
                                    }
                                } catch (e: any) {
                                    setSavingEdit(false);
                                    setEditSaveError(
                                        e?.message ||
                                            "Failed to update the student's class roster.",
                                    );
                                    return;
                                }
                                setSavingEdit(false);
                                const dobLabel = editingStudent.dobRaw
                                    ? formatDate(editingStudent.dobRaw)
                                    : editingStudent.dob;
                                setIdStudents((prev) =>
                                    prev.map((e) =>
                                        e.id === editingStudent.id
                                            ? {
                                                  ...editingStudent,
                                                  dob: dobLabel,
                                              }
                                            : e,
                                    ),
                                );
                                setShowEditStudentModal(false);
                            }}
                            disabled={savingEdit}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-60"
                        >
                            {savingEdit ? "Saving…" : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Off-screen QR renderer used to rasterize the QR code for whichever student is being exported to PDF */}
            {pdfExportStudent && (
                <div className="fixed -left-[9999px] top-0" aria-hidden="true">
                    <QRCodeCanvas
                        ref={pdfQrCanvasRef}
                        value={buildIdQRPayload(pdfExportStudent)}
                        size={240}
                        level="M"
                        includeMargin={false}
                    />
                </div>
            )}

            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">
                    Student ID Generation
                </h1>
                <p className="text-[#6b6456]">
                    Generate and print student ID cards, filterable by grade
                    level • {schoolYear}
                </p>
            </div>

            {/* Search + Grade Filter + Bulk Print */}
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
                            {GRADE_LEVELS.map((g) => (
                                <option key={g} value={g}>
                                    {g === "All" ? "All Grade Levels" : g}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={downloadSelectedIdsPdf}
                        disabled={
                            selectedIds.length === 0 ||
                            pdfGeneratingIds.length > 0
                        }
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Printer className="w-4 h-4" />
                        {pdfGeneratingIds.length > 0
                            ? "Generating PDF…"
                            : `Print Selected (${selectedIds.length})`}
                    </button>
                </div>
                {pdfError && (
                    <div className="mt-3 flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{pdfError}</span>
                    </div>
                )}
            </div>

            {/* Student Table */}
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
                        <thead className="bg-[#faf8f5] border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3">
                                    <input
                                        type="checkbox"
                                        checked={
                                            filtered.length > 0 &&
                                            selectedIds.length ===
                                                filtered.length
                                        }
                                        onChange={toggleSelectAll}
                                        className="accent-[#1a2b4a]"
                                    />
                                </th>
                                <th className="px-6 py-3 text-sm font-semibold text-[#1a2b4a] text-center">
                                    Student
                                </th>
                                <th className="px-6 py-3 text-sm font-semibold text-[#1a2b4a] text-center">
                                    ID Number
                                </th>
                                <th className="px-6 py-3 text-sm font-semibold text-[#1a2b4a] text-center">
                                    Grades
                                </th>
                                <th className="px-6 py-3 text-sm font-semibold text-[#1a2b4a] text-center">
                                    ID Status
                                </th>
                                <th className="px-6 py-3 text-sm font-semibold text-[#1a2b4a] text-center">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-6 py-10 text-center text-[#8b8476] text-sm"
                                    >
                                        Loading students…
                                    </td>
                                </tr>
                            ) : loadError ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-6 py-10 text-center text-red-500 text-sm"
                                    >
                                        {loadError}
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-6 py-10 text-center text-[#8b8476] text-sm"
                                    >
                                        No students found for this grade level.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((s) => (
                                    <tr
                                        key={s.id}
                                        className="hover:bg-[#faf8f5] transition-colors"
                                    >
                                        <td className="px-6 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(
                                                    s.id,
                                                )}
                                                onChange={() =>
                                                    toggleSelect(s.id)
                                                }
                                                className="accent-[#1a2b4a]"
                                            />
                                        </td>
                                        <td className="px-6 py-3 font-medium text-[#2c2c2c]">
                                            {s.displayName}
                                        </td>
                                        <td className="px-6 py-3 font-mono text-sm text-[#6b6456]">
                                            {s.id}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-[#6b6456]">
                                            {s.grade}
                                        </td>
                                        <td className="px-6 py-3">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${s.idPrinted ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}
                                            >
                                                {s.idPrinted
                                                    ? `Printed ${s.idIssued ? "· " + s.idIssued : ""}`
                                                    : "Not Printed"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="flex gap-2 justify-center">
                                                <button
                                                    onClick={() => {
                                                        setPreviewStudent(s);
                                                        setPreviewSide("front");
                                                        setShowPreviewModal(
                                                            true,
                                                        );
                                                    }}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-[#6b6456] rounded-lg text-xs font-medium hover:border-[#1a2b4a] hover:bg-[#faf8f5] transition-all"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    Preview
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingStudent({
                                                            ...s,
                                                        });
                                                        setShowEditStudentModal(
                                                            true,
                                                        );
                                                    }}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-[#6b6456] rounded-lg text-xs font-medium hover:border-[#c9a961] hover:bg-[#faf8f5] transition-all"
                                                >
                                                    <Edit className="w-3.5 h-3.5" />
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        downloadIdPdf(s)
                                                    }
                                                    disabled={pdfGeneratingIds.includes(
                                                        s.id,
                                                    )}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 border border-[#1a2b4a] text-[#1a2b4a] rounded-lg text-xs font-medium hover:bg-[#1a2b4a] hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Printer className="w-3.5 h-3.5" />
                                                    {pdfGeneratingIds.includes(
                                                        s.id,
                                                    )
                                                        ? "Generating…"
                                                        : s.idPrinted
                                                          ? "Redownload ID"
                                                          : "Download ID"}
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

            {/* ID Preview Modal */}
            {showPreviewModal && previewStudent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
                        <div className="bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white px-6 py-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold">
                                ID Card Preview
                            </h3>
                            <button
                                onClick={() => {
                                    setShowPreviewModal(false);
                                    setPreviewSide("front");
                                }}
                                className="p-1 hover:bg-white/20 rounded-lg"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-6">
                            {/* Front / Back toggle */}
                            <div className="flex gap-2 mb-3">
                                <button
                                    onClick={() => setPreviewSide("front")}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${previewSide === "front" ? "border-[#1a2b4a] bg-[#1a2b4a] text-white" : "border-gray-200 text-[#6b6456] bg-white"}`}
                                >
                                    Front
                                </button>
                                <button
                                    onClick={() => setPreviewSide("back")}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${previewSide === "back" ? "border-[#1a2b4a] bg-[#1a2b4a] text-white" : "border-gray-200 text-[#6b6456] bg-white"}`}
                                >
                                    Back
                                </button>
                            </div>

                            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white aspect-[3/4] flex flex-col shadow-sm max-w-[280px] mx-auto">
                                <div className="bg-[#1a6b45] h-3 shrink-0" />
                                {previewSide === "front" ? (
                                    <>
                                        <div className="flex-1 flex flex-col items-center px-4 py-2 text-center overflow-hidden">
                                            <img
                                                src={schoolLogo}
                                                alt="School Logo"
                                                className="w-11 h-11 rounded-full object-cover mb-1 shrink-0"
                                            />
                                            <p className="text-[10px] font-extrabold text-[#1a6b45] leading-tight">
                                                {schoolInfo.school_name.toUpperCase()}
                                            </p>
                                            <p className="text-[6px] font-semibold tracking-widest text-[#1a6b45]/80 mb-1.5">
                                                STUDENT IDENTIFICATION CARD
                                            </p>
                                            <div className="w-full h-px bg-[#1a6b45]/25 mb-1.5 shrink-0" />
                                            <div className="w-16 h-20 rounded-lg border-2 border-[#1a6b45] overflow-hidden bg-[#f4faf6] flex items-center justify-center mb-1.5 shrink-0">
                                                {previewStudent.photo ? (
                                                    <img
                                                        src={
                                                            previewStudent.photo
                                                        }
                                                        alt={
                                                            previewStudent.name
                                                        }
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <User className="w-7 h-7 text-[#1a6b45]/40" />
                                                )}
                                            </div>
                                            <p className="font-extrabold text-[#1a6b45] text-[11px] leading-tight uppercase">
                                                {previewStudent.cardName}
                                            </p>
                                            <div className="w-full mt-auto pt-1.5 shrink-0">
                                                <div className="flex justify-between border-t border-[#1a6b45]/20 py-0.5 text-[8.5px]">
                                                    <span className="text-[#6b6456]">
                                                        Student No.
                                                    </span>
                                                    <span className="font-mono font-semibold text-[#1a6b45]">
                                                        {previewStudent.id}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between border-t border-[#1a6b45]/20 py-0.5 text-[8.5px]">
                                                    <span className="text-[#6b6456]">
                                                        Grade
                                                    </span>
                                                    <span className="font-semibold text-[#1a6b45]">
                                                        {previewStudent.grade}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-[#1a6b45] text-white text-center py-1 text-[8.5px] font-bold shrink-0">
                                            SCHOOL YEAR {schoolYear}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex-1 flex flex-col px-4 py-2.5 overflow-hidden">
                                            <p className="text-center text-[10px] font-extrabold text-[#1a6b45] leading-tight mb-1.5 shrink-0">
                                                STUDENT &amp; EMERGENCY
                                                <br />
                                                INFORMATION
                                            </p>
                                            <div className="space-y-1 text-[7.5px] shrink-0">
                                                {(
                                                    [
                                                        [
                                                            "Date of Birth",
                                                            previewStudent.dob,
                                                        ],
                                                        [
                                                            "Address",
                                                            previewStudent.address,
                                                        ],
                                                        [
                                                            "Parent / Guardian",
                                                            previewStudent.guardianName,
                                                        ],
                                                        [
                                                            "Emergency Contact",
                                                            previewStudent.emergencyContact,
                                                        ],
                                                    ] as [
                                                        string,
                                                        string | undefined,
                                                    ][]
                                                ).map(([label, value]) => (
                                                    <div
                                                        key={label}
                                                        className="border-t border-[#1a6b45]/20 pt-0.5 leading-tight"
                                                    >
                                                        <p className="text-[#6b6456] uppercase tracking-wide text-[6px] leading-tight">
                                                            {label}
                                                        </p>
                                                        <p className="font-semibold text-[#1a2b4a] leading-tight">
                                                            {value || "—"}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex items-start gap-2 mt-1.5 border-t border-[#1a6b45]/20 pt-1.5 shrink-0">
                                                <div className="p-1 bg-white border border-[#1a6b45] rounded-md shrink-0">
                                                    <QRCodeSVG
                                                        value={buildIdQRPayload(
                                                            previewStudent,
                                                        )}
                                                        size={48}
                                                        level="M"
                                                        includeMargin={false}
                                                    />
                                                    <p className="text-[6px] font-mono text-center mt-0.5 text-[#1a6b45] leading-tight">
                                                        {previewStudent.id}
                                                    </p>
                                                </div>
                                                <div className="flex-1 flex flex-col justify-center gap-3 self-stretch">
                                                    <div className="border-t border-gray-400 pt-0.5 text-center text-[6px] font-semibold text-[#1a2b4a] leading-tight">
                                                        STUDENT SIGNATURE
                                                    </div>
                                                    <div className="border-t border-gray-400 pt-0.5 text-center text-[6px] font-semibold text-[#1a2b4a] leading-tight">
                                                        AUTHORIZED SCHOOL
                                                        SIGNATURE
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-auto pt-1.5 border-t border-[#1a6b45]/20 text-center shrink-0">
                                                <p className="text-[6.5px] font-bold text-[#1a2b4a] leading-tight">
                                                    {schoolInfo.school_address || "—"}
                                                </p>
                                                <p className="text-[6.5px] text-[#1a2b4a] leading-tight">
                                                    {schoolInfo.contact_phone}
                                                </p>
                                                <p className="text-[5.5px] text-[#8b8476] mt-0.5 leading-snug">
                                                    This card is
                                                    non-transferable and remains
                                                    the property of {schoolInfo.school_name.toUpperCase()}. If found,
                                                    please return it to the
                                                    school.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="bg-[#1a6b45] text-white text-center py-1.5 text-[9px] font-bold shrink-0">
                                            VALID FOR S.Y. {schoolYear}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Add Photo (front only) */}
                            {previewSide === "front" && (
                                <label className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-[#1a6b45] text-[#1a6b45] rounded-lg text-sm font-medium hover:bg-[#f4faf6] transition-all cursor-pointer">
                                    <Plus className="w-4 h-4" />
                                    {previewStudent.photo
                                        ? "Replace Student Photo"
                                        : "Upload Student Photo"}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) =>
                                            handlePhotoUpload(
                                                e.target.files?.[0] || null,
                                            )
                                        }
                                    />
                                </label>
                            )}

                            {pdfError && (
                                <div className="w-full mt-3 flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    <span>{pdfError}</span>
                                </div>
                            )}
                            <button
                                onClick={async () => {
                                    const ok =
                                        await downloadIdPdf(previewStudent);
                                    if (ok) {
                                        setShowPreviewModal(false);
                                        setPreviewSide("front");
                                    }
                                }}
                                disabled={pdfGeneratingIds.includes(
                                    previewStudent.id,
                                )}
                                className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#1a6b45] to-[#238a5c] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                <Printer className="w-4 h-4" />{" "}
                                {pdfGeneratingIds.includes(previewStudent.id)
                                    ? "Generating PDF…"
                                    : previewStudent.idPrinted
                                      ? "Redownload ID"
                                      : "Download ID"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
