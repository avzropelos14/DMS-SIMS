// Props shared by the admin and registrar dashboard shells (App.tsx passes the same
// props to both).
export interface StaffDashboardProps {
    user: any;
    onLogout: () => void;
    tuitionFees?: Record<string, number>;
    onTuitionFeesChange?: (
        fees: Record<string, number>,
    ) => Promise<string | null>;
    enrollmentFees?: Record<string, number>;
    onEnrollmentFeesChange?: (
        fees: Record<string, number>,
    ) => Promise<string | null>;
}
