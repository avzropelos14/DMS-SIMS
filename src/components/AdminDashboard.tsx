import { useState, useRef, Fragment, useEffect } from "react";
import { DashboardLayout } from "./DashboardLayout";
import { StaffProfileView } from "./StaffProfileView";
import schoolLogo from "./assets/dmgteLogo.jpg";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import {
    LayoutDashboard,
    Users,
    GraduationCap,
    Calendar,
    PhilippinePeso,
    Settings,
    UserPlus,
    Search,
    Filter,
    Download,
    MoreVertical,
    Award,
    AlertCircle,
    CheckCircle,
    Clock,
    Mail,
    Phone,
    MapPin,
    Edit,
    Trash2,
    Eye,
    UserCheck,
    UserX,
    BookMarked,
    Shield,
    CreditCard,
    FileCheck,
    X,
    Check,
    Printer,
    User,
    Briefcase,
    Wrench,
    BookMarked as BookIcon,
    Heart,
    Stethoscope,
    Archive,
    ChevronDown,
    Plus,
    Layers,
    QrCode,
    Receipt,
    Lock,
    ClipboardList,
    LayoutGrid,
    List,
    RotateCcw,
    BookOpen,
    ArrowLeft,
} from "lucide-react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { supabase } from "./../supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";
import {
    TUITION_GRADE_GROUPS,
    DEFAULT_TUITION_FEES,
    DEFAULT_ENROLLMENT_FEES,
    getTuitionForGrade,
} from "../lib/tuition";
import {
    getCurrentSchoolYear,
    getSchoolYearByLabel,
    type SchoolYear,
} from "../lib/schoolYear";
import {
    CURRICULA,
    listSubjects,
    createSubject,
    updateSubject,
    deleteSubject,
    setSubjectHidden,
    curriculumForGrade,
    getOrCreateSubjectId,
    type Subject,
} from "../lib/subjects";
import {
    listRooms,
    createRoom,
    updateRoom,
    deleteRoom,
    type Room,
} from "../lib/rooms";
import { getSchoolSettings, DEFAULT_SCHOOL_SETTINGS, type SchoolSettings } from "../lib/schoolSettings";

// --- ID Card PDF export helpers ---------------------------------------------

function loadImageAsDataUrl(src: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                reject(new Error("Canvas context unavailable"));
                return;
            }
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        img.src = src;
    });
}

let cachedSchoolLogoDataUrl: string | null = null;
async function getSchoolLogoDataUrl(): Promise<string> {
    if (!cachedSchoolLogoDataUrl)
        cachedSchoolLogoDataUrl = await loadImageAsDataUrl(schoolLogo);
    return cachedSchoolLogoDataUrl;
}

function imageFormatFromDataUrl(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
    if (dataUrl.startsWith("data:image/png")) return "PNG";
    if (dataUrl.startsWith("data:image/webp")) return "WEBP";
    return "JPEG";
}

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

async function getCurrentSchoolYearId(): Promise<string | null> {
    const { data } = await supabase
        .from("school_years")
        .select("id")
        .eq("is_current", true)
        .limit(1)
        .maybeSingle();
    return data?.id ?? null;
}

// Student portal login accounts are only auto-created for junior high (Grades 7-10) —
// younger grades don't get a student email/account.
const JUNIOR_HIGH_GRADES = ["Grade 7", "Grade 8", "Grade 9", "Grade 10"];
function isJuniorHighGrade(grade: string): boolean {
    return JUNIOR_HIGH_GRADES.includes(grade);
}

// Converts a 24-hour "HH:MM" time into 12-hour "h:mm AM/PM" for display.
function formatTime12hr(t: string): string {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return t;
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

// Converts a stored "HH:MM-HH:MM" schedules.time_label into a 12-hour range
// (e.g. "08:00-09:00" -> "8:00 AM - 9:00 AM"); anything else is returned as-is.
function formatTimeLabel12hr(timeLabel: string): string {
    if (!timeLabel) return timeLabel;
    const parts = timeLabel.split("-");
    if (parts.length !== 2) return timeLabel;
    const [start, end] = parts;
    if (!/^\d{1,2}:\d{2}$/.test(start.trim()) || !/^\d{1,2}:\d{2}$/.test(end.trim()))
        return timeLabel;
    return `${formatTime12hr(start.trim())} - ${formatTime12hr(end.trim())}`;
}

// supabase.functions.invoke only sets error.message to a generic
// "Edge Function returned a non-2xx status code" — the actual reason (e.g. an
// Auth/SMTP failure) lives in the response body, which this reads out.
async function functionErrorMessage(error: unknown): Promise<string> {
    if (error instanceof FunctionsHttpError) {
        try {
            const body = await error.context.json();
            if (body?.error) return body.error as string;
        } catch {
            // response body wasn't JSON — fall through to the generic message
        }
    }
    return error instanceof Error ? error.message : "Something went wrong";
}

async function createStudentAccount(
    studentId: string,
    email?: string | null,
): Promise<{ email: string; password: string | null; emailSent?: boolean }> {
    // Pass the caller's access token explicitly rather than relying on the client's implicit
    // default headers — the edge function requires a real user JWT (verify_jwt is on), and
    // without an explicit token some sessions were reaching it with neither an Authorization
    // nor apikey header, which the gateway rejects with UNAUTHORIZED_NO_AUTH_HEADER before the
    // function even runs.
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
        throw new Error(
            "Your session has expired — please log in again before confirming this enrollment.",
        );
    }
    const { data, error } = await supabase.functions.invoke(
        "create-student-account",
        {
            body: { student_id: studentId, email: email || undefined },
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    if (error) throw new Error(await functionErrorMessage(error));
    return data as { email: string; password: string | null; emailSent?: boolean };
}

// Creates (or reuses, if the email already has a parent account) a guardian login and
// links it to the student. `isPrimaryContact` marks whether this guardian is the
// designated contact of record for the student.
async function createGuardianAccount(args: {
    studentId: string;
    fullName: string;
    relationship: string;
    phone?: string;
    email?: string;
    isPrimaryContact?: boolean;
}): Promise<{
    email: string;
    password: string | null;
    isNewAccount: boolean;
    emailSent?: boolean;
}> {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
        throw new Error(
            "Your session has expired — please log in again before confirming this enrollment.",
        );
    }
    const { data, error } = await supabase.functions.invoke(
        "create-guardian-account",
        {
            body: {
                student_id: args.studentId,
                full_name: args.fullName,
                relationship: args.relationship,
                phone: args.phone,
                email: args.email,
                is_primary_contact: args.isPrimaryContact ?? true,
            },
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    if (error) throw new Error(await functionErrorMessage(error));
    return data as {
        email: string;
        password: string | null;
        isNewAccount: boolean;
        emailSent?: boolean;
    };
}

type StaffAppRole =
    | "full_admin"
    | "registrar"
    | "cashier"
    | "teacher"
    | "guard";

const STAFF_POSITION_ROLES: Record<string, StaffAppRole> = {
    Teacher: "teacher",
    Admin: "full_admin",
    Registrar: "registrar",
    Cashier: "cashier",
    Guard: "guard",
};

async function createStaffAccount(
    employeeId: string,
    role: StaffAppRole,
    email?: string,
): Promise<{ email: string; password: string | null; emailSent?: boolean }> {
    // See createStudentAccount above — pass the caller's access token explicitly so the
    // gateway doesn't reject the request with UNAUTHORIZED_NO_AUTH_HEADER.
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
        throw new Error(
            "Your session has expired — please log in again before adding this employee.",
        );
    }
    const { data, error } = await supabase.functions.invoke(
        "create-staff-account",
        {
            body: { employee_id: employeeId, role, email },
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    if (error) throw new Error(await functionErrorMessage(error));
    return data as { email: string; password: string | null; emailSent?: boolean };
}

// Full-admin-only: removes the Supabase Auth login tied to a student, employee, or
// profile record (server-side, via the service role) so removing them here also
// cleans up their account instead of leaving an orphaned login in Supabase.
async function deleteAuthAccountFor(
    target: { studentId: string } | { employeeId: string } | { userId: string },
): Promise<{ deleted: boolean }> {
    const body =
        "studentId" in target
            ? { student_id: target.studentId }
            : "employeeId" in target
              ? { employee_id: target.employeeId }
              : { user_id: target.userId };
    const { data, error } = await supabase.functions.invoke(
        "delete-user-account",
        { body },
    );
    if (error) throw new Error(await functionErrorMessage(error));
    return data as { deleted: boolean };
}

// Keeps a student's `enrollments` row for a given school year in sync with a grade/section
// change made outside the enrollment flow (e.g. Class Management's "Assign Student", or a
// Student Management edit). `students.grade_level/section` is a mutable pointer, but rosters
// (Student Management's list, Teacher Dashboard's My Classes) read from `enrollments`, which is
// per-year and never auto-updated — without this, a reassigned student keeps showing up under
// their old class there even though `students` reflects the new one.
async function syncEnrollmentGradeSection(
    studentId: string,
    schoolYearId: string,
    gradeLevel: string,
    section: string | null,
): Promise<void> {
    const { data, error } = await supabase
        .from("enrollments")
        .update({ grade_level: gradeLevel, section })
        .eq("student_id", studentId)
        .eq("school_year_id", schoolYearId)
        .select("student_id");
    if (error) throw error;
    if (!data || data.length === 0) {
        const { error: insertError } = await supabase.from("enrollments").insert({
            student_id: studentId,
            school_year_id: schoolYearId,
            grade_level: gradeLevel,
            section,
            status: "confirmed",
            enrollment_type: "Continuing Student",
        });
        if (insertError) throw insertError;
    }
}

async function generateStudentId(lastName: string): Promise<string> {
    const surname =
        lastName
            .trim()
            .toUpperCase()
            .replace(/[^A-Z]/g, "") || "STUDENT";
    const prefix = `STU-${surname}-`;
    const { count } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .like("id", `${prefix}%`);
    const seq = ((count ?? 0) + 1).toString().padStart(3, "0");
    return `${prefix}${seq}`;
}

async function generateEmployeeId(fullName: string): Promise<string> {
    const parts = fullName.trim().split(/\s+/);
    const last = parts[parts.length - 1] || "STAFF";
    const surname = last.toUpperCase().replace(/[^A-Z]/g, "") || "STAFF";
    const prefix = `EMP-${surname}-`;
    const { count } = await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .like("id", `${prefix}%`);
    const seq = ((count ?? 0) + 1).toString().padStart(3, "0");
    return `${prefix}${seq}`;
}

async function getDepartmentIdByName(name: string): Promise<string | null> {
    if (!name) return null;
    const { data } = await supabase
        .from("departments")
        .select("id")
        .eq("name", name)
        .maybeSingle();
    return data?.id ?? null;
}

interface NewEmployeeInput {
    fullName: string;
    position: string;
    departmentName: string;
    email?: string | null;
    phone: string;
    education?: string | null;
    employmentType?: "full-time" | "part-time" | "contractual" | null;
    dateHired: string;
    address?: string | null;
    licenseNo?: string | null;
    notes?: string | null;
}

async function insertEmployee(input: NewEmployeeInput) {
    const id = await generateEmployeeId(input.fullName);
    const departmentId = await getDepartmentIdByName(input.departmentName);
    const { data, error } = await supabase
        .from("employees")
        .insert({
            id,
            full_name: input.fullName,
            position: input.position,
            department_id: departmentId,
            email: input.email || null,
            phone: input.phone,
            education: input.education || null,
            employment_type: input.employmentType || null,
            date_hired: input.dateHired,
            status: "active",
            address: input.address || null,
            license_no: input.licenseNo || null,
            notes: input.notes || null,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

interface AdminDashboardProps {
    user: any;
    onLogout: () => void;
    accessLevel?: "full" | "registrar";
    tuitionFees?: Record<string, number>;
    onTuitionFeesChange?: (
        fees: Record<string, number>,
    ) => Promise<string | null>;
    enrollmentFees?: Record<string, number>;
    onEnrollmentFeesChange?: (
        fees: Record<string, number>,
    ) => Promise<string | null>;
}

export function AdminDashboard({
    user,
    onLogout,
    accessLevel = "full",
    tuitionFees = DEFAULT_TUITION_FEES,
    onTuitionFeesChange,
    enrollmentFees = DEFAULT_ENROLLMENT_FEES,
    onEnrollmentFeesChange,
}: AdminDashboardProps) {
    const isRegistrar = accessLevel === "registrar";
    const isAdmin = !isRegistrar;
    const [activeView, setActiveView] = useState(
        isRegistrar ? "students" : "overview",
    );
    const [schoolYear, setSchoolYear] = useState("2025-2026");
    const [currentSchoolYear, setCurrentSchoolYear] =
        useState<SchoolYear | null>(null);

    const refreshCurrentSchoolYear = () => {
        getCurrentSchoolYear().then((sy) => {
            if (!sy) return;
            setCurrentSchoolYear(sy);
            setSchoolYear(sy.label);
        });
    };

    useEffect(() => {
        refreshCurrentSchoolYear();
    }, []);

    const isArchivedYear =
        currentSchoolYear !== null && schoolYear !== currentSchoolYear.label;

    const fullNavigation = [
        { id: "overview", label: "Dashboard Overview", icon: LayoutDashboard },
        { id: "students", label: "Student Management", icon: GraduationCap },
        {
            id: "classmanagement-group",
            label: "Class Management",
            icon: Layers,
            children: [
                { id: "classmanagement", label: "Classes" },
                { id: "subjects", label: "Subjects" },
                { id: "rooms", label: "Room Management" },
                { id: "teacherslist", label: "Teachers List" },
            ],
        },
        { id: "staff", label: "Staff & Teachers", icon: Users },
        { id: "idgeneration", label: "ID Generation", icon: CreditCard },
        { id: "profile", label: "My Profile", icon: User },
        { id: "settings", label: "System Settings", icon: Settings },
    ];

    const registrarNavigation = [
        {
            id: "enrollment-group",
            label: "Enrollment",
            icon: UserPlus,
            children: [
                { id: "enrollment", label: "New / Transferee" },
                { id: "enrollment-continuing", label: "Continuing Student" },
                { id: "enrollment-pending", label: "Pending Enrollment" },
                { id: "enrollment-recent", label: "Recently Enrolled" },
            ],
        },
        { id: "students", label: "Student Management", icon: GraduationCap },
        {
            id: "academics-group",
            label: "Schedule & Classes",
            icon: Calendar,
            children: [
                { id: "academics-teacher-schedule", label: "Calendar" },
                { id: "academics", label: "Teacher Schedules" },
            ],
        },
        { id: "receipts", label: "Receipts", icon: Receipt },
        { id: "gradeRecords", label: "Grade Records (TOR)", icon: FileCheck },
        { id: "profile", label: "My Profile", icon: User },
    ];

    const navigation = isRegistrar ? registrarNavigation : fullNavigation;

    return (
        <DashboardLayout
            user={user}
            role={isRegistrar ? "registrar" : "admin"}
            navigation={navigation}
            activeView={activeView}
            onViewChange={setActiveView}
            onLogout={onLogout}
            schoolYear={schoolYear}
            onSchoolYearChange={setSchoolYear}
        >
            {isAdmin && (
                <BackupReminderBanner
                    endDate={currentSchoolYear?.end_date ?? null}
                    yearLabel={currentSchoolYear?.label ?? null}
                />
            )}
            {isArchivedYear && (
                <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
                    <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800">
                        Viewing archived school year{" "}
                        <strong>{schoolYear}</strong> — records are read-only.
                        Switch back to the current school year (
                        {currentSchoolYear?.label}) to make changes.
                    </p>
                </div>
            )}

            {activeView === "overview" && !isRegistrar && (
                <OverviewSection user={user} schoolYear={schoolYear} />
            )}
            {(activeView === "enrollment" ||
                activeView === "enrollment-continuing" ||
                activeView === "enrollment-pending" ||
                activeView === "enrollment-recent") &&
                isRegistrar && (
                    <EnrollmentSection
                        schoolYear={schoolYear}
                        isArchivedYear={isArchivedYear}
                        user={user}
                        subPage={
                            activeView === "enrollment-continuing"
                                ? "continuing"
                                : activeView === "enrollment-pending"
                                  ? "pending"
                                  : activeView === "enrollment-recent"
                                    ? "recent"
                                    : "new"
                        }
                    />
                )}
            {activeView === "students" && (
                <StudentManagement
                    schoolYear={schoolYear}
                    isRegistrar={isRegistrar}
                />
            )}
            {activeView === "classmanagement" && !isRegistrar && (
                <ClassManagementSection
                    schoolYear={schoolYear}
                    isArchivedYear={isArchivedYear}
                    user={user}
                />
            )}
            {activeView === "subjects" && !isRegistrar && (
                <SubjectManagement />
            )}
            {activeView === "rooms" && !isRegistrar && (
                <RoomManagement />
            )}
            {activeView === "teacherslist" && !isRegistrar && (
                <TeachersListSection schoolYear={schoolYear} />
            )}
            {activeView === "staff" && !isRegistrar && (
                <StaffManagement schoolYear={schoolYear} isAdmin={isAdmin} />
            )}
            {(activeView === "academics" ||
                activeView === "academics-teacher-schedule") && (
                <AcademicsSection
                    schoolYear={schoolYear}
                    isArchivedYear={isArchivedYear}
                    subPage={
                        activeView === "academics-teacher-schedule"
                            ? "teacher-schedule"
                            : "list"
                    }
                    onViewCalendar={() =>
                        setActiveView("academics-teacher-schedule")
                    }
                />
            )}
            {activeView === "receipts" && isRegistrar && (
                <ReceiptsSection schoolYear={schoolYear} />
            )}
            {activeView === "gradeRecords" && isRegistrar && (
                <GradeRecordsSection schoolYear={schoolYear} />
            )}
            {activeView === "idgeneration" && !isRegistrar && (
                <IDGenerationSection schoolYear={schoolYear} />
            )}
            {activeView === "financials" && !isRegistrar && (
                <FinancialSection
                    schoolYear={schoolYear}
                    tuitionFees={tuitionFees}
                />
            )}
            {activeView === "settings" && !isRegistrar && (
                <SettingsSection
                    tuitionFees={tuitionFees}
                    onTuitionFeesChange={onTuitionFeesChange}
                    enrollmentFees={enrollmentFees}
                    onEnrollmentFeesChange={onEnrollmentFeesChange}
                    currentSchoolYear={currentSchoolYear}
                    onSchoolYearRolledOver={refreshCurrentSchoolYear}
                />
            )}
            {activeView === "profile" && (
                <StaffProfileView user={user} color="#1a2b4a" />
            )}
        </DashboardLayout>
    );
}

// Subject Management — create, update, and delete the subject catalog that
// Class Management picks from when assigning subjects to a class section.
const ALL_GRADE_LEVELS = 'All Grade Levels';

function SubjectManagement() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [curriculumFilter, setCurriculumFilter] = useState<string>('All');
    const [search, setSearch] = useState('');

    const load = () => {
        setLoading(true);
        setLoadError(null);
        listSubjects(undefined, true)
            .then((rows) => setSubjects(rows))
            .catch((e) => setLoadError(e?.message || 'Failed to load subjects.'))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const [showModal, setShowModal] = useState(false);
    const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
    const [form, setForm] = useState<{ name: string; curriculum: string }>({ name: '', curriculum: ALL_GRADE_LEVELS });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const openCreateModal = () => {
        setEditingSubject(null);
        setForm({ name: '', curriculum: ALL_GRADE_LEVELS });
        setFormError(null);
        setShowModal(true);
    };

    const openEditModal = (subject: Subject) => {
        setEditingSubject(subject);
        setForm({ name: subject.name, curriculum: subject.curriculum || ALL_GRADE_LEVELS });
        setFormError(null);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            setFormError('Subject name is required.');
            return;
        }
        setSaving(true);
        setFormError(null);
        const curriculum = form.curriculum === ALL_GRADE_LEVELS ? null : form.curriculum;
        try {
            if (editingSubject) {
                await updateSubject(editingSubject.id, form.name, curriculum);
            } else {
                await createSubject(form.name, curriculum);
            }
            setShowModal(false);
            load();
        } catch (e: any) {
            setFormError(e?.message || 'Failed to save subject.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (subject: Subject) => {
        setDeletingId(subject.id);
        setDeleteError(null);
        setDeleteNotice(null);
        const { error, hidden } = await deleteSubject(subject.id);
        setDeletingId(null);
        if (error) {
            setDeleteError(error);
            return;
        }
        if (hidden) {
            setDeleteNotice(`"${subject.name}" is still used by a class from a past school year, so it was hidden instead of deleted — it won't appear when assigning subjects to classes anymore.`);
            setSubjects((prev) => prev.map((s) => (s.id === subject.id ? { ...s, hidden: true } : s)));
            return;
        }
        setSubjects((prev) => prev.filter((s) => s.id !== subject.id));
    };

    const handleToggleHidden = async (subject: Subject) => {
        setTogglingId(subject.id);
        setDeleteError(null);
        setDeleteNotice(null);
        const error = await setSubjectHidden(subject.id, !subject.hidden);
        setTogglingId(null);
        if (error) {
            setDeleteError(error);
            return;
        }
        setSubjects((prev) => prev.map((s) => (s.id === subject.id ? { ...s, hidden: !s.hidden } : s)));
    };

    const filtered = subjects.filter((s) => {
        if (curriculumFilter !== 'All' && s.curriculum !== curriculumFilter) return false;
        if (search.trim() && !s.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
        return true;
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">Subject Management</h1>
                    <p className="text-[#6b6456]">Create, update, and delete subjects offered across the curriculum</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white hover:shadow-lg transition-all"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add Subject</span>
                </button>
            </div>

            {deleteError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {deleteError}
                </div>
            )}
            {deleteNotice && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {deleteNotice}
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search subjects..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 focus:border-transparent"
                        />
                    </div>
                    <select
                        value={curriculumFilter}
                        onChange={(e) => setCurriculumFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-[#2c2c2c] focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20"
                    >
                        <option value="All">All Curricula</option>
                        {CURRICULA.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-[#faf8f5] border-b border-gray-200">
                            <tr>
                                <th className="text-left px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Subject</th>
                                <th className="text-left px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Curriculum</th>
                                <th className="text-center px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-[#8b8476]">Loading subjects…</td></tr>
                            ) : loadError ? (
                                <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-red-500">{loadError}</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-[#8b8476]">
                                    {subjects.length === 0 ? 'No subjects yet — click "Add Subject" to create one.' : 'No subjects match your search.'}
                                </td></tr>
                            ) : (
                                filtered.map((s) => (
                                    <tr key={s.id} className={`hover:bg-[#faf8f5] transition-colors ${s.hidden ? 'opacity-60' : ''}`}>
                                        <td className="px-6 py-4 font-medium text-[#2c2c2c]">
                                            {s.name}
                                            {s.hidden && (
                                                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-[#6b6456] border border-gray-200">
                                                    Hidden
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-[#6b6456]">{s.curriculum || ALL_GRADE_LEVELS}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => openEditModal(s)}
                                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                                    title="Edit Subject"
                                                >
                                                    <Edit className="w-4 h-4 text-[#8b8476]" />
                                                </button>
                                                {s.hidden ? (
                                                    <button
                                                        onClick={() => handleToggleHidden(s)}
                                                        disabled={togglingId === s.id}
                                                        className="p-2 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                                                        title="Unhide Subject"
                                                    >
                                                        <RotateCcw className="w-4 h-4 text-emerald-500" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleDelete(s)}
                                                        disabled={deletingId === s.id}
                                                        className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                                        title="Delete Subject"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-400" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                        <div className="bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
                            <h3 className="text-lg font-semibold">{editingSubject ? 'Edit Subject' : 'Add Subject'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">Subject Name</label>
                                <input
                                    value={form.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g. Mathematics"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">Curriculum</label>
                                <select
                                    value={form.curriculum}
                                    onChange={(e) => setForm((f) => ({ ...f, curriculum: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-black focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20"
                                >
                                    {CURRICULA.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                    <option value={ALL_GRADE_LEVELS}>{ALL_GRADE_LEVELS}</option>
                                </select>
                            </div>
                            {formError && <p className="text-sm text-red-500">{formError}</p>}
                        </div>
                        <div className="p-6 pt-0 flex gap-3">
                            <button onClick={() => setShowModal(false)} disabled={saving} className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#2c2c2c] font-medium hover:border-[#c9a961] transition-all disabled:opacity-60">
                                Cancel
                            </button>
                            <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60">
                                {saving ? 'Saving…' : editingSubject ? 'Save Changes' : 'Add Subject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function RoomManagement() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const load = () => {
        setLoading(true);
        setLoadError(null);
        listRooms()
            .then((rows) => setRooms(rows))
            .catch((e) => setLoadError(e?.message || 'Failed to load rooms.'))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const [showModal, setShowModal] = useState(false);
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);
    const [form, setForm] = useState({ name: '' });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const openCreateModal = () => {
        setEditingRoom(null);
        setForm({ name: '' });
        setFormError(null);
        setShowModal(true);
    };

    const openEditModal = (room: Room) => {
        setEditingRoom(room);
        setForm({ name: room.name });
        setFormError(null);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            setFormError('Room name is required.');
            return;
        }
        setSaving(true);
        setFormError(null);
        try {
            if (editingRoom) {
                await updateRoom(editingRoom.id, form.name);
            } else {
                await createRoom(form.name);
            }
            setShowModal(false);
            load();
        } catch (e: any) {
            setFormError(e?.message || 'Failed to save room.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (room: Room) => {
        setDeletingId(room.id);
        setDeleteError(null);
        const error = await deleteRoom(room.id, room.name);
        setDeletingId(null);
        if (error) {
            setDeleteError(error);
            return;
        }
        setRooms((prev) => prev.filter((r) => r.id !== room.id));
    };

    const filtered = rooms.filter((r) => {
        if (search.trim() && !r.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
        return true;
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">Room Management</h1>
                    <p className="text-[#6b6456]">Create, update, and delete rooms available to Class Management</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white hover:shadow-lg transition-all"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add Room</span>
                </button>
            </div>

            {deleteError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {deleteError}
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search rooms..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 focus:border-transparent"
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-[#faf8f5] border-b border-gray-200">
                            <tr>
                                <th className="text-left px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Room</th>
                                <th className="text-center px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan={2} className="px-6 py-8 text-center text-sm text-[#8b8476]">Loading rooms…</td></tr>
                            ) : loadError ? (
                                <tr><td colSpan={2} className="px-6 py-8 text-center text-sm text-red-500">{loadError}</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={2} className="px-6 py-8 text-center text-sm text-[#8b8476]">
                                    {rooms.length === 0 ? 'No rooms yet — click "Add Room" to create one.' : 'No rooms match your search.'}
                                </td></tr>
                            ) : (
                                filtered.map((r) => (
                                    <tr key={r.id} className="hover:bg-[#faf8f5] transition-colors">
                                        <td className="px-6 py-4 font-medium text-[#2c2c2c]">{r.name}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => openEditModal(r)}
                                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                                    title="Edit Room"
                                                >
                                                    <Edit className="w-4 h-4 text-[#8b8476]" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(r)}
                                                    disabled={deletingId === r.id}
                                                    className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                                    title="Delete Room"
                                                >
                                                    <Trash2 className="w-4 h-4 text-red-400" />
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

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                        <div className="bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
                            <h3 className="text-lg font-semibold">{editingRoom ? 'Edit Room' : 'Add Room'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">Room Name</label>
                                <input
                                    value={form.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g. Room 201"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                                    autoFocus
                                />
                            </div>
                            {formError && <p className="text-sm text-red-500">{formError}</p>}
                        </div>
                        <div className="p-6 pt-0 flex gap-3">
                            <button onClick={() => setShowModal(false)} disabled={saving} className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#2c2c2c] font-medium hover:border-[#c9a961] transition-all disabled:opacity-60">
                                Cancel
                            </button>
                            <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60">
                                {saving ? 'Saving…' : editingRoom ? 'Save Changes' : 'Add Room'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Registrar/admin password reset section: directly set a new password for any
// registered account (staff, parent, or student) by email, no reset-link email needed.
function PasswordResetSection() {
    const [resetEmail, setResetEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
        "idle",
    );
    const [errorMessage, setErrorMessage] = useState("");

    const attemptReset = async (accessToken: string | undefined) => {
        const { data, error } = await supabase.functions.invoke(
            "admin-reset-password",
            {
                body: { email: resetEmail.trim(), new_password: newPassword },
                headers: accessToken
                    ? { Authorization: `Bearer ${accessToken}` }
                    : undefined,
            },
        );
        if (error) throw new Error(await functionErrorMessage(error));
        if (data?.error) throw new Error(data.error);
    };

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus("sending");
        setErrorMessage("");
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        try {
            // admin-reset-password pages through listUsers before updating, so it's slower and
            // more prone to a client-side network/timeout error firing after the password was
            // already changed server-side. The reset itself is idempotent, so one silent retry
            // resolves that case instead of surfacing a false failure.
            try {
                await attemptReset(accessToken);
            } catch {
                await attemptReset(accessToken);
            }
            setStatus("sent");
            setResetEmail("");
            setNewPassword("");
        } catch (err: any) {
            setStatus("error");
            setErrorMessage(
                err?.message ||
                    "Couldn't confirm the password reset after two attempts — it may have already gone through. Please verify with the account holder before retrying.",
            );
        }
    };

    return (
        <div className="max-w-md">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-[#1a2b4a]">
                        Reset Password
                    </h3>
                    <p className="text-xs text-[#8b8476] mt-1">
                        Set a new password for any registered account (staff,
                        parent, or student) by email.
                    </p>
                </div>

                <div className="p-6">
                    {status === "sent" ? (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2.5 p-3.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>
                                    Password updated. The account holder can now
                                    sign in with the new password.
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setStatus("idle")}
                                className="w-full py-3 rounded-xl text-sm font-semibold border-2 border-[#1a2b4a] text-[#1a2b4a] hover:bg-[#1a2b4a]/5 transition-all"
                            >
                                Reset Another Password
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleReset} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2">
                                    Account Email Address
                                </label>
                                <div className="relative">
                                    <Mail
                                        className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
                                        style={{ color: "#8b8476" }}
                                    />
                                    <input
                                        type="email"
                                        value={resetEmail}
                                        onChange={(e) =>
                                            setResetEmail(e.target.value)
                                        }
                                        placeholder="someone@missionschool.edu.ph"
                                        required
                                        className="w-full pl-11 pr-4 py-3 text-sm rounded-xl border-2 border-[#5c5c5b] focus:border-[#1a2b4a] focus:ring-2 focus:ring-[#1a2b4a]/10 outline-none transition-all bg-white text-black"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-[#1a2b4a] mb-2">
                                    New Password
                                </label>
                                <div className="relative">
                                    <Lock
                                        className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
                                        style={{ color: "#8b8476" }}
                                    />
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) =>
                                            setNewPassword(e.target.value)
                                        }
                                        placeholder="At least 8 characters"
                                        minLength={8}
                                        required
                                        className="w-full pl-11 pr-4 py-3 text-sm rounded-xl border-2 border-[#5c5c5b] focus:border-[#1a2b4a] focus:ring-2 focus:ring-[#1a2b4a]/10 outline-none transition-all bg-white"
                                    />
                                </div>
                            </div>

                            {status === "error" && (
                                <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>{errorMessage}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={status === "sending"}
                                className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                                style={{ backgroundColor: "#1a2b4a" }}
                            >
                                {status === "sending"
                                    ? "Updating..."
                                    : "Set New Password"}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

// Shown to admins in the 30 days before the current school year's end date, reminding
// them to back up data. Purely a UI reminder — the system never auto-deletes anything.
function BackupReminderBanner({
    endDate,
    yearLabel,
}: {
    endDate: string | null;
    yearLabel: string | null;
}) {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed || !yearLabel) return null;

    if (!endDate) {
        return (
            <div className="mb-6 flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
                <p className="text-sm text-blue-800">
                    Set an end date for school year <strong>{yearLabel}</strong>{" "}
                    in System Settings to enable backup reminders.
                </p>
                <button
                    onClick={() => setDismissed(true)}
                    className="text-blue-600 hover:text-blue-800 shrink-0"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        );
    }

    const daysLeft = Math.ceil(
        (new Date(endDate).getTime() - Date.now()) / 86400000,
    );
    if (daysLeft > 30 || daysLeft < 0) return null;

    return (
        <div className="mb-6 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
            <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800">
                    <strong>
                        {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                    </strong>{" "}
                    in school year {yearLabel} — please back up all data before
                    it ends.
                </p>
            </div>
            <button
                onClick={() => setDismissed(true)}
                className="text-amber-600 hover:text-amber-800 shrink-0"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

// Overview Section
function OverviewSection({
    user,
    schoolYear,
}: {
    user: any;
    schoolYear: string;
}) {
    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [showFacultyModal, setShowFacultyModal] = useState(false);
    const [selectedFacultyRole, setSelectedFacultyRole] = useState<
        string | null
    >(null);
    const [newFacultyId, setNewFacultyId] = useState<string | null>(null);
    const [showEventModal, setShowEventModal] = useState(false);

    const emptyEnrollForm = {
        firstName: "",
        lastName: "",
        middleName: "",
        dob: "",
        gender: "",
        gradeLevel: "",
        studentEmail: "",
        guardianName: "",
        relationship: "",
        phone: "",
        email: "",
        address: "",
    };
    const [enrollForm, setEnrollForm] = useState(emptyEnrollForm);
    const [enrolling, setEnrolling] = useState(false);
    const [enrollError, setEnrollError] = useState<string | null>(null);
    const [newStudentCredentials, setNewStudentCredentials] = useState<{
        name: string;
        email: string | null;
        password: string | null;
        emailSent?: boolean;
    } | null>(null);

    const [totalStudents, setTotalStudents] = useState(0);
    const [totalEmployees, setTotalEmployees] = useState(0);
    const [recentActivities, setRecentActivities] = useState<
        { id: string; type: string; message: string; time: string; icon: any }[]
    >([]);

    const ACTIVITY_ICONS: Record<string, any> = {
        enrollment: UserPlus,
        grade: BookMarked,
        attendance: Calendar,
        alert: AlertCircle,
        staff: Users,
    };

    const timeAgo = (iso: string) => {
        const diffMs = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
        const days = Math.floor(hours / 24);
        return `${days} day${days === 1 ? "" : "s"} ago`;
    };

    useEffect(() => {
        let cancelled = false;
        const loadOverview = async () => {
            const [
                { count: studentCount },
                { count: employeeCount },
                { data: activities },
            ] = await Promise.all([
                supabase
                    .from("students")
                    .select("id, school_years!inner(label)", {
                        count: "exact",
                        head: true,
                    })
                    .eq("status", "Active")
                    .eq("school_years.label", schoolYear),
                supabase
                    .from("employees")
                    .select("id", { count: "exact", head: true })
                    .eq("status", "active")
                    .is("deleted_at", null),
                supabase
                    .from("activity_log")
                    .select("id, activity_type, message, created_at")
                    .order("created_at", { ascending: false })
                    .limit(5),
            ]);
            if (cancelled) return;
            setTotalStudents(studentCount ?? 0);
            setTotalEmployees(employeeCount ?? 0);
            setRecentActivities(
                (activities ?? []).map((a) => ({
                    id: a.id,
                    type: a.activity_type,
                    message: a.message,
                    time: timeAgo(a.created_at),
                    icon: ACTIVITY_ICONS[a.activity_type] ?? Calendar,
                })),
            );
        };
        loadOverview();
        return () => {
            cancelled = true;
        };
    }, [schoolYear]);

    const handleEnrollSubmit = async () => {
        if (
            !enrollForm.firstName.trim() ||
            !enrollForm.lastName.trim() ||
            !enrollForm.dob ||
            !enrollForm.gender ||
            !enrollForm.gradeLevel ||
            !enrollForm.guardianName.trim() ||
            !enrollForm.relationship ||
            !enrollForm.phone.trim() ||
            !enrollForm.address.trim() ||
            (isJuniorHighGrade(enrollForm.gradeLevel) &&
                !enrollForm.studentEmail.trim())
        ) {
            setEnrollError("Please fill in all required fields.");
            return;
        }
        setEnrolling(true);
        setEnrollError(null);
        try {
            const id = await generateStudentId(enrollForm.lastName);
            const schoolYearId = await getCurrentSchoolYearId();
            const { error } = await supabase.from("students").insert({
                id,
                first_name: enrollForm.firstName,
                middle_name: enrollForm.middleName || null,
                last_name: enrollForm.lastName,
                date_of_birth: enrollForm.dob,
                gender: enrollForm.gender,
                grade_level: enrollForm.gradeLevel,
                status: "Active",
                home_address: enrollForm.address,
                enrolled_date: new Date().toISOString().slice(0, 10),
                school_year_id: schoolYearId,
                guardian_name: enrollForm.guardianName,
                guardian_relationship: enrollForm.relationship,
                guardian_phone: enrollForm.phone,
                guardian_email: enrollForm.email || null,
            });
            if (error) throw error;
            const account = isJuniorHighGrade(enrollForm.gradeLevel)
                ? await createStudentAccount(id, enrollForm.studentEmail)
                : null;
            if (account)
                await supabase
                    .from("students")
                    .update({ email: account.email })
                    .eq("id", id);
            setShowEnrollModal(false);
            setEnrollForm(emptyEnrollForm);
            setNewStudentCredentials({
                name: `${enrollForm.firstName} ${enrollForm.lastName}`,
                email: account?.email ?? null,
                password: account?.password ?? null,
                emailSent: account?.emailSent ?? false,
            });
        } catch (e: any) {
            setEnrollError(e?.message || "Failed to enroll student.");
        } finally {
            setEnrolling(false);
        }
    };

    const stats = [
        {
            label: "Total Students",
            value: totalStudents.toLocaleString(),
            icon: GraduationCap,
            color: "from-[#1a2b4a] to-[#2d4263]",
            barColor: "#032b76c2",
        },
        {
            label: "Total Employees",
            value: totalEmployees,
            icon: Users,
            color: "from-[#7d1935] to-[#9b2847]",
            barColor: "#7d1935cb",
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2 ">
                    Administrator Dashboard
                </h1>
                <p className="text-[#6b6456]">Welcome back, {user.name}.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                {stats.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                        <div
                            key={index}
                            className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 transition-all border-l-[8px] border-b-[8px]`}
                            style={{
                                borderLeftColor: stat.barColor,
                                borderBottomColor: stat.barColor,
                            }}
                        >
                            <div className="flex items-center gap-4">
                                <div
                                    className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-lg flex items-center justify-center`}
                                >
                                    <Icon className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-2xl  font-bold text-[#2c2c2c] mb-1">
                                        {stat.value}
                                    </h3>
                                    <p className="text-sm  text-[#8b8476]">
                                        {stat.label}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Enroll Student Modal */}
            {showEnrollModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-none">
                        <div className="sticky top-0 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <UserPlus className="w-6 h-6" />
                                <h2 className="text-xl font-semibold">
                                    Enroll New Student
                                </h2>
                            </div>
                            <button
                                onClick={() => setShowEnrollModal(false)}
                                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Student Information */}
                            <div>
                                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">
                                    Student Information
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            First Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={enrollForm.firstName}
                                            onChange={(e) =>
                                                setEnrollForm((f) => ({
                                                    ...f,
                                                    firstName: e.target.value,
                                                }))
                                            }
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                            placeholder="Enter first name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Last Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={enrollForm.lastName}
                                            onChange={(e) =>
                                                setEnrollForm((f) => ({
                                                    ...f,
                                                    lastName: e.target.value,
                                                }))
                                            }
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                            placeholder="Enter last name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Middle Name
                                        </label>
                                        <input
                                            type="text"
                                            value={enrollForm.middleName}
                                            onChange={(e) =>
                                                setEnrollForm((f) => ({
                                                    ...f,
                                                    middleName: e.target.value,
                                                }))
                                            }
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                            placeholder="Enter middle name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Date of Birth *
                                        </label>
                                        <input
                                            type="date"
                                            value={enrollForm.dob}
                                            onChange={(e) =>
                                                setEnrollForm((f) => ({
                                                    ...f,
                                                    dob: e.target.value,
                                                }))
                                            }
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Gender *
                                        </label>
                                        <select
                                            value={enrollForm.gender}
                                            onChange={(e) =>
                                                setEnrollForm((f) => ({
                                                    ...f,
                                                    gender: e.target.value,
                                                }))
                                            }
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                        >
                                            <option value="">
                                                Select gender
                                            </option>
                                            <option value="Male">Male</option>
                                            <option value="Female">
                                                Female
                                            </option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Grade Level *
                                        </label>
                                        <select
                                            value={enrollForm.gradeLevel}
                                            onChange={(e) =>
                                                setEnrollForm((f) => ({
                                                    ...f,
                                                    gradeLevel: e.target.value,
                                                }))
                                            }
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                        >
                                            <option value="">
                                                Select grade
                                            </option>
                                            <option>Kinder 1</option>
                                            <option>Kinder 2</option>
                                            <option>Grade 1</option>
                                            <option>Grade 2</option>
                                            <option>Grade 3</option>
                                            <option>Grade 4</option>
                                            <option>Grade 5</option>
                                            <option>Grade 6</option>
                                            <option>Grade 7</option>
                                            <option>Grade 8</option>
                                            <option>Grade 9</option>
                                            <option>Grade 10</option>
                                        </select>
                                    </div>
                                    {isJuniorHighGrade(enrollForm.gradeLevel) && (
                                        <div>
                                            <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                                Student's Email *
                                            </label>
                                            <input
                                                type="email"
                                                required
                                                value={enrollForm.studentEmail}
                                                onChange={(e) =>
                                                    setEnrollForm((f) => ({
                                                        ...f,
                                                        studentEmail:
                                                            e.target.value,
                                                    }))
                                                }
                                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                                placeholder="e.g. juan@example.com"
                                            />
                                            <p className="text-xs text-[#8b8476] mt-1">
                                                An activation link for the
                                                Student Portal is sent here —
                                                required for Junior High.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Parent/Guardian Information */}
                            <div>
                                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">
                                    Parent/Guardian Information
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Parent/Guardian Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={enrollForm.guardianName}
                                            onChange={(e) =>
                                                setEnrollForm((f) => ({
                                                    ...f,
                                                    guardianName:
                                                        e.target.value,
                                                }))
                                            }
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                            placeholder="Enter parent/guardian name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Relationship *
                                        </label>
                                        <select
                                            value={enrollForm.relationship}
                                            onChange={(e) =>
                                                setEnrollForm((f) => ({
                                                    ...f,
                                                    relationship:
                                                        e.target.value,
                                                }))
                                            }
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                        >
                                            <option value="">
                                                Select relationship
                                            </option>
                                            <option value="Father">
                                                Father
                                            </option>
                                            <option value="Mother">
                                                Mother
                                            </option>
                                            <option value="Legal Guardian">
                                                Legal Guardian
                                            </option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Contact Number *
                                        </label>
                                        <input
                                            type="tel"
                                            value={enrollForm.phone}
                                            onChange={(e) =>
                                                setEnrollForm((f) => ({
                                                    ...f,
                                                    phone: e.target.value,
                                                }))
                                            }
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                            placeholder="+63 912 345 6789"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Email Address
                                        </label>
                                        <input
                                            type="email"
                                            value={enrollForm.email}
                                            onChange={(e) =>
                                                setEnrollForm((f) => ({
                                                    ...f,
                                                    email: e.target.value,
                                                }))
                                            }
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                            placeholder="parent@example.com"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Address */}
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                    Home Address *
                                </label>
                                <textarea
                                    value={enrollForm.address}
                                    onChange={(e) =>
                                        setEnrollForm((f) => ({
                                            ...f,
                                            address: e.target.value,
                                        }))
                                    }
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                    rows={3}
                                    placeholder="Enter complete home address"
                                ></textarea>
                            </div>

                            {enrollError && (
                                <p className="text-sm text-red-500">
                                    {enrollError}
                                </p>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-3 pt-4 border-t border-gray-200">
                                <button
                                    onClick={() => {
                                        setShowEnrollModal(false);
                                        setEnrollForm(emptyEnrollForm);
                                        setEnrollError(null);
                                    }}
                                    className="flex-1 px-6 py-3 border-2 border-gray-200 text-[#2c2c2c] rounded-lg hover:border-[#c9a961] hover:bg-[#faf8f5] transition-all font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleEnrollSubmit}
                                    disabled={enrolling}
                                    className="flex-1 px-6 py-3 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg hover:shadow-lg transition-all font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {enrolling
                                        ? "Enrolling…"
                                        : "Enroll Student"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {newStudentCredentials && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <h2 className="text-xl font-semibold text-[#1a2b4a]">
                            Student Enrolled
                        </h2>
                        {newStudentCredentials.email ? (
                            <>
                                <p className="text-sm text-[#6b6456]">
                                    {newStudentCredentials.emailSent
                                        ? `An activation email was sent to ${newStudentCredentials.name} at:`
                                        : `${newStudentCredentials.name} can now log in to the student portal with:`}
                                </p>
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-1 text-sm">
                                    <p>
                                        <strong>Email:</strong>{" "}
                                        {newStudentCredentials.email}
                                    </p>
                                    {!newStudentCredentials.emailSent && (
                                        <p>
                                            <strong>Password:</strong>{" "}
                                            {newStudentCredentials.password}
                                        </p>
                                    )}
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-[#6b6456]">
                                {newStudentCredentials.name} has been enrolled.
                                Student portal accounts are only created
                                automatically for Junior High (Grades 7-10).
                            </p>
                        )}
                        <button
                            onClick={() => setNewStudentCredentials(null)}
                            className="w-full px-6 py-3 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg hover:shadow-lg transition-all font-medium"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {newFacultyId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <h2 className="text-xl font-semibold text-[#1a2b4a]">
                            Employee Added
                        </h2>
                        <p className="text-sm text-[#6b6456]">
                            The new employee has been saved with ID{" "}
                            <strong>{newFacultyId}</strong>.
                        </p>
                        <button
                            onClick={() => setNewFacultyId(null)}
                            className="w-full px-6 py-3 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg hover:shadow-lg transition-all font-medium"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {/* Add Faculty/Staff Modal */}
            {showFacultyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-none">
                        <div className="sticky top-0 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Users className="w-6 h-6" />
                                <h2 className="text-xl font-semibold">
                                    {!selectedFacultyRole
                                        ? "Add Faculty/Staff - Select Role"
                                        : `Add New ${selectedFacultyRole}`}
                                </h2>
                            </div>
                            <button
                                onClick={() => {
                                    setShowFacultyModal(false);
                                    setSelectedFacultyRole(null);
                                }}
                                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6">
                            {!selectedFacultyRole ? (
                                // Role Selection Screen
                                <div className="space-y-4">
                                    <p className="text-[#6b6456] mb-6">
                                        Please select the type of faculty or
                                        staff member you want to add to the
                                        system.
                                    </p>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Teacher Role */}
                                        <button
                                            onClick={() =>
                                                setSelectedFacultyRole(
                                                    "Teacher",
                                                )
                                            }
                                            className="p-6 border-2 border-gray-200 rounded-xl hover:border-[#7d1935] hover:bg-[#7d1935]/5 transition-all  group"
                                        >
                                            <div className="flex items-center gap-4 mb-3">
                                                <div className="w-12 h-12 bg-gradient-to-br from-[#7d1935] to-[#9b2847] rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    <GraduationCap className="w-6 h-6 text-white" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-[#1a2b4a]">
                                                    Teacher
                                                </h3>
                                            </div>
                                            <p className="text-sm text-[#6b6456]">
                                                Academic instructors with
                                                subject specializations
                                            </p>
                                        </button>

                                        {/* Administrative Staff */}
                                        <button
                                            onClick={() =>
                                                setSelectedFacultyRole(
                                                    "Administrative Staff",
                                                )
                                            }
                                            className="p-6 border-2 border-gray-200 rounded-xl hover:border-[#7d1935] hover:bg-[#7d1935]/5 transition-all  group"
                                        >
                                            <div className="flex items-center gap-4 mb-3">
                                                <div className="w-12 h-12 bg-gradient-to-br from-[#1a2b4a] to-[#2d4263] rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    <Briefcase className="w-6 h-6 text-white" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-[#1a2b4a]">
                                                    Administrative Staff
                                                </h3>
                                            </div>
                                            <p className="text-sm text-[#6b6456]">
                                                Office and administrative
                                                support personnel
                                            </p>
                                        </button>

                                        {/* Guidance Counselor */}
                                        <button
                                            onClick={() =>
                                                setSelectedFacultyRole(
                                                    "Guidance Counselor",
                                                )
                                            }
                                            className="p-6 border-2 border-gray-200 rounded-xl hover:border-[#7d1935] hover:bg-[#7d1935]/5 transition-all  group"
                                        >
                                            <div className="flex items-center gap-4 mb-3">
                                                <div className="w-12 h-12 bg-gradient-to-br from-[#4a7d19] to-[#5a9b28] rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    <Heart className="w-6 h-6 text-white" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-[#1a2b4a]">
                                                    Guidance Counselor
                                                </h3>
                                            </div>
                                            <p className="text-sm text-[#6b6456]">
                                                Student counseling and guidance
                                                services
                                            </p>
                                        </button>

                                        {/* School Nurse */}
                                        <button
                                            onClick={() =>
                                                setSelectedFacultyRole(
                                                    "School Nurse",
                                                )
                                            }
                                            className="p-6 border-2 border-gray-200 rounded-xl hover:border-[#7d1935] hover:bg-[#7d1935]/5 transition-all  group"
                                        >
                                            <div className="flex items-center gap-4 mb-3">
                                                <div className="w-12 h-12 bg-gradient-to-br from-[#dc2626] to-[#ef4444] rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    <Stethoscope className="w-6 h-6 text-white" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-[#1a2b4a]">
                                                    School Nurse
                                                </h3>
                                            </div>
                                            <p className="text-sm text-[#6b6456]">
                                                Health services and medical
                                                assistance
                                            </p>
                                        </button>

                                        {/* Maintenance Staff */}
                                        <button
                                            onClick={() =>
                                                setSelectedFacultyRole(
                                                    "Maintenance Staff",
                                                )
                                            }
                                            className="p-6 border-2 border-gray-200 rounded-xl hover:border-[#7d1935] hover:bg-[#7d1935]/5 transition-all  group"
                                        >
                                            <div className="flex items-center gap-4 mb-3">
                                                <div className="w-12 h-12 bg-gradient-to-br from-[#78350f] to-[#92400e] rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    <Wrench className="w-6 h-6 text-white" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-[#1a2b4a]">
                                                    Maintenance Staff
                                                </h3>
                                            </div>
                                            <p className="text-sm text-[#6b6456]">
                                                Facilities maintenance and
                                                janitorial services
                                            </p>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // Faculty/Staff Form (inserts into Supabase employees table)
                                <FacultyForm
                                    role={selectedFacultyRole}
                                    onCancel={() =>
                                        setSelectedFacultyRole(null)
                                    }
                                    onAdded={(employeeId) => {
                                        setNewFacultyId(employeeId);
                                        setShowFacultyModal(false);
                                        setSelectedFacultyRole(null);
                                    }}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Event Modal */}
            {showEventModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-none">
                        <div className="sticky top-0 bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Calendar className="w-6 h-6" />
                                <h2 className="text-xl font-semibold">
                                    Create School Event
                                </h2>
                            </div>
                            <button
                                onClick={() => setShowEventModal(false)}
                                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Event Details */}
                            <div>
                                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">
                                    Event Details
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Event Title *
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                            placeholder="Enter event title"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Event Type *
                                        </label>
                                        <select className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]">
                                            <option value="">
                                                Select type
                                            </option>
                                            <option value="academic">
                                                Academic
                                            </option>
                                            <option value="religious">
                                                Religious/Spiritual
                                            </option>
                                            <option value="sports">
                                                Sports & Athletics
                                            </option>
                                            <option value="cultural">
                                                Cultural
                                            </option>
                                            <option value="parent-meeting">
                                                Parent Meeting
                                            </option>
                                            <option value="holiday">
                                                Holiday/Break
                                            </option>
                                            <option value="other">Other</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                                Start Date & Time *
                                            </label>
                                            <input
                                                type="datetime-local"
                                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                                End Date & Time *
                                            </label>
                                            <input
                                                type="datetime-local"
                                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Location *
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                            placeholder="Enter event location"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Description *
                                        </label>
                                        <textarea
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                            rows={4}
                                            placeholder="Describe the event details, objectives, and any special instructions"
                                        ></textarea>
                                    </div>
                                </div>
                            </div>

                            {/* Target Audience */}
                            <div>
                                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">
                                    Target Audience
                                </h3>
                                <div className="space-y-3">
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-[#faf8f5] cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 text-[#c9a961] rounded"
                                        />
                                        <span className="text-sm text-[#2c2c2c]">
                                            All Students
                                        </span>
                                    </label>
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-[#faf8f5] cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 text-[#c9a961] rounded"
                                        />
                                        <span className="text-sm text-[#2c2c2c]">
                                            Parents/Guardians
                                        </span>
                                    </label>
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-[#faf8f5] cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 text-[#c9a961] rounded"
                                        />
                                        <span className="text-sm text-[#2c2c2c]">
                                            Teachers & Staff
                                        </span>
                                    </label>
                                    <div>
                                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                            Specific Grade Levels (Optional)
                                        </label>
                                        <select
                                            multiple
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                            size={3}
                                        >
                                            <option value="1">Grade 1</option>
                                            <option value="2">Grade 2</option>
                                            <option value="3">Grade 3</option>
                                            <option value="4">Grade 4</option>
                                            <option value="5">Grade 5</option>
                                            <option value="6">Grade 6</option>
                                        </select>
                                        <p className="text-xs text-[#8b8476] mt-1">
                                            Hold Ctrl/Cmd to select multiple
                                            grades
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3 pt-4 border-t border-gray-200">
                                <button
                                    onClick={() => setShowEventModal(false)}
                                    className="flex-1 px-6 py-3 border-2 border-gray-200 text-[#2c2c2c] rounded-lg hover:border-[#c9a961] hover:bg-[#faf8f5] transition-all font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        alert("Event created successfully!");
                                        setShowEventModal(false);
                                    }}
                                    className="flex-1 px-6 py-3 bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white rounded-lg hover:shadow-lg transition-all font-medium"
                                >
                                    Create Event
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Academic departments available for teacher subject specialization (must match `departments` table)
const TEACHER_SUBJECTS = [
    "Mathematics",
    "English",
    "Science",
    "Filipino",
    "Araling Panlipunan",
    "MAPEH",
    "Christian Living",
];

// Non-teacher faculty/staff roles map to a fixed department in the `departments` table
const ROLE_DEPARTMENTS: Record<string, string> = {
    "Administrative Staff": "Administration",
    "Guidance Counselor": "Student Services",
    "School Nurse": "Health Services",
    "Maintenance Staff": "Maintenance & Facilities",
};

// Faculty/Staff Form Component — inserts a new row into the Supabase `employees` table
function FacultyForm({
    role,
    onCancel,
    onAdded,
}: {
    role: string;
    onCancel: () => void;
    onAdded: (employeeId: string) => void;
}) {
    const empty = {
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        subject: TEACHER_SUBJECTS[0],
        subDetail: "",
        licenseNo: "",
        employmentType: "" as "" | "full-time" | "part-time" | "contractual",
        startDate: "",
        qualifications: "",
    };
    const [form, setForm] = useState(empty);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isTeacher = role === "Teacher";
    const adminStaffDepartments = [
        "Registrar's Office",
        "Admissions Office",
        "Accounting",
        "Human Resources",
        "Principal's Office",
    ];
    const counselingFocuses = [
        "Academic Counseling",
        "Career Guidance",
        "Personal/Social Development",
        "Special Needs Support",
    ];
    const maintenanceRoles = [
        "Janitorial Services",
        "Electrician",
        "Plumber",
        "Carpenter",
        "Groundskeeper",
    ];

    const handleSubmit = async () => {
        if (
            !form.firstName.trim() ||
            !form.lastName.trim() ||
            !form.email.trim() ||
            !form.phone.trim() ||
            !form.employmentType ||
            !form.startDate
        ) {
            setError("Please fill in all required fields.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const departmentName = isTeacher
                ? form.subject
                : ROLE_DEPARTMENTS[role] || "Administration";
            const notesParts = [form.subDetail, form.qualifications].filter(
                Boolean,
            );
            const employee = await insertEmployee({
                fullName: `${form.firstName.trim()} ${form.lastName.trim()}`,
                position: role,
                departmentName,
                email: form.email.trim(),
                phone: form.phone.trim(),
                employmentType: form.employmentType,
                dateHired: form.startDate,
                licenseNo: form.licenseNo || null,
                notes: notesParts.length ? notesParts.join(" — ") : null,
            });
            onAdded(employee.id as string);
        } catch (e: any) {
            setError(e?.message || `Failed to add ${role}.`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Personal Information */}
            <div>
                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">
                    Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                            First Name *
                        </label>
                        <input
                            type="text"
                            value={form.firstName}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    firstName: e.target.value,
                                }))
                            }
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                            placeholder="Enter first name"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                            Last Name *
                        </label>
                        <input
                            type="text"
                            value={form.lastName}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    lastName: e.target.value,
                                }))
                            }
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                            placeholder="Enter last name"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                            Email Address *
                        </label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    email: e.target.value,
                                }))
                            }
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                            placeholder="staff@dumaguete-mission.edu"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                            Contact Number *
                        </label>
                        <input
                            type="tel"
                            value={form.phone}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    phone: e.target.value,
                                }))
                            }
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                            placeholder="+63 917 234 5678"
                        />
                    </div>
                </div>
            </div>

            {/* Employment Information */}
            <div>
                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">
                    Employment Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isTeacher && (
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                Subject Specialization *
                            </label>
                            <select
                                value={form.subject}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        subject: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                            >
                                {TEACHER_SUBJECTS.map((s) => (
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {role === "Administrative Staff" && (
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                Office
                            </label>
                            <select
                                value={form.subDetail}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        subDetail: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                            >
                                <option value="">Select office</option>
                                {adminStaffDepartments.map((d) => (
                                    <option key={d} value={d}>
                                        {d}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {role === "Guidance Counselor" && (
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                Counseling Focus
                            </label>
                            <select
                                value={form.subDetail}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        subDetail: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                            >
                                <option value="">Select focus area</option>
                                {counselingFocuses.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {role === "School Nurse" && (
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                License Number
                            </label>
                            <input
                                type="text"
                                value={form.licenseNo}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        licenseNo: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                                placeholder="PRC License Number"
                            />
                        </div>
                    )}
                    {role === "Maintenance Staff" && (
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                Role Type
                            </label>
                            <select
                                value={form.subDetail}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        subDetail: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                            >
                                <option value="">Select role</option>
                                {maintenanceRoles.map((r) => (
                                    <option key={r} value={r}>
                                        {r}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                            Employment Type *
                        </label>
                        <select
                            value={form.employmentType}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    employmentType: e.target
                                        .value as typeof f.employmentType,
                                }))
                            }
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                        >
                            <option value="">Select type</option>
                            <option value="full-time">Full-time</option>
                            <option value="part-time">Part-time</option>
                            <option value="contractual">Contractual</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                            Start Date *
                        </label>
                        <input
                            type="date"
                            value={form.startDate}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    startDate: e.target.value,
                                }))
                            }
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                        />
                    </div>
                </div>
            </div>

            {/* Qualifications */}
            <div>
                <label className="block text-sm font-medium text-[#6b6456] mb-2">
                    Qualifications & Certifications
                </label>
                <textarea
                    value={form.qualifications}
                    onChange={(e) =>
                        setForm((f) => ({
                            ...f,
                            qualifications: e.target.value,
                        }))
                    }
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961]"
                    rows={3}
                    placeholder="Enter qualifications, degrees, and certifications"
                ></textarea>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                    onClick={onCancel}
                    className="flex-1 px-6 py-3 border-2 border-gray-200 text-[#2c2c2c] rounded-lg hover:border-[#c9a961] hover:bg-[#faf8f5] transition-all font-medium"
                >
                    Back
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg hover:shadow-lg transition-all font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {submitting ? "Adding…" : `Add ${role}`}
                </button>
            </div>
        </div>
    );
}

// Student Management Section
type StudentStatus =
    | "Active"
    | "Graduate"
    | "Dropped"
    | "Transferred"
    | "Archived";

type Student = {
    id: string;
    name: string;
    firstName: string;
    middleName: string;
    lastName: string;
    suffix: string;
    grade: string;
    section: string;
    gpa: number;
    status: StudentStatus;
    email: string;
    phone: string;
    enrolled: string;
    guardianName: string;
    guardianRelationship: string;
    guardianPhone: string;
    guardianEmail: string;
    isTransferee: boolean;
    transferDate: string;
};

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

function studentRowToStudent(
    row: any,
    isTransferee: boolean,
    transferDate: string = "",
): Student {
    const name =
        [row.first_name, row.middle_name, row.last_name]
            .filter(Boolean)
            .join(" ") + (row.suffix ? ` ${row.suffix}` : "");
    return {
        id: row.id,
        name,
        firstName: row.first_name || "",
        middleName: row.middle_name || "",
        lastName: row.last_name || "",
        suffix: row.suffix || "",
        grade: row.grade_level,
        section: row.section || "",
        gpa: row.gpa ?? null,
        status: row.status,
        email: row.email || "",
        phone: row.phone || "",
        enrolled: row.enrolled_date
            ? new Date(row.enrolled_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
              })
            : "",
        guardianName: row.guardian_name || "",
        guardianRelationship: row.guardian_relationship || "",
        guardianPhone: row.guardian_phone || "",
        guardianEmail: row.guardian_email || "",
        isTransferee,
        transferDate,
    };
}

// Splits a "First Middle Last" name into { firstName, lastName } for writing back to the
// students table's separate first_name/last_name columns (same "last word = family name"
// convention used by familyName/formatFamilyNameFirst throughout this file).
function splitStudentName(fullName: string): {
    firstName: string;
    lastName: string;
} {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 2)
        return { firstName: fullName.trim(), lastName: fullName.trim() };
    return {
        firstName: parts.slice(0, -1).join(" "),
        lastName: parts[parts.length - 1],
    };
}

function StudentManagement({
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
            setLoading(false);
            return;
        }

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

    // The Guard portal's scanner only accepts the PickupQRPayload shape it and the Parent
    // portal share (see GuardPortal.tsx / ParentPortal.tsx) — type 'permanent' plus the
    // guardian's real student_guardians link id, not the denormalized guardian_* text
    // fields on the student row. Fetch that link when the detail modal opens.
    const [primaryGuardian, setPrimaryGuardian] = useState<
        { id: string; name: string; relationship: string } | null | undefined
    >(undefined);

    useEffect(() => {
        if (!showViewModal || !selectedStudent) {
            setPrimaryGuardian(undefined);
            return;
        }
        let cancelled = false;
        setPrimaryGuardian(undefined);
        (async () => {
            const { data } = await supabase
                .from("student_guardians")
                .select(
                    "guardian_id, relationship, is_primary_contact, guardians(full_name)",
                )
                .eq("student_id", selectedStudent.id)
                .order("is_primary_contact", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (cancelled) return;
            setPrimaryGuardian(
                data
                    ? {
                          id: data.guardian_id,
                          name:
                              (data as any).guardians?.full_name ??
                              selectedStudent.guardianName,
                          relationship: data.relationship,
                      }
                    : null,
            );
        })();
        return () => {
            cancelled = true;
        };
    }, [showViewModal, selectedStudent]);

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

    const buildGuardianQRPayload = (
        student: Student,
        guardian: { id: string; name: string; relationship: string },
    ) =>
        JSON.stringify({
            type: "permanent",
            guardianId: guardian.id,
            guardianName: guardian.name,
            relationship: guardian.relationship,
            studentId: student.id,
            studentName: student.name,
        });

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
                          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${s.subject}</td>
                          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${s.teacher}</td>
                          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${s.schedule || "No schedule set"}</td>
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
                          <title>Subject Assessment — ${selectedStudent.name}</title>
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
                            <img src="${logoDataUrl}" alt="School logo" />
                            <div>
                              <h2>${schoolInfo.school_name.toUpperCase()}</h2>
                              ${schoolInfo.school_address ? `<p>${schoolInfo.school_address}</p>` : ""}
                            </div>
                          </div>
                          <h1>Subject Assessment</h1>
                          <p>${selectedStudent.name} • ${selectedStudent.grade}${selectedStudent.section ? ` - ${selectedStudent.section}` : ""}</p>
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
                                    onClick={() =>
                                        setShowPaymentHistoryModal(false)
                                    }
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
                        <div className="max-w-2xl mx-auto">
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
                                    <div className="mb-4 p-3 bg-white border border-gray-200 rounded-lg flex items-center justify-between text-sm">
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
                                    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 px-4">
                                        {paymentHistory.map((p) => (
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
                    <div className="max-w-2xl mx-auto space-y-5">
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

                            {/* Parent/Guardian QR Authentication Pass */}
                            <div className="border-2 border-[#c9a961]/40 rounded-xl p-5 bg-[#fdf9f0]">
                                <div className="flex items-center gap-2 mb-4">
                                    <QrCode className="w-5 h-5 text-[#c9a961]" />
                                    <h3 className="text-sm font-semibold text-[#1a2b4a]">
                                        Parent/Guardian QR Authentication Pass
                                    </h3>
                                </div>
                                {primaryGuardian === undefined ? (
                                    <p className="text-sm text-[#8b8476]">
                                        Loading linked guardian…
                                    </p>
                                ) : primaryGuardian === null ? (
                                    <p className="text-sm text-[#8b8476]">
                                        No guardian is linked to this student
                                        yet in Student Guardians, so a pickup QR
                                        can't be issued here. Ask the parent to
                                        generate one from their Parent Portal
                                        Pickup screen once they're linked, or
                                        link a guardian first.
                                    </p>
                                ) : (
                                    <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
                                        <div
                                            id={`guardian-qr-${selectedStudent.id}`}
                                            className="p-3 bg-white rounded-lg border border-gray-200 shrink-0"
                                        >
                                            <QRCodeSVG
                                                value={buildGuardianQRPayload(
                                                    selectedStudent,
                                                    primaryGuardian,
                                                )}
                                                size={128}
                                                level="M"
                                                includeMargin={false}
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-1.5 text-sm">
                                            <p>
                                                <span className="text-[#8b8476]">
                                                    Authorized Guardian:
                                                </span>{" "}
                                                <span className="font-semibold text-[#2c2c2c]">
                                                    {primaryGuardian.name}
                                                </span>
                                            </p>
                                            <p>
                                                <span className="text-[#8b8476]">
                                                    Relationship:
                                                </span>{" "}
                                                <span className="font-medium text-[#2c2c2c]">
                                                    {
                                                        primaryGuardian.relationship
                                                    }
                                                </span>
                                            </p>
                                            <p className="text-xs text-[#8b8476] pt-1">
                                                Present this QR code at
                                                dismissal. Security personnel
                                                will scan it to verify the
                                                guardian's identity before
                                                releasing{" "}
                                                {
                                                    selectedStudent.name.split(
                                                        " ",
                                                    )[0]
                                                }
                                                .
                                            </p>
                                            <button
                                                onClick={() => window.print()}
                                                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 border-2 border-[#c9a961] text-[#1a2b4a] rounded-lg text-xs font-semibold hover:bg-[#c9a961]/10 transition-all"
                                            >
                                                <Printer className="w-3.5 h-3.5" />{" "}
                                                Print Pass
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

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
                                <button
                                    onClick={() => setShowViewModal(false)}
                                    className="px-4 py-2.5 border-2 border-gray-200 text-[#6b6456] rounded-lg font-medium hover:bg-[#faf8f5] transition-all text-sm"
                                >
                                    Back
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

function StudentEditModal({
    student,
    gradeOptions,
    sectionOptionsForGrade,
    saving,
    error,
    schoolYear,
    isRegistrar,
    onCancel,
    onChangeStatus,
    onSave,
}: {
    student: Student;
    gradeOptions: string[];
    sectionOptionsForGrade: (grade: string) => string[];
    saving: boolean;
    error: string | null;
    schoolYear: string;
    isRegistrar: boolean;
    onCancel: () => void;
    onChangeStatus: () => void;
    onSave: (form: {
        firstName: string;
        middleName: string;
        lastName: string;
        suffix: string;
        email: string;
        phone: string;
        grade: string;
        section: string;
    }) => void;
}) {
    const SUFFIX_OPTIONS = ["", "Jr.", "Sr.", "II", "III", "IV", "V"];
    const [form, setForm] = useState({
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
        suffix: student.suffix,
        email: student.email,
        phone: student.phone,
        grade: student.grade,
        section: student.section,
    });
    const sectionOptions = sectionOptionsForGrade(form.grade);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <button
                        onClick={onCancel}
                        className="flex items-center gap-1.5 text-base font-medium text-[#1a2b4a] hover:underline mb-2"
                    >
                        <ChevronDown className="w-5 h-5 rotate-90" />
                        Back to Student Management
                    </button>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        Edit Student
                    </h1>
                    <p className="text-[#6b6456]">
                        {student.firstName} {student.lastName}
                    </p>
                </div>
                <button
                    onClick={onChangeStatus}
                    className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-gray-200 text-[#1a2b4a] rounded-lg text-xs font-semibold hover:border-[#1a2b4a]/30 transition-all"
                    title="Change Status"
                >
                    <UserCheck className="w-3.5 h-3.5" /> Change Status
                </button>
            </div>
            <div className="max-w-2xl mx-auto space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[#6b6456] mb-1">
                            Student ID
                        </label>
                        <input
                            type="text"
                            value={student.id}
                            disabled
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 text-black"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Last Name
                            </label>
                            <input
                                type="text"
                                value={form.lastName}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        lastName: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                First Name
                            </label>
                            <input
                                type="text"
                                value={form.firstName}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        firstName: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Middle Name{" "}
                                <span className="text-[#8b8476] font-normal">
                                    (Optional)
                                </span>
                            </label>
                            <input
                                type="text"
                                value={form.middleName}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        middleName: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Suffix{" "}
                                <span className="text-[#8b8476] font-normal">
                                    (Optional)
                                </span>
                            </label>
                            <select
                                value={form.suffix}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        suffix: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            >
                                {SUFFIX_OPTIONS.map((s) => (
                                    <option key={s || "none"} value={s}>
                                        {s || "None"}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Email
                            </label>
                            <input
                                type="text"
                                value={form.email}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        email: e.target.value,
                                    }))
                                }
                                disabled={isRegistrar}
                                title={
                                    isRegistrar
                                        ? "Only an Administrator can change a student's email"
                                        : undefined
                                }
                                className={`w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black ${isRegistrar ? "bg-gray-50 text-gray-400 cursor-not-allowed" : ""}`}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Phone
                            </label>
                            <input
                                type="text"
                                value={form.phone}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        phone: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Grade Level
                            </label>
                            <select
                                value={form.grade}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        grade: e.target.value,
                                        section:
                                            sectionOptionsForGrade(
                                                e.target.value,
                                            )[0] || "",
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            >
                                {gradeOptions.map((g) => (
                                    <option key={g}>{g}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Section
                            </label>
                            {sectionOptions.length > 0 ? (
                                <select
                                    value={form.section}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            section: e.target.value,
                                        }))
                                    }
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                                >
                                    {sectionOptions.map((s) => (
                                        <option key={s}>{s}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    value="None"
                                    disabled
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 text-black"
                                />
                            )}
                        </div>
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}
                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                        <button
                            onClick={onCancel}
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onSave(form)}
                            disabled={saving}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60"
                        >
                            {saving ? "Saving…" : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>
    );
}

// Teachers List (Admin, Class Management) — for each teacher, the subjects they're assigned
// to teach this school year and the students enrolled in each of those classes.
function TeachersListSection({ schoolYear }: { schoolYear: string }) {
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
                          "id, first_name, middle_name, last_name, suffix, grade_level, section, status, school_years!inner(label)",
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

// Class Management Section (Admin) — grade-level tabs, section rosters, and student assignment
function ClassManagementSection({
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

// Staff & Employee Management Section
function StaffManagement({
    schoolYear,
    isAdmin,
}: {
    schoolYear: string;
    isAdmin: boolean;
}) {
    type EmployeeStatus = "active" | "on-leave" | "inactive";

    type Employee = {
        id: string;
        name: string;
        position: string;
        department: string;
        email: string;
        phone: string;
        education: string;
        dateHired: string;
        status: EmployeeStatus;
        address: string;
        licenseNo?: string;
        notes?: string;
    };

    // Positions offered when adding a new employee — each maps to a login role (see STAFF_POSITION_ROLES)
    const ADD_POSITIONS = [
        "Teacher",
        "Admin",
        "Registrar",
        "Cashier",
        "Guard",
    ] as const;

    const employeeRowToEmployee = (row: any): Employee => ({
        id: row.id,
        name: row.full_name,
        position: row.position,
        department: row.departments?.name || "",
        email: row.email || "",
        phone: row.phone || "",
        education: row.education || "",
        dateHired: row.date_hired
            ? new Date(row.date_hired).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
              })
            : "",
        status: row.status,
        address: row.address || "",
        licenseNo: row.license_no || undefined,
        notes: row.notes || undefined,
    });

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const loadEmployees = async () => {
        setLoading(true);
        setLoadError(null);
        const [{ data: empRows, error }, { data: deptRows }] =
            await Promise.all([
                supabase
                    .from("employees")
                    .select(
                        "id, full_name, position, email, phone, education, date_hired, status, address, license_no, notes, departments(name)",
                    )
                    .is("deleted_at", null)
                    .order("full_name"),
                supabase.from("departments").select("name").order("name"),
            ]);
        if (error) {
            setLoadError(error.message);
            setLoading(false);
            return;
        }
        setEmployees((empRows ?? []).map(employeeRowToEmployee));
        setDepartments((deptRows ?? []).map((d: any) => d.name));
        setLoading(false);
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await loadEmployees();
            if (cancelled) return;
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
        null,
    );
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [search, setSearch] = useState("");
    const [deptFilter, setDeptFilter] = useState("All");
    const [activeTab, setActiveTab] = useState<"all" | EmployeeStatus>("all");
    const SUFFIX_OPTIONS = ["", "Jr.", "Sr.", "II", "III", "IV", "V"];
    const [newEmployee, setNewEmployee] = useState<{
        firstName: string;
        middleName: string;
        lastName: string;
        suffix: string;
        position: "" | (typeof ADD_POSITIONS)[number];
        subject: string;
        email: string;
        phone: string;
        education: string;
        dateHired: string;
        address: string;
        licenseNo: string;
        employmentType: "" | "full-time" | "part-time" | "contractual";
    }>({
        firstName: "",
        middleName: "",
        lastName: "",
        suffix: "",
        position: "",
        subject: TEACHER_SUBJECTS[0],
        email: "",
        phone: "",
        education: "",
        dateHired: "",
        address: "",
        licenseNo: "",
        employmentType: "",
    });
    const composeEmployeeName = (f: {
        firstName: string;
        middleName: string;
        lastName: string;
        suffix: string;
    }) =>
        [f.firstName.trim(), f.middleName.trim(), f.lastName.trim()]
            .filter(Boolean)
            .join(" ") + (f.suffix ? ` ${f.suffix}` : "");
    const [addingEmployee, setAddingEmployee] = useState(false);
    const [addEmployeeError, setAddEmployeeError] = useState<string | null>(
        null,
    );
    const [newEmployeeCredentials, setNewEmployeeCredentials] = useState<{
        name: string;
        email: string;
        password: string | null;
        emailSent?: boolean;
    } | null>(null);

    const statusConfig: Record<
        EmployeeStatus,
        { label: string; bg: string; text: string; dot: string }
    > = {
        active: {
            label: "Active",
            bg: "bg-green-100",
            text: "text-green-800",
            dot: "bg-green-500",
        },
        "on-leave": {
            label: "On Leave",
            bg: "bg-yellow-100",
            text: "text-yellow-800",
            dot: "bg-yellow-500",
        },
        inactive: {
            label: "Inactive",
            bg: "bg-gray-200",
            text: "text-gray-700",
            dot: "bg-gray-500",
        },
    };

    const tabs = [
        { id: "all", label: "All", count: employees.length },
        {
            id: "active",
            label: "Active",
            count: employees.filter((e) => e.status === "active").length,
        },
        {
            id: "on-leave",
            label: "On Leave",
            count: employees.filter((e) => e.status === "on-leave").length,
        },
        {
            id: "inactive",
            label: "Inactive",
            count: employees.filter((e) => e.status === "inactive").length,
        },
    ] as const;

    const filtered = employees
        .filter((e) => activeTab === "all" || e.status === activeTab)
        .filter((e) => deptFilter === "All" || e.department === deptFilter)
        .filter(
            (e) =>
                !search ||
                e.name.toLowerCase().includes(search.toLowerCase()) ||
                e.id.toLowerCase().includes(search.toLowerCase()) ||
                e.position.toLowerCase().includes(search.toLowerCase()),
        );

    const openDetail = (emp: Employee) => {
        setSelectedEmployee(emp);
        setShowDetailModal(true);
    };
    const openEdit = (emp: Employee) => {
        setSelectedEmployee(emp);
        setShowEditModal(true);
    };

    const deleteEmployee = async () => {
        if (!selectedEmployee) return;
        setDeleteError(null);
        if (isAdmin) {
            try {
                await deleteAuthAccountFor({ employeeId: selectedEmployee.id });
            } catch (e: any) {
                setDeleteError(
                    e?.message ||
                        "Failed to remove the employee's login account.",
                );
                return;
            }
        }
        // Soft-delete: employees are referenced by historical records (payments,
        // pickup logs, class section advisers, etc.), so a hard delete would either
        // fail on those foreign keys or erase the name from past school years.
        // Marking deleted_at instead keeps history intact while hiding the staff
        // member from active lists going forward.
        const { error } = await supabase
            .from("employees")
            .update({ deleted_at: new Date().toISOString(), status: "inactive" })
            .eq("id", selectedEmployee.id);
        if (error) {
            setDeleteError(error.message);
            return;
        }
        setEmployees((prev) =>
            prev.filter((e) => e.id !== selectedEmployee.id),
        );
        setShowDeleteModal(false);
        setShowDetailModal(false);
    };

    const saveEdit = async (updated: Employee) => {
        const departmentId = await getDepartmentIdByName(updated.department);
        const { error } = await supabase
            .from("employees")
            .update({
                full_name: updated.name,
                position: updated.position,
                department_id: departmentId,
                email: updated.email || null,
                phone: updated.phone,
                education: updated.education || null,
                address: updated.address || null,
                license_no: updated.licenseNo || null,
            })
            .eq("id", updated.id);
        if (error) {
            setLoadError(error.message);
            return;
        }
        setEmployees((prev) =>
            prev.map((e) => (e.id === updated.id ? updated : e)),
        );
        setShowEditModal(false);
    };

    const addEmployee = async () => {
        if (
            !newEmployee.firstName.trim() ||
            !newEmployee.lastName.trim() ||
            !newEmployee.position ||
            !newEmployee.phone.trim() ||
            !newEmployee.dateHired ||
            !newEmployee.employmentType
        ) {
            setAddEmployeeError(
                "Please fill in first name, last name, position, employment type, phone, and date hired.",
            );
            return;
        }
        if (newEmployee.position === "Teacher" && !newEmployee.subject) {
            setAddEmployeeError("Please select a subject.");
            return;
        }
        if (!newEmployee.email.trim()) {
            setAddEmployeeError("Please enter an email address.");
            return;
        }
        setAddingEmployee(true);
        setAddEmployeeError(null);
        const fullName = composeEmployeeName(newEmployee);
        const departmentName =
            newEmployee.position === "Teacher" ? newEmployee.subject : "";
        let inserted: { id: string } | null = null;
        try {
            inserted = (await insertEmployee({
                fullName,
                position: newEmployee.position,
                departmentName,
                email: newEmployee.email.trim(),
                phone: newEmployee.phone,
                education: newEmployee.education || null,
                employmentType: newEmployee.employmentType || null,
                dateHired: newEmployee.dateHired,
                address: newEmployee.address || null,
                licenseNo: newEmployee.licenseNo || null,
            })) as { id: string };
            const role = STAFF_POSITION_ROLES[newEmployee.position];
            const credentials = await createStaffAccount(
                inserted.id,
                role,
                newEmployee.email.trim(),
            );
            setEmployees((prev) => [
                ...prev,
                {
                    id: inserted!.id,
                    name: fullName,
                    position: newEmployee.position,
                    department: departmentName,
                    email: credentials.email,
                    phone: newEmployee.phone,
                    education: newEmployee.education,
                    dateHired: newEmployee.dateHired,
                    status: "active",
                    address: newEmployee.address,
                    licenseNo: newEmployee.licenseNo || undefined,
                },
            ]);
            setNewEmployee({
                firstName: "",
                middleName: "",
                lastName: "",
                suffix: "",
                position: "",
                subject: TEACHER_SUBJECTS[0],
                email: "",
                phone: "",
                education: "",
                dateHired: "",
                address: "",
                licenseNo: "",
                employmentType: "",
            });
            setShowAddModal(false);
            setNewEmployeeCredentials({
                name: fullName,
                email: credentials.email,
                password: credentials.password,
                emailSent: credentials.emailSent ?? false,
            });
        } catch (e: any) {
            // supabase.functions.invoke can throw on a client-side network/timeout error even
            // after create-staff-account finished successfully server-side. Before reporting a
            // false failure, check whether the login account actually got created.
            if (inserted) {
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("email")
                    .eq("employee_id", inserted.id)
                    .maybeSingle();
                if (profile?.email) {
                    setEmployees((prev) => [
                        ...prev,
                        {
                            id: inserted!.id,
                            name: fullName,
                            position: newEmployee.position,
                            department: departmentName,
                            email: profile.email,
                            phone: newEmployee.phone,
                            education: newEmployee.education,
                            dateHired: newEmployee.dateHired,
                            status: "active",
                            address: newEmployee.address,
                            licenseNo: newEmployee.licenseNo || undefined,
                        },
                    ]);
                    setNewEmployee({
                        firstName: "",
                        middleName: "",
                        lastName: "",
                        suffix: "",
                        position: "",
                        subject: TEACHER_SUBJECTS[0],
                        email: "",
                        phone: "",
                        education: "",
                        dateHired: "",
                        address: "",
                        licenseNo: "",
                        employmentType: "",
                    });
                    setShowAddModal(false);
                    setNewEmployeeCredentials({
                        name: fullName,
                        email: profile.email,
                        password: null,
                        emailSent: true,
                    });
                    setAddingEmployee(false);
                    return;
                }
            }
            setAddEmployeeError(e?.message || "Failed to add employee.");
        } finally {
            setAddingEmployee(false);
        }
    };

    const initials = (name: string) =>
        name
            .split(" ")
            .filter((_: string, i: number) => i > 0 && i <= 2)
            .map((n: string) => n[0])
            .join("");

    if (showEditModal && selectedEmployee) {
        return (
            <EmployeeEditModal
                employee={selectedEmployee}
                departments={departments}
                onCancel={() => setShowEditModal(false)}
                onSave={saveEdit}
            />
        );
    }

    if (showDetailModal && selectedEmployee) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => setShowDetailModal(false)}
                    className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] font-medium"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Staff Management</span>
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        Employee Details
                    </h1>
                    <p className="text-[#6b6456]">
                        Full profile for {selectedEmployee.name}
                    </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                    <div className="p-6 space-y-5">
                        <div className="flex items-start gap-4 pb-5 border-b border-gray-200">
                            <div className="w-16 h-16 bg-gradient-to-br from-[#1a2b4a] to-[#7d1935] rounded-xl flex items-center justify-center text-white text-xl font-bold shrink-0">
                                {initials(selectedEmployee.name)}
                            </div>
                            <div>
                                <h4 className="text-xl font-bold text-[#1a2b4a]">
                                    {selectedEmployee.name}
                                </h4>
                                <p className="text-[#c9a961] font-medium">
                                    {selectedEmployee.position} –{" "}
                                    {selectedEmployee.department}
                                </p>
                                <span
                                    className={`inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusConfig[selectedEmployee.status].bg} ${statusConfig[selectedEmployee.status].text}`}
                                >
                                    {statusConfig[selectedEmployee.status].label}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[
                                {
                                    label: "Employee ID",
                                    value: selectedEmployee.id,
                                },
                                {
                                    label: "Email Address",
                                    value: selectedEmployee.email,
                                },
                                {
                                    label: "Phone Number",
                                    value: selectedEmployee.phone,
                                },
                                {
                                    label: "Home Address",
                                    value: selectedEmployee.address,
                                },
                                {
                                    label: "Educational Background",
                                    value: selectedEmployee.education,
                                },
                                {
                                    label: "Professional License No.",
                                    value: selectedEmployee.licenseNo || "N/A",
                                },
                                {
                                    label: "Date Hired",
                                    value: selectedEmployee.dateHired,
                                },
                            ].map((item) => (
                                <div
                                    key={item.label}
                                    className="bg-[#faf8f5] rounded-lg p-3"
                                >
                                    <p className="text-xs font-semibold text-[#8b8476] mb-1 uppercase tracking-wide">
                                        {item.label}
                                    </p>
                                    <p className="text-sm text-[#2c2c2c] font-medium">
                                        {item.value}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {selectedEmployee.notes && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm font-semibold text-blue-800">
                                    Notes:
                                </p>
                                <p className="text-sm text-blue-700 mt-1">
                                    {selectedEmployee.notes}
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="p-6 border-t border-gray-200 flex flex-wrap gap-3">
                        <button
                            onClick={() => {
                                setShowDetailModal(false);
                                openEdit(selectedEmployee);
                            }}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all text-sm"
                        >
                            Edit
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (showAddModal) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => setShowAddModal(false)}
                    className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] font-medium"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Staff Management</span>
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                        Add New Employee
                    </h1>
                    <p className="text-[#6b6456]">
                        Create a new staff account • {schoolYear}
                    </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Last Name
                            </label>
                            <input
                                value={newEmployee.lastName}
                                onChange={(e) =>
                                    setNewEmployee((f) => ({
                                        ...f,
                                        lastName: e.target.value,
                                    }))
                                }
                                placeholder="e.g. Dela Cruz"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                First Name
                            </label>
                            <input
                                value={newEmployee.firstName}
                                onChange={(e) =>
                                    setNewEmployee((f) => ({
                                        ...f,
                                        firstName: e.target.value,
                                    }))
                                }
                                placeholder="e.g. Juana"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Middle Name{" "}
                                <span className="text-[#8b8476] font-normal">
                                    (optional)
                                </span>
                            </label>
                            <input
                                value={newEmployee.middleName}
                                onChange={(e) =>
                                    setNewEmployee((f) => ({
                                        ...f,
                                        middleName: e.target.value,
                                    }))
                                }
                                placeholder="e.g. Reyes"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Suffix
                            </label>
                            <select
                                value={newEmployee.suffix}
                                onChange={(e) =>
                                    setNewEmployee((f) => ({
                                        ...f,
                                        suffix: e.target.value,
                                    }))
                                }
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 bg-white text-black"
                            >
                                {SUFFIX_OPTIONS.map((s) => (
                                    <option key={s || "none"} value={s}>
                                        {s || "None"}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Address
                            </label>
                            <input
                                value={newEmployee.address}
                                onChange={(e) =>
                                    setNewEmployee((f) => ({
                                        ...f,
                                        address: e.target.value,
                                    }))
                                }
                                placeholder="Home address"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Email Address
                            </label>
                            <input
                                type="email"
                                value={newEmployee.email}
                                onChange={(e) =>
                                    setNewEmployee((f) => ({
                                        ...f,
                                        email: e.target.value,
                                    }))
                                }
                                placeholder="e.g. juana.delacruz@missionschool.edu.ph"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Phone
                            </label>
                            <input
                                type="number"
                                value={newEmployee.phone}
                                onChange={(e) =>
                                    setNewEmployee((f) => ({
                                        ...f,
                                        phone: e.target.value,
                                    }))
                                }
                                placeholder="09xxxxxxxxx"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Position
                            </label>
                            <select
                                value={newEmployee.position}
                                onChange={(e) =>
                                    setNewEmployee((f) => ({
                                        ...f,
                                        position: e.target
                                            .value as typeof f.position,
                                    }))
                                }
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                            >
                                <option value="">Select position</option>
                                {ADD_POSITIONS.map((p) => (
                                    <option key={p} value={p}>
                                        {p}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Employment Type
                            </label>
                            <select
                                value={newEmployee.employmentType}
                                onChange={(e) =>
                                    setNewEmployee((f) => ({
                                        ...f,
                                        employmentType: e.target
                                            .value as typeof f.employmentType,
                                    }))
                                }
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                            >
                                <option value="">Select type</option>
                                <option value="full-time">Full-time</option>
                                <option value="part-time">Part-time</option>
                                <option value="contractual">
                                    Contractual
                                </option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Date Hired
                            </label>
                            <input
                                type="date"
                                value={newEmployee.dateHired}
                                onChange={(e) =>
                                    setNewEmployee((f) => ({
                                        ...f,
                                        dateHired: e.target.value,
                                    }))
                                }
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                            />
                        </div>
                    </div>
                    {newEmployee.position === "Teacher" && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                    Subject
                                </label>
                                <select
                                    value={newEmployee.subject}
                                    onChange={(e) =>
                                        setNewEmployee((f) => ({
                                            ...f,
                                            subject: e.target.value,
                                        }))
                                    }
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                                >
                                    {TEACHER_SUBJECTS.map((s) => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Education
                            </label>
                            <input
                                value={newEmployee.education}
                                onChange={(e) =>
                                    setNewEmployee((f) => ({
                                        ...f,
                                        education: e.target.value,
                                    }))
                                }
                                placeholder="e.g. BSEd – Mathematics, Silliman University"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                Professional License No. (optional)
                            </label>
                            <input
                                value={newEmployee.licenseNo}
                                onChange={(e) =>
                                    setNewEmployee((f) => ({
                                        ...f,
                                        licenseNo: e.target.value,
                                    }))
                                }
                                placeholder="e.g. LET-2024-1234"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                            />
                        </div>
                    </div>
                    {addEmployeeError && (
                        <p className="text-sm text-red-500">
                            {addEmployeeError}
                        </p>
                    )}
                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                        <button
                            onClick={() => setShowAddModal(false)}
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={addEmployee}
                            disabled={addingEmployee}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {addingEmployee ? "Adding…" : "Add Employee"}
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
                        Staff Management
                    </h1>
                    <p className="text-[#6b6456]">
                        Manage all employees — teachers, staff, and
                        administration • {schoolYear}
                    </p>
                </div>
                {isAdmin && (
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all"
                    >
                        <UserPlus className="w-4 h-4" />
                        Add Employee
                    </button>
                )}
            </div>

            {/* Search + Department Filter */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 w-md">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8b8476]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name, ID, or position..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-[15px] text-black"
                        />
                    </div>
                </div>
            </div>

            {/* Employee List */}
            <div className="space-y-4">
                {loading && (
                    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-[#8b8476] text-sm">
                        Loading employees…
                    </div>
                )}
                {!loading && loadError && (
                    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-red-500 text-sm">
                        {loadError}
                    </div>
                )}
                {!loading &&
                    !loadError &&
                    filtered.map((emp) => {
                        return (
                            <div
                                key={emp.id}
                                className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-all"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-start gap-2 mb-1">
                                            <h3 className="font-semibold text-[#1a2b4a] text-lg leading-tight">
                                                {emp.name}
                                            </h3>
                                        </div>
                                        <p className="text-sm font-medium text-[#c9a961] mb-1">
                                            {emp.position} – {emp.department}
                                        </p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8b8476]">
                                            <span className="flex items-center gap-1">
                                                <Mail className="w-3 h-3" />
                                                {emp.email}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Phone className="w-3 h-3" />
                                                {emp.phone}
                                            </span>
                                            <span>Hired: {emp.dateHired}</span>
                                        </div>
                                        {emp.notes && (
                                            <p className="text-xs text-[#8b8476] mt-1 italic">
                                                {emp.notes}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2 shrink-0">
                                        <button
                                            onClick={() => openDetail(emp)}
                                            className="flex items-center gap-1.5 px-3 py-2 border-2 border-black text-black rounded-lg text-sm font-medium hover:border-[#1a2b4a] hover:bg-[#faf8f5] transition-all"
                                        >
                                            <Eye className="w-4 h-4" />
                                            <span className="hidden sm:inline text-black">
                                                View
                                            </span>
                                        </button>
                                        {isAdmin && (
                                            <button
                                                onClick={() => {
                                                    setSelectedEmployee(emp);
                                                    setShowDeleteModal(true);
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-2 border-2 border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
                                                title="Remove Employee"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                {!loading && !loadError && filtered.length === 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-[#8b8476]">No employees found.</p>
                    </div>
                )}
            </div>

            {newEmployeeCredentials && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <h2 className="text-xl font-semibold text-[#1a2b4a]">
                            Employee Added
                        </h2>
                        <p className="text-sm text-[#6b6456]">
                            {newEmployeeCredentials.emailSent
                                ? `An activation email was sent to ${newEmployeeCredentials.name} at:`
                                : `${newEmployeeCredentials.name} can now log in to the system with:`}
                        </p>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-1 text-sm">
                            <p>
                                <strong>Email:</strong>{" "}
                                {newEmployeeCredentials.email}
                            </p>
                            {!newEmployeeCredentials.emailSent && (
                                newEmployeeCredentials.password ? (
                                    <p>
                                        <strong>Password:</strong>{" "}
                                        {newEmployeeCredentials.password}
                                    </p>
                                ) : (
                                    <p className="text-[#8b8476]">
                                        We couldn't confirm the generated
                                        password — use Reset Password to set
                                        one before sharing login details.
                                    </p>
                                )
                            )}
                        </div>
                        <button
                            onClick={() => setNewEmployeeCredentials(null)}
                            className="w-full px-6 py-3 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg hover:shadow-lg transition-all font-medium"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && selectedEmployee && isAdmin && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                                <Trash2 className="w-7 h-7 text-red-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-[#1a2b4a] mb-1">
                                    Remove Employee Record
                                </h3>
                                <p className="text-sm text-[#6b6456]">
                                    Permanently remove{" "}
                                    <strong>{selectedEmployee.name}</strong>{" "}
                                    from the employee directory? This action
                                    cannot be undone.
                                </p>
                            </div>
                            {deleteError && (
                                <p className="text-sm text-red-500">
                                    {deleteError}
                                </p>
                            )}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowDeleteModal(false);
                                        setDeleteError(null);
                                    }}
                                    className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={deleteEmployee}
                                    className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-all"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function EmployeeEditModal({
    employee,
    departments,
    onCancel,
    onSave,
}: {
    employee: any;
    departments: string[];
    onCancel: () => void;
    onSave: (updated: any) => void;
}) {
    const [form, setForm] = useState({ ...employee });
    return (
        <div className="space-y-6">
            <button
                onClick={onCancel}
                className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] font-medium"
            >
                <ArrowLeft className="w-5 h-5" />
                <span>Back to Staff Management</span>
            </button>
            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                    Edit Employee
                </h1>
                <p className="text-[#6b6456]">
                    Update {employee.name}'s employee record
                </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-black mb-1">
                                Employee ID
                            </label>
                            <input
                                value={form.id}
                                disabled
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-black mb-1">
                                Full Name
                            </label>
                            <input
                                value={form.name}
                                onChange={(e) =>
                                    setForm((f: any) => ({
                                        ...f,
                                        name: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-black mb-1">
                                Position
                            </label>
                            <input
                                value={form.position}
                                onChange={(e) =>
                                    setForm((f: any) => ({
                                        ...f,
                                        position: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-black mb-1">
                                Department
                            </label>
                            <select
                                value={form.department}
                                onChange={(e) =>
                                    setForm((f: any) => ({
                                        ...f,
                                        department: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            >
                                {departments.map((d) => (
                                    <option key={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-black mb-1">
                                Email
                            </label>
                            <input
                                value={form.email}
                                onChange={(e) =>
                                    setForm((f: any) => ({
                                        ...f,
                                        email: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-black mb-1">
                                Phone
                            </label>
                            <input
                                value={form.phone}
                                onChange={(e) =>
                                    setForm((f: any) => ({
                                        ...f,
                                        phone: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-black mb-1">
                                License No.
                            </label>
                            <input
                                value={form.licenseNo || ""}
                                onChange={(e) =>
                                    setForm((f: any) => ({
                                        ...f,
                                        licenseNo: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-black mb-1">
                                Education
                            </label>
                            <input
                                value={form.education}
                                onChange={(e) =>
                                    setForm((f: any) => ({
                                        ...f,
                                        education: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-black mb-1">
                                Address
                            </label>
                            <input
                                value={form.address}
                                onChange={(e) =>
                                    setForm((f: any) => ({
                                        ...f,
                                        address: e.target.value,
                                    }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 focus:border-[#c9a961] text-black"
                            />
                        </div>
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                        <button
                            onClick={onCancel}
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-black font-medium hover:bg-[#faf8f5] transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onSave(form)}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg font-medium hover:shadow-lg transition-all"
                        >
                            Save Changes
                        </button>
                    </div>
            </div>
        </div>
    );
}

// ID Generation Section
// ID Generation Section
function IDGenerationSection({ schoolYear }: { schoolYear: string }) {
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
                "id, first_name, middle_name, last_name, suffix, grade_level, section, status, date_of_birth, home_address, guardian_name, guardian_phone, school_years!inner(label), student_id_cards(printed, issued_date, school_year_id)",
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

// Financial Section
function FinancialSection({
    schoolYear,
    tuitionFees = DEFAULT_TUITION_FEES,
}: {
    schoolYear: string;
    tuitionFees?: Record<string, number>;
}) {
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportType, setReportType] = useState("collection-summary");
    const [dateRange, setDateRange] = useState("current-year");
    const [customStartDate, setCustomStartDate] = useState("");
    const [customEndDate, setCustomEndDate] = useState("");
    const [reportFormat, setReportFormat] = useState("pdf");
    const [showReportPreview, setShowReportPreview] = useState(false);

    const totalRevenue = schoolYear === "2025-2026" ? 45780000 : 43250000;
    const pendingPayments = schoolYear === "2025-2026" ? 3200000 : 3000000;

    const reportTypes = [
        {
            value: "collection-summary",
            label: "Collection Summary Report",
            description: "Overall payment collection summary",
        },
        {
            value: "outstanding-payments",
            label: "Outstanding Payments Report",
            description: "List of pending and overdue payments",
        },
        {
            value: "payment-history",
            label: "Payment History Report",
            description: "Detailed payment transaction history",
        },
    ];

    const handleGenerateReport = () => {
        setShowReportPreview(true);
    };

    const handleDownloadReport = () => {
        // Simulate download
        alert(
            `Downloading ${reportTypes.find((r) => r.value === reportType)?.label} as ${reportFormat.toUpperCase()}...`,
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">
                        Financial Overview
                    </h1>
                    <p className="text-[#6b6456]">
                        Track tuition payments and school finances
                    </p>
                </div>
                <button
                    onClick={() => setShowReportModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a2b4a] text-white rounded-lg hover:bg-[#2d4263] transition-colors"
                >
                    <FileCheck className="w-4 h-4" />
                    Generate Report
                </button>
            </div>

            {/* Tuition Fees by Grade Level — read-only here; edited in System Settings */}
            <div className="bg-white rounded-xl shadow-sm border-2 border-[#c9a961]/40 p-6">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#c9a961]/10 rounded-xl flex items-center justify-center">
                            <PhilippinePeso className="w-5 h-5 text-[#c9a961]" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-[#1a2b4a]">
                                Tuition Fees by Grade Level
                            </h3>
                            <p className="text-sm text-[#6b6456]">
                                Automatically applied to each student's account
                                in the Cashier portal based on grade level
                            </p>
                        </div>
                    </div>
                    <span className="text-xs font-medium text-[#8b8476]">
                        Edit these in System Settings → Tuition Management
                    </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {TUITION_GRADE_GROUPS.map((group) => (
                        <div
                            key={group.label}
                            className="border border-gray-200 rounded-lg overflow-hidden"
                        >
                            <div className="bg-[#faf8f5] px-3 py-2 border-b border-gray-200">
                                <p className="text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                    {group.label}
                                </p>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {group.grades.map((g) => (
                                    <div
                                        key={g}
                                        className="px-3 py-2 flex items-center justify-between text-sm"
                                    >
                                        <span className="text-[#6b6456]">
                                            {g}
                                        </span>
                                        <span className="font-semibold text-[#2c2c2c]">
                                            ₱
                                            {(
                                                tuitionFees[g] ?? 0
                                            ).toLocaleString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <PhilippinePeso className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-[#2c2c2c]">
                                ₱{totalRevenue.toLocaleString()}
                            </p>
                            <p className="text-xs text-[#8b8476]">
                                Total Collected
                            </p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                            <Clock className="w-5 h-5 text-yellow-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-[#2c2c2c]">
                                ₱{pendingPayments.toLocaleString()}
                            </p>
                            <p className="text-xs text-[#8b8476]">
                                Pending Payments
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">
                    Payment Status Distribution
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                        <p className="text-sm text-green-800 mb-1">
                            Fully Paid
                        </p>
                        <p className="text-2xl font-bold text-green-900">
                            892 students
                        </p>
                    </div>
                    <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p className="text-sm text-yellow-800 mb-1">
                            Partial Payment
                        </p>
                        <p className="text-2xl font-bold text-yellow-900">
                            243 students
                        </p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                        <p className="text-sm text-red-800 mb-1">Overdue</p>
                        <p className="text-2xl font-bold text-red-900">
                            112 students
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Transactions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                        <h3 className="font-semibold text-[#1a2b4a]">
                            Recent Transactions
                        </h3>
                        <span className="text-xs text-[#8b8476]">Latest 5</span>
                    </div>
                    <div className="divide-y divide-gray-200">
                        {[
                            {
                                name: "Maria Santos",
                                grade: "Grade 5",
                                amount: 14000,
                                method: "GCash",
                                date: "Today, 9:14 AM",
                            },
                            {
                                name: "John Carlo Rivera",
                                grade: "Grade 4",
                                amount: 25000,
                                method: "Bank Transfer",
                                date: "Today, 8:02 AM",
                            },
                            {
                                name: "Sarah Mae Lopez",
                                grade: "Grade 6",
                                amount: 7000,
                                method: "Cash",
                                date: "Yesterday, 3:47 PM",
                            },
                            {
                                name: "Patricia Dela Cruz",
                                grade: "Grade 3",
                                amount: 14000,
                                method: "GCash",
                                date: "Yesterday, 1:12 PM",
                            },
                            {
                                name: "Jose Miguel Abad",
                                grade: "Grade 6",
                                amount: 20000,
                                method: "Cash",
                                date: "Mar 5, 2026",
                            },
                        ].map((t, i) => (
                            <div
                                key={i}
                                className="px-6 py-3 flex items-center justify-between"
                            >
                                <div>
                                    <p className="text-sm font-medium text-[#2c2c2c]">
                                        {t.name}
                                    </p>
                                    <p className="text-xs text-[#8b8476]">
                                        {t.grade} • {t.method} • {t.date}
                                    </p>
                                </div>
                                <span className="text-sm font-semibold text-green-700">
                                    +₱{t.amount.toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Overdue Accounts */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                        <h3 className="font-semibold text-[#1a2b4a]">
                            Overdue Accounts
                        </h3>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                            <AlertCircle className="w-3.5 h-3.5" /> Needs
                            follow-up
                        </span>
                    </div>
                    <div className="divide-y divide-gray-200">
                        {[
                            {
                                name: "Carlo Bautista",
                                grade: "Grade 2",
                                balance: 42000,
                                daysOverdue: 34,
                            },
                            {
                                name: "Anna Gabrielle Torres",
                                grade: "Grade 4",
                                balance: 18500,
                                daysOverdue: 21,
                            },
                            {
                                name: "Marco Villanueva",
                                grade: "Grade 1",
                                balance: 63000,
                                daysOverdue: 45,
                            },
                            {
                                name: "Diana Reyes",
                                grade: "Grade 5",
                                balance: 9800,
                                daysOverdue: 12,
                            },
                        ].map((t, i) => (
                            <div
                                key={i}
                                className="px-6 py-3 flex items-center justify-between"
                            >
                                <div>
                                    <p className="text-sm font-medium text-[#2c2c2c]">
                                        {t.name}
                                    </p>
                                    <p className="text-xs text-[#8b8476]">
                                        {t.grade} • {t.daysOverdue} days overdue
                                    </p>
                                </div>
                                <span className="text-sm font-semibold text-red-600">
                                    ₱{t.balance.toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Expenses Snapshot */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">
                    Expense Overview (This Month)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        {
                            label: "Payroll",
                            amount: 2450000,
                            color: "text-[#1a2b4a]",
                        },
                        {
                            label: "Utilities",
                            amount: 185000,
                            color: "text-[#1a2b4a]",
                        },
                        {
                            label: "Supplies & Materials",
                            amount: 96000,
                            color: "text-[#1a2b4a]",
                        },
                        {
                            label: "Maintenance",
                            amount: 62000,
                            color: "text-[#1a2b4a]",
                        },
                    ].map((e) => (
                        <div
                            key={e.label}
                            className="p-4 bg-[#faf8f5] rounded-lg"
                        >
                            <p className="text-xs text-[#8b8476] mb-1">
                                {e.label}
                            </p>
                            <p className={`text-lg font-bold ${e.color}`}>
                                ₱{e.amount.toLocaleString()}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Generate Report Modal */}
            {showReportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="sticky top-0 bg-gradient-to-r from-[#1a2b4a] to-[#7d1935] text-white p-6 rounded-t-2xl">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold">
                                        Generate Financial Report
                                    </h2>
                                    <p className="text-sm text-white/80 mt-1">
                                        Select report parameters and preferences
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowReportModal(false);
                                        setShowReportPreview(false);
                                    }}
                                    className="text-white/80 hover:text-white transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Report Type Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-[#1a2b4a] mb-3">
                                    Report Type
                                </label>
                                <div className="space-y-2">
                                    {reportTypes.map((type) => (
                                        <div
                                            key={type.value}
                                            onClick={() =>
                                                setReportType(type.value)
                                            }
                                            className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                                                reportType === type.value
                                                    ? "border-[#c9a961] bg-[#c9a961]/5"
                                                    : "border-gray-200 hover:border-gray-300"
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div
                                                    className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                                                        reportType ===
                                                        type.value
                                                            ? "border-[#c9a961]"
                                                            : "border-gray-300"
                                                    }`}
                                                >
                                                    {reportType ===
                                                        type.value && (
                                                        <div className="w-3 h-3 rounded-full bg-[#c9a961]"></div>
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-semibold text-[#2c2c2c]">
                                                        {type.label}
                                                    </p>
                                                    <p className="text-sm text-[#8b8476] mt-0.5">
                                                        {type.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Date Range Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-[#1a2b4a] mb-3">
                                    Date Range
                                </label>
                                <div className="grid grid-cols-2 gap-3 mb-[35px]">
                                    <button
                                        onClick={() =>
                                            setDateRange("current-year")
                                        }
                                        className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                                            dateRange === "current-year"
                                                ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]"
                                                : "border-gray-200 text-[#6b6456] hover:border-gray-300"
                                        }`}
                                    >
                                        Current School Year
                                    </button>
                                    <button
                                        onClick={() =>
                                            setDateRange("last-quarter")
                                        }
                                        className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                                            dateRange === "last-quarter"
                                                ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]"
                                                : "border-gray-200 text-[#6b6456] hover:border-gray-300"
                                        }`}
                                    >
                                        Last Quarter
                                    </button>
                                    <button
                                        onClick={() =>
                                            setDateRange("last-month")
                                        }
                                        className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                                            dateRange === "last-month"
                                                ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]"
                                                : "border-gray-200 text-[#6b6456] hover:border-gray-300"
                                        }`}
                                    >
                                        Last Month
                                    </button>
                                    <button
                                        onClick={() => setDateRange("custom")}
                                        className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                                            dateRange === "custom"
                                                ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]"
                                                : "border-gray-200 text-[#6b6456] hover:border-gray-300"
                                        }`}
                                    >
                                        Custom Range
                                    </button>
                                </div>

                                {dateRange === "custom" && (
                                    <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg">
                                        <div>
                                            <label className="block text-xs font-medium text-[#6b6456] mb-2">
                                                Start Date
                                            </label>
                                            <input
                                                type="date"
                                                value={customStartDate}
                                                onChange={(e) =>
                                                    setCustomStartDate(
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-[#6b6456] mb-2">
                                                End Date
                                            </label>
                                            <input
                                                type="date"
                                                value={customEndDate}
                                                onChange={(e) =>
                                                    setCustomEndDate(
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Report Format */}
                            <div>
                                <label className="block text-sm font-semibold text-[#1a2b4a] mb-3">
                                    Export Format
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setReportFormat("pdf")}
                                        className={`px-4 py-3 rounded-lg border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                                            reportFormat === "pdf"
                                                ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]"
                                                : "border-gray-200 text-[#6b6456] hover:border-gray-300"
                                        }`}
                                    >
                                        <FileCheck className="w-4 h-4" />
                                        PDF Document
                                    </button>
                                    <button
                                        onClick={() => setReportFormat("excel")}
                                        className={`px-4 py-3 rounded-lg border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                                            reportFormat === "excel"
                                                ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]"
                                                : "border-gray-200 text-[#6b6456] hover:border-gray-300"
                                        }`}
                                    >
                                        <Download className="w-4 h-4" />
                                        Excel Spreadsheet
                                    </button>
                                </div>
                            </div>

                            {/* Report Preview (if generated) */}
                            {showReportPreview && (
                                <div className="border-2 border-[#c9a961] rounded-lg p-6 bg-[#c9a961]/5">
                                    <div className="flex items-center gap-3 mb-4">
                                        <CheckCircle className="w-6 h-6 text-green-600" />
                                        <div>
                                            <h3 className="font-semibold text-[#1a2b4a]">
                                                Report Preview
                                            </h3>
                                            <p className="text-sm text-[#6b6456]">
                                                {
                                                    reportTypes.find(
                                                        (r) =>
                                                            r.value ===
                                                            reportType,
                                                    )?.label
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-lg p-4 space-y-3 border border-gray-200">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-[#6b6456]">
                                                Report Type:
                                            </span>
                                            <span className="font-semibold text-[#2c2c2c]">
                                                {
                                                    reportTypes.find(
                                                        (r) =>
                                                            r.value ===
                                                            reportType,
                                                    )?.label
                                                }
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-[#6b6456]">
                                                Date Range:
                                            </span>
                                            <span className="font-semibold text-[#2c2c2c]">
                                                {dateRange === "custom"
                                                    ? `${customStartDate || "N/A"} to ${customEndDate || "N/A"}`
                                                    : dateRange
                                                          .replace("-", " ")
                                                          .split(" ")
                                                          .map(
                                                              (w) =>
                                                                  w
                                                                      .charAt(0)
                                                                      .toUpperCase() +
                                                                  w.slice(1),
                                                          )
                                                          .join(" ")}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-[#6b6456]">
                                                School Year:
                                            </span>
                                            <span className="font-semibold text-[#2c2c2c]">
                                                {schoolYear}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-[#6b6456]">
                                                Format:
                                            </span>
                                            <span className="font-semibold text-[#2c2c2c]">
                                                {reportFormat.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-[#6b6456]">
                                                Generated:
                                            </span>
                                            <span className="font-semibold text-[#2c2c2c]">
                                                {new Date().toLocaleDateString(
                                                    "en-US",
                                                    {
                                                        month: "short",
                                                        day: "numeric",
                                                        year: "numeric",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    },
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 rounded-b-2xl flex items-center justify-end gap-3 border-t border-gray-200">
                            <button
                                onClick={() => {
                                    setShowReportModal(false);
                                    setShowReportPreview(false);
                                }}
                                className="px-6 py-2.5 border border-gray-300 text-[#6b6456] rounded-lg hover:bg-gray-100 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            {!showReportPreview ? (
                                <button
                                    onClick={handleGenerateReport}
                                    className="px-6 py-2.5 bg-[#1a2b4a] text-white rounded-lg hover:bg-[#2d4263] transition-colors font-medium flex items-center gap-2"
                                >
                                    <Eye className="w-4 h-4" />
                                    Preview Report
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() =>
                                            setShowReportPreview(false)
                                        }
                                        className="px-6 py-2.5 border border-gray-300 text-[#6b6456] rounded-lg hover:bg-gray-100 transition-colors font-medium"
                                    >
                                        Edit Parameters
                                    </button>
                                    <button
                                        onClick={handleDownloadReport}
                                        className="px-6 py-2.5 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg hover:opacity-90 transition-opacity font-medium flex items-center gap-2"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download {reportFormat.toUpperCase()}
                                    </button>
                                    <button
                                        onClick={() => {
                                            alert("Opening print dialog...");
                                        }}
                                        className="px-6 py-2.5 bg-[#c9a961] text-white rounded-lg hover:bg-[#d4af37] transition-colors font-medium flex items-center gap-2"
                                    >
                                        <Printer className="w-4 h-4" />
                                        Print
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Settings Section //
function SettingsSection({
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
    const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);

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
                                onClick={() => setShowPasswordResetModal(true)}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-[#1a2b4a] text-[#1a2b4a] rounded-lg font-medium hover:bg-[#faf8f5] transition-all"
                            >
                                <Lock className="w-4 h-4" /> Reset Password
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

            {showPasswordResetModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="relative w-full max-w-md">
                        <button
                            onClick={() => setShowPasswordResetModal(false)}
                            className="absolute -top-3 -right-3 p-1.5 bg-white rounded-full shadow-lg hover:bg-gray-100 z-10"
                        >
                            <X className="w-4 h-4 text-[#1a2b4a]" />
                        </button>
                        <PasswordResetSection />
                    </div>
                </div>
            )}
        </>
    );
}

// Starts a new school year: inserts a new school_years row and flips is_current from the
// old year to the new one. Nothing is copied or wiped — class sections, schedules, and
// enrollments are all scoped by school_year_id, so a brand-new year is empty by construction
// while every existing student/payment/grade record stays exactly where it is.
function ChangeSchoolYearModal({
    currentLabel,
    onClose,
    onCreated,
}: {
    currentLabel: string | null;
    onClose: () => void;
    onCreated: (newLabel: string) => void;
}) {
    const [label, setLabel] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConfirm = async () => {
        if (!label.trim() || !startDate || !endDate) return;
        setSubmitting(true);
        setError(null);
        try {
            const { data: newYear, error: insErr } = await supabase
                .from("school_years")
                .insert({
                    label: label.trim(),
                    start_date: startDate,
                    end_date: endDate,
                    is_current: false,
                })
                .select("id, label")
                .single();
            if (insErr) throw insErr;

            const { error: clearErr } = await supabase
                .from("school_years")
                .update({ is_current: false })
                .eq("is_current", true);
            if (clearErr) throw clearErr;

            const { error: setErr } = await supabase
                .from("school_years")
                .update({ is_current: true })
                .eq("id", newYear.id);
            if (setErr) {
                setError(
                    "School year was created but the switch may be incomplete — please check System Settings / Supabase before continuing.",
                );
                throw setErr;
            }

            onCreated(newYear.label);
            onClose();
        } catch (e: any) {
            setError(
                (prev) =>
                    prev || e?.message || "Failed to start new school year.",
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
                <div className="sticky top-0 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Calendar className="w-6 h-6" />
                        <h2 className="text-xl font-semibold">
                            Change to New School Year
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {currentLabel && (
                        <p className="text-sm text-[#6b6456]">
                            Current school year:{" "}
                            <strong className="text-[#2c2c2c]">
                                {currentLabel}
                            </strong>
                        </p>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-[#6b6456] mb-2">
                            New School Year Label *
                        </label>
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="e.g. 2026-2027"
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 text-black"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                Start Date *
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#6b6456] mb-2">
                                End Date *
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 text-black"
                            />
                        </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800">
                            Class sections, subject assignments, and schedules
                            will start fresh for the new year. Student records,
                            payments, and grades are preserved and remain
                            accessible by selecting the old year from the School
                            Year selector. Students and parents will need
                            re-enrollment confirmed by the Registrar before
                            regaining portal access.
                        </p>
                    </div>
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                        </div>
                    )}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 text-[#2c2c2c] rounded-lg font-medium hover:bg-gray-50 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={
                                submitting ||
                                !label.trim() ||
                                !startDate ||
                                !endDate
                            }
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60"
                        >
                            {submitting
                                ? "Starting…"
                                : "Confirm & Start New Year"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Manage Accounts modal — lists real login accounts (public.profiles) and lets an
// admin reassign a user's role or revoke their access (deletes their profile row,
// which removes their app role/login without touching the underlying auth user or
// employee record).
function ManageAccountsModal({
    accounts,
    loading,
    error,
    roleDefs,
    onClose,
    onChangeRole,
    onRevoke,
    onRetry,
    unauthorizedAccounts,
    unauthorizedLoading,
    unauthorizedError,
    onRevokeUnauthorized,
    onRetryUnauthorized,
}: {
    accounts: {
        id: string;
        name: string;
        email: string;
        role: string;
        employeeId: string | null;
        position: string | null;
        department: string | null;
        createdAt: string;
    }[];
    loading: boolean;
    error: string | null;
    roleDefs: { role: string; label: string; access_note: string }[];
    onClose: () => void;
    onChangeRole: (id: string, role: string) => Promise<void>;
    onRevoke: (id: string) => Promise<void>;
    onRetry: () => void;
    unauthorizedAccounts: {
        id: string;
        email: string | null;
        createdAt: string;
        lastSignInAt: string | null;
    }[];
    unauthorizedLoading: boolean;
    unauthorizedError: string | null;
    onRevokeUnauthorized: (id: string) => Promise<void>;
    onRetryUnauthorized: () => void;
}) {
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("All");
    const [savingId, setSavingId] = useState<string | null>(null);
    const [rowError, setRowError] = useState<string | null>(null);
    const [pendingRevoke, setPendingRevoke] = useState<{
        id: string;
        name: string;
    } | null>(null);
    const [revoking, setRevoking] = useState(false);
    const [pendingRevokeUnauthorized, setPendingRevokeUnauthorized] = useState<{
        id: string;
        email: string | null;
    } | null>(null);
    const [revokingUnauthorized, setRevokingUnauthorized] = useState(false);
    const [unauthorizedRowError, setUnauthorizedRowError] = useState<
        string | null
    >(null);

    const labelForRole = (role: string) =>
        roleDefs.find((r) => r.role === role)?.label ?? role;

    const filtered = accounts
        .filter((a) => roleFilter === "All" || a.role === roleFilter)
        .filter(
            (a) =>
                !search ||
                a.name.toLowerCase().includes(search.toLowerCase()) ||
                a.email.toLowerCase().includes(search.toLowerCase()),
        );

    const handleRoleChange = async (id: string, role: string) => {
        setSavingId(id);
        setRowError(null);
        try {
            await onChangeRole(id, role);
        } catch (e: any) {
            setRowError(e?.message || "Failed to update role.");
        } finally {
            setSavingId(null);
        }
    };

    const confirmRevoke = async () => {
        if (!pendingRevoke) return;
        setRevoking(true);
        try {
            await onRevoke(pendingRevoke.id);
            setPendingRevoke(null);
        } catch (e: any) {
            setRowError(e?.message || "Failed to revoke access.");
        } finally {
            setRevoking(false);
        }
    };

    const confirmRevokeUnauthorized = async () => {
        if (!pendingRevokeUnauthorized) return;
        setRevokingUnauthorized(true);
        try {
            await onRevokeUnauthorized(pendingRevokeUnauthorized.id);
            setPendingRevokeUnauthorized(null);
        } catch (e: any) {
            setUnauthorizedRowError(e?.message || "Failed to remove account.");
        } finally {
            setRevokingUnauthorized(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-none">
                <div className="sticky top-0 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between z-10 ">
                    <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5" />
                        <div>
                            <h2 className="text-lg font-semibold">
                                Manage Accounts
                            </h2>
                            <p className="text-xs text-white/70">
                                Staff login accounts and their system roles
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/20 rounded-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by name or email..."
                                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-[#000000]"
                            />
                        </div>
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-[#000000]"
                        >
                            <option value="All">All Roles</option>
                            {roleDefs.map((rd) => (
                                <option key={rd.role} value={rd.role}>
                                    {rd.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {rowError && (
                        <p className="text-sm text-red-500">{rowError}</p>
                    )}

                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-[#faf8f5] border-b border-gray-200">
                                    <tr>
                                        {[
                                            "Name",
                                            "Email",
                                            "Position",
                                            "Role",
                                            "",
                                        ].map((h) => (
                                            <th
                                                key={h}
                                                className="px-4 py-2.5 text-xs font-semibold text-[#1a2b4a] text-left"
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {loading ? (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-4 py-10 text-center text-[#8b8476] text-sm"
                                            >
                                                Loading accounts…
                                            </td>
                                        </tr>
                                    ) : error ? (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-4 py-10 text-center text-sm"
                                            >
                                                <p className="text-red-500 mb-2">
                                                    {error}
                                                </p>
                                                <button
                                                    onClick={onRetry}
                                                    className="text-[#1a2b4a] underline text-xs"
                                                >
                                                    Try again
                                                </button>
                                            </td>
                                        </tr>
                                    ) : filtered.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-4 py-10 text-center text-[#8b8476] text-sm"
                                            >
                                                No accounts found.
                                            </td>
                                        </tr>
                                    ) : (
                                        filtered.map((a) => (
                                            <tr
                                                key={a.id}
                                                className="hover:bg-[#faf8f5] transition-colors"
                                            >
                                                <td className="px-4 py-2.5 text-sm font-medium text-[#2c2c2c]">
                                                    {a.name}
                                                </td>
                                                <td className="px-4 py-2.5 text-sm text-[#6b6456]">
                                                    {a.email}
                                                </td>
                                                <td className="px-4 py-2.5 text-sm text-[#6b6456]">
                                                    {a.position || "—"}
                                                    {a.department
                                                        ? ` · ${a.department}`
                                                        : ""}
                                                </td>
                                                <td className="px-4 py-2.5 text-sm">
                                                    <select
                                                        value={a.role}
                                                        disabled={
                                                            savingId === a.id
                                                        }
                                                        onChange={(e) =>
                                                            handleRoleChange(
                                                                a.id,
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-[#000000] disabled:opacity-50"
                                                    >
                                                        {roleDefs.map((rd) => (
                                                            <option
                                                                key={rd.role}
                                                                value={rd.role}
                                                            >
                                                                {rd.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {savingId === a.id && (
                                                        <span className="ml-2 text-[10px] text-[#8b8476]">
                                                            Saving…
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <button
                                                        onClick={() =>
                                                            setPendingRevoke({
                                                                id: a.id,
                                                                name: a.name,
                                                            })
                                                        }
                                                        className="text-xs font-medium text-red-600 hover:text-red-700 flex items-center gap-1 ml-auto"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />{" "}
                                                        Revoke
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <p className="text-xs text-[#8b8476]">
                        Changing a role updates what the account can access the
                        next time they sign in. Revoking access removes the
                        account's system role and login access, but keeps their
                        employee record on file.
                    </p>

                    <div className="pt-4 border-t border-gray-200">
                        <h3 className="text-sm font-semibold text-[#1a2b4a] mb-1">
                            Unauthorized Accounts
                        </h3>
                        <p className="text-xs text-[#8b8476] mb-3">
                            These accounts can sign in but have no profile,
                            guardian, or student record linked — they're
                            rejected at login with "Email is unauthorized."
                            Remove any that shouldn't exist.
                        </p>

                        {unauthorizedRowError && (
                            <p className="text-sm text-red-500 mb-2">
                                {unauthorizedRowError}
                            </p>
                        )}

                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-[#faf8f5] border-b border-gray-200">
                                        <tr>
                                            {[
                                                "Email",
                                                "Created",
                                                "Last Sign-in",
                                                "",
                                            ].map((h) => (
                                                <th
                                                    key={h}
                                                    className="px-4 py-2.5 text-xs font-semibold text-[#1a2b4a] text-left"
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {unauthorizedLoading ? (
                                            <tr>
                                                <td
                                                    colSpan={4}
                                                    className="px-4 py-8 text-center text-[#8b8476] text-sm"
                                                >
                                                    Loading…
                                                </td>
                                            </tr>
                                        ) : unauthorizedError ? (
                                            <tr>
                                                <td
                                                    colSpan={4}
                                                    className="px-4 py-8 text-center text-sm"
                                                >
                                                    <p className="text-red-500 mb-2">
                                                        {unauthorizedError}
                                                    </p>
                                                    <button
                                                        onClick={
                                                            onRetryUnauthorized
                                                        }
                                                        className="text-[#1a2b4a] underline text-xs"
                                                    >
                                                        Try again
                                                    </button>
                                                </td>
                                            </tr>
                                        ) : unauthorizedAccounts.length ===
                                          0 ? (
                                            <tr>
                                                <td
                                                    colSpan={4}
                                                    className="px-4 py-8 text-center text-[#8b8476] text-sm"
                                                >
                                                    No unauthorized accounts
                                                    found.
                                                </td>
                                            </tr>
                                        ) : (
                                            unauthorizedAccounts.map((a) => (
                                                <tr
                                                    key={a.id}
                                                    className="hover:bg-[#faf8f5] transition-colors"
                                                >
                                                    <td className="px-4 py-2.5 text-sm text-[#2c2c2c]">
                                                        {a.email ||
                                                            "(no email)"}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-sm text-[#6b6456]">
                                                        {a.createdAt}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-sm text-[#6b6456]">
                                                        {a.lastSignInAt ||
                                                            "Never"}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right">
                                                        <button
                                                            onClick={() =>
                                                                setPendingRevokeUnauthorized(
                                                                    {
                                                                        id: a.id,
                                                                        email: a.email,
                                                                    },
                                                                )
                                                            }
                                                            className="text-xs font-medium text-red-600 hover:text-red-700 flex items-center gap-1 ml-auto"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />{" "}
                                                            Remove
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {pendingRevokeUnauthorized && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                                <Trash2 className="w-7 h-7 text-red-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-[#1a2b4a] mb-1">
                                    Remove Unauthorized Account
                                </h3>
                                <p className="text-sm text-[#6b6456]">
                                    Permanently delete the login account for{" "}
                                    <strong>
                                        {pendingRevokeUnauthorized.email ||
                                            "this user"}
                                    </strong>{" "}
                                    ? This action cannot be undone.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() =>
                                        setPendingRevokeUnauthorized(null)
                                    }
                                    disabled={revokingUnauthorized}
                                    className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmRevokeUnauthorized}
                                    disabled={revokingUnauthorized}
                                    className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-all disabled:opacity-60"
                                >
                                    {revokingUnauthorized
                                        ? "Removing…"
                                        : "Remove"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {pendingRevoke && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                                <Trash2 className="w-7 h-7 text-red-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-[#1a2b4a] mb-1">
                                    Revoke Access
                                </h3>
                                <p className="text-sm text-[#6b6456]">
                                    Permanently remove the login account for{" "}
                                    <strong>{pendingRevoke.name}</strong> from
                                    Supabase? They will no longer be able to
                                    sign in, and a new account would need to be
                                    created to restore access.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setPendingRevoke(null)}
                                    disabled={revoking}
                                    className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmRevoke}
                                    disabled={revoking}
                                    className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-all disabled:opacity-60"
                                >
                                    {revoking ? "Revoking…" : "Revoke"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Academics / Schedule Section
const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function AcademicsSection({
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
                    <div>
                        <button
                            onClick={() => setShowCreateModal(false)}
                            className="flex items-center gap-1.5 text-sm font-medium text-[#1a2b4a] hover:underline mb-2"
                        >
                            <ChevronDown className="w-4 h-4 rotate-90" />
                            Back to Schedules
                        </button>
                        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                            {editingTeacherName
                                ? "Edit Schedule"
                                : "Create Schedule"}
                        </h1>
                    </div>
                    <div className="max-w-lg mx-auto">
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

            {/* Schedule Conflict Notice — blocks saving until the conflicting slot is fixed */}
            {scheduleConflicts && scheduleConflicts.length > 0 && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                                    <AlertCircle className="w-6 h-6 text-red-500" />
                                </div>
                                <h3 className="text-lg font-bold text-[#1a2b4a]">
                                    Schedule Conflict
                                </h3>
                            </div>
                            <ul className="space-y-2">
                                {scheduleConflicts.map((c, i) => (
                                    <li
                                        key={i}
                                        className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3"
                                    >
                                        {c}
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-[#8b8476]">
                                Adjust the day, time, room, or class before
                                saving this schedule.
                            </p>
                            <button
                                onClick={() => setScheduleConflicts(null)}
                                className="w-full px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-xl font-medium hover:shadow-lg transition-all"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
// Receipts Section (Registrar) — a single read-only view into cashier-recorded payments,
// with a category filter (All / Enrollment / Tuition Payment) instead of separate tabs,
// searchable by last name or receipt number.
function ReceiptsSection({ schoolYear }: { schoolYear: string }) {
    type ReceiptRow = {
        id: string;
        receiptNumber: string;
        amount: number;
        method: string;
        paidAt: string;
        studentName: string;
        grade: string;
        category: string;
    };

    const CATEGORY_FILTERS = [
        { id: "all" as const, label: "All Receipts" },
        { id: "enrollment_fee" as const, label: "Enrollment" },
        { id: "tuition" as const, label: "Tuition Payment" },
    ];

    const [categoryFilter, setCategoryFilter] = useState<
        "all" | "enrollment_fee" | "tuition"
    >("all");
    const [search, setSearch] = useState("");
    const [rows, setRows] = useState<ReceiptRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        (async () => {
            setLoading(true);
            setLoadError(null);
            let query = supabase
                .from("payments")
                .select(
                    "id, receipt_number, amount, method, paid_at, category, students(first_name, last_name, grade_level, section), school_years!inner(label)",
                )
                .eq("school_years.label", schoolYear)
                .order("paid_at", { ascending: false });
            if (categoryFilter !== "all")
                query = query.eq("category", categoryFilter);
            const { data, error } = await query;
            if (!active) return;
            if (error) {
                setLoadError(error.message);
                setLoading(false);
                return;
            }
            setRows(
                (data ?? []).map((r: any) => ({
                    id: r.id,
                    receiptNumber: r.receipt_number || "—",
                    amount: Number(r.amount),
                    method: r.method,
                    paidAt: r.paid_at,
                    studentName: r.students
                        ? `${r.students.last_name}, ${r.students.first_name}`
                        : "Unknown Student",
                    grade: r.students?.section
                        ? `${r.students.grade_level}, ${r.students.section}`
                        : r.students?.grade_level || "",
                    category: r.category,
                })),
            );
            setLoading(false);
        })();
        return () => {
            active = false;
        };
    }, [categoryFilter, schoolYear]);

    const filtered = rows.filter(
        (r) =>
            !search ||
            r.studentName.toLowerCase().includes(search.toLowerCase()) ||
            r.receiptNumber.toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                    Receipts
                </h1>
                <p className="text-[#6b6456]">
                    Cashier-recorded payments • {schoolYear}
                </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3 sm:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by last name or receipt number…"
                            className="w-full pl-11 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4a4a]/20 text-black"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476] pointer-events-none" />
                        <select
                            value={categoryFilter}
                            onChange={(e) =>
                                setCategoryFilter(
                                    e.target.value as typeof categoryFilter,
                                )
                            }
                            className="pl-9 pr-8 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-[#1a2b4a] focus:outline-none focus:ring-2 focus:ring-[#1a4a4a]/20 appearance-none bg-white"
                        >
                            {CATEGORY_FILTERS.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {loadError && (
                    <div className="flex items-center gap-2 p-4 bg-red-50 border-b border-red-200 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {loadError}
                    </div>
                )}

                {loading ? (
                    <div className="px-6 py-14 text-center text-sm text-[#8b8476]">
                        Loading receipts…
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="px-6 py-14 text-center text-sm text-[#8b8476]">
                        No receipts found.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200 bg-[#faf8f5]">
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        Receipt No.
                                    </th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        Student
                                    </th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        Grade
                                    </th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        Type
                                    </th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        Amount
                                    </th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        Date
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.map((r) => (
                                    <tr
                                        key={r.id}
                                        className="hover:bg-[#faf8f5] transition-colors"
                                    >
                                        <td className="px-6 py-3 font-mono text-sm text-[#1a2b4a]">
                                            {r.receiptNumber}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-[#2c2c2c]">
                                            {r.studentName}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-[#6b6456]">
                                            {r.grade}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-[#6b6456]">
                                            {r.category === "enrollment_fee"
                                                ? "Enrollment"
                                                : "Tuition Payment"}
                                        </td>
                                        <td className="px-6 py-3 text-sm font-semibold text-[#1a2b4a]">
                                            ₱{r.amount.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-[#6b6456]">
                                            {new Date(
                                                r.paidAt,
                                            ).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                            })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

const enrollmentEmptyPerson = {
    firstName: "",
    lastName: "",
    middleName: "",
    occupation: "",
    phone: "",
    email: "",
    nationality: "Filipino",
};
type EnrollmentPerson = typeof enrollmentEmptyPerson;

const enrollmentPersonIsComplete = (p: EnrollmentPerson) =>
    Boolean(
        p.firstName.trim() &&
        p.lastName.trim() &&
        p.phone.trim() &&
        p.email.trim(),
    );
const enrollmentPersonIsStarted = (p: EnrollmentPerson) =>
    Boolean(
        p.firstName.trim() ||
        p.lastName.trim() ||
        p.middleName.trim() ||
        p.occupation.trim() ||
        p.phone.trim() ||
        p.email.trim(),
    );
const enrollmentPersonFullName = (p: EnrollmentPerson) =>
    `${p.lastName.trim()}, ${p.firstName.trim()}${p.middleName.trim() ? " " + p.middleName.trim() : ""}`;
const enrollmentPersonToJson = (p: EnrollmentPerson) => ({
    first_name: p.firstName.trim(),
    last_name: p.lastName.trim(),
    middle_name: p.middleName.trim() || null,
    occupation: p.occupation.trim() || null,
    phone: p.phone.trim(),
    email: p.email.trim() || null,
    nationality: p.nationality.trim() || null,
});

const ENROLLMENT_GUARDIAN_RELATIONSHIPS = [
    "Legal Guardian",
    "Grandparent",
    "Sibling",
];
const enrollmentInputCls =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 focus:border-[#1a2b4a] text-[#000000]";
const enrollmentLabelCls = "block text-sm font-medium text-[#2c2c2c] mb-1";

// Defined at module scope (not inside EnrollmentSection) so its identity is stable across
// re-renders — otherwise every keystroke would create a new component type, forcing React
// to unmount/remount the whole form subtree and lose input focus / scroll position.
const PersonFieldGroup = ({
    heading,
    note,
    person,
    onChange,
    lastNameLabel = "Last Name",
    relationship,
    onRelationshipChange,
}: {
    heading: string;
    note?: string;
    person: EnrollmentPerson;
    onChange: (p: EnrollmentPerson) => void;
    lastNameLabel?: string;
    relationship?: string;
    onRelationshipChange?: (v: string) => void;
}) => (
    <div>
        <p className="text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide mb-2">
            {heading}{" "}
            {note && (
                <span className="text-[#8b8476] font-normal normal-case">
                    {note}
                </span>
            )}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <label className={enrollmentLabelCls}>{lastNameLabel}</label>
                <input
                    value={person.lastName}
                    onChange={(e) =>
                        onChange({ ...person, lastName: e.target.value })
                    }
                    placeholder="e.g. Santos"
                    className={enrollmentInputCls}
                />
            </div>
            <div>
                <label className={enrollmentLabelCls}>First Name</label>
                <input
                    value={person.firstName}
                    onChange={(e) =>
                        onChange({ ...person, firstName: e.target.value })
                    }
                    placeholder="e.g. Elena"
                    className={enrollmentInputCls}
                />
            </div>
            <div>
                <label className={enrollmentLabelCls}>
                    Middle Name{" "}
                    <span className="text-[#8b8476] font-normal">
                        (Optional)
                    </span>
                </label>
                <input
                    value={person.middleName}
                    onChange={(e) =>
                        onChange({ ...person, middleName: e.target.value })
                    }
                    placeholder="e.g. Reyes"
                    className={enrollmentInputCls}
                />
            </div>
            {onRelationshipChange && (
                <div>
                    <label className={enrollmentLabelCls}>Relationship</label>
                    <select
                        value={relationship}
                        onChange={(e) => onRelationshipChange(e.target.value)}
                        className={enrollmentInputCls}
                    >
                        <option value="">Select relationship</option>
                        {ENROLLMENT_GUARDIAN_RELATIONSHIPS.map((r) => (
                            <option key={r}>{r}</option>
                        ))}
                    </select>
                </div>
            )}
            <div>
                <label className={enrollmentLabelCls}>
                    Occupation{" "}
                    <span className="text-[#8b8476] font-normal">
                        (Optional)
                    </span>
                </label>
                <input
                    value={person.occupation}
                    onChange={(e) =>
                        onChange({ ...person, occupation: e.target.value })
                    }
                    placeholder="e.g. Teacher"
                    className={enrollmentInputCls}
                />
            </div>
            <div>
                <label className={enrollmentLabelCls}>Contact Number</label>
                <input
                    value={person.phone}
                    onChange={(e) =>
                        onChange({ ...person, phone: e.target.value })
                    }
                    placeholder="e.g. +63 917 000 0000"
                    className={enrollmentInputCls}
                />
            </div>
            <div>
                <label className={enrollmentLabelCls}>
                    Email Address <span className="text-red-400">*</span>
                </label>
                <input
                    type="email"
                    required
                    value={person.email}
                    onChange={(e) =>
                        onChange({ ...person, email: e.target.value })
                    }
                    placeholder="e.g. elena@example.com"
                    className={enrollmentInputCls}
                />
                <p className="text-xs text-[#8b8476] mt-1">
                    This email becomes the login for this contact's Parent
                    Portal — required.
                </p>
            </div>
            <div>
                <label className={enrollmentLabelCls}>
                    Nationality{" "}
                    <span className="text-[#8b8476] font-normal">
                        (Optional)
                    </span>
                </label>
                <input
                    value={person.nationality}
                    onChange={(e) =>
                        onChange({ ...person, nationality: e.target.value })
                    }
                    placeholder="e.g. Filipino"
                    className={enrollmentInputCls}
                />
            </div>
        </div>
        {enrollmentPersonIsStarted(person) &&
            !(
                enrollmentPersonIsComplete(person) &&
                (!onRelationshipChange || relationship)
            ) && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> First name,{" "}
                    {lastNameLabel.toLowerCase()}, contact number, email address
                    {onRelationshipChange ? ", and relationship" : ""} are
                    needed to use this as a contact on file.
                </p>
            )}
    </div>
);

const EnrollmentFormSection = ({
    icon: Icon,
    title,
    description,
    children,
}: {
    icon: any;
    title: string;
    description: string;
    children: React.ReactNode;
}) => (
    <div className="space-y-4">
        <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
            <div className="w-8 h-8 rounded-lg bg-[#1a2b4a]/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-[#1a2b4a]" />
            </div>
            <div>
                <h4 className="font-semibold text-[#1a2b4a] text-sm">
                    {title}
                </h4>
                <p className="text-xs text-[#8b8476]">{description}</p>
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{children}</div>
    </div>
);

// Enrollment Section (Registrar) — simple, direct enrollment, no application/approval workflow
function EnrollmentSection({
    schoolYear,
    isArchivedYear = false,
    user,
    subPage,
}: {
    schoolYear: string;
    isArchivedYear?: boolean;
    user?: any;
    // Which sidebar sub-page under "Enrollment" is active — drives form.enrollmentType
    // instead of an in-page tab bar. "pending" shows only the consolidated pending grids;
    // "recent" shows only the Recently Enrolled grid.
    subPage: "new" | "continuing" | "pending" | "recent";
}) {
    type Enrollee = {
        id: string;
        name: string;
        birthdate: string;
        grade: string;
        section: string;
        guardianName: string;
        guardianPhone: string;
        address: string;
        previousSchool: string;
        dateEnrolled: string;
        enrolledAt: string;
    };

    const GRADES = [
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
    // Automatic academic placement: a student who completed grade N is placed into grade N+1.
    const nextGrade = (grade: string): string => {
        const idx = GRADES.indexOf(grade);
        if (idx === -1 || idx === GRADES.length - 1) return grade;
        return GRADES[idx + 1];
    };
    const GENDERS = ["Male", "Female"];
    const SUFFIXES = ["", "Jr.", "Sr.", "II", "III", "IV", "V"];
    const ENROLLMENT_TYPES = [
        "New Student",
        "Continuing Student",
        "Transferee",
    ] as const;
    const REQUIREMENTS = [
        { key: "birthCertificate", label: "PSA Birth Certificate" },
        { key: "reportCard", label: "Report Card / Form 138" },
        { key: "goodMoral", label: "Certificate of Good Moral Character" },
        { key: "medicalCert", label: "Medical / Health Certificate" },
        { key: "idPhotos", label: "2x2 ID Photos (2 pcs)" },
        { key: "immunization", label: "Immunization Record" },
    ] as const;

    const familyName = (fullName: string) => {
        const parts = fullName.trim().split(/\s+/);
        return parts[parts.length - 1] || fullName;
    };

    const rowToEnrollee = (row: any): Enrollee => ({
        id: row.id,
        name: `${row.last_name}, ${row.first_name}${row.middle_name ? " " + row.middle_name : ""}${row.suffix ? " " + row.suffix : ""}`,
        birthdate: row.date_of_birth
            ? new Date(row.date_of_birth + "T00:00:00").toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric", year: "numeric" },
              )
            : "",
        grade: row.grade_level || "",
        section: row.section || "",
        guardianName: row.guardian_name || "",
        guardianPhone: row.guardian_phone || "",
        address: row.home_address || "",
        previousSchool: row.previous_school || "",
        dateEnrolled: row.enrolled_date
            ? new Date(row.enrolled_date + "T00:00:00").toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric", year: "numeric" },
              )
            : "",
        enrolledAt: row.created_at || row.enrolled_date || "",
    });

    const [enrollees, setEnrollees] = useState<Enrollee[]>([]);
    const [loadingList, setLoadingList] = useState(true);
    const [listError, setListError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        (async () => {
            const { data, error } = await supabase
                .from("students")
                .select(
                    "id, first_name, middle_name, last_name, suffix, date_of_birth, grade_level, section, guardian_name, guardian_phone, home_address, previous_school, enrolled_date, created_at",
                )
                .order("created_at", { ascending: false })
                .limit(100);
            if (!active) return;
            if (error) {
                setListError(error.message);
                setLoadingList(false);
                return;
            }
            setEnrollees((data ?? []).map(rowToEnrollee));
            setLoadingList(false);
        })();
        return () => {
            active = false;
        };
    }, []);

    const [sectionCatalog, setSectionCatalog] = useState<
        { grade: string; section: string }[]
    >([]);

    useEffect(() => {
        let active = true;
        (async () => {
            const { data: syRow } = await supabase
                .from("school_years")
                .select("id")
                .eq("label", schoolYear)
                .maybeSingle();
            const syId = syRow?.id ?? null;
            if (!active) return;
            if (!syId) {
                setSectionCatalog([]);
                return;
            }
            const { data } = await supabase
                .from("class_sections")
                .select("grade_level, section_name")
                .eq("school_year_id", syId);
            if (!active) return;
            setSectionCatalog(
                (data ?? []).map((c: any) => ({
                    grade: c.grade_level,
                    section: c.section_name,
                })),
            );
        })();
        return () => {
            active = false;
        };
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

    const emptyPerson = enrollmentEmptyPerson;

    const personIsComplete = enrollmentPersonIsComplete;
    const personIsStarted = enrollmentPersonIsStarted;
    const personFullName = enrollmentPersonFullName;
    const personToJson = enrollmentPersonToJson;

    const emptyForm = {
        firstName: "",
        lastName: "",
        middleName: "",
        suffix: "",
        birthdate: "",
        gender: "",
        nationality: "Filipino",
        religion: "",
        grade: GRADES[0],
        section: "",
        enrollmentType: "New Student" as (typeof ENROLLMENT_TYPES)[number],
        previousSchool: "",
        designatedContact: "" as "" | "mother" | "father" | "guardian",
        email: "",
        phone: "",
        address: "",
        mother: { ...emptyPerson },
        father: { ...emptyPerson },
        guardian: { ...emptyPerson, relationship: "" },
        requirements: REQUIREMENTS.reduce(
            (acc, r) => ({ ...acc, [r.key]: false }),
            {} as Record<string, boolean>,
        ),
        certified: false,
    };
    const [form, setForm] = useState(emptyForm);

    // The sidebar's "New / Transferee" vs "Continuing Student" sub-page selects which
    // form/pending-grid pair is shown; keep form.enrollmentType's Continuing-vs-not
    // dimension in sync with it without clobbering the New Student/Transferee choice
    // made inside the New/Transferee form.
    useEffect(() => {
        if (subPage === "pending" || subPage === "recent") return;
        setForm((f) => {
            if (subPage === "continuing") {
                return f.enrollmentType === "Continuing Student"
                    ? f
                    : { ...f, enrollmentType: "Continuing Student", previousSchool: "" };
            }
            return f.enrollmentType === "Continuing Student"
                ? { ...f, enrollmentType: "New Student" }
                : f;
        });
    }, [subPage]);

    const [search, setSearch] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [showConfirmReview, setShowConfirmReview] = useState(false);
    const [newStudentCredentials, setNewStudentCredentials] = useState<{
        name: string;
        email: string | null;
        password: string | null;
        emailSent?: boolean;
        parent: {
            name: string;
            email: string;
            password: string | null;
            isNewAccount: boolean;
            emailSent?: boolean;
        } | null;
    } | null>(null);
    const [submitNotice, setSubmitNotice] = useState<string | null>(null);
    // Captured right before the form resets on a successful enroll, so "Enroll Another
    // Child" can carry the same parent's info into the next submission untouched — the
    // registrar never retypes the email, which is what actually prevents duplicate
    // parent accounts (the reuse check in create-guardian-account matches on exact email).
    const [lastGuardianContacts, setLastGuardianContacts] = useState<{
        mother: EnrollmentPerson;
        father: EnrollmentPerson;
        guardian: EnrollmentPerson & { relationship: string };
        designatedContact: "" | "mother" | "father" | "guardian";
    } | null>(null);

    // --- Search existing guardians on file, to autofill a contact instead of retyping
    // (and mistyping) their info — the real fix for duplicate parent accounts. ---
    const [guardianSearch, setGuardianSearch] = useState("");
    const [guardianSearchResults, setGuardianSearchResults] = useState<
        {
            id: string;
            fullName: string;
            email: string;
            phone: string | null;
            detected: "mother" | "father" | "guardian";
            detectedLabel: string | null;
        }[]
    >([]);
    const [guardianSearching, setGuardianSearching] = useState(false);

    // --- Continuing Student re-enrollment: reuses the existing student row & login,
    // only creates a new per-year `enrollments` row (see Pending Re-Enrollments below). ---
    const [currentSchoolYearId, setCurrentSchoolYearId] = useState<
        string | null
    >(null);
    const [continuingSearch, setContinuingSearch] = useState("");
    const [continuingResults, setContinuingResults] = useState<
        { id: string; name: string; grade: string; email: string }[]
    >([]);
    const [continuingSearching, setContinuingSearching] = useState(false);
    const [selectedContinuingStudent, setSelectedContinuingStudent] = useState<{
        id: string;
        name: string;
    } | null>(null);
    const [continuingGrade, setContinuingGrade] = useState(GRADES[0]);
    const [continuingSection, setContinuingSection] = useState("");
    const [continuingEmail, setContinuingEmail] = useState("");
    const [continuingSubmitting, setContinuingSubmitting] = useState(false);
    const [continuingError, setContinuingError] = useState<string | null>(null);

    type PendingEnrollment = {
        enrollmentId: string;
        studentId: string;
        name: string;
        grade: string;
        section: string;
        feeSettled: boolean;
    };
    const [pendingEnrollments, setPendingEnrollments] = useState<
        PendingEnrollment[]
    >([]);
    const [pendingNewEnrollments, setPendingNewEnrollments] = useState<
        PendingEnrollment[]
    >([]);
    const [pendingLoading, setPendingLoading] = useState(true);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [confirmNotice, setConfirmNotice] = useState<string | null>(null);

    const loadPendingEnrollments = async (syId: string) => {
        setPendingLoading(true);
        const [{ data }, { data: feeRows }, { data: paymentRows }] =
            await Promise.all([
                supabase
                    .from("enrollments")
                    .select(
                        "id, student_id, grade_level, section, enrollment_type, students(first_name, last_name)",
                    )
                    .eq("school_year_id", syId)
                    .eq("status", "pending")
                    .order("created_at", { ascending: false }),
                supabase
                    .from("enrollment_fees")
                    .select("grade_level, fee")
                    .eq("school_year_id", syId),
                supabase
                    .from("payments")
                    .select("student_id, amount")
                    .eq("school_year_id", syId)
                    .eq("category", "enrollment_fee"),
            ]);
        const enrollmentFeesMap = {
            ...DEFAULT_ENROLLMENT_FEES,
            ...Object.fromEntries(
                (feeRows ?? []).map((f: any) => [f.grade_level, Number(f.fee)]),
            ),
        };
        const paidByStudent = new Map<string, number>();
        (paymentRows ?? []).forEach((p: any) => {
            paidByStudent.set(
                p.student_id,
                (paidByStudent.get(p.student_id) ?? 0) + Number(p.amount || 0),
            );
        });
        const rows = (data ?? []).map((r: any) => {
            const feeRequired = getTuitionForGrade(
                enrollmentFeesMap,
                r.grade_level,
            );
            const paid = paidByStudent.get(r.student_id) ?? 0;
            return {
                enrollmentId: r.id,
                studentId: r.student_id,
                name: r.students
                    ? `${r.students.last_name}, ${r.students.first_name}`
                    : r.student_id,
                grade: r.grade_level,
                section: r.section || "",
                enrollmentType: r.enrollment_type,
                // Continuing students re-enrolling into their new grade level owe a fresh
                // enrollment fee too, so this gates Pending Re-Enrollments the same way it
                // gates Pending Enrollment below.
                feeSettled: feeRequired > 0 ? paid >= feeRequired : paid > 0,
            };
        });
        setPendingEnrollments(
            rows.filter((r) => r.enrollmentType === "Continuing Student"),
        );
        setPendingNewEnrollments(
            rows.filter((r) => r.enrollmentType !== "Continuing Student"),
        );
        setPendingLoading(false);
    };

    useEffect(() => {
        let active = true;
        (async () => {
            const syId = await getCurrentSchoolYearId();
            if (!active) return;
            setCurrentSchoolYearId(syId);
            if (syId) await loadPendingEnrollments(syId);
            else setPendingLoading(false);
        })();
        return () => {
            active = false;
        };
    }, [schoolYear]);

    useEffect(() => {
        if (guardianSearch.trim().length < 2) {
            setGuardianSearchResults([]);
            return;
        }
        let active = true;
        setGuardianSearching(true);
        const t = setTimeout(async () => {
            const q = guardianSearch.trim();
            const { data } = await supabase
                .from("guardians")
                .select(
                    "id, full_name, email, phone, student_guardians(relationship, created_at)",
                )
                .or(
                    `full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`,
                )
                .limit(10);
            if (!active) return;
            setGuardianSearchResults(
                (data ?? []).map((g: any) => {
                    const links = (g.student_guardians ?? []) as {
                        relationship: string | null;
                        created_at: string;
                    }[];
                    const latest = links.length
                        ? links.reduce((a, b) =>
                              a.created_at > b.created_at ? a : b,
                          )
                        : null;
                    const relLower = (latest?.relationship || "")
                        .trim()
                        .toLowerCase();
                    const detected: "mother" | "father" | "guardian" =
                        relLower === "mother"
                            ? "mother"
                            : relLower === "father"
                              ? "father"
                              : "guardian";
                    return {
                        id: g.id,
                        fullName: g.full_name,
                        email: g.email,
                        phone: g.phone,
                        detected,
                        detectedLabel: latest?.relationship || null,
                    };
                }),
            );
            setGuardianSearching(false);
        }, 300);
        return () => {
            active = false;
            clearTimeout(t);
        };
    }, [guardianSearch]);

    // Guardians on file are stored as "Last, First Middle" (see enrollmentPersonFullName) —
    // split on the comma rather than assuming "First Middle Last" word order, otherwise the
    // last/first names land in the wrong fields.
    const splitGuardianFullName = (
        fullName: string,
    ): { firstName: string; lastName: string; middleName: string } => {
        const [lastRaw, restRaw] = fullName.split(",");
        if (restRaw !== undefined) {
            const restWords = restRaw.trim().split(/\s+/).filter(Boolean);
            return {
                lastName: lastRaw.trim(),
                firstName: restWords[0] || "",
                middleName: restWords.slice(1).join(" "),
            };
        }
        const { firstName, lastName } = splitStudentName(fullName);
        return { firstName, lastName, middleName: "" };
    };

    // Fills a Mother/Father/Guardian slot from a guardian record on file — keeps the exact
    // stored email so create-guardian-account's dedup-by-email reuses the same login.
    const fillContactFromGuardian = (
        target: "mother" | "father" | "guardian",
        g: { fullName: string; email: string; phone: string | null },
    ) => {
        const { firstName, lastName, middleName } = splitGuardianFullName(
            g.fullName,
        );
        const filled: EnrollmentPerson = {
            ...emptyPerson,
            firstName,
            lastName,
            middleName,
            phone: g.phone || "",
            email: g.email || "",
        };
        setForm((f) => ({
            ...f,
            [target]:
                target === "guardian"
                    ? { ...filled, relationship: f.guardian.relationship }
                    : filled,
            designatedContact: f.designatedContact || target,
        }));
        setGuardianSearch("");
        setGuardianSearchResults([]);
    };

    useEffect(() => {
        if (
            form.enrollmentType !== "Continuing Student" ||
            continuingSearch.trim().length < 2
        ) {
            setContinuingResults([]);
            return;
        }
        let active = true;
        setContinuingSearching(true);
        const t = setTimeout(async () => {
            // Search all students by last name, not just those whose `status` currently
            // reads 'Active' — a continuing student's prior-year record may show any status
            // (e.g. left inactive over the break), and this search is exactly how the
            // registrar finds a returning student's archived record to re-enroll them.
            const { data } = await supabase
                .from("students")
                .select(
                    "id, first_name, middle_name, last_name, grade_level, status, email",
                )
                .not("status", "in", '("Graduate","Dropped","Transferred")')
                .ilike("last_name", `%${continuingSearch.trim()}%`)
                .limit(20);
            if (!active) return;
            setContinuingResults(
                (data ?? []).map((r: any) => ({
                    id: r.id,
                    name: `${r.last_name}, ${r.first_name}${r.middle_name ? " " + r.middle_name : ""}`,
                    grade: r.grade_level,
                    email: r.email || "",
                })),
            );
            setContinuingSearching(false);
        }, 300);
        return () => {
            active = false;
            clearTimeout(t);
        };
    }, [continuingSearch, form.enrollmentType]);

    const handleContinuingEnroll = async () => {
        if (
            isArchivedYear ||
            !selectedContinuingStudent ||
            !continuingGrade ||
            !currentSchoolYearId
        )
            return;
        if (isJuniorHighGrade(continuingGrade) && !continuingEmail.trim()) {
            setContinuingError(
                "Email is required for Junior High (Grades 7-10) students.",
            );
            return;
        }
        setContinuingSubmitting(true);
        setContinuingError(null);
        try {
            const { error: enrollErr } = await supabase
                .from("enrollments")
                .upsert(
                    {
                        student_id: selectedContinuingStudent.id,
                        school_year_id: currentSchoolYearId,
                        grade_level: continuingGrade,
                        section: continuingSection || null,
                        status: "pending",
                        enrollment_type: "Continuing Student",
                    },
                    { onConflict: "student_id,school_year_id" },
                );
            if (enrollErr) throw enrollErr;

            const { error: updErr } = await supabase
                .from("students")
                .update({
                    grade_level: continuingGrade,
                    section: continuingSection || null,
                    school_year_id: currentSchoolYearId,
                    status: "Active",
                    ...(continuingEmail.trim()
                        ? { email: continuingEmail.trim() }
                        : {}),
                })
                .eq("id", selectedContinuingStudent.id);
            if (updErr) throw updErr;

            await loadPendingEnrollments(currentSchoolYearId);
            setSelectedContinuingStudent(null);
            setContinuingSearch("");
            setContinuingResults([]);
            setContinuingSection("");
            setContinuingGrade(GRADES[0]);
            setContinuingEmail("");
        } catch (e: any) {
            setContinuingError(e?.message || "Failed to re-enroll student.");
        } finally {
            setContinuingSubmitting(false);
        }
    };

    const confirmEnrollment = async (
        enrollmentId: string,
        studentName: string,
    ) => {
        setConfirmingId(enrollmentId);
        setConfirmNotice(null);
        const { error } = await supabase
            .from("enrollments")
            .update({
                status: "confirmed",
                confirmed_at: new Date().toISOString(),
                confirmed_by: user?.id || null,
            })
            .eq("id", enrollmentId);
        setConfirmingId(null);
        if (error) {
            setContinuingError(error.message);
            return;
        }
        setPendingEnrollments((prev) =>
            prev.filter((p) => p.enrollmentId !== enrollmentId),
        );
        setConfirmNotice(
            `${studentName}'s enrollment is confirmed — student and parent portal access is now active.`,
        );
    };

    // Confirms a new-student enrollment after the registrar has verified (via Receipts) that
    // the enrollment fee was paid — this is the point portal accounts actually get created.
    const confirmNewEnrollment = async (
        enrollmentId: string,
        studentId: string,
        studentName: string,
    ) => {
        setConfirmingId(enrollmentId);
        setConfirmNotice(null);
        try {
            const { data: studentRow, error: studentErr } = await supabase
                .from("students")
                .select(
                    "first_name, last_name, grade_level, email, guardian_name, guardian_relationship, guardian_phone, guardian_email",
                )
                .eq("id", studentId)
                .single();
            if (studentErr) throw studentErr;

            if (!studentRow.guardian_email) {
                throw new Error(
                    `${studentName} has no guardian email on file — the guardian's email is required to generate their Parent Portal login. Edit the student record to add it before confirming.`,
                );
            }

            // Student portal login accounts are only auto-created for Junior High (Grades 7-10),
            // and use the email the parent/registrar entered at enrollment as the login itself
            // (rather than a generated address) so it matches what the family was told to expect.
            if (
                isJuniorHighGrade(studentRow.grade_level || "") &&
                !studentRow.email
            ) {
                throw new Error(
                    `${studentName} has no email on file — a Junior High student's own email is required to generate their Student Portal login. Edit the student record to add it before confirming.`,
                );
            }
            const account = isJuniorHighGrade(studentRow.grade_level || "")
                ? await createStudentAccount(studentId, studentRow.email)
                : null;
            if (account)
                await supabase
                    .from("students")
                    .update({ email: account.email })
                    .eq("id", studentId);
            const parentAccount = await createGuardianAccount({
                studentId,
                fullName: studentRow.guardian_name || "",
                relationship: studentRow.guardian_relationship || "",
                phone: studentRow.guardian_phone || undefined,
                email: studentRow.guardian_email,
                isPrimaryContact: true,
            });

            const { error: enrollErr } = await supabase
                .from("enrollments")
                .update({
                    status: "confirmed",
                    confirmed_at: new Date().toISOString(),
                    confirmed_by: user?.id || null,
                })
                .eq("id", enrollmentId);
            if (enrollErr) throw enrollErr;

            setPendingNewEnrollments((prev) =>
                prev.filter((p) => p.enrollmentId !== enrollmentId),
            );
            setNewStudentCredentials({
                name: `${studentRow.first_name} ${studentRow.last_name}`,
                email: account?.email ?? null,
                password: account?.password ?? null,
                emailSent: account?.emailSent ?? false,
                parent: {
                    name: studentRow.guardian_name || "",
                    email: parentAccount.email,
                    password: parentAccount.password,
                    isNewAccount: parentAccount.isNewAccount,
                    emailSent: parentAccount.emailSent ?? false,
                },
            });
        } catch (e: any) {
            setContinuingError(
                e?.message || `Failed to confirm ${studentName}'s enrollment.`,
            );
        } finally {
            setConfirmingId(null);
        }
    };

    const filtered = enrollees
        .filter(
            (e) =>
                !search ||
                e.name.toLowerCase().includes(search.toLowerCase()) ||
                e.id.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt));

    const hasMother = personIsComplete(form.mother);
    const hasFather = personIsComplete(form.father);
    const hasGuardian =
        personIsComplete(form.guardian) && Boolean(form.guardian.relationship);
    const hasPrimaryContact = hasMother || hasFather || hasGuardian;
    const availableContacts = [
        hasMother && "mother",
        hasFather && "father",
        hasGuardian && "guardian",
    ].filter(Boolean) as Array<"mother" | "father" | "guardian">;
    const needsDesignatedContactChoice = availableContacts.length > 1;
    // When both parents and the guardian are on file, the registrar must explicitly pick who is
    // the designated contact; otherwise fall back to the single available contact, if any.
    const effectiveDesignatedContact =
        form.designatedContact &&
        availableContacts.includes(form.designatedContact)
            ? form.designatedContact
            : !needsDesignatedContactChoice
              ? availableContacts[0]
              : null;

    const requiredFieldsMissing =
        !form.lastName.trim() ||
        !form.firstName.trim() ||
        !form.birthdate ||
        !form.gender ||
        !hasPrimaryContact ||
        !form.address.trim() ||
        !effectiveDesignatedContact ||
        (isJuniorHighGrade(form.grade) && !form.email.trim()) ||
        !form.certified;

    const handleEnroll = async () => {
        if (
            isArchivedYear ||
            requiredFieldsMissing ||
            !effectiveDesignatedContact
        )
            return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const id = await generateStudentId(form.lastName);
            const schoolYearId = await getCurrentSchoolYearId();
            // Primary contact on file: the registrar's designated contact when more than one
            // of Mother/Father/Guardian is on file, otherwise whichever one is complete.
            // Portal login accounts aren't created here — see confirmNewEnrollment, which
            // derives the standard first-initial login address from the student's stored
            // guardian_name once the enrollment fee payment is confirmed.
            const primary =
                effectiveDesignatedContact === "mother"
                    ? {
                          name: personFullName(form.mother),
                          relationship: "Mother",
                          phone: form.mother.phone.trim(),
                          email: form.mother.email.trim() || null,
                      }
                    : effectiveDesignatedContact === "father"
                      ? {
                            name: personFullName(form.father),
                            relationship: "Father",
                            phone: form.father.phone.trim(),
                            email: form.father.email.trim() || null,
                        }
                      : {
                            name: personFullName(form.guardian),
                            relationship: form.guardian.relationship,
                            phone: form.guardian.phone.trim(),
                            email: form.guardian.email.trim() || null,
                        };
            const { data, error } = await supabase
                .from("students")
                .insert({
                    id,
                    first_name: form.firstName.trim(),
                    middle_name: form.middleName.trim() || null,
                    last_name: form.lastName.trim(),
                    suffix: form.suffix.trim() || null,
                    date_of_birth: form.birthdate,
                    gender: form.gender,
                    nationality: form.nationality.trim() || null,
                    religion: form.religion.trim() || null,
                    grade_level: form.grade,
                    section: form.section || null,
                    status: "Active",
                    email: form.email.trim() || null,
                    phone: form.phone.trim() || null,
                    home_address: form.address,
                    enrolled_date: new Date().toISOString().slice(0, 10),
                    school_year_id: schoolYearId,
                    mother_info: personIsStarted(form.mother)
                        ? personToJson(form.mother)
                        : null,
                    father_info: personIsStarted(form.father)
                        ? personToJson(form.father)
                        : null,
                    guardian_info: personIsStarted(form.guardian)
                        ? {
                              ...personToJson(form.guardian),
                              relationship: form.guardian.relationship || null,
                          }
                        : null,
                    guardian_name: primary.name,
                    guardian_relationship: primary.relationship,
                    guardian_phone: primary.phone,
                    guardian_email: primary.email,
                    previous_school: form.previousSchool || null,
                })
                .select(
                    "id, first_name, middle_name, last_name, suffix, date_of_birth, grade_level, section, guardian_name, guardian_phone, home_address, previous_school, enrolled_date",
                )
                .single();
            if (error) throw error;

            if (schoolYearId) {
                await supabase.from("enrollments").upsert(
                    {
                        student_id: id,
                        school_year_id: schoolYearId,
                        grade_level: form.grade,
                        section: form.section || null,
                        status: "pending",
                        enrollment_type: form.enrollmentType,
                    },
                    { onConflict: "student_id,school_year_id" },
                );
                await loadPendingEnrollments(schoolYearId);
            }

            // Portal accounts are NOT created here — the enrollment fee must be paid at the
            // Cashier's Office first. Accounts are created once the registrar confirms the
            // enrollment from the Pending Enrollment grid (see confirmNewEnrollment).
            setEnrollees((prev) => [rowToEnrollee(data), ...prev]);
            setLastGuardianContacts({
                mother: form.mother,
                father: form.father,
                guardian: form.guardian,
                designatedContact: effectiveDesignatedContact,
            });
            setForm(emptyForm);
            setSubmitNotice(
                `${data.first_name} ${data.last_name}'s application was submitted and is now in Pending Enrollment. Portal access will be granted once the enrollment fee is paid at the Cashier's Office and the registrar confirms the enrollment.`,
            );
        } catch (e: any) {
            setSubmitError(e?.message || "Failed to enroll student.");
        } finally {
            setSubmitting(false);
        }
    };

    const inputCls = enrollmentInputCls;
    const labelCls = enrollmentLabelCls;
    const FormSection = EnrollmentFormSection;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                    Enrollment
                </h1>
                <p className="text-[#6b6456]">
                    {subPage === "pending"
                        ? `Confirm enrollments awaiting fee payment • ${schoolYear}`
                        : subPage === "recent"
                          ? `Students recently enrolled or re-enrolled • ${schoolYear}`
                          : `Directly enroll a new student • ${schoolYear}`}
                </p>
            </div>

            {subPage !== "pending" && subPage !== "recent" && (
            <>
            {/* Direct Enrollment Form — which one shows is driven by the "New / Transferee"
          vs "Continuing Student" sub-page selected in the sidebar (see subPage prop). */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] px-6 py-4">
                    <h3 className="font-semibold text-white">
                        {form.enrollmentType === "Continuing Student"
                            ? "Continuing Student Re-Enrollment"
                            : "Student Enrollment Form"}
                    </h3>
                    <p className="text-xs text-white/70">
                        School Year {schoolYear}
                    </p>
                </div>

                {form.enrollmentType === "Continuing Student" ? (
                    <div className="p-6 space-y-6">
                        {isArchivedYear && (
                            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                                <AlertCircle className="w-4 h-4 shrink-0" />{" "}
                                Viewing an archived school year — re-enrollment
                                is disabled. Switch to the current school year
                                to re-enroll students.
                            </div>
                        )}
                        <div>
                            <label className={labelCls}>
                                Search Existing Student{" "}
                                <span className="text-red-400">*</span>
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                                <input
                                    value={continuingSearch}
                                    onChange={(e) => {
                                        setContinuingSearch(e.target.value);
                                        setSelectedContinuingStudent(null);
                                        setContinuingEmail("");
                                    }}
                                    placeholder="Search by last name…"
                                    className={inputCls + " pl-9"}
                                />
                            </div>
                            {selectedContinuingStudent && (
                                <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1.5">
                                    <CheckCircle className="w-3.5 h-3.5" />{" "}
                                    Selected: {selectedContinuingStudent.name} (
                                    {selectedContinuingStudent.id})
                                </p>
                            )}
                            {!selectedContinuingStudent &&
                                continuingSearch.trim().length >= 2 && (
                                    <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                                        {continuingSearching ? (
                                            <p className="px-3 py-2 text-sm text-[#8b8476]">
                                                Searching…
                                            </p>
                                        ) : continuingResults.length === 0 ? (
                                            <p className="px-3 py-2 text-sm text-[#8b8476]">
                                                No matching students found.
                                            </p>
                                        ) : (
                                            continuingResults.map((r) => (
                                                <button
                                                    key={r.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedContinuingStudent(
                                                            {
                                                                id: r.id,
                                                                name: r.name,
                                                            },
                                                        );
                                                        const g = r.grade
                                                            ? nextGrade(r.grade)
                                                            : GRADES[0];
                                                        setContinuingGrade(g);
                                                        setContinuingSection(
                                                            sectionOptionsForGrade(
                                                                g,
                                                            )[0] || "",
                                                        );
                                                        setContinuingEmail(
                                                            r.email,
                                                        );
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-[#faf8f5] transition-colors"
                                                >
                                                    <span className="font-medium text-[#2c2c2c]">
                                                        {r.name}
                                                    </span>
                                                    <span className="text-[#8b8476]">
                                                        {" "}
                                                        • {r.id} • {r.grade}
                                                    </span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls}>
                                    New Grade Level{" "}
                                    <span className="text-red-400">*</span>
                                </label>
                                <select
                                    value={continuingGrade}
                                    onChange={(e) => {
                                        setContinuingGrade(e.target.value);
                                        setContinuingSection(
                                            sectionOptionsForGrade(
                                                e.target.value,
                                            )[0] || "",
                                        );
                                    }}
                                    className={inputCls}
                                >
                                    {GRADES.map((g) => (
                                        <option key={g}>{g}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>New Section</label>
                                {sectionOptionsForGrade(continuingGrade)
                                    .length > 0 ? (
                                    <select
                                        value={continuingSection}
                                        onChange={(e) =>
                                            setContinuingSection(e.target.value)
                                        }
                                        className={inputCls}
                                    >
                                        {sectionOptionsForGrade(
                                            continuingGrade,
                                        ).map((s) => (
                                            <option key={s}>{s}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        value="None"
                                        disabled
                                        className={inputCls}
                                    />
                                )}
                            </div>
                        </div>

                        {isJuniorHighGrade(continuingGrade) && (
                            <div>
                                <label className={labelCls}>
                                    Email Address{" "}
                                    <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="email"
                                    required
                                    value={continuingEmail}
                                    onChange={(e) =>
                                        setContinuingEmail(e.target.value)
                                    }
                                    placeholder="e.g. juan@example.com"
                                    className={inputCls}
                                />
                                <p className="text-xs text-[#8b8476] mt-1">
                                    {continuingEmail
                                        ? "Detected from the student's existing record — this is their Student Portal login."
                                        : "This email becomes the learner's Student Portal login — required for Junior High."}
                                </p>
                            </div>
                        )}

                        {continuingError && (
                            <p className="text-sm text-red-500">
                                {continuingError}
                            </p>
                        )}
                        <div className="flex justify-end pt-2 border-t border-gray-200">
                            <button
                                onClick={handleContinuingEnroll}
                                disabled={
                                    isArchivedYear ||
                                    continuingSubmitting ||
                                    !selectedContinuingStudent ||
                                    !continuingGrade ||
                                    (isJuniorHighGrade(continuingGrade) &&
                                        !continuingEmail.trim())
                                }
                                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                <UserPlus className="w-4 h-4" />{" "}
                                {continuingSubmitting
                                    ? "Re-Enrolling…"
                                    : "Re-Enroll Student"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-6 space-y-8">
                        <FormSection
                            icon={User}
                            title="Learner Information"
                            description="Legal name and personal details as they appear on official documents"
                        >
                            <div>
                                <label className={labelCls}>
                                    Last Name{" "}
                                    <span className="text-red-400">*</span>
                                </label>
                                <input
                                    value={form.lastName}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            lastName: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. Dela Cruz"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>
                                    First Name{" "}
                                    <span className="text-red-400">*</span>
                                </label>
                                <input
                                    value={form.firstName}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            firstName: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. Juan"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>
                                    Middle Name{" "}
                                    <span className="text-[#8b8476] font-normal">
                                        (Optional)
                                    </span>
                                </label>
                                <input
                                    value={form.middleName}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            middleName: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. Santos"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Suffix</label>
                                <select
                                    value={form.suffix}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            suffix: e.target.value,
                                        }))
                                    }
                                    className={inputCls}
                                >
                                    {SUFFIXES.map((s) => (
                                        <option key={s} value={s}>
                                            {s || "None"}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>
                                    Birthdate{" "}
                                    <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={form.birthdate}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            birthdate: e.target.value,
                                        }))
                                    }
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>
                                    Gender{" "}
                                    <span className="text-red-400">*</span>
                                </label>
                                <select
                                    value={form.gender}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            gender: e.target.value,
                                        }))
                                    }
                                    className={inputCls}
                                >
                                    <option value="">Select gender</option>
                                    {GENDERS.map((g) => (
                                        <option key={g}>{g}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Nationality</label>
                                <input
                                    value={form.nationality}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            nationality: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. Filipino"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Religion</label>
                                <input
                                    value={form.religion}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            religion: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. Roman Catholic"
                                    className={inputCls}
                                />
                            </div>
                        </FormSection>

                        <FormSection
                            icon={GraduationCap}
                            title="Academic Placement"
                            description="Grade level, section, and prior schooling"
                        >
                            <div>
                                <label className={labelCls}>
                                    Grade Level{" "}
                                    <span className="text-red-400">*</span>
                                </label>
                                <select
                                    value={form.grade}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            grade: e.target.value,
                                            section:
                                                sectionOptionsForGrade(
                                                    e.target.value,
                                                )[0] || "",
                                        }))
                                    }
                                    className={inputCls}
                                >
                                    {GRADES.map((g) => (
                                        <option key={g}>{g}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Section</label>
                                {sectionOptionsForGrade(form.grade).length >
                                0 ? (
                                    <select
                                        value={form.section}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                section: e.target.value,
                                            }))
                                        }
                                        className={inputCls}
                                    >
                                        {sectionOptionsForGrade(form.grade).map(
                                            (s) => (
                                                <option key={s}>{s}</option>
                                            ),
                                        )}
                                    </select>
                                ) : (
                                    <input
                                        value="None"
                                        disabled
                                        className={inputCls}
                                    />
                                )}
                            </div>
                            <div>
                                <label className={labelCls}>
                                    Last School Attended
                                </label>
                                <input
                                    value={form.previousSchool}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            previousSchool: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. Taclobo Elementary"
                                    className={inputCls}
                                />
                            </div>
                            <div className="md:col-span-3 pt-2 border-t border-gray-100">
                                <label className={labelCls}>
                                    Enrollment Type
                                </label>
                                <div className="flex gap-4">
                                    {(
                                        ["New Student", "Transferee"] as const
                                    ).map((t) => (
                                        <label
                                            key={t}
                                            className="flex items-center gap-2 text-sm text-[#2c2c2c] cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                name="newOrTransferee"
                                                checked={
                                                    form.enrollmentType === t
                                                }
                                                onChange={() =>
                                                    setForm((f) => ({
                                                        ...f,
                                                        enrollmentType: t,
                                                        previousSchool:
                                                            t === "New Student"
                                                                ? ""
                                                                : f.previousSchool,
                                                    }))
                                                }
                                                className="w-4 h-4 text-[#1a2b4a] focus:ring-[#1a2b4a]/20 rounded"
                                            />
                                            {t}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </FormSection>

                        <FormSection
                            icon={Phone}
                            title="Contact Information"
                            description="How the school can reach the learner directly"
                        >
                            <div>
                                <label className={labelCls}>
                                    Email Address{" "}
                                    {isJuniorHighGrade(form.grade) && (
                                        <span className="text-red-400">*</span>
                                    )}
                                </label>
                                <input
                                    type="email"
                                    required={isJuniorHighGrade(form.grade)}
                                    value={form.email}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            email: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. juan@example.com"
                                    className={inputCls}
                                />
                                {isJuniorHighGrade(form.grade) && (
                                    <p className="text-xs text-[#8b8476] mt-1">
                                        This email becomes the learner's Student
                                        Portal login — required for Junior High.
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className={labelCls}>
                                    Contact Number
                                </label>
                                <input
                                    value={form.phone}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            phone: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. +63 917 000 0000"
                                    className={inputCls}
                                />
                            </div>
                            <div className="md:col-span-1">
                                <label className={labelCls}>
                                    Home Address{" "}
                                    <span className="text-red-400">*</span>
                                </label>
                                <input
                                    value={form.address}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            address: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. Brgy. Taclobo, Dumaguete City"
                                    className={inputCls}
                                />
                            </div>
                        </FormSection>

                        <FormSection
                            icon={Users}
                            title="Parent / Guardian Information"
                            description="At least one parent or the guardian contact below is required"
                        >
                            <div className="md:col-span-3 space-y-6">
                                <div className="p-4 bg-[#faf8f5] border border-gray-200 rounded-lg">
                                    <label className={labelCls}>
                                        Search Existing Parent/Guardian on File{" "}
                                        <span className="text-[#8b8476] font-normal">
                                            (avoids creating a duplicate portal
                                            account)
                                        </span>
                                    </label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                                        <input
                                            value={guardianSearch}
                                            onChange={(e) =>
                                                setGuardianSearch(
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Search by name, email, or phone — e.g. an existing sibling's parent…"
                                            className={inputCls + " pl-9"}
                                        />
                                    </div>
                                    {guardianSearching && (
                                        <p className="text-xs text-[#8b8476] mt-2">
                                            Searching…
                                        </p>
                                    )}
                                    {guardianSearchResults.length > 0 && (
                                        <div className="mt-2 space-y-2">
                                            {guardianSearchResults.map((g) => (
                                                <div
                                                    key={g.id}
                                                    className="flex items-center justify-between gap-3 p-2.5 bg-white border border-gray-200 rounded-lg text-sm"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-[#2c2c2c] truncate">
                                                            {g.fullName}
                                                            {g.detectedLabel && (
                                                                <span className="ml-2 text-xs font-normal text-[#8b8476]">
                                                                    (on file as{" "}
                                                                    {
                                                                        g.detectedLabel
                                                                    }
                                                                    )
                                                                </span>
                                                            )}
                                                        </p>
                                                        <p className="text-xs text-[#8b8476] truncate">
                                                            {g.email}
                                                            {g.phone
                                                                ? ` • ${g.phone}`
                                                                : ""}
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-1.5 shrink-0">
                                                        {g.detectedLabel ? (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    fillContactFromGuardian(
                                                                        g.detected,
                                                                        g,
                                                                    )
                                                                }
                                                                className="px-2.5 py-1.5 bg-[#1a2b4a] text-white rounded-md text-xs font-semibold hover:bg-[#1a2b4a]/90"
                                                            >
                                                                Use as{" "}
                                                                {g.detected ===
                                                                "guardian"
                                                                    ? "Guardian"
                                                                    : g.detected ===
                                                                        "mother"
                                                                      ? "Mother"
                                                                      : "Father"}
                                                            </button>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        fillContactFromGuardian(
                                                                            "mother",
                                                                            g,
                                                                        )
                                                                    }
                                                                    className="px-2.5 py-1.5 border border-[#1a2b4a] text-[#1a2b4a] rounded-md text-xs font-semibold hover:bg-[#1a2b4a]/5"
                                                                >
                                                                    Use as
                                                                    Mother
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        fillContactFromGuardian(
                                                                            "father",
                                                                            g,
                                                                        )
                                                                    }
                                                                    className="px-2.5 py-1.5 border border-[#1a2b4a] text-[#1a2b4a] rounded-md text-xs font-semibold hover:bg-[#1a2b4a]/5"
                                                                >
                                                                    Use as
                                                                    Father
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        fillContactFromGuardian(
                                                                            "guardian",
                                                                            g,
                                                                        )
                                                                    }
                                                                    className="px-2.5 py-1.5 border border-[#1a2b4a] text-[#1a2b4a] rounded-md text-xs font-semibold hover:bg-[#1a2b4a]/5"
                                                                >
                                                                    Use as
                                                                    Guardian
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <PersonFieldGroup
                                    heading="Mother"
                                    lastNameLabel="Maiden Last Name"
                                    person={form.mother}
                                    onChange={(p) =>
                                        setForm((f) => ({ ...f, mother: p }))
                                    }
                                />
                                <PersonFieldGroup
                                    heading="Father"
                                    person={form.father}
                                    onChange={(p) =>
                                        setForm((f) => ({ ...f, father: p }))
                                    }
                                />
                                <PersonFieldGroup
                                    heading="Guardian"
                                    note="(Optional — if both parents cannot attend to the student)"
                                    person={form.guardian}
                                    onChange={(p) =>
                                        setForm((f) => ({
                                            ...f,
                                            guardian: { ...f.guardian, ...p },
                                        }))
                                    }
                                    relationship={form.guardian.relationship}
                                    onRelationshipChange={(v) =>
                                        setForm((f) => ({
                                            ...f,
                                            guardian: {
                                                ...f.guardian,
                                                relationship: v,
                                            },
                                        }))
                                    }
                                />

                                {!hasPrimaryContact && (
                                    <p className="text-xs text-amber-600 flex items-center gap-1.5">
                                        <AlertCircle className="w-3.5 h-3.5" />{" "}
                                        Provide complete details for at least
                                        the Mother, the Father, or the Guardian.
                                    </p>
                                )}

                                {needsDesignatedContactChoice && (
                                    <div className="border-t border-gray-100 pt-4">
                                        <p className={labelCls}>
                                            Designated Contact{" "}
                                            <span className="text-red-400">
                                                *
                                            </span>
                                        </p>
                                        <p className="text-xs text-[#8b8476] mb-2">
                                            More than one contact is on file.
                                            Select who will be the primary
                                            contact and receive parent portal
                                            access.
                                        </p>
                                        <div className="flex gap-4 flex-wrap">
                                            {availableContacts.map((c) => (
                                                <label
                                                    key={c}
                                                    className="flex items-center gap-2 text-sm text-[#2c2c2c] cursor-pointer"
                                                >
                                                    <input
                                                        type="radio"
                                                        name="designatedContact"
                                                        checked={
                                                            form.designatedContact ===
                                                            c
                                                        }
                                                        onChange={() =>
                                                            setForm((f) => ({
                                                                ...f,
                                                                designatedContact:
                                                                    c,
                                                            }))
                                                        }
                                                        className="w-4 h-4 text-[#1a2b4a] focus:ring-[#1a2b4a]/20"
                                                    />
                                                    {c === "mother"
                                                        ? "Mother"
                                                        : c === "father"
                                                          ? "Father"
                                                          : "Guardian"}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </FormSection>

                        <FormSection
                            icon={FileCheck}
                            title="Enrollment Requirements"
                            description="Documents verified on file at time of enrollment"
                        >
                            <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {REQUIREMENTS.map((r) => (
                                    <label
                                        key={r.key}
                                        className={`flex items-center gap-2.5 px-3 py-2.5 border rounded-lg text-sm cursor-pointer transition-all ${form.requirements[r.key] ? "border-[#1a2b4a] bg-[#1a2b4a]/5" : "border-gray-200 hover:border-gray-300"}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={form.requirements[r.key]}
                                            onChange={(e) =>
                                                setForm((f) => ({
                                                    ...f,
                                                    requirements: {
                                                        ...f.requirements,
                                                        [r.key]:
                                                            e.target.checked,
                                                    },
                                                }))
                                            }
                                            className="w-4 h-4 rounded border-gray-300 text-[#1a2b4a] focus:ring-[#1a2b4a]/20"
                                        />
                                        <span
                                            className={
                                                form.requirements[r.key]
                                                    ? "text-[#1a2b4a] font-medium"
                                                    : "text-[#6b6456]"
                                            }
                                        >
                                            {r.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </FormSection>

                        <div className="border rounded-lg p-4 bg-amber-50 border-amber-200">
                            <span className="text-sm text-[#4a4a4a] flex items-start gap-1.5">
                                <PhilippinePeso className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                                <span>
                                    <span className="font-semibold text-[#1a2b4a]">
                                        Enrollment fee pending.
                                    </span>{" "}
                                    Submitting this form places the student in
                                    Pending Enrollment. The enrollment fee must
                                    then be paid at the Cashier's Office; once
                                    the registrar verifies the payment and
                                    confirms the enrollment, the student and
                                    parent portal accounts will be created.
                                </span>
                            </span>
                        </div>

                        <div className="bg-[#faf8f5] border border-gray-200 rounded-lg p-4">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.certified}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            certified: e.target.checked,
                                        }))
                                    }
                                    className="w-4 h-4 mt-0.5 rounded border-gray-300 text-[#1a2b4a] focus:ring-[#1a2b4a]/20"
                                />
                                <span className="text-sm text-[#4a4a4a]">
                                    I certify that the information provided
                                    above is true and accurate, and that the
                                    submitted requirements have been verified by
                                    the Registrar's Office prior to enrollment.
                                </span>
                            </label>
                        </div>

                        {submitError && (
                            <p className="text-sm text-red-500">
                                {submitError}
                            </p>
                        )}
                        <div className="flex justify-end pt-2 border-t border-gray-200">
                            <button
                                onClick={() => setShowConfirmReview(true)}
                                disabled={submitting || requiredFieldsMissing}
                                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                <UserPlus className="w-4 h-4" />{" "}
                                {submitting
                                    ? "Enrolling…"
                                    : "Submit & Enroll Student"}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Review & Confirm before finalizing enrollment */}
            {showConfirmReview && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
                        <div className="bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white px-6 py-4 rounded-t-2xl">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <FileCheck className="w-5 h-5" /> Confirm
                                Enrollment Details
                            </h2>
                            <p className="text-xs text-white/70 mt-0.5">
                                Please review before finalizing — this will
                                create the student's record and portal accounts.
                            </p>
                        </div>
                        <div className="p-6 space-y-3 text-sm">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-xs text-[#8b8476]">
                                        Full Name
                                    </p>
                                    <p className="font-medium text-[#2c2c2c]">
                                        {form.lastName}, {form.firstName}{" "}
                                        {form.middleName}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#8b8476]">
                                        Enrollment Type
                                    </p>
                                    <p className="font-medium text-[#2c2c2c]">
                                        {form.enrollmentType}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#8b8476]">
                                        Grade Level
                                    </p>
                                    <p className="font-medium text-[#2c2c2c]">
                                        {form.grade}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#8b8476]">
                                        Section
                                    </p>
                                    <p className="font-medium text-[#2c2c2c]">
                                        {form.section || "—"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#8b8476]">
                                        Birthdate
                                    </p>
                                    <p className="font-medium text-[#2c2c2c]">
                                        {form.birthdate}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#8b8476]">
                                        Gender
                                    </p>
                                    <p className="font-medium text-[#2c2c2c]">
                                        {form.gender}
                                    </p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-xs text-[#8b8476]">
                                        Home Address
                                    </p>
                                    <p className="font-medium text-[#2c2c2c]">
                                        {form.address}
                                    </p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-xs text-[#8b8476]">
                                        Designated Contact (will receive parent
                                        portal access)
                                    </p>
                                    <p className="font-medium text-[#2c2c2c]">
                                        {effectiveDesignatedContact === "mother"
                                            ? personFullName(form.mother)
                                            : effectiveDesignatedContact ===
                                                "father"
                                              ? personFullName(form.father)
                                              : effectiveDesignatedContact ===
                                                  "guardian"
                                                ? `${personFullName(form.guardian)} (${form.guardian.relationship})`
                                                : "—"}
                                    </p>
                                </div>
                            </div>
                            <p className="text-xs text-[#8b8476] pt-2 border-t border-gray-200">
                                By confirming, you certify that the details
                                above are accurate and true as entered from the
                                enrollee's submitted documents.
                            </p>
                        </div>
                        <div className="p-6 pt-0 flex gap-3">
                            <button
                                onClick={() => setShowConfirmReview(false)}
                                disabled={submitting}
                                className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all disabled:opacity-60"
                            >
                                Go Back &amp; Edit
                            </button>
                            <button
                                onClick={async () => {
                                    await handleEnroll();
                                    setShowConfirmReview(false);
                                }}
                                disabled={submitting}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60"
                            >
                                <CheckCircle className="w-4 h-4" />{" "}
                                {submitting ? "Enrolling…" : "Confirm & Enroll"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmNotice && (
                <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
                    <CheckCircle className="w-4 h-4 shrink-0" /> {confirmNotice}
                </div>
            )}
            </>
            )}

            {/* Pending Re-Enrollments — moved off the New/Transferee & Continuing Student
          sub-pages onto the dedicated "Pending Enrollment" sub-page (see subPage prop). */}
            {subPage === "pending" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="font-semibold text-[#1a2b4a]">
                        Pending Re-Enrollments{" "}
                        <span className="text-sm font-normal text-[#8b8476]">
                            ({pendingEnrollments.length})
                        </span>
                    </h3>
                    <p className="text-xs text-[#8b8476] mt-1">
                        Awaiting enrollment fee payment at the Cashier's Office.
                        Verify the receipt under Receipts before confirming —
                        confirming unlocks the student's and parent's portal
                        access for {schoolYear}.
                    </p>
                </div>
                <div className="divide-y divide-gray-200">
                    {pendingLoading ? (
                        <div className="px-6 py-8 text-center text-sm text-[#8b8476]">
                            Loading…
                        </div>
                    ) : pendingEnrollments.length === 0 ? (
                        <div className="px-6 py-8 text-center text-sm text-[#8b8476]">
                            No pending re-enrollments.
                        </div>
                    ) : (
                        pendingEnrollments.map((p) => (
                            <div
                                key={p.enrollmentId}
                                className="px-6 py-4 flex items-center justify-between gap-3"
                            >
                                <div>
                                    <p className="font-medium text-[#2c2c2c]">
                                        {p.name}
                                    </p>
                                    <p className="text-xs text-[#8b8476]">
                                        {p.studentId} • {p.grade}
                                        {p.section ? `, ${p.section}` : ""}
                                    </p>
                                    {!p.feeSettled && (
                                        <p className="text-xs text-amber-600 font-medium mt-0.5">
                                            Enrollment fee not yet paid
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() =>
                                        confirmEnrollment(
                                            p.enrollmentId,
                                            p.name,
                                        )
                                    }
                                    disabled={
                                        confirmingId === p.enrollmentId ||
                                        isArchivedYear ||
                                        !p.feeSettled
                                    }
                                    title={
                                        !p.feeSettled
                                            ? "The enrollment fee must be paid at the Cashier's Office before this enrollment can be confirmed."
                                            : undefined
                                    }
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-all disabled:opacity-60"
                                >
                                    <CheckCircle className="w-4 h-4" />{" "}
                                    {confirmingId === p.enrollmentId
                                        ? "Confirming…"
                                        : "Confirm Enrollment"}
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
            )}

            {/* Pending Enrollment (new students / transferees) — moved onto the dedicated
          "Pending Enrollment" sub-page (see subPage prop). */}
            {subPage === "pending" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="font-semibold text-[#1a2b4a]">
                        Pending Enrollment{" "}
                        <span className="text-sm font-normal text-[#8b8476]">
                            ({pendingNewEnrollments.length})
                        </span>
                    </h3>
                    <p className="text-xs text-[#8b8476] mt-1">
                        Awaiting enrollment fee payment at the Cashier's Office.
                        Verify the receipt under Receipts before confirming —
                        confirming creates the student's and parent's portal
                        access.
                    </p>
                </div>
                <div className="divide-y divide-gray-200">
                    {pendingLoading ? (
                        <div className="px-6 py-8 text-center text-sm text-[#8b8476]">
                            Loading…
                        </div>
                    ) : pendingNewEnrollments.length === 0 ? (
                        <div className="px-6 py-8 text-center text-sm text-[#8b8476]">
                            No pending enrollments.
                        </div>
                    ) : (
                        pendingNewEnrollments.map((p) => (
                            <div
                                key={p.enrollmentId}
                                className="px-6 py-4 flex items-center justify-between gap-3"
                            >
                                <div>
                                    <p className="font-medium text-[#2c2c2c]">
                                        {p.name}
                                    </p>
                                    <p className="text-xs text-[#8b8476]">
                                        {p.studentId} • {p.grade}
                                        {p.section ? `, ${p.section}` : ""}
                                    </p>
                                    {!p.feeSettled && (
                                        <p className="text-xs text-amber-600 font-medium mt-0.5">
                                            Enrollment fee not yet paid
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() =>
                                        confirmNewEnrollment(
                                            p.enrollmentId,
                                            p.studentId,
                                            p.name,
                                        )
                                    }
                                    disabled={
                                        confirmingId === p.enrollmentId ||
                                        isArchivedYear ||
                                        !p.feeSettled
                                    }
                                    title={
                                        !p.feeSettled
                                            ? "The enrollment fee must be paid at the Cashier's Office before this enrollment can be confirmed."
                                            : undefined
                                    }
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-all disabled:opacity-60"
                                >
                                    <CheckCircle className="w-4 h-4" />{" "}
                                    {confirmingId === p.enrollmentId
                                        ? "Confirming…"
                                        : "Confirm Enrollment"}
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
            )}

            {/* Recently Enrolled — lives on its own dedicated sub-page, off the New/Transferee
          & Continuing Student sub-pages (see subPage prop). */}
            {subPage === "recent" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="font-semibold text-[#1a2b4a]">
                        Recently Enrolled{" "}
                        <span className="text-sm font-normal text-[#8b8476]">
                            ({filtered.length})
                        </span>
                    </h3>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name or ID..."
                            className="pl-9 pr-3 py-1.5 border border-black-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#000000]/20 text-[#000000]"
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-[#faf8f5] border-b border-gray-200">
                            <tr>
                                {[
                                    "Student",
                                    "ID",
                                    "Grade & Section",
                                    "Guardian",
                                    "Date Enrolled",
                                ].map((h) => (
                                    <th
                                        key={h}
                                        className="px-6 py-3 text-sm font-semibold text-[#1a2b4a] text-left"
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loadingList ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-6 py-10 text-center text-[#8b8476] text-sm"
                                    >
                                        Loading…
                                    </td>
                                </tr>
                            ) : listError ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-6 py-10 text-center text-red-500 text-sm"
                                    >
                                        {listError}
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-6 py-10 text-center text-[#8b8476] text-sm"
                                    >
                                        No enrollees found.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((e) => (
                                    <tr
                                        key={e.id}
                                        className="hover:bg-[#faf8f5] transition-colors"
                                    >
                                        <td className="px-6 py-3 text-sm font-medium text-[#2c2c2c]">
                                            {e.name}
                                        </td>
                                        <td className="px-6 py-3 text-sm font-mono text-[#6b6456]">
                                            {e.id}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-[#6b6456]">
                                            {e.grade} — {e.section}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-[#6b6456]">
                                            {e.guardianName}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-[#6b6456]">
                                            {e.dateEnrolled}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            )}

            {submitNotice && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <h2 className="text-xl font-semibold text-[#1a2b4a]">
                            Application Submitted
                        </h2>
                        <p className="text-sm text-[#6b6456]">{submitNotice}</p>
                        {lastGuardianContacts && (
                            <button
                                onClick={() => {
                                    setForm({
                                        ...emptyForm,
                                        mother: lastGuardianContacts.mother,
                                        father: lastGuardianContacts.father,
                                        guardian: lastGuardianContacts.guardian,
                                        designatedContact:
                                            lastGuardianContacts.designatedContact,
                                    });
                                    setSubmitNotice(null);
                                }}
                                className="w-full px-6 py-3 border-2 border-[#1a2b4a] text-[#1a2b4a] rounded-lg hover:bg-[#1a2b4a]/5 transition-all font-medium"
                            >
                                Enroll Another Child (Same Parent)
                            </button>
                        )}
                        <button
                            onClick={() => setSubmitNotice(null)}
                            className="w-full px-6 py-3 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg hover:shadow-lg transition-all font-medium"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {newStudentCredentials && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <h2 className="text-xl font-semibold text-[#1a2b4a]">
                            Enrollment Confirmed
                        </h2>
                        <div>
                            {newStudentCredentials.email ? (
                                <>
                                    <p className="text-sm text-[#6b6456] mb-1.5">
                                        {newStudentCredentials.emailSent
                                            ? `An activation email was sent to ${newStudentCredentials.name} at:`
                                            : `${newStudentCredentials.name} can now log in to the student portal with:`}
                                    </p>
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-1 text-sm">
                                        <p>
                                            <strong>Email:</strong>{" "}
                                            {newStudentCredentials.email}
                                        </p>
                                        {newStudentCredentials.emailSent ? (
                                            <p className="text-[#8b8476] italic">
                                                They'll set their own password
                                                by following the link in that
                                                email.
                                            </p>
                                        ) : (
                                            <p>
                                                <strong>Password:</strong>{" "}
                                                {newStudentCredentials.password}
                                            </p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <p className="text-sm text-[#6b6456] mb-1.5">
                                    Student portal accounts are only created
                                    automatically for Junior High (Grades 7-10),
                                    so no student login was created.
                                </p>
                            )}
                        </div>
                        {newStudentCredentials.parent && (
                            <div>
                                <p className="text-sm text-[#6b6456] mb-1.5">
                                    {newStudentCredentials.parent.emailSent
                                        ? `An activation email was sent to ${newStudentCredentials.parent.name} at:`
                                        : newStudentCredentials.parent.isNewAccount
                                          ? `${newStudentCredentials.parent.name} can now log in to the parent portal with:`
                                          : `${newStudentCredentials.parent.name} already has parent portal access under this email — this student was linked to that existing account:`}
                                </p>
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-1 text-sm">
                                    <p>
                                        <strong>Email:</strong>{" "}
                                        {newStudentCredentials.parent.email}
                                    </p>
                                    {newStudentCredentials.parent.emailSent ? (
                                        <p className="text-[#8b8476] italic">
                                            They'll set their own password by
                                            following the link in that email.
                                        </p>
                                    ) : newStudentCredentials.parent.password ? (
                                        <p>
                                            <strong>Password:</strong>{" "}
                                            {
                                                newStudentCredentials.parent
                                                    .password
                                            }
                                        </p>
                                    ) : (
                                        <p className="text-[#8b8476] italic">
                                            Existing password unchanged.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                        {newStudentCredentials.parent &&
                            lastGuardianContacts && (
                                <button
                                    onClick={() => {
                                        setForm({
                                            ...emptyForm,
                                            mother: lastGuardianContacts.mother,
                                            father: lastGuardianContacts.father,
                                            guardian:
                                                lastGuardianContacts.guardian,
                                            designatedContact:
                                                lastGuardianContacts.designatedContact,
                                        });
                                        setNewStudentCredentials(null);
                                    }}
                                    className="w-full px-6 py-3 border-2 border-[#1a2b4a] text-[#1a2b4a] rounded-lg hover:bg-[#1a2b4a]/5 transition-all font-medium"
                                >
                                    Enroll Another Child (Same Parent)
                                </button>
                            )}
                        <button
                            onClick={() => setNewStudentCredentials(null)}
                            className="w-full px-6 py-3 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg hover:shadow-lg transition-all font-medium"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

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
function GradeRecordsSection({ schoolYear }: { schoolYear: string }) {
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
                    "id, first_name, middle_name, last_name, date_of_birth, home_address, guardian_name, grade_level, section",
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

    if (selected) {
        return (
                <div className="space-y-6">
                    <div>
                        <button
                            onClick={() => setSelected(null)}
                            className="flex items-center gap-1.5 text-sm font-medium text-[#1a2b4a] hover:underline mb-2"
                        >
                            <ChevronDown className="w-4 h-4 rotate-90" />
                            Back to Grade Records
                        </button>
                        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                            Transcript of Records
                        </h1>
                    </div>

                    <div className="max-w-2xl mx-auto space-y-5">
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
                                {/* <button onClick={openEdit} className="flex-1 px-4 py-2.5 border-2 border-[#c9a961] text-[#1a2b4a] rounded-lg font-medium hover:bg-[#fdf9f0] transition-all text-sm flex items-center justify-center gap-1.5">
                  <Edit className="w-4 h-4" /> Edit Student Info
                </button> */}
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


            {/* Edit Student Info Modal (grades are never editable here) */}
            {showEditModal && selected && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Edit className="w-5 h-5" />
                                <h3 className="text-lg font-semibold">
                                    Edit Student Info
                                </h3>
                            </div>
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="p-1 hover:bg-white/20 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">
                                    Full Name
                                </label>
                                <input
                                    value={selected.name}
                                    disabled
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-[#8b8476]"
                                />
                                <p className="text-xs text-[#8b8476] mt-1">
                                    Edit the student's name from Student
                                    Management.
                                </p>
                            </div>
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
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
                                />
                            </div>
                            <div>
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
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
                                />
                            </div>
                            <div>
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
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
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
                </div>
            )}
        </div>
    );
}
