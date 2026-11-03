import { useState, useEffect } from "react";
import {
    Users,
    GraduationCap,
    Calendar,
    UserPlus,
    AlertCircle,
    BookMarked,
    X,
    Briefcase,
    Wrench,
    Heart,
    Stethoscope,
} from "lucide-react";
import { supabase } from "../../supabase";
import { createStudentAccount } from "../../lib/accounts";
import {
    getCurrentSchoolYearId,
    isJuniorHighGrade,
    generateStudentId,
} from "../../lib/students";
import { FacultyForm } from "./FacultyForm";

// Overview Section
export function OverviewSection({
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
