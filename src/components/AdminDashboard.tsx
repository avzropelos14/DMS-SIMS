import { useState, useEffect } from "react";
import { DashboardLayout } from "./DashboardLayout";
import { StaffProfileView } from "./StaffProfileView";
import { usePersistedView, navViewIds } from "../lib/usePersistedView";
import {
    LayoutDashboard,
    Users,
    GraduationCap,
    Settings,
    CreditCard,
    User,
    Layers,
    Lock,
    ShieldCheck,
    Footprints,
    ScrollText,
} from "lucide-react";
import {
    DEFAULT_TUITION_FEES,
    DEFAULT_ENROLLMENT_FEES,
} from "../lib/tuition";
import {
    getCurrentSchoolYear,
    type SchoolYear,
} from "../lib/schoolYear";
import { StudentManagement } from "./shared/StudentManagement";
import { SubjectManagement } from "./admin/SubjectManagement";
import { RoomManagement } from "./admin/RoomManagement";
import { BackupReminderBanner } from "./admin/BackupReminderBanner";
import { TeachersListSection } from "./admin/TeachersListSection";
import { ClassManagementSection } from "./admin/ClassManagementSection";
import { StaffManagement } from "./admin/StaffManagement";
import { IDGenerationSection } from "./admin/IDGenerationSection";
import { OverviewSection } from "./admin/OverviewSection";
import { FinancialSection } from "./admin/FinancialSection";
import { SettingsSection } from "./admin/SettingsSection";
import { GuardianSecuritySection } from "./admin/GuardianSecuritySection";
import { SelfDismissalApprovals } from "./shared/SelfDismissalApprovals";
import { AuditLogSection } from "./admin/AuditLogSection";
import { type StaffDashboardProps } from "./shared/dashboardProps";

export function AdminDashboard({
    user,
    onLogout,
    tuitionFees = DEFAULT_TUITION_FEES,
    onTuitionFeesChange,
    enrollmentFees = DEFAULT_ENROLLMENT_FEES,
    onEnrollmentFeesChange,
}: StaffDashboardProps) {
    // This shell is only rendered for the full admin; the registrar has RegistrarDashboard.
    const isAdmin = true;
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
        { id: "guardiansecurity", label: "Guardian Security", icon: ShieldCheck },
        { id: "selfdismissal", label: "Self-Dismissal Requests", icon: Footprints },
        { id: "auditlog", label: "Audit Log", icon: ScrollText },
        { id: "profile", label: "My Profile", icon: User },
        { id: "settings", label: "System Settings", icon: Settings },
    ];
    const [activeView, setActiveView] = usePersistedView(
        "admin",
        user?.id,
        navViewIds(fullNavigation),
        "overview",
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
            role="admin"
            navigation={fullNavigation}
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

            {activeView === "overview" && (
                <OverviewSection user={user} schoolYear={schoolYear} />
            )}
            {activeView === "students" && (
                <StudentManagement
                    schoolYear={schoolYear}
                    isRegistrar={false}
                />
            )}
            {activeView === "classmanagement" && (
                <ClassManagementSection
                    schoolYear={schoolYear}
                    isArchivedYear={isArchivedYear}
                    user={user}
                />
            )}
            {activeView === "subjects" && (
                <SubjectManagement />
            )}
            {activeView === "rooms" && (
                <RoomManagement />
            )}
            {activeView === "teacherslist" && (
                <TeachersListSection schoolYear={schoolYear} />
            )}
            {activeView === "staff" && (
                <StaffManagement schoolYear={schoolYear} isAdmin={isAdmin} />
            )}
            {activeView === "idgeneration" && (
                <IDGenerationSection schoolYear={schoolYear} />
            )}
            {activeView === "guardiansecurity" && <GuardianSecuritySection />}
            {activeView === "selfdismissal" && <SelfDismissalApprovals />}
            {activeView === "auditlog" && <AuditLogSection />}
            {activeView === "financials" && (
                <FinancialSection
                    schoolYear={schoolYear}
                    tuitionFees={tuitionFees}
                />
            )}
            {activeView === "settings" && (
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
