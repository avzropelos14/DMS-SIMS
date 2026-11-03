import { useState, useEffect } from "react";
import {
    Users,
    UserPlus,
    Search,
    Mail,
    Phone,
    Trash2,
    Eye,
    ArrowLeft,
} from "lucide-react";
import { supabase } from "../../supabase";
import {
    STAFF_POSITION_ROLES,
    createStaffAccount,
    deleteAuthAccountFor,
} from "../../lib/accounts";
import {
    getDepartmentIdByName,
    insertEmployee,
    TEACHER_SUBJECTS,
} from "../../lib/employees";
import { EmployeeEditModal } from "./EmployeeEditModal";

// Staff & Employee Management Section
export function StaffManagement({
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
