import { useEffect, useState } from "react";
import { getSchoolYearByLabel } from "../../lib/schoolYear";
import { StudentRequirements } from "../shared/StudentRequirements";

// Parent portal overview: the selected child's enrollment requirements, read-only (Phase 7).

export function ChildRequirementsCard({ childId, childName, schoolYear }: { childId: string; childName: string; schoolYear: string }) {
    const [yearId, setYearId] = useState<{ label: string; id: string | null } | null>(null);

    useEffect(() => {
        let cancelled = false;
        getSchoolYearByLabel(schoolYear).then((sy) => { if (!cancelled) setYearId({ label: schoolYear, id: sy?.id ?? null }); });
        return () => { cancelled = true; };
    }, [schoolYear]);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a] mb-1">Enrollment Requirements</h3>
            <p className="text-sm text-[#6b6456] mb-4">Documents on file for {childName}, school year {schoolYear}.</p>
            {yearId?.label === schoolYear ? (
                <StudentRequirements key={`${childId}-${yearId.id}`} studentId={childId} schoolYearId={yearId.id} readOnly />
            ) : (
                <p className="text-sm text-[#8b8476]">Loading…</p>
            )}
        </div>
    );
}
