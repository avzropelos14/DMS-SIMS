import { useEffect, useRef, useState } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { supabase } from '../supabase';
import { getCurrentSchoolYear, getSchoolYearByLabel } from '../lib/schoolYear';
import { fetchAssignedTeacherMap } from '../lib/schedule';
import { DEFAULT_TUITION_FEES, DEFAULT_ENROLLMENT_FEES, getTuitionForGrade, useTuitionBreakdown } from '../lib/tuition';
import schoolLogo from './assets/dmgteLogo.jpg';
import { QRCodeCanvas } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  LayoutDashboard, Award, Calendar, Settings, Users,
  BookOpen, Download,
  QrCode, UserPlus, X, Plus, Timer, Shield, CheckCircle, AlertCircle,
  Mail, User, Trash2, Phone, Briefcase, FileText, ArrowLeft, LogOut
} from 'lucide-react';

// The Guard portal's scanner decodes and parses this exact shape (see GuardPortal.tsx).
// Content is the guardian name, guardian relationship, and student name (plus the IDs
// needed to verify those names actually match a real, currently-linked record).
type PickupQRPayload =
  | { type: 'permanent'; guardianId: string; guardianName: string; relationship: string; studentId: string; studentName: string }
  | { type: 'temporary'; authId: string; guardianName: string; relationship: string; studentId: string; studentName: string };

interface ParentPortalProps {
  user: any;
  onLogout: () => void;
}

export function ParentPortal({ user, onLogout }: ParentPortalProps) {
  const [activeView, setActiveView] = useState('overview');
  const [schoolYear, setSchoolYear] = useState('2025-2026');
  const [selectedChild, setSelectedChild] = useState('');

  useEffect(() => {
    getCurrentSchoolYear().then((sy) => { if (sy) setSchoolYear(sy.label); });
  }, []);

  // First-time parents — or parents whose child has just been re-enrolled for a new
  // school year — must acknowledge the Notice of Access before the portal is usable.
  // Persisted per-user *and* per-school-year, so re-enrollment into a new year surfaces
  // the notice again instead of a once-ever flag silently covering every future year.
  const noticeStorageKey = `noticeOfAccessAck_${user?.id || user?.email || 'guest'}_${schoolYear}`;
  const [showNotice, setShowNotice] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(noticeStorageKey) !== 'true';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setShowNotice(window.localStorage.getItem(noticeStorageKey) !== 'true');
  }, [noticeStorageKey]);
  const acknowledgeNotice = () => {
    window.localStorage.setItem(noticeStorageKey, 'true');
    setShowNotice(false);
  };

  // Multiple children data - shared across all views. Loaded from student_guardians
  // (joined to students) for the signed-in guardian, since a parent/guardian may
  // have more than one enrolled child linked to their account.
  const [children, setChildren] = useState<any[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadChildren() {
      if (!user?.id) {
        setChildren([]);
        setChildrenLoading(false);
        return;
      }
      setChildrenLoading(true);
      const { data, error } = await supabase
        .from('student_guardians')
        .select('student_id, relationship, is_primary_contact, can_view_academics, can_pickup, students(id, first_name, middle_name, last_name, grade_level, section, date_of_birth, gender, status, gpa, mother_info, father_info, guardian_info, enrolled_date)')
        .eq('guardian_id', user.id);

      if (cancelled) return;

      if (!error && data) {
        const mapped = data
          .filter((row: any) => row.students)
          .map((row: any) => {
            const s = row.students;
            const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ');
            // Occupation lives on whichever *_info JSONB bucket matches this guardian's
            // relationship to the child, as recorded at enrollment.
            const infoForRelationship = row.relationship === 'Mother'
              ? s.mother_info
              : row.relationship === 'Father'
                ? s.father_info
                : s.guardian_info;
            return {
              id: s.id,
              name: fullName,
              grade: s.section ? `${s.grade_level}, Section ${s.section}` : s.grade_level,
              gradeLevel: s.grade_level,
              section: s.section,
              enrolledDate: s.enrolled_date,
              gender: s.gender,
              dateOfBirth: s.date_of_birth,
              status: s.status,
              gpa: s.gpa,
              relationship: row.relationship,
              isPrimaryContact: row.is_primary_contact,
              canViewAcademics: row.can_view_academics,
              canPickup: row.can_pickup,
              guardianOccupation: infoForRelationship?.occupation || '',
            };
          });
        setChildren(mapped);
        setSelectedChild((prev) => (prev && mapped.some((c: any) => c.id === prev)) ? prev : (mapped[0]?.id || ''));
      } else {
        setChildren([]);
      }
      setChildrenLoading(false);
    }

    loadChildren();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Restricts the header year-switcher to years at least one of this guardian's children
  // was actually enrolled in — a new student has no prior years to offer, while a
  // continuing student sees every year back to whichever one they first enrolled in.
  const [availableYears, setAvailableYears] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function loadAvailableYears() {
      if (children.length === 0) { setAvailableYears(undefined); return; }
      const { data } = await supabase
        .from('enrollments')
        .select('school_years(label)')
        .in('student_id', children.map((c: any) => c.id));
      if (cancelled) return;
      const labels = Array.from(new Set((data ?? []).map((r: any) => r.school_years?.label).filter(Boolean)));
      // Always include the current label so a brand-new student (no enrollment row yet)
      // still has somewhere to land — and so the selector never ends up empty.
      if (schoolYear && !labels.includes(schoolYear)) labels.push(schoolYear);
      setAvailableYears(labels);
    }
    loadAvailableYears();
    return () => { cancelled = true; };
  }, [children, schoolYear]);

  if (user?.enrollmentConfirmed === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf8f5] px-4">
        <div className="max-w-md text-center bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-[#1a2b4a] mb-2">Enrollment Not Yet Confirmed</h2>
          <p className="text-sm text-[#6b6456] mb-6">
            Your child's enrollment for the current school year has not been confirmed yet. Please visit the Registrar's Office to complete re-enrollment before accessing your portal.
          </p>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1a2b4a] text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  const navigation = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'academics', label: 'Academic Progress', icon: Award },
    { id: 'schedule', label: 'Student Schedule', icon: Calendar },
    { id: 'pickup', label: 'Student Pickup', icon: QrCode },
    { id: 'financials', label: 'Billing & Payments', icon: Settings },
    { id: 'profile', label: 'My Profile', icon: User },
    /* { id: 'messages', label: 'Messages', icon: MessageSquare } */
  ];

  return (
    <>
      <div className={showNotice ? 'blur-sm pointer-events-none select-none' : ''}>
        <DashboardLayout
          user={user}
          role="parent"
          navigation={navigation}
          activeView={activeView}
          onViewChange={setActiveView}
          onLogout={onLogout}
          schoolYear={schoolYear}
          onSchoolYearChange={setSchoolYear}
          onProfileClick={() => setActiveView('profile')}
          availableYears={availableYears}
        >
          {activeView === 'schoolPolicy' && <SchoolPolicyPage onBack={() => setActiveView('overview')} />}
          {activeView !== 'schoolPolicy' && childrenLoading && (
            <div className="p-12 text-center text-[#6b6456]">Loading your children's records…</div>
          )}
          {activeView !== 'schoolPolicy' && !childrenLoading && children.length === 0 && (
            <div className="p-12 text-center text-[#6b6456]">
              No students are currently linked to your account. Please contact the registrar's office.
            </div>
          )}
          {activeView !== 'schoolPolicy' && !childrenLoading && children.length > 0 && (
            <>
              {activeView === 'overview' && <ParentOverview user={user} schoolYear={schoolYear} children={children} selectedChild={selectedChild} setSelectedChild={setSelectedChild} onOpenSchoolPolicy={() => setActiveView('schoolPolicy')} />}
              {activeView === 'academics' && <AcademicProgress schoolYear={schoolYear} children={children} selectedChild={selectedChild} setSelectedChild={setSelectedChild} />}
              {activeView === 'schedule' && <ScheduleViewing schoolYear={schoolYear} children={children} selectedChild={selectedChild} setSelectedChild={setSelectedChild} />}
              {activeView === 'pickup' && <StudentPickup user={user} children={children} />}
              {activeView === 'financials' && <BillingPayments schoolYear={schoolYear} children={children} selectedChild={selectedChild} setSelectedChild={setSelectedChild} />}
              {activeView === 'profile' && <MyProfile user={user} children={children} />}
              {activeView === 'messages' && <MessagingCenter user={user} />}
            </>
          )}
        </DashboardLayout>
      </div>
      {showNotice && <NoticeOfAccessModal onAcknowledge={acknowledgeNotice} />}
    </>
  );
}

// School Policy — placeholder document view reached from the dashboard's School Policy card.
// The real policy PDF is still being finalized by the administration, so this shows a
// stand-in "document" with a dummy last-updated date until that file is ready.
function SchoolPolicyPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] font-medium"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to Dashboard</span>
      </button>

      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">School Policy</h1>
        <p className="text-[#6b6456]">Dumaguete Mission School • Official Policy Document</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-3xl">
        <div className="bg-[#faf8f5] px-6 py-5 border-b border-gray-200 flex items-center gap-4">
          <img src={schoolLogo} alt="School Logo" className="w-14 h-14 rounded-full object-cover border-2 border-[#c9a961]" />
          <div>
            <p className="font-semibold text-[#1a2b4a]">Dumaguete Mission School — Student & Parent Handbook</p>
            <p className="text-xs text-[#8b8476]">Last Updated: June 1, 2026 (dummy date — placeholder document)</p>
          </div>
        </div>
        <div className="p-6 space-y-5 text-sm text-[#2c2c2c] leading-relaxed">
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>This is a placeholder. The administration is still finalizing the official School Policy PDF — this page will link directly to that document once it's available.</span>
          </div>
          <div>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">1. Attendance & Punctuality</h3>
            <p className="text-[#6b6456]">Students are expected to arrive on time and maintain a minimum attendance rate each quarter. Repeated tardiness or absences will be communicated to parents/guardians.</p>
          </div>
          <div>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">2. Code of Conduct</h3>
            <p className="text-[#6b6456]">Students are expected to treat faculty, staff, and peers with respect at all times, both on and off campus during school-related activities.</p>
          </div>
          <div>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">3. Uniform & Dress Code</h3>
            <p className="text-[#6b6456]">Proper school uniform must be worn on regular school days. Physical education uniforms are required on scheduled PE days.</p>
          </div>
          <div>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">4. Academic Integrity</h3>
            <p className="text-[#6b6456]">Cheating, plagiarism, and other forms of academic dishonesty are strictly prohibited and subject to disciplinary action.</p>
          </div>
          <div>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">5. Tuition & Fees</h3>
            <p className="text-[#6b6456]">Tuition and miscellaneous fees are due per the schedule provided by the Cashier's Office. Late payments may incur additional charges as outlined in the enrollment contract.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Notice of Access — shown once on a parent's first login. The checkbox stays disabled
// until the contract text has been scrolled to the bottom, so the acknowledgement is
// only enabled once the parent has actually seen the full document.
function NoticeOfAccessModal({ onAcknowledge }: { onAcknowledge: () => void }) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const reachedBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    if (reachedBottom) setHasScrolledToBottom(true);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200 flex items-center gap-3 shrink-0 ">
          <div className="w-10 h-10 bg-[#1a2b4a] rounded-lg flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#1a2b4a]">Notice of Access</h2>
            <p className="text-xs text-[#8b8476]">Please read the full contract below before continuing</p>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="px-6 py-5 overflow-y-auto space-y-4 text-sm text-[#2c2c2c] leading-relaxed"
        >
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>This is a placeholder contract. The administration is still finalizing the official Contract of the School — the content below stands in until that document is ready.</span>
          </div>

          <div>
            <p className="font-semibold text-[#1a2b4a]">Dumaguete Mission School — Parent Portal Access Contract</p>
            <p className="text-xs text-[#8b8476] mt-1">Contract Date: June 1, 2026 (dummy date — placeholder document)</p>
          </div>

          <p className="text-[#6b6456]">
            This Notice of Access confirms that you, as the parent or legal guardian, are being granted access to the Dumaguete Mission School Parent Portal.
            By using this portal, you agree to the terms set forth in your enrollment contract with the school, including but not limited to the sections below.
          </p>

          <div className='mt-4'>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">Enrollment Agreement Acknowledgement</h3>
            <p className="text-[#6b6456]">By signing below, the Parent/Guardian achknowledges that they have read, understood, and agreed to all the terms and conditions stated in the Dumaguete Mission School</p>
          </div>

          <div className='mt-4'>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">Enrollment Agreement</h3>
            <p className="text-[#6b6456]">The Parent/Guardian also affirms that they have the legal authority to enter into this agreement on behalf of the student. Furthermore, they understand that this enrollment is legally biinding and all obligations must be fulfilled as per the agreement</p>
          </div>

          <div>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">1. Data Privacy</h3>
            <p className="text-[#6b6456]">Information accessed through this portal — including grades, attendance, and billing records — is confidential and intended solely for the parent/guardian of the enrolled student. You agree not to share your login credentials with any third party.</p>
          </div>
          <div>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">2. Financial Obligations</h3>
            <p className="text-[#6b6456]">You acknowledge responsibility for tuition and fees as outlined in your child's enrollment contract, payable according to the schedule set by the Cashier's Office.</p>
          </div>
          <div>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">3. Communication</h3>
            <p className="text-[#6b6456]">The school may use this portal, along with email and phone, to communicate important announcements, grade updates, and billing notices. You are responsible for keeping your contact information up to date.</p>
          </div>
          <div>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">4. Student Pickup Authorization</h3>
            <p className="text-[#6b6456]">Only individuals authorized through this portal's Student Pickup feature, or otherwise designated in writing to the school, may pick up your child from campus.</p>
          </div>
          <div>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">5. Acceptable Use</h3>
            <p className="text-[#6b6456]">You agree to use the Parent Portal only for its intended purpose of monitoring your child's academic progress, attendance, billing, and school communications, and not to attempt unauthorized access to any other student's records.</p>
          </div>
          <div>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">6. Acknowledgement</h3>
            <p className="text-[#6b6456]">By checking the box below, you acknowledge that you have read and understood this Notice of Access and agree to the terms of your contract with Dumaguete Mission School.</p>
          </div>

          <p className="text-xs text-[#8b8476] italic pt-2 border-t border-gray-100">— End of document —</p>
        </div>

        <div className="px-6 py-5 border-t border-gray-200 space-y-4 shrink-0">
          <label className={`flex items-start gap-3 ${hasScrolledToBottom ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={!hasScrolledToBottom}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[#1a2b4a]"
            />
            <span className="text-sm text-[#2c2c2c]">
              I have read and understood the Notice of Access and the terms of my contract with the school.
              {!hasScrolledToBottom && <span className="block text-xs text-[#8b8476] mt-0.5">Scroll to the bottom of the document above to enable this checkbox.</span>}
            </span>
          </label>
          <button
            onClick={onAcknowledge}
            disabled={!acknowledged}
            className="w-full px-6 py-3 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue to Parent Portal
          </button>
        </div>
      </div>
    </div>
  );
}

// Parent Overview
function ParentOverview({ user, schoolYear, children, selectedChild, setSelectedChild, onOpenSchoolPolicy }: any) {
  const childInfo = children.find((c: any) => c.id === selectedChild) || children[0];

  // Live GPA for the selected child, computed from the real `grades` table.
  const [childGPA, setChildGPA] = useState<string>('—');

  useEffect(() => {
    if (!childInfo) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('grades')
        .select('final_grade')
        .eq('student_id', childInfo.id);
      if (cancelled) return;
      if (error) {
        console.error('Failed to load GPA', error);
        return;
      }
      const finals = (data ?? []).map((g) => g.final_grade).filter((f): f is number => f != null).map(Number);
      setChildGPA(finals.length ? (finals.reduce((sum, f) => sum + f, 0) / finals.length).toFixed(1) : '—');
    })();

    return () => { cancelled = true; };
  }, [childInfo?.id]);

  const childData = { gpa: childGPA };

  // Outstanding balance across all of this guardian's children, for the selected
  // school year: per child, sum(student_charges) [falling back to the grade's
  // tuition_fees annual fee when no itemized charges exist yet], summed across
  // children, minus sum(payments). Mirrors the balance calculation in
  // CashierPortal's fetchStudentBalances.
  const [outstandingBalance, setOutstandingBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadBalance() {
      const childIds = children.map((c: any) => c.id);
      if (childIds.length === 0) {
        setOutstandingBalance(0);
        return;
      }
      const { data: yearRow } = await supabase
        .from('school_years')
        .select('id')
        .eq('label', schoolYear)
        .maybeSingle();
      const schoolYearId = yearRow?.id;

      let chargesQuery = supabase.from('student_charges').select('student_id, amount').in('student_id', childIds);
      let paymentsQuery = supabase.from('payments').select('amount').in('student_id', childIds);
      if (schoolYearId) {
        chargesQuery = chargesQuery.eq('school_year_id', schoolYearId);
        paymentsQuery = paymentsQuery.eq('school_year_id', schoolYearId);
      }

      const [{ data: charges }, { data: payments }, { data: tuitionFees }] = await Promise.all([
        chargesQuery,
        paymentsQuery,
        schoolYearId
          ? supabase.from('tuition_fees').select('grade_level, annual_fee').eq('school_year_id', schoolYearId)
          : Promise.resolve({ data: null } as any),
      ]);
      if (cancelled) return;

      const chargesByChild = new Map<string, number>();
      (charges || []).forEach((c: any) => {
        chargesByChild.set(c.student_id, (chargesByChild.get(c.student_id) ?? 0) + Number(c.amount || 0));
      });

      const tuitionFeesMap = { ...DEFAULT_TUITION_FEES, ...Object.fromEntries((tuitionFees ?? []).map((f: any) => [f.grade_level, Number(f.annual_fee)])) };

      let totalDue = 0;
      children.forEach((child: any) => {
        const chargeTotal = chargesByChild.get(child.id);
        const baseFee = chargeTotal && chargeTotal > 0
          ? chargeTotal
          : getTuitionForGrade(tuitionFeesMap, child.gradeLevel);

        totalDue += baseFee;
      });

      const totalPaid = (payments || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      setOutstandingBalance(Math.max(0, totalDue - totalPaid));
    }
    loadBalance();
    return () => { cancelled = true; };
  }, [children, schoolYear]);

  

  // Per-child tuition line-item breakdown across ALL children (not just the selected
  // one), same computation as the Billing & Payments' "Tuition Details" grid —
  // real student_charges (falling back to the grade's tuition_fees annual fee).
  const [tuitionItemsByChild, setTuitionItemsByChild] = useState<Record<string, { label: string; amount: number; status: string }[]>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadTuitionItems() {
      const childIds = children.map((c: any) => c.id);
      if (childIds.length === 0) return;
      const { data: yearRow } = await supabase.from('school_years').select('id').eq('label', schoolYear).maybeSingle();
      const schoolYearId = yearRow?.id;

      const [{ data: charges }, { data: payments }, { data: tuitionFees }, { data: enrollmentFees }] = await Promise.all([
        supabase.from('student_charges').select('student_id, description, amount').in('student_id', childIds).eq('school_year_id', schoolYearId ?? ''),
        supabase.from('payments').select('student_id, amount, description').in('student_id', childIds).eq('school_year_id', schoolYearId ?? ''),
        schoolYearId
          ? supabase.from('tuition_fees').select('grade_level, annual_fee').eq('school_year_id', schoolYearId)
          : Promise.resolve({ data: null } as any),
        schoolYearId
          ? supabase.from('enrollment_fees').select('grade_level, fee').eq('school_year_id', schoolYearId)
          : Promise.resolve({ data: null } as any),
      ]);
      if (cancelled) return;

      // Payments are tagged by description ('Enrollment Fee' vs 'Tuition Payment' — see
      // CashierPortal's ProcessPayment), so each pays down its own line item rather than
      // being pooled together.
      const paidByChild = new Map<string, number>();
      const paidEnrollmentByChild = new Map<string, number>();
      (payments || []).forEach((p: any) => {
        const bucket = p.description === 'Enrollment Fee' ? paidEnrollmentByChild : paidByChild;
        bucket.set(p.student_id, (bucket.get(p.student_id) ?? 0) + Number(p.amount || 0));
      });

      const tuitionFeesMap = { ...DEFAULT_TUITION_FEES, ...Object.fromEntries((tuitionFees ?? []).map((f: any) => [f.grade_level, Number(f.annual_fee)])) };
      const enrollmentFeesMap = { ...DEFAULT_ENROLLMENT_FEES, ...Object.fromEntries((enrollmentFees ?? []).map((f: any) => [f.grade_level, Number(f.fee)])) };

      const result: Record<string, { label: string; amount: number; status: string }[]> = {};
      children.forEach((child: any) => {
        const childCharges = (charges || []).filter((c: any) => c.student_id === child.id);
        const paid = paidByChild.get(child.id) ?? 0;
        let remaining = paid;
        const tuitionItems = childCharges.length > 0
          ? childCharges.map((c: any) => {
              const amount = Number(c.amount || 0);
              const status = remaining >= amount ? 'Paid' : remaining > 0 ? 'Partial' : 'Unpaid';
              remaining = Math.max(0, remaining - amount);
              return { label: c.description, amount, status };
            })
          : (() => {
              const amount = getTuitionForGrade(tuitionFeesMap, child.gradeLevel);
              return amount > 0 ? [{ label: 'Base Tuition Fee', amount, status: paid >= amount ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid' }] : [];
            })();

        const enrollmentFeeAmount = getTuitionForGrade(enrollmentFeesMap, child.gradeLevel);
        const paidEnrollment = paidEnrollmentByChild.get(child.id) ?? 0;
        const enrollmentItems = enrollmentFeeAmount > 0
          ? [{ label: 'Enrollment Fee', amount: enrollmentFeeAmount, status: paidEnrollment >= enrollmentFeeAmount ? 'Paid' : paidEnrollment > 0 ? 'Partial' : 'Unpaid' }]
          : [];

        const items = [...enrollmentItems, ...tuitionItems];

        result[child.id] = items;
      });
      setTuitionItemsByChild(result);
    }
    loadTuitionItems();
    return () => { cancelled = true; };
  }, [children, schoolYear]);

  const getTuitionItems = (childId: string) => tuitionItemsByChild[childId] ?? [];

  // Total/Balance shown on the dashboard card use the same monthly-installment
  // breakdown as the Billing & Payments detail table, so the two never disagree.
  const tuitionBreakdownByChild = useTuitionBreakdown(children, schoolYear);
  const getTuitionTotal = (childId: string) => tuitionBreakdownByChild[childId]?.total ?? 0;
  const getTuitionBalance = (childId: string) => tuitionBreakdownByChild[childId]?.balance ?? 0;

  // Note: the "Recent Activity" panel that used to read from a hardcoded
  // recentActivity mock array is commented out further below (no live
  // per-event activity feed table exists yet to back it), so the mock
  // array itself has been removed rather than replaced.

  return (
    <div className="space-y-6">
      {/* Welcome Banner with Child Info */}
      <div className="bg-[#1a5c38] rounded-xl p-6 sm:p-8 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 break-words">Welcome, {user.firstName || user.name.split(' ')[0]}!</h1>
            <p className="text-white/90 mb-4">Monitor your child's academic journey</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 shrink-0" />
                <span className="truncate">{childInfo.name}</span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="w-4 h-4 shrink-0" />
                <span className="truncate">{childInfo.grade}</span>
              </div>
            </div>
          </div>
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-2xl sm:text-3xl font-bold shrink-0 self-center sm:self-auto">
            {childInfo.name.split(' ').map((n: string) => n[0]).join('')}
          </div>
        </div>
      </div>


      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* School Policy — links out to the placeholder policy document page */}
        <button
          onClick={onOpenSchoolPolicy}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-all text-left group flex flex-col items-center text-center gap-3"
        >
          <img src={schoolLogo} alt="School Logo" className="w-14 h-14 rounded-full object-cover border-2 border-[#c9a961]" />
          <h3 className="text-lg font-semibold text-[#1a2b4a]">School Policy</h3>
          <p className="text-xs text-[#8b8476] group-hover:text-[#c9a961] transition-colors">Click here to read more</p>
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Grades */}
        {/* <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a]">Recent Subject Grades</h3>
            <button className="text-sm text-[#c9a961] hover:text-[#b8994f] font-medium">
              View All Grades
            </button>
          </div>
          <div className="space-y-4">
            {childData.recentGrades.map((subject: any, index: number) => (
              <div key={index} className="flex items-center gap-4 p-4 bg-[#faf8f5] rounded-lg border border-gray-200">
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: subject.color }}
                ></div>
                <div className="flex-1">
                  <p className="font-semibold text-[#1a2b4a]">{subject.subject}</p>
                  <p className="text-xs text-[#8b8476]">Quarter 3</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-[#c9a961]">{subject.grade}</span>
                  {subject.trend === 'up' && <Award className="w-5 h-5 text-green-600" />}
                  {subject.trend === 'stable' && <Activity className="w-5 h-5 text-blue-600" />}
                  {subject.trend === 'down' && <Activity className="w-5 h-5 text-orange-600" />}
                </div>
              </div>
            ))}
          </div>
        </div> */}

        {/* Recent Activity */}
        {/* <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-[#1a2b4a] mb-6">Recent Activity</h3>
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 pb-4 border-b border-gray-100 last:border-0">
                <div className="w-8 h-8 bg-[#c9a961]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <div className="w-2 h-2 bg-[#c9a961] rounded-full"></div>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-[#2c2c2c] mb-1">{activity.message}</p>
                  <p className="text-xs text-[#8b8476]">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div> */}
      </div>

      {/* Tuition Details - per child */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-[#1a2b4a] mb-6">Tuition Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {children.map((child: any) => {
            const items = getTuitionItems(child.id);
            const total = getTuitionTotal(child.id);
            return (
              <div key={child.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-[#faf8f5] px-4 py-3 border-b border-gray-200 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1a2b4a] to-[#2d4263] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {child.name.split(' ').map((n: string) => n[0]).join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1a2b4a] truncate">{child.name}</p>
                    <p className="text-xs text-[#8b8476] truncate">{child.grade}</p>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {items.map((item: any, idx: number) => (
                    <div key={idx} className="px-4 py-2.5 flex items-center justify-between gap-2">
                      <p className="text-xs text-[#6b6456] truncate min-w-0">{item.label}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs font-semibold whitespace-nowrap ${item.amount < 0 ? 'text-green-600' : 'text-[#2c2c2c]'}`}>
                          {item.amount < 0 ? `-₱${Math.abs(item.amount).toLocaleString()}` : `₱${item.amount.toLocaleString()}`}
                        </span>
                      </div>
                    </div>
                    
                  ))}
                </div>
                <div className="px-4 py-3 bg-[#faf8f5] border-t border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#1a2b4a]">Total</span>
                  <span className="text-sm font-bold text-[#c9a961]">₱{total.toLocaleString()}</span>
                </div>
                <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#1a2b4a]">Balance</span>
                  <span className="text-sm font-bold text-[#7d1935]">₱{getTuitionBalance(child.id).toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Academic Progress Section
function AcademicProgress({ schoolYear, children, selectedChild, setSelectedChild }: any) {
  const childInfo = children.find((c: any) => c.id === selectedChild) || children[0];

  const [detailedGrades, setDetailedGrades] = useState<any[]>([]);
  const [loadingGrades, setLoadingGrades] = useState(true);

  useEffect(() => {
    if (!childInfo || !schoolYear) return;
    let cancelled = false;
    setLoadingGrades(true);

    (async () => {
      // Grades are tagged per school_years.id — resolve the selected year label
      // before querying so switching years shows that year's grades, not always
      // whatever happens to be in the table for this student.
      const sy = await getSchoolYearByLabel(schoolYear);
      if (cancelled) return;
      if (!sy) {
        setDetailedGrades([]);
        setLoadingGrades(false);
        return;
      }

      const { data, error } = await supabase
        .from('grades')
        .select(`
          q1, q2, q3, q4, final_grade,
          class_section_subjects (
            subjects ( name ),
            employees ( full_name )
          )
        `)
        .eq('student_id', childInfo.id)
        .eq('school_year_id', sy.id);

      if (cancelled) return;
      if (error) {
        console.error('Failed to load grades', error);
        setDetailedGrades([]);
        setLoadingGrades(false);
        return;
      }

      const mapped = (data ?? []).map((row: any) => ({
        subject: row.class_section_subjects?.subjects?.name ?? row.class_section_subjects?.[0]?.subjects?.[0]?.name ?? 'Subject',
        teacher: row.class_section_subjects?.employees?.full_name ?? row.class_section_subjects?.[0]?.employees?.[0]?.full_name ?? 'To Be Assigned',
        q1: row.q1 != null ? Number(row.q1) : null,
        q2: row.q2 != null ? Number(row.q2) : null,
        q3: row.q3 != null ? Number(row.q3) : null,
        q4: row.q4 != null ? Number(row.q4) : null,
        final: row.final_grade != null ? Number(row.final_grade) : null,
      })).sort((a: any, b: any) => a.subject.localeCompare(b.subject));

      setDetailedGrades(mapped);
      setLoadingGrades(false);
    })();

    return () => { cancelled = true; };
  }, [childInfo?.id, schoolYear]);

  const finals = detailedGrades.map((g) => g.final).filter((f): f is number => f != null);
  const currentGPA = finals.length ? (finals.reduce((sum, f) => sum + f, 0) / finals.length).toFixed(1) : '—';
  const gradeData = { currentGPA, detailedGrades };

  const handleDownloadReport = () => {
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('DUMAGUETE MISSION SCHOOL', 105, 18, { align: 'center' });

    doc.setFontSize(13);
    doc.text('ACADEMIC PROGRESS REPORT', 105, 27, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Student: ${childInfo.name}`, 14, 40);
    doc.text(`Student ID: ${childInfo.id}`, 14, 47);
    doc.text(`${schoolYear} - ${childInfo.grade}`, 14, 54);
    doc.text(`Current GPA: ${gradeData.currentGPA}`, 14, 61);

    autoTable(doc, {
      startY: 69,
      head: [['Subject', 'Teacher', 'Q1', 'Q2', 'Q3', 'Q4', 'Final']],
      body: gradeData.detailedGrades.map((g: any) => [
        g.subject,
        g.teacher,
        g.q1 ?? '—',
        g.q2 ?? '—',
        g.q3 ?? '—',
        g.q4 ?? '—',
        g.final ?? '—',
      ]),
    });

    doc.save(`${childInfo.name.replace(/\s+/g, '_')}_Academic_Report_${schoolYear}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1a2b4a] mb-2">Academic Progress</h1>
          <p className="text-[#6b6456]">Monitor your child's academic performance</p>
        </div>
        <button
          onClick={handleDownloadReport}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-[#1a5c38] text-white rounded-lg hover:shadow-lg transition-all w-full sm:w-auto"
        >
          <Download className="w-5 h-5" />
          <span className="font-medium">Download Report</span>
        </button>
      </div>

      {/* Child Selection Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <label className="block text-sm font-semibold text-[#1a2b4a] mb-3">
          Select Child
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {children.map((child: any) => (
            <button
              key={child.id}
              onClick={() => setSelectedChild(child.id)}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                selectedChild === child.id
                  ? 'border-[#c9a961] bg-[#c9a961]/5 shadow-md'
                  : 'border-gray-200 hover:border-[#c9a961]/50 hover:bg-[#faf8f5]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${
                  selectedChild === child.id
                    ? 'bg-gradient-to-br from-[#c9a961] to-[#d4af37]'
                    : 'bg-gradient-to-br from-[#1a2b4a] to-[#2d4263]'
                }`}>
                  {child.name.split(' ').map((n: string) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1a2b4a] truncate">{child.name}</p>
                  <p className="text-sm text-[#6b6456] truncate">{child.grade}</p>
                  <p className="text-xs text-[#8b8476] font-mono mt-0.5 truncate">{child.id}</p>
                </div>
                {selectedChild === child.id && (
                  <CheckCircle className="w-5 h-5 text-[#c9a961] flex-shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detailed Grades Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-[#1a2b4a]">Detailed Grade Report - Academic Year {schoolYear}</h3>
          <p className="text-sm text-[#6b6456] mt-1">Student: {childInfo.name} ({childInfo.grade})</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-[#faf8f5] border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a] whitespace-nowrap">Subject</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a] whitespace-nowrap">Teacher</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a] whitespace-nowrap">Q1</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a] whitespace-nowrap">Q2</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a] whitespace-nowrap">Q3</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a] whitespace-nowrap">Q4</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a] whitespace-nowrap">Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loadingGrades && (
                <tr><td className="px-6 py-6 text-center text-sm text-[#8b8476]" colSpan={7}>Loading grades…</td></tr>
              )}
              {!loadingGrades && gradeData.detailedGrades.length === 0 && (
                <tr><td className="px-6 py-6 text-center text-sm text-[#8b8476]" colSpan={7}>No grades on file yet for this school year.</td></tr>
              )}
              {gradeData.detailedGrades.map((grade: any, index: number) => (
                <tr key={index} className="hover:bg-[#faf8f5] transition-colors">
                  <td className="px-6 py-4 font-medium text-[#2c2c2c]">{grade.subject}</td>
                  <td className="px-6 py-4 text-sm text-[#6b6456]">{grade.teacher}</td>
                  <td className="px-6 py-4 text-center text-[#2c2c2c]">{grade.q1 ?? '—'}</td>
                  <td className="px-6 py-4 text-center text-[#2c2c2c]">{grade.q2 ?? '—'}</td>
                  <td className="px-6 py-4 text-center text-[#2c2c2c]">{grade.q3 ?? '—'}</td>
                  <td className="px-6 py-4 text-center text-[#2c2c2c]">{grade.q4 ?? '—'}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-[#c9a961]/10 text-[#c9a961]">
                      {grade.final ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
              {!loadingGrades && gradeData.detailedGrades.length > 0 && (
                <tr className="bg-[#faf8f5] font-semibold">
                  <td className="px-6 py-4 text-[#1a2b4a]" colSpan={6}>Final GPA</td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-[#1a2b4a]/10 text-[#1a2b4a]">
                      {gradeData.currentGPA}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Schedule Viewing
const WEEK_DAY_ABBR: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri'
};

// Converts a "HH:MM-HH:MM" 24-hour time_label into a 12-hour "h:mm AM - h:mm AM" range.
function formatTimeRange12(timeLabel: string): string {
  if (!timeLabel) return '';
  const to12 = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return t;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
  };
  const [start, end] = timeLabel.split('-');
  if (!end) return to12(start);
  return `${to12(start)} - ${to12(end)}`;
}

function ScheduleViewing({ children, selectedChild, setSelectedChild }: any) {
  const childInfo = children.find((c: any) => c.id === selectedChild) || children[0];
  const [scheduleRows, setScheduleRows] = useState<any[]>([]);
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!childInfo) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      let query = supabase
        .from('schedules')
        .select('id, subject, teacher, days, time_label, room, school_years!inner(is_current)')
        .eq('grade_level', childInfo.gradeLevel)
        .eq('school_years.is_current', true);

      if (childInfo.section) {
        query = query.eq('section_name', childInfo.section);
      }

      const { data, error } = await query;
      if (cancelled) return;
      if (error) console.error('Failed to load schedule', error);
      setScheduleRows(data ?? []);

      const map = await fetchAssignedTeacherMap(childInfo.gradeLevel, childInfo.section ?? null);
      if (cancelled) return;
      setTeacherMap(map);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [childInfo?.id, childInfo?.gradeLevel, childInfo?.section]);

  const schedule: Record<string, { time: string; subject: string; teacher: string; room: string }[]> = {};
  for (const day of Object.keys(WEEK_DAY_ABBR)) {
    const abbr = WEEK_DAY_ABBR[day];
    schedule[day] = scheduleRows
      .filter((row) => Array.isArray(row.days) && row.days.includes(abbr))
      .map((row) => ({ time: row.time_label, subject: row.subject, teacher: teacherMap[row.subject] || row.teacher, room: row.room }))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Student Schedule</h1>
        <p className="text-[#6b6456]">View your child's weekly class schedule</p>
      </div>

      {/* Child Selection Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <label className="block text-sm font-semibold text-[#1a2b4a] mb-3">
          Select Child
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {children.map((child: any) => (
            <button
              key={child.id}
              onClick={() => setSelectedChild(child.id)}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                selectedChild === child.id
                  ? 'border-[#c9a961] bg-[#c9a961]/5 shadow-md'
                  : 'border-gray-200 hover:border-[#c9a961]/50 hover:bg-[#faf8f5]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${
                  selectedChild === child.id
                    ? 'bg-gradient-to-br from-[#c9a961] to-[#d4af37]'
                    : 'bg-gradient-to-br from-[#1a2b4a] to-[#2d4263]'
                }`}>
                  {child.name.split(' ').map((n: string) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1a2b4a] truncate">{child.name}</p>
                  <p className="text-sm text-[#6b6456] truncate">{child.grade}</p>
                  <p className="text-xs text-[#8b8476] font-mono mt-0.5 truncate">{child.id}</p>
                </div>
                {selectedChild === child.id && (
                  <CheckCircle className="w-5 h-5 text-[#c9a961] flex-shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Schedule Display */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading && <p className="p-6 text-sm text-[#8b8476]">Loading schedule…</p>}
        <div className="overflow-x-auto">
        <div className="grid grid-flow-col auto-cols-[minmax(200px,1fr)] lg:grid-flow-row lg:grid-cols-5 lg:auto-cols-auto gap-px bg-gray-200">
          {!loading && Object.entries(schedule).map(([day, classes]) => (
            <div key={day} className="bg-white min-w-0">
              <div className="bg-[#1a5c38] p-4 text-center">
                <h3 className="font-semibold text-white">{day}</h3>
              </div>
              <div className="p-4 space-y-3">
                {classes.length === 0 && <p className="text-xs text-[#8b8476]">No classes.</p>}
                {classes.map((item: any, index: number) => (
                  <div key={index} className="p-3 bg-[#faf8f5] rounded-lg border border-gray-200">
                    <p className="text-xs font-semibold text-[#7d1935] mb-2 break-words">{formatTimeRange12(item.time)}</p>
                    <p className="text-sm font-medium text-[#1a2b4a] mb-1 break-words">{item.subject}</p>
                    <p className="text-xs text-[#8b8476] mb-1 break-words">{item.teacher}</p>
                    <p className="text-xs text-[#6b6456] break-words">{item.room}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}

// Student Pickup
function StudentPickup({ user, children }: any) {
  const [showTempForm, setShowTempForm] = useState(false);
  const [selectedChild, setSelectedChild] = useState('');
  const [tempGuardians, setTempGuardians] = useState<any[]>([]);
  const [guardianName, setGuardianName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');
  const [validHours, setValidHours] = useState('2');
  const [viewingQr, setViewingQr] = useState<any>(null);

  useEffect(() => {
    if (!selectedChild && children.length > 0) setSelectedChild(children[0].id);
  }, [children, selectedChild]);

  const childInfo = children.find((c: any) => c.id === selectedChild) || children[0];

  const loadTempGuardians = async () => {
    const childIds = children.map((c: any) => c.id);
    if (childIds.length === 0) return;
    const { data, error } = await supabase
      .from('pickup_authorizations')
      .select('id, student_id, guardian_name, relationship, phone, valid_until, status, created_at')
      .in('student_id', childIds)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load temporary guardians', error);
      return;
    }
    setTempGuardians(
      (data ?? []).map((row) => ({
        id: row.id,
        studentId: row.student_id,
        name: row.guardian_name,
        relationship: row.relationship,
        phone: row.phone,
        validUntil: new Date(row.valid_until),
        status: row.status,
        createdAt: new Date(row.created_at),
      }))
    );
  };

  useEffect(() => {
    loadTempGuardians();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.length]);

  const handleGenerateTempQR = async () => {
    if (!guardianName || !relationship || !phone || !selectedChild) return;

    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + parseInt(validHours));

    const { error } = await supabase.from('pickup_authorizations').insert({
      id: `AUTH-${Date.now()}`,
      student_id: selectedChild,
      authorized_by: user.id,
      guardian_name: guardianName,
      relationship,
      phone,
      qr_token: crypto.randomUUID(),
      valid_until: expiryDate.toISOString(),
      status: 'active',
    });
    if (error) {
      console.error('Failed to create temporary guardian authorization', error);
      return;
    }

    await loadTempGuardians();
    setGuardianName('');
    setRelationship('');
    setPhone('');
    setValidHours('2');
    setShowTempForm(false);
  };

  const handleRevoke = async (id: string) => {
    setTempGuardians(tempGuardians.map(g => g.id === id ? { ...g, status: 'revoked' } : g));
    const { error } = await supabase.from('pickup_authorizations').update({ status: 'revoked' }).eq('id', id);
    if (error) console.error('Failed to revoke authorization', error);
  };

  const handleDelete = async (id: string) => {
    setTempGuardians(tempGuardians.filter(g => g.id !== id));
    const { error } = await supabase.from('pickup_authorizations').delete().eq('id', id);
    if (error) console.error('Failed to delete authorization', error);
  };

  const isExpired = (validUntil: Date) => {
    return new Date() > new Date(validUntil);
  };

  const getTimeRemaining = (validUntil: Date) => {
    const now = new Date();
    const expiry = new Date(validUntil);
    const diff = expiry.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  // Filter temporary guardians for selected child
  const filteredTempGuardians = tempGuardians.filter(g => g.studentId === selectedChild);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Student Pickup QR Code</h1>
        <p className="text-[#6b6456]">Show this QR code to the security guard during pickup</p>
      </div>

      {/* Child Selection Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <label className="block text-sm font-semibold text-[#1a2b4a] mb-3">
          Select Child
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {children.map((child: any) => (
            <button
              key={child.id}
              onClick={() => setSelectedChild(child.id)}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                selectedChild === child.id
                  ? 'border-[#c9a961] bg-[#c9a961]/5 shadow-md'
                  : 'border-gray-200 hover:border-[#c9a961]/50 hover:bg-[#faf8f5]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${
                  selectedChild === child.id
                    ? 'bg-gradient-to-br from-[#c9a961] to-[#d4af37]'
                    : 'bg-gradient-to-br from-[#1a2b4a] to-[#2d4263]'
                }`}>
                  {child.name.split(' ').map((n: string) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1a2b4a] truncate">{child.name}</p>
                  <p className="text-sm text-[#6b6456] truncate">{child.grade}</p>
                  <p className="text-xs text-[#8b8476] font-mono mt-0.5 truncate">{child.id}</p>
                </div>
                {selectedChild === child.id && (
                  <CheckCircle className="w-5 h-5 text-[#c9a961] flex-shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Child Information */}
      <div className="bg-gradient-to-r from-[#c9a961] via-[#d4af37] to-[#b8994f] rounded-xl p-6 text-white">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-2xl font-bold shrink-0">
            {childInfo.name.split(' ').map((n: string) => n[0]).join('')}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold truncate">{childInfo.name}</h2>
            <p className="text-white/90 truncate">{childInfo.grade}</p>
            <p className="text-sm text-white/80 truncate">ID: {childInfo.id}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Permanent Parent QR Code */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-6 h-6" />
              <h3 className="text-xl font-bold">Permanent QR Code</h3>
            </div>
            <p className="text-sm text-white/80">Authorized Parent/Guardian</p>
          </div>

          <div className="p-8">
            {/* Real, scannable QR code — content is the guardian name, guardian
                relationship, and student name (plus IDs the Guard portal verifies
                against student_guardians before treating a scan as valid). */}
            <div className="bg-white border-4 border-[#1a2b4a] rounded-2xl p-6 mb-6 flex items-center justify-center">
              <QRCodeCanvas
                id="permanent-qr-canvas"
                value={JSON.stringify({
                  type: 'permanent',
                  guardianId: user.id,
                  guardianName: user.name,
                  relationship: childInfo.relationship || 'Guardian',
                  studentId: childInfo.id,
                  studentName: childInfo.name,
                } satisfies PickupQRPayload)}
                size={220}
                level="M"
                includeMargin
              />
            </div>

            {/* Parent Information */}
            <div className="space-y-3 bg-[#faf8f5] rounded-xl p-4 border border-gray-200">
              <div>
                <div className="text-xs text-[#6b6456] mb-1">Authorized Parent</div>
                <div className="font-semibold text-[#1a2b4a]">{user.name}</div>
              </div>
              <div>
                <div className="text-xs text-[#6b6456] mb-1">Relationship</div>
                <div className="font-semibold text-[#1a2b4a]">{childInfo.relationship || 'Guardian'}</div>
              </div>
              <div>
                <div className="text-xs text-[#6b6456] mb-1">Student</div>
                <div className="font-semibold text-[#1a2b4a]">{childInfo.name}</div>
              </div>
              <div>
                <div className="text-xs text-[#6b6456] mb-1">Status</div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                  <CheckCircle className="w-3 h-3" />
                  Always Valid
                </span>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  const canvas = document.getElementById('permanent-qr-canvas') as HTMLCanvasElement | null;
                  if (!canvas) return;
                  const link = document.createElement('a');
                  link.download = `${childInfo.name.replace(/\s+/g, '_')}_pickup_qr.png`;
                  link.href = canvas.toDataURL('image/png');
                  link.click();
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#1a2b4a] text-white rounded-lg hover:bg-[#2d4263] transition-all"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm font-medium">Download</span>
              </button>
            </div>
          </div>
        </div>

        {/* Temporary QR Code Generation */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-[#7d1935] to-[#9b2847] p-6 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-3 min-w-0">
                <Timer className="w-6 h-6 shrink-0" />
                <h3 className="text-xl font-bold truncate">Temporary Access</h3>
              </div>
              <button
                onClick={() => setShowTempForm(!showTempForm)}
                className="flex items-center gap-2 px-4 py-2 min-h-11 bg-white/20 backdrop-blur-lg rounded-lg hover:bg-white/30 transition-all shrink-0"
              >
                {showTempForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                <span className="text-sm font-medium">{showTempForm ? 'Cancel' : 'New'}</span>
              </button>
            </div>
            <p className="text-sm text-white/80">Generate for alternative guardians</p>
          </div>

          <div className="p-6">
            {showTempForm ? (
              <div className="space-y-4 mb-6 p-4 bg-[#faf8f5] rounded-xl border border-gray-200">
                <div>
                  <label className="block text-sm font-semibold text-[#1a2b4a] mb-2">
                    Guardian Name
                  </label>
                  <input
                    type="text"
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-[#c9a961] focus:ring-4 focus:ring-[#c9a961]/10 outline-none transition-all text-black"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#1a2b4a] mb-2">
                    Relationship to Student
                  </label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-[#c9a961] focus:ring-4 focus:ring-[#c9a961]/10 outline-none transition-all text-black"
                  >
                    <option value="">Select relationship</option>
                    <option value="Aunt">Aunt</option>
                    <option value="Uncle">Uncle</option>
                    <option value="Grandmother">Grandmother</option>
                    <option value="Grandfather">Grandfather</option>
                    <option value="Family Friend">Family Friend</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#1a2b4a] mb-2">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0917-XXX-XXXX"
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-[#c9a961] focus:ring-4 focus:ring-[#c9a961]/10 outline-none transition-all text-black"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#1a2b4a] mb-2">
                    Valid For (Hours)
                  </label>
                  <select
                    value={validHours}
                    onChange={(e) => setValidHours(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-[#c9a961] focus:ring-4 focus:ring-[#c9a961]/10 outline-none transition-all text-black"
                  >
                    <option value="1">1 hour</option>
                    <option value="2">2 hours</option>
                    <option value="3">3 hours</option>
                    <option value="4">4 hours</option>
                    <option value="6">6 hours</option>
                    <option value="12">12 hours</option>
                    <option value="24">24 hours</option>
                  </select>
                </div>

                <button
                  onClick={handleGenerateTempQR}
                  disabled={!guardianName || !relationship || !phone}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <QrCode className="w-5 h-5" />
                  <span className="font-semibold">Generate Temporary QR</span>
                </button>
              </div>
            ) : (
              <div className="bg-[#faf8f5] rounded-xl p-6 border border-gray-200 text-center mb-6">
                <UserPlus className="w-12 h-12 text-[#7d1935] mx-auto mb-3" />
                <h4 className="font-semibold text-[#1a2b4a] mb-2">No Temporary Access</h4>
                <p className="text-sm text-[#6b6456] mb-4">
                  Generate a temporary QR code when you can't pick up your child
                </p>
                <button
                  onClick={() => setShowTempForm(true)}
                  className="inline-flex items-center gap-2 px-6 py-2 bg-[#7d1935] text-white rounded-lg hover:bg-[#9b2847] transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm font-medium">Generate New</span>
                </button>
              </div>
            )}

            {/* Active Temporary QR Codes */}
            {filteredTempGuardians.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-[#1a2b4a]">Active Temporary Access</h4>
                {filteredTempGuardians.map((guardian) => {
                  const expired = isExpired(guardian.validUntil);
                  const revoked = guardian.status === 'revoked';
                  
                  return (
                    <div 
                      key={guardian.id}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        revoked 
                          ? 'bg-gray-50 border-gray-200 opacity-60' 
                          : expired 
                            ? 'bg-red-50 border-red-200' 
                            : 'bg-green-50 border-green-200'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h5 className="font-semibold text-[#1a2b4a]">{guardian.name}</h5>
                            {revoked ? (
                              <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-medium rounded">
                                Revoked
                              </span>
                            ) : expired ? (
                              <span className="px-2 py-0.5 bg-red-200 text-red-700 text-xs font-medium rounded">
                                Expired
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-green-200 text-green-700 text-xs font-medium rounded">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#6b6456]">{guardian.relationship} • {guardian.phone}</p>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[#6b6456]">Valid Until:</span>
                          <span className="font-medium text-[#1a2b4a]">
                            {new Date(guardian.validUntil).toLocaleString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                        </div>
                        {!expired && !revoked && (
                          <div className="flex items-center justify-between">
                            <span className="text-[#6b6456]">Time Remaining:</span>
                            <span className="font-semibold text-green-600">
                              {getTimeRemaining(guardian.validUntil)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-[#6b6456]">QR Code ID:</span>
                          <span className="font-mono text-[#1a2b4a]">{guardian.id}</span>
                        </div>
                      </div>

                      {!expired && !revoked ? (
                        <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap gap-2">
                          <button
                            onClick={() => setViewingQr(guardian)}
                            className="flex-1 min-w-22.5 flex items-center justify-center gap-1 px-3 py-2 min-h-10 bg-white border border-gray-200 rounded-lg hover:border-[#c9a961] hover:bg-[#faf8f5] transition-all text-xs font-medium"
                          >
                            <QrCode className="w-3 h-3" />
                            View QR
                          </button>
                          <button
                            onClick={() => handleRevoke(guardian.id)}
                            className="flex-1 min-w-22.5 flex items-center justify-center gap-1 px-3 py-2 min-h-10 bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-all text-xs font-medium"
                          >
                            <X className="w-3 h-3" />
                            Revoke
                          </button>
                          <button
                            onClick={() => handleDelete(guardian.id)}
                            className="flex-1 min-w-22.5 flex items-center justify-center gap-1 px-3 py-2 min-h-10 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all text-xs font-medium"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={() => handleDelete(guardian.id)}
                            className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all text-xs font-medium"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-[#1a2b4a] mb-3">Important Pickup Instructions</h4>
            <ul className="space-y-2 text-sm text-[#6b6456]">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1.5 flex-shrink-0"></span>
                <span><strong>Permanent QR Code:</strong> Always available for authorized parents/guardians</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1.5 flex-shrink-0"></span>
                <span><strong>Temporary QR Code:</strong> Generate when someone else needs to pick up your child (aunt, uncle, family friend, etc.)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1.5 flex-shrink-0"></span>
                <span><strong>Security:</strong> Show the QR code to the security guard at the gate. They will scan and verify the information before releasing your child.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1.5 flex-shrink-0"></span>
                <span><strong>Expiration:</strong> Temporary QR codes automatically expire after the set duration. You can also manually revoke them anytime.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1.5 flex-shrink-0"></span>
                <span><strong>Valid ID Required:</strong> The person picking up must present a valid government ID matching the name on the QR code.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Temporary QR view/download modal */}
      {viewingQr && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewingQr(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-[#1a2b4a] truncate">Temporary Pickup QR</h3>
              <button onClick={() => setViewingQr(null)} className="p-2 min-w-11 min-h-11 flex items-center justify-center hover:bg-gray-100 rounded-lg shrink-0">
                <X className="w-5 h-5 text-[#6b6456]" />
              </button>
            </div>
            <div className="flex items-center justify-center bg-white border-4 border-[#7d1935] rounded-2xl p-6">
              <QRCodeCanvas
                id="temp-qr-canvas"
                value={JSON.stringify({
                  type: 'temporary',
                  authId: viewingQr.id,
                  guardianName: viewingQr.name,
                  relationship: viewingQr.relationship,
                  studentId: viewingQr.studentId,
                  studentName: (children.find((c: any) => c.id === viewingQr.studentId) || {}).name || '',
                } satisfies PickupQRPayload)}
                size={200}
                level="M"
                includeMargin
              />
            </div>
            <div className="text-sm text-[#6b6456] text-center">{viewingQr.name} • {viewingQr.relationship}</div>
            <button
              onClick={() => {
                const canvas = document.getElementById('temp-qr-canvas') as HTMLCanvasElement | null;
                if (!canvas) return;
                const link = document.createElement('a');
                link.download = `${viewingQr.name.replace(/\s+/g, '_')}_temp_pickup_qr.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1a2b4a] text-white rounded-lg hover:bg-[#2d4263] transition-all"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm font-medium">Download</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Billing & Payments
function BillingPayments({ schoolYear, children, selectedChild, setSelectedChild }: any) {
  const childInfo = children.find((c: any) => c.id === selectedChild) || children[0];

  // Per-child tuition breakdown, split into one installment per month of the school
  // year, plus the Enrollment Fee as its own line. Shared with the dashboard's
  // Tuition Details summary so both show the same total/balance.
  const breakdownByChild = useTuitionBreakdown(children, schoolYear);
  const getBreakdown = (childId: string) => breakdownByChild[childId] ?? { items: [], total: 0, balance: 0 };

  const [billingInfo, setBillingInfo] = useState({ total: 0, paid: 0, balance: 0 });
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loadingBilling, setLoadingBilling] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadBilling() {
      if (!childInfo?.id) {
        setLoadingBilling(false);
        return;
      }
      setLoadingBilling(true);

      const { data: yearRow } = await supabase
        .from('school_years')
        .select('id')
        .eq('label', schoolYear)
        .maybeSingle();
      const schoolYearId = yearRow?.id;

      let chargesQuery = supabase.from('student_charges').select('description, amount').eq('student_id', childInfo.id);
      let paymentsQuery = supabase
        .from('payments')
        .select('id, amount, method, receipt_number, paid_at, description')
        .eq('student_id', childInfo.id)
        .order('paid_at', { ascending: false });
      if (schoolYearId) {
        chargesQuery = chargesQuery.eq('school_year_id', schoolYearId);
        paymentsQuery = paymentsQuery.eq('school_year_id', schoolYearId);
      }

      const [{ data: charges }, { data: payments }, { data: tuitionFee }] = await Promise.all([
        chargesQuery,
        paymentsQuery,
        schoolYearId && childInfo.gradeLevel
          ? supabase.from('tuition_fees').select('annual_fee').eq('school_year_id', schoolYearId).eq('grade_level', childInfo.gradeLevel).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      if (cancelled) return;

      let baseFee = (charges || []).reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);
      if (baseFee === 0 && tuitionFee?.annual_fee) {
        baseFee = Number(tuitionFee.annual_fee);
      }
      const total = baseFee;
      const paid = (payments || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      const balance = Math.max(0, total - paid);
      setBillingInfo({ total, paid, balance });

      setPaymentHistory(
        (payments || []).map((p: any) => ({
          date: p.paid_at
            ? new Date(p.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '—',
          description: p.description || `Payment (${p.method || 'N/A'})`,
          receiptNumber: p.receipt_number || '—',
          amount: Number(p.amount || 0),
          status: 'Paid',
        }))
      );
      setLoadingBilling(false);
    }
    loadBilling();
    return () => { cancelled = true; };
  }, [childInfo?.id, childInfo?.gradeLevel, schoolYear]);

  const handleDownloadReceipts = () => {
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('DUMAGUETE MISSION SCHOOL', 105, 18, { align: 'center' });

    doc.setFontSize(13);
    doc.text('PAYMENT HISTORY / RECEIPTS', 105, 27, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Student: ${childInfo.name}`, 14, 40);
    doc.text(`School Year: ${schoolYear}`, 14, 47);

    autoTable(doc, {
      startY: 55,
      head: [['Date', 'Description', 'Receipt #', 'Amount', 'Status']],
      body: paymentHistory.map((p) => [
        p.date,
        p.description,
        p.receiptNumber,
        `PHP ${p.amount.toLocaleString()}`,
        p.status,
      ]),
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Fees: PHP ${billingInfo.total.toLocaleString()}`, 14, finalY);
    doc.text(`Paid: PHP ${billingInfo.paid.toLocaleString()}`, 14, finalY + 7);
    doc.text(`Balance: PHP ${billingInfo.balance.toLocaleString()}`, 14, finalY + 14);

    doc.save(`Payment_Receipts_${childInfo.name.replace(/\s+/g, '_')}_${schoolYear}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Billing & Payments</h1>
        <p className="text-[#6b6456]">View tuition fees and payment history</p>
      </div>

      {/* Child Selection Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <label className="block text-sm font-semibold text-[#1a2b4a] mb-3">
          Select Child
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {children.map((child: any) => (
            <button
              key={child.id}
              onClick={() => setSelectedChild(child.id)}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                selectedChild === child.id
                  ? 'border-[#c9a961] bg-[#c9a961]/5 shadow-md'
                  : 'border-gray-200 hover:border-[#c9a961]/50 hover:bg-[#faf8f5]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${
                  selectedChild === child.id
                    ? 'bg-gradient-to-br from-[#c9a961] to-[#d4af37]'
                    : 'bg-gradient-to-br from-[#1a2b4a] to-[#2d4263]'
                }`}>
                  {child.name.split(' ').map((n: string) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1a2b4a] truncate">{child.name}</p>
                  <p className="text-sm text-[#6b6456] truncate">{child.grade}</p>
                  <p className="text-xs text-[#8b8476] font-mono mt-0.5 truncate">{child.id}</p>
                </div>
                {selectedChild === child.id && (
                  <CheckCircle className="w-5 h-5 text-[#c9a961] flex-shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Tuition Payment Breakdown - per child, max two per row */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-[#1a2b4a] mb-6">Tuition Payment Breakdown</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {children.map((child: any) => {
            const { items, total, balance } = getBreakdown(child.id);
            return (
              <div key={child.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-[#faf8f5] px-4 py-3 border-b border-gray-200 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1a2b4a] to-[#2d4263] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {child.name.split(' ').map((n: string) => n[0]).join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1a2b4a] truncate">{child.name}</p>
                    <p className="text-xs text-[#8b8476] truncate">{child.grade}</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[#8b8476] border-b border-gray-200">
                        <th className="px-4 py-2 font-semibold">Details</th>
                        <th className="px-4 py-2 font-semibold text-right">Amount</th>
                        <th className="px-4 py-2 font-semibold text-right">Due</th>
                        <th className="px-4 py-2 font-semibold text-right">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-[#2c2c2c] whitespace-nowrap">{item.label}</td>
                          <td className={`px-4 py-2 text-right font-medium whitespace-nowrap ${item.amount < 0 ? 'text-green-600' : 'text-[#2c2c2c]'}`}>
                            {item.amount < 0 ? `-₱${Math.abs(item.amount).toLocaleString()}` : `₱${item.amount.toLocaleString()}`}
                          </td>
                          <td className="px-4 py-2 text-right text-[#6b6456] whitespace-nowrap">
                            {item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {item.remark && (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                item.remark === 'PAID' ? 'bg-green-100 text-green-700'
                                : item.remark === 'PARTIAL' ? 'bg-amber-100 text-amber-700'
                                : item.remark === 'APPLIED' ? 'bg-blue-100 text-blue-700'
                                : item.remark === 'OVERDUE' ? 'bg-red-200 text-red-800'
                                : 'bg-red-100 text-red-700'
                              }`}>
                                {item.remark}
                              </span>
                            )}
                            {item.datePaid && (
                              <div className="text-[10px] text-[#8b8476] mt-0.5 whitespace-nowrap">
                                Date Paid: {new Date(item.datePaid).toLocaleDateString()}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200">
                        <td className="px-4 py-2 font-semibold text-[#1a2b4a]">Total</td>
                        <td className="px-4 py-2 text-right font-bold text-[#c9a961]" colSpan={3}>₱{total.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 pb-3 font-semibold text-[#1a2b4a]">Balance</td>
                        <td className="px-4 py-2 pb-3 text-right font-bold text-[#7d1935]" colSpan={3}>₱{balance.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loadingBilling ? (
        <div className="p-12 text-center text-[#6b6456]">Loading billing information…</div>
      ) : (
        <>
          {/* Payment History */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-lg font-semibold text-[#1a2b4a]">Payment History</h3>
              <button
                onClick={handleDownloadReceipts}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:border-[#c9a961] hover:shadow-lg bg-[#1a5c38] text-[#ffffff] transition-all w-full sm:w-auto"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm font-medium">Download Receipts</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#faf8f5] border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Date</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Description</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Receipt No.</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Amount</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paymentHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-sm text-[#8b8476]">
                        No payments recorded yet for this school year.
                      </td>
                    </tr>
                  ) : (
                    paymentHistory.map((payment, index) => (
                      <tr key={index} className="hover:bg-[#faf8f5] transition-colors">
                        <td className="px-6 py-4 text-sm text-[#2c2c2c]">{payment.date}</td>
                        <td className="px-6 py-4 text-sm text-[#2c2c2c]">{payment.description}</td>
                        <td className="px-6 py-4 text-sm text-[#2c2c2c] font-mono">{payment.receiptNumber}</td>
                        <td className="px-6 py-4 text-sm text-right font-semibold text-[#2c2c2c]">
                          ₱{payment.amount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            {payment.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// My Profile
function MyProfile({ user, children }: any) {
  const initials = (user?.name || 'P')
    .split(' ')
    .map((n: string) => n[0])
    .join('');

  // Occupation is recorded per-child at enrollment (mother_info/father_info/guardian_info),
  // not on the guardian account itself — pull it from whichever linked child has it on file.
  const occupation = (children || []).find((c: any) => c.guardianOccupation)?.guardianOccupation || 'Not provided';

  const profileFields = [
    { label: 'Full Name', value: user?.name || user?.firstName || 'Not provided', icon: User },
    { label: 'Occupation', value: occupation, icon: Briefcase },
    { label: 'Email Address', value: user?.email || 'Not provided', icon: Mail },
    { label: 'Phone Number', value: user?.phone || 'Not provided', icon: Phone }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">My Profile</h1>
        <p className="text-[#6b6456]">View your account details and linked students</p>
      </div>

      {/* Account Details */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-[#1a2b4a] mb-6">Account Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profileFields.map((field, index) => {
            const Icon = field.icon;
            return (
              <div key={index} className="flex items-start gap-3 p-4 bg-[#faf8f5] rounded-lg border border-gray-200">
                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center flex-shrink-0 border border-gray-200">
                  <Icon className="w-4 h-4 text-[#1a2b4a]" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-[#8b8476] mb-0.5">{field.label}</p>
                  <p className="text-sm font-semibold text-[#2c2c2c] truncate">{field.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Linked Students */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-[#1a2b4a] mb-6">Linked Students</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {children.map((child: any) => (
            <div key={child.id} className="p-4 rounded-xl border-2 border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1a2b4a] to-[#2d4263] flex items-center justify-center text-white font-bold flex-shrink-0">
                  {child.name.split(' ').map((n: string) => n[0]).join('')}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[#1a2b4a] truncate">{child.name}</p>
                  <p className="text-sm text-[#6b6456] truncate">{child.grade}</p>
                  <p className="text-xs text-[#8b8476] font-mono mt-0.5">{child.id}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Messaging Center
function MessagingCenter({ user }: any) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadMessages() {
      if (!user?.id) {
        setLoadingMessages(false);
        return;
      }
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from('messages')
        .select('id, subject, body, sent_at, read_at, employees(full_name)')
        .eq('recipient_guardian_id', user.id)
        .order('sent_at', { ascending: false });
      if (cancelled) return;
      if (!error && data) {
        setMessages(
          data.map((m: any) => ({
            id: m.id,
            from: m.employees?.full_name || 'School Administration',
            subject: m.subject || '(No subject)',
            preview: m.body || '',
            date: m.sent_at
              ? new Date(m.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : '',
            read: !!m.read_at,
          }))
        );
      }
      setLoadingMessages(false);
    }
    loadMessages();
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1a2b4a] mb-2">Messages</h1>
          <p className="text-[#6b6456]">Communication with teachers and school administration</p>
        </div>
        <button className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white rounded-lg hover:shadow-lg transition-all w-full sm:w-auto">
          <Mail className="w-5 h-5" />
          <span className="font-medium">New Message</span>
        </button>
      </div>

      {loadingMessages ? (
        <div className="p-12 text-center text-[#6b6456]">Loading messages…</div>
      ) : messages.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-[#6b6456]">
          No messages yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-200">
          {messages.map((message) => (
            <div key={message.id} className={`p-6 hover:bg-[#faf8f5] transition-colors cursor-pointer ${
              !message.read ? 'bg-[#c9a961]/5' : ''
            }`}>
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-[#1a2b4a] to-[#7d1935] rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                  {message.from.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[#1a2b4a] truncate">{message.from}</h3>
                      <p className="text-sm text-[#2c2c2c] font-medium break-words">{message.subject}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm text-[#6b6456] whitespace-nowrap">{message.date}</span>
                      {!message.read && (
                        <div className="w-2 h-2 bg-[#c9a961] rounded-full"></div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-[#6b6456] break-words">{message.preview}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}