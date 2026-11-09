import { useEffect, useState } from "react";
import { getSchoolYearByLabel } from "../../lib/schoolYear";
import { StudentRequirements } from "../shared/StudentRequirements";

// Parent portal overview: the selected child's enrollment requirements, read-only (Phase 7).
// Parents with more than one child switch between them right here; the choice is the portal's
// shared selected child, so the other tabs stay in step.

interface ChildRequirementsCardProps {
    children: { id: string; name: string; grade?: string }[];
    childId: string;
    childName: string;
    schoolYear: string;
    onSelectChild: (id: string) => void;
}

export function ChildRequirementsCard({ children, childId, childName, schoolYear, onSelectChild }: ChildRequirementsCardProps) {
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
            {children.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Choose a child">
                    {children.map((child) => (
                        <button
                            key={child.id}
                            onClick={() => onSelectChild(child.id)}
                            aria-pressed={child.id === childId}
                            className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                                child.id === childId
                                    ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]"
                                    : "border-gray-200 text-[#6b6456] hover:border-[#c9a961]/50 hover:bg-[#faf8f5]"
                            }`}
                        >
                            {child.name}
                        </button>
                    ))}
                </div>
            )}
            {yearId?.label === schoolYear ? (
                <StudentRequirements key={`${childId}-${yearId.id}`} studentId={childId} schoolYearId={yearId.id} readOnly />
            ) : (
                <p className="text-sm text-[#8b8476]">Loading…</p>
            )}
        </div>
    );
}
