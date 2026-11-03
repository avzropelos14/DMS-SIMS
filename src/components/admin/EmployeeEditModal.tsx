import { useState } from "react";
import { ArrowLeft } from "lucide-react";

export function EmployeeEditModal({
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
