import { useState } from "react";
import { UserCheck, ChevronDown } from "lucide-react";
import { type Student } from "../../lib/students";

export function StudentEditModal({
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
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
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
