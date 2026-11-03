import { useState, useEffect } from "react";
import { DashboardLayout } from "./DashboardLayout";
import { StaffProfileView } from "./StaffProfileView";
import { usePersistedView, navViewIds } from "../lib/usePersistedView";
import {
    GraduationCap,
    Calendar,
    UserPlus,
    FileCheck,
    User,
    Receipt,
    Lock,
} from "lucide-react";
import {
    getCurrentSchoolYear,
    type SchoolYear,
} from "../lib/schoolYear";
import { StudentManagement } from "./shared/StudentManagement";
import { ReceiptsSection } from "./registrar/ReceiptsSection";
import { GradeRecordsSection } from "./registrar/GradeRecordsSection";
import { AcademicsSection } from "./registrar/AcademicsSection";
import { EnrollmentSection } from "./registrar/EnrollmentSection";
import { type StaffDashboardProps } from "./shared/dashboardProps";

// The fee props in StaffDashboardProps are accepted so App.tsx can pass the same props
// to both dashboards; no registrar view uses them.
export function RegistrarDashboard({
    user,
    onLogout,
}: StaffDashboardProps) {
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
    const [activeView, setActiveView] = usePersistedView(
        "registrar",
        user?.id,
        navViewIds(registrarNavigation),
        "students",
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

    return (
        <DashboardLayout
            user={user}
            role="registrar"
            navigation={registrarNavigation}
            activeView={activeView}
            onViewChange={setActiveView}
            onLogout={onLogout}
            schoolYear={schoolYear}
            onSchoolYearChange={setSchoolYear}
        >
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

            {(activeView === "enrollment" ||
                activeView === "enrollment-continuing" ||
                activeView === "enrollment-pending" ||
                activeView === "enrollment-recent") && (
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
                    isRegistrar={true}
                />
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
            {activeView === "receipts" && (
                <ReceiptsSection schoolYear={schoolYear} />
            )}
            {activeView === "gradeRecords" && (
                <GradeRecordsSection schoolYear={schoolYear} />
            )}
            {activeView === "profile" && (
                <StaffProfileView user={user} color="#1a2b4a" />
            )}
        </DashboardLayout>
    );
}
