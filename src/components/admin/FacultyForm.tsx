import { useState } from "react";
import { insertEmployee, TEACHER_SUBJECTS } from "../../lib/employees";

// Non-teacher faculty/staff roles map to a fixed department in the `departments` table
const ROLE_DEPARTMENTS: Record<string, string> = {
    "Administrative Staff": "Administration",
    "Guidance Counselor": "Student Services",
    "School Nurse": "Health Services",
    "Maintenance Staff": "Maintenance & Facilities",
};

// Faculty/Staff Form Component — inserts a new row into the Supabase `employees` table
export function FacultyForm({
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
