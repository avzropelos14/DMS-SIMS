import { useState, useEffect } from "react";
import {
    Users,
    GraduationCap,
    PhilippinePeso,
    UserPlus,
    Search,
    AlertCircle,
    CheckCircle,
    Phone,
    FileCheck,
    User,
} from "lucide-react";
import { supabase } from "../../supabase";
import { DEFAULT_ENROLLMENT_FEES, getTuitionForGrade } from "../../lib/tuition";
import {
    createStudentAccount,
    createGuardianAccount,
} from "../../lib/accounts";
import {
    getCurrentSchoolYearId,
    isJuniorHighGrade,
    generateStudentId,
    splitStudentName,
} from "../../lib/students";

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
export function EnrollmentSection({
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
