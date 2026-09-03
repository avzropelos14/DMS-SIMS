import { useState, useEffect } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { StaffProfileView } from './StaffProfileView';
import { supabase } from '../supabase';
import { getCurrentSchoolYear, getSchoolYearByLabel } from '../lib/schoolYear';
import {
  LayoutDashboard, PhilippinePeso, Users, Search, Filter,
  Receipt, Calendar, User, XCircle, Plus,
  Printer,
  CheckCircle, AlertCircle, Clock, CreditCard, Eye, Download
} from 'lucide-react';
import { DEFAULT_TUITION_FEES, DEFAULT_ENROLLMENT_FEES, getTuitionForGrade } from '../lib/tuition';
import { getSchoolSettings, DEFAULT_SCHOOL_SETTINGS, type SchoolSettings } from '../lib/schoolSettings';
import schoolLogo from './assets/dmgteLogo.jpg';

// A peso-sign icon matching the sizing/API of lucide-react icons (className is forwarded),
// used in place of DollarSign wherever this portal deals in Philippine pesos.
function PesoSignIcon({ className }: { className?: string }) {
  return <span className={`${className ?? ''} inline-flex items-center justify-center font-bold leading-none`}>₱</span>;
}

// Shared payment receipt modal — used by both Student Accounts ("View Receipt" on a
// payment history entry) and Payment History (the Printer action). Shows the live
// School Information (logo/name/address/contact) instead of hardcoded text, and its
// container carries .print-receipt so the Print button's window.print() call actually
// prints only the receipt (see the @media print rule in src/index.css).
function ReceiptModal({
  studentName,
  studentId,
  grade,
  reference,
  amount,
  method,
  dateLabel,
  balanceBefore,
  schoolYear,
  onClose,
}: {
  studentName: string;
  studentId: string;
  grade?: string;
  reference: string;
  amount: number;
  method: string;
  dateLabel: string;
  balanceBefore?: number;
  schoolYear: string;
  onClose: () => void;
}) {
  const [schoolInfo, setSchoolInfo] = useState<SchoolSettings>(DEFAULT_SCHOOL_SETTINGS);
  useEffect(() => {
    let cancelled = false;
    getSchoolSettings().then((s) => { if (!cancelled) setSchoolInfo(s); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-none print-receipt">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <h2 className="text-xl font-bold text-[#1a2b4a]">Payment Receipt</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-all">
            <XCircle className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="space-y-4 print:hidden">
          <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
            <img src={schoolLogo} alt="School Logo" className="w-14 h-14 object-contain shrink-0" />
            <div>
              <p className="font-bold text-[#1a2b4a] text-lg">{schoolInfo.school_name}</p>
              {schoolInfo.school_motto && <p className="text-xs text-[#8b8476]">{schoolInfo.school_motto}</p>}
              {schoolInfo.school_address && <p className="text-xs text-[#8b8476]">{schoolInfo.school_address}</p>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-[#1a2b4a] to-[#2d4263] rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-semibold text-[#1a2b4a]">{studentName}</p>
              <p className="text-sm text-[#8b8476] font-mono">{studentId}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-[#6b6456] mb-1">Receipt No.</p>
              <p className="font-mono font-bold text-[#1a2b4a]">{reference}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-[#6b6456] mb-1">Date & Time</p>
              <p className="font-semibold text-[#1a2b4a]">{dateLabel}</p>
            </div>
          </div>
          {grade && (
            <div className="p-4 bg-[#faf8f5] rounded-xl">
              <p className="text-sm text-[#6b6456] mb-2">Student Information</p>
              <p className="font-bold text-[#1a2b4a] text-lg">{studentName}</p>
              <p className="text-sm text-[#8b8476]">{grade}</p>
              <p className="text-xs text-[#8b8476] font-mono mt-1">ID: {studentId}</p>
            </div>
          )}
          <div className="p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-xl border-2 border-green-200">
            <p className="text-sm text-green-800 mb-2">Payment Details</p>
            <div className="flex justify-between items-center">
              <span className="text-green-900 font-semibold">Amount Paid:</span>
              <span className="text-3xl font-bold text-green-700">₱{amount.toLocaleString()}</span>
            </div>
            <div className="mt-3 pt-3 border-t border-green-300 flex justify-between text-sm">
              <span className="text-green-800">Payment Method:</span>
              <span className="font-semibold text-green-900 capitalize">{method.replace('_', ' ')}</span>
            </div>
          </div>
          {balanceBefore !== undefined && (
            <div className="p-4 bg-[#faf8f5] rounded-xl">
              <div className="flex justify-between mb-2">
                <span className="text-[#6b6456]">Previous Balance:</span>
                <span className="font-semibold text-[#1a2b4a]">₱{balanceBefore.toLocaleString()}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-[#6b6456]">Amount Paid:</span>
                <span className="font-semibold text-green-600">-₱{amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-300">
                <span className="font-semibold text-[#1a2b4a]">New Balance:</span>
                <span className="font-bold text-[#1a2b4a] text-lg">₱{(balanceBefore - amount).toLocaleString()}</span>
              </div>
            </div>
          )}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center text-sm text-blue-800">
            <p className="font-semibold mb-1">{schoolInfo.school_name}</p>
            {schoolInfo.school_motto && <p>{schoolInfo.school_motto}</p>}
            <p className="text-xs mt-2">Academic Year {schoolYear}</p>
          </div>
          <button
            onClick={() => window.print()}
            className="w-full px-6 py-3 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Print
          </button>
        </div>

        {/* Print-only layout — a formal official-receipt document. Hidden on
            screen; shown only inside the @media print rule via print:block. */}
        <div className="hidden print:block text-black font-sans">
          <div className="flex items-start gap-4 border-b-2 border-black pb-4 mb-4">
            <img src={schoolLogo} alt="School Logo" className="w-16 h-16 object-contain shrink-0" />
            <div className="flex-1">
              <p className="text-xl font-bold">{schoolInfo.school_name}</p>
              {schoolInfo.school_motto && <p className="text-xs italic">{schoolInfo.school_motto}</p>}
              {schoolInfo.school_address && <p className="text-xs">{schoolInfo.school_address}</p>}
              {(schoolInfo.contact_phone || schoolInfo.contact_email) && (
                <p className="text-xs">{[schoolInfo.contact_phone, schoolInfo.contact_email].filter(Boolean).join(' • ')}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold uppercase tracking-wide">Official Receipt</p>
              <p className="text-sm font-mono">No. {reference}</p>
              <p className="text-sm">{dateLabel}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            <div>
              <p className="text-xs uppercase text-gray-500">Received From</p>
              <p className="font-semibold">{studentName}</p>
              <p className="font-mono text-xs">{studentId}</p>
              {grade && <p className="text-xs">{grade}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase text-gray-500">School Year</p>
              <p className="font-semibold">{schoolYear}</p>
            </div>
          </div>
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-t-2 border-b border-black">
                <th className="text-left py-2 font-semibold">Description</th>
                <th className="text-right py-2 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 capitalize">Tuition Payment — {method.replace('_', ' ')}</td>
                <td className="py-2 text-right">₱{amount.toLocaleString()}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black font-bold">
                <td className="py-2">Total Paid</td>
                <td className="py-2 text-right">₱{amount.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
          {balanceBefore !== undefined && (
            <div className="text-sm mb-10 max-w-xs ml-auto space-y-1">
              <div className="flex justify-between"><span>Previous Balance</span><span>₱{balanceBefore.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Amount Paid</span><span>-₱{amount.toLocaleString()}</span></div>
              <div className="flex justify-between font-bold border-t border-black pt-1"><span>Remaining Balance</span><span>₱{(balanceBefore - amount).toLocaleString()}</span></div>
            </div>
          )}
          <div className="flex justify-between items-end mt-16 text-sm">
            <div className="text-center">
              <div className="border-t border-black w-44 pt-1">Authorized Signature</div>
            </div>
            <p className="text-xs text-gray-500 italic">THIS RECEIPT IS NOT VALID FOR CLAIM OF INPUT TAX.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Resolves the school_years.id for whatever label is currently selected in the
// navbar year-switcher, instead of always the current year — so switching years
// actually changes which year's payments/balances the Cashier portal shows.
async function fetchSchoolYearId(label: string): Promise<string | null> {
  const sy = await getSchoolYearByLabel(label);
  return sy?.id ?? null;
}

async function generateReceiptNumber(): Promise<string> {
  const { data, error } = await supabase.rpc('next_receipt_number');
  if (error) throw error;
  return data as string;
}

// Shared per-student balance calculation used by Process Payment and Student
// Accounts: totals up real student_charges (falling back to the admin-configured
// tuitionFees for the student's grade when no charges have been recorded yet),
// against real payments to derive balance, status, and overdue penalties.
export type StudentBalance = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  gradeLevel: string;
  section: string | null;
  baseFee: number;
  totalFee: number;
  paid: number;
  balance: number;
  status: 'paid' | 'partial' | 'overdue';
  lastPaymentDate: string | null;
  monthsOverdue: number;
  penalties: number;
};

// "{last_name} {suffix}, {first_name} {middle_name}" — the display format used throughout
// the Cashier portal's Process Payment and Student Accounts sections.
function formatStudentName(b: { firstName: string; middleName?: string | null; lastName: string; suffix?: string | null }): string {
  return `${b.lastName}${b.suffix ? ` ${b.suffix}` : ''}, ${[b.firstName, b.middleName].filter(Boolean).join(' ')}`;
}

export async function fetchStudentBalances(schoolYearId: string, tuitionFees: Record<string, number>): Promise<StudentBalance[]> {
  // Roster comes from `enrollments` (one row per student per year) rather than filtering
  // `students.school_year_id` directly — that column only points at whichever year each
  // student's row was most recently re-enrolled into, so a direct filter would leave any
  // other year's roster looking empty. See the matching note on StudentManagement's
  // loadStudents in AdminDashboard.tsx.
  const [{ data: enrollmentRows }, { data: charges }, { data: payments }] = await Promise.all([
    supabase.from('enrollments')
      .select('student_id, grade_level, section, students!inner(id, first_name, middle_name, last_name, suffix, status)')
      .eq('school_year_id', schoolYearId).eq('students.status', 'Active'),
    supabase.from('student_charges').select('student_id, amount, due_date').eq('school_year_id', schoolYearId),
    supabase.from('payments').select('student_id, amount, paid_at').eq('school_year_id', schoolYearId),
  ]);

  const students = (enrollmentRows ?? [])
    .map((row: any) => ({
      id: row.students.id,
      first_name: row.students.first_name,
      middle_name: row.students.middle_name,
      last_name: row.students.last_name,
      suffix: row.students.suffix,
      grade_level: row.grade_level,
      section: row.section,
    }))
    .sort((a: any, b: any) => a.last_name.localeCompare(b.last_name));

  const chargeMap = new Map<string, { total: number; earliestDue: string | null }>();
  (charges || []).forEach((c: any) => {
    const cur = chargeMap.get(c.student_id) || { total: 0, earliestDue: null as string | null };
    cur.total += Number(c.amount);
    if (c.due_date && (!cur.earliestDue || c.due_date < cur.earliestDue)) cur.earliestDue = c.due_date;
    chargeMap.set(c.student_id, cur);
  });

  const paidMap = new Map<string, { total: number; lastDate: string | null }>();
  (payments || []).forEach((p: any) => {
    const cur = paidMap.get(p.student_id) || { total: 0, lastDate: null as string | null };
    cur.total += Number(p.amount);
    if (!cur.lastDate || p.paid_at > cur.lastDate) cur.lastDate = p.paid_at;
    paidMap.set(p.student_id, cur);
  });

  const today = new Date();

  return (students || []).map((s: any): StudentBalance => {
    const chargeInfo = chargeMap.get(s.id);
    const fallbackFee = getTuitionForGrade(tuitionFees, s.grade_level);
    const baseFee = chargeInfo && chargeInfo.total > 0 ? chargeInfo.total : fallbackFee;

    const totalFee = baseFee;

    const paidInfo = paidMap.get(s.id);
    const paid = paidInfo?.total ?? 0;
    const balance = Math.max(totalFee - paid, 0);

    let monthsOverdue = 0;
    if (balance > 0 && chargeInfo?.earliestDue) {
      const due = new Date(chargeInfo.earliestDue);
      if (due < today) {
        monthsOverdue = Math.max(1, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24 * 30)));
      }
    }
    const penalties = monthsOverdue * 200;
    const status: StudentBalance['status'] = balance <= 0 ? 'paid' : monthsOverdue > 0 ? 'overdue' : 'partial';

    return {
      id: s.id,
      firstName: s.first_name,
      middleName: s.middle_name ?? null,
      lastName: s.last_name,
      suffix: s.suffix ?? null,
      gradeLevel: s.grade_level,
      section: s.section ?? null,
      baseFee,
      totalFee,
      paid,
      balance,
      status,
      lastPaymentDate: paidInfo?.lastDate ?? null,
      monthsOverdue,
      penalties,
    };
  });
}

interface CashierPortalProps {
  user: any;
  onLogout: () => void;
  tuitionFees?: Record<string, number>;
  enrollmentFees?: Record<string, number>;
}

export function CashierPortal({ user, onLogout, tuitionFees: tuitionFeesProp = DEFAULT_TUITION_FEES, enrollmentFees: enrollmentFeesProp = DEFAULT_ENROLLMENT_FEES }: CashierPortalProps) {
  const [activeView, setActiveView] = useState('overview');
  const [schoolYear, setSchoolYear] = useState('2025-2026');
  // The cashier's session can outlive an admin changing fees in a different session, and
  // the tuitionFees/enrollmentFees props are only ever set once at login — so refetch them
  // straight from the DB here to pick up whatever the Admin has set for the current school
  // year, instead of relying on a value that may already be stale.
  const [tuitionFees, setTuitionFees] = useState(tuitionFeesProp);
  const [enrollmentFees, setEnrollmentFees] = useState(enrollmentFeesProp);

  const loadFees = async () => {
    const sy = await getCurrentSchoolYear();
    if (!sy) return;
    setSchoolYear(sy.label);
    const [{ data: tuitionRows }, { data: enrollmentRows }] = await Promise.all([
      supabase.from('tuition_fees').select('grade_level, annual_fee').eq('school_year_id', sy.id),
      supabase.from('enrollment_fees').select('grade_level, fee').eq('school_year_id', sy.id),
    ]);
    if (tuitionRows && tuitionRows.length > 0) {
      setTuitionFees({ ...DEFAULT_TUITION_FEES, ...Object.fromEntries(tuitionRows.map((r: any) => [r.grade_level, Number(r.annual_fee)])) });
    }
    if (enrollmentRows && enrollmentRows.length > 0) {
      setEnrollmentFees({ ...DEFAULT_ENROLLMENT_FEES, ...Object.fromEntries(enrollmentRows.map((r: any) => [r.grade_level, Number(r.fee)])) });
    }
  };

  useEffect(() => {
    loadFees();
  }, [activeView]);

  const navigation = [
    { id: 'overview', label: 'Payment Overview', icon: LayoutDashboard },
    { id: 'process', label: 'Process Payment', icon: PesoSignIcon },
    { id: 'students', label: 'Student Accounts', icon: Users },
    { id: 'history', label: 'Payment History', icon: Receipt },
    { id: 'profile', label: 'My Profile', icon: User }
  ];

  return (
    <DashboardLayout
      user={user}
      role="cashier"
      navigation={navigation}
      activeView={activeView}
      onViewChange={setActiveView}
      onLogout={onLogout}
      schoolYear={schoolYear}
      onSchoolYearChange={setSchoolYear}
    >
      {activeView === 'overview' && <PaymentOverview user={user} schoolYear={schoolYear} tuitionFees={tuitionFees} />}
      {activeView === 'process' && <ProcessPayment schoolYear={schoolYear} tuitionFees={tuitionFees} enrollmentFees={enrollmentFees} user={user} />}
      {activeView === 'students' && <StudentAccounts schoolYear={schoolYear} tuitionFees={tuitionFees} />}
      {activeView === 'history' && <PaymentHistory schoolYear={schoolYear} tuitionFees={tuitionFees} />}
      {activeView === 'profile' && <StaffProfileView user={user} color="#7a5c1e" />}
    </DashboardLayout>
  );
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (val: string | number) => {
    const str = String(val);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Payment Overview
function PaymentOverview({ user, schoolYear, tuitionFees = DEFAULT_TUITION_FEES }: any) {
  const [loading, setLoading] = useState(true);
  const [todaysPayments, setTodaysPayments] = useState<{ id: string; time: string; student: string; grade: string; amount: number; type: string }[]>([]);
  const [, setStats] = useState({ collectedToday: 0, collectedThisMonth: 0, studentsPaid: 0, overdueAccounts: 0 });
  const [methodBreakdown, setMethodBreakdown] = useState<{ name: string; amount: number; percent: number }[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const schoolYearId = await fetchSchoolYearId(schoolYear);
      if (!schoolYearId) {
        if (active) { setTodaysPayments([]); setStats({ collectedToday: 0, collectedThisMonth: 0, studentsPaid: 0, overdueAccounts: 0 }); setMethodBreakdown([]); setLoading(false); }
        return;
      }

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: monthPayments } = await supabase
        .from('payments')
        .select('id, amount, method, paid_at, description, students(first_name, last_name, grade_level, section)')
        .eq('school_year_id', schoolYearId)
        .gte('paid_at', startOfMonth)
        .order('paid_at', { ascending: false });

      const balances = await fetchStudentBalances(schoolYearId, tuitionFees);
      if (!active) return;

      const rows = monthPayments || [];
      const todays = rows.filter((p: any) => p.paid_at >= startOfToday);

      setTodaysPayments(todays.map((p: any) => {
        const s = p.students;
        return {
          id: p.id as string,
          time: new Date(p.paid_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          student: s ? `${s.first_name} ${s.last_name}` : 'Unknown Student',
          grade: s?.grade_level ? (s.section ? `${s.grade_level}, ${s.section}` : s.grade_level) : '—',
          amount: Number(p.amount),
          type: p.description || 'Payment',
        };
      }));

      const collectedToday = todays.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const collectedThisMonth = rows.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const studentsPaid = balances.filter(b => b.status === 'paid').length;
      const overdueAccounts = balances.filter(b => b.status === 'overdue').length;
      setStats({ collectedToday, collectedThisMonth, studentsPaid, overdueAccounts });

      const methodTotals = new Map<string, number>();
      rows.forEach((p: any) => methodTotals.set(p.method, (methodTotals.get(p.method) || 0) + Number(p.amount)));
      const methodList = Array.from(methodTotals.entries())
        .map(([name, amount]) => ({ name, amount, percent: collectedThisMonth > 0 ? Math.round((amount / collectedThisMonth) * 100) : 0 }))
        .sort((a, b) => b.amount - a.amount);
      setMethodBreakdown(methodList);

      setLoading(false);
    })();
    return () => { active = false; };
  }, [schoolYear, tuitionFees]);

  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const paymentTypes = Array.from(new Set(todaysPayments.map(p => p.type)));
  const filteredTodaysPayments = typeFilter === 'all'
    ? todaysPayments
    : todaysPayments.filter(p => p.type === typeFilter);

  const handleExportTodaysPayments = () => {
    downloadCsv(
      `todays_payments_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Receipt No.', 'Time', 'Student', 'Grade', 'Type', 'Amount'],
      filteredTodaysPayments.map(p => [p.id, p.time, p.student, p.grade, p.type, p.amount])
    );
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#1a2b4a] via-[#2d4263] to-[#1a2b4a] rounded-xl p-8 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Welcome, {user.name}!</h1>
            <p className="text-white/90 mb-4">Cashier Portal - Payment Management System</p>
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>Shift: 8:00 AM - 5:00 PM</span>
              </div>
            </div>
          </div>
          <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
            <PhilippinePeso className="w-10 h-10" />
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Payments */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a]">Today's Payments</h3>
            <div className="flex items-center gap-2">
              {/* <div className="relative">
                <button
                  onClick={() => setShowTypeFilter(!showTypeFilter)}
                  className={`px-4 py-2 border rounded-lg transition-all text-sm font-medium ${
                    typeFilter !== 'all' ? 'border-[#c9a961] bg-[#faf8f5] text-[#1a2b4a]' : 'border-black-200 hover:border-[#c9a961] hover:bg-[#faf8f5] text-black'
                  }`}
                >
                  <Filter className="w-4 h-4 inline mr-2" />
                  {typeFilter === 'all' ? 'Filter' : typeFilter}
                </button>
                {showTypeFilter && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                    <button
                      onClick={() => { setTypeFilter('all'); setShowTypeFilter(false); }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-[#faf8f5] ${typeFilter === 'all' ? 'font-semibold text-[#1a2b4a]' : 'text-[#6b6456]'}`}
                    >
                      All Types
                    </button>
                    {paymentTypes.map(type => (
                      <button
                        key={type}
                        onClick={() => { setTypeFilter(type); setShowTypeFilter(false); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-[#faf8f5] ${typeFilter === type ? 'font-semibold text-[#1a2b4a]' : 'text-[#6b6456]'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                )}
              </div> */}
              {/* <button
                onClick={handleExportTodaysPayments}
                className="px-4 py-2 bg-[#1a2b4a] text-white rounded-lg hover:bg-[#2d4263] transition-all text-sm font-medium"
              >
                <Download className="w-4 h-4 inline mr-2" />
                Export
              </button> */}
            </div>
          </div>
          {loading ? (
            <p className="text-sm text-[#8b8476] text-center py-8">Loading today's payments...</p>
          ) : filteredTodaysPayments.length === 0 ? (
            <p className="text-sm text-[#8b8476] text-center py-8">No payments recorded today yet.</p>
          ) : (
            <div className="space-y-3">
              {filteredTodaysPayments.map((payment) => (
                <div key={payment.id} className="flex items-center gap-4 p-4 bg-[#faf8f5] rounded-lg border border-gray-200 hover:shadow-md transition-all">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-[#1a2b4a]">{payment.student}</p>
                      <p className="text-lg font-bold text-green-600">₱{payment.amount.toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[#8b8476]">
                      <span>{payment.grade}</span>
                      <span>•</span>
                      <span>{payment.type}</span>
                      <span>•</span>
                      <span>{payment.time}</span>
                      <span>•</span>
                      <span className="font-mono">{payment.id.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Process Payment
function ProcessPayment({ schoolYear, tuitionFees = DEFAULT_TUITION_FEES, enrollmentFees = DEFAULT_ENROLLMENT_FEES, user }: { schoolYear: string; tuitionFees?: Record<string, number>; enrollmentFees?: Record<string, number>; user?: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentCategory, setPaymentCategory] = useState<'tuition' | 'enrollment_fee'>('tuition');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [changeDue, setChangeDue] = useState(0);
  const [amountApplied, setAmountApplied] = useState(0);
  const [schoolYearId, setSchoolYearId] = useState<string | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [schoolInfo, setSchoolInfo] = useState<SchoolSettings>(DEFAULT_SCHOOL_SETTINGS);
  useEffect(() => {
    let cancelled = false;
    getSchoolSettings().then((s) => { if (!cancelled) setSchoolInfo(s); });
    return () => { cancelled = true; };
  }, []);
  // Newly-enrolled students stay on a 'pending' enrollment until the registrar confirms
  // payment, so only the Enrollment Fee (not Tuition) can be collected for them.
  const [enrollmentPending, setEnrollmentPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!selectedStudent || !schoolYearId) { setEnrollmentPending(false); return; }
    (async () => {
      const { data } = await supabase
        .from('enrollments')
        .select('status')
        .eq('student_id', selectedStudent.id)
        .eq('school_year_id', schoolYearId)
        .maybeSingle();
      if (cancelled) return;
      const pending = data?.status === 'pending';
      setEnrollmentPending(pending);
      if (pending) setPaymentCategory('enrollment_fee');
    })();
    return () => { cancelled = true; };
  }, [selectedStudent, schoolYearId]);

  // Official Receipt (OR) number, drawn from the range the Admin registered for this
  // school year in System Settings — so the system-recorded number matches the printed
  // physical booklet copy. Issued automatically; the cashier no longer types it in.
  const [orRange, setOrRange] = useState<{ start: string; end: string; next: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sy = await getSchoolYearByLabel(schoolYear);
      if (cancelled) return;
      if (sy?.or_range_start && sy?.or_range_end && sy?.or_next_number) {
        setOrRange({ start: sy.or_range_start, end: sy.or_range_end, next: sy.or_next_number });
      } else {
        setOrRange(null);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolYear]);

  // Each student's tuition is looked up from real student_charges (falling back to
  // the admin-configured tuitionFees for their grade); balance is derived so it
  // stays consistent with what's actually been charged and paid in the database.
  const loadStudents = async () => {
    const syId = await fetchSchoolYearId(schoolYear);
    setSchoolYearId(syId);
    if (!syId) { setStudents([]); setLoading(false); return; }
    const balances = await fetchStudentBalances(syId, tuitionFees);
    setStudents(balances.map(b => ({
      id: b.id,
      name: formatStudentName(b),
      grade: b.section ? `${b.gradeLevel}, ${b.section}` : b.gradeLevel,
      paid: b.paid,
      totalFee: b.totalFee,
      balance: b.balance,
      monthsOverdue: b.monthsOverdue,
      penalties: b.penalties,
    })));
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolYear]);

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // While enrollment is still pending, the amount owed is the admin-configured enrollment
  // fee for this grade — not the tuition-based totalFee/balance, which don't apply until
  // the registrar confirms enrollment.
  const enrollmentFeeAmount = selectedStudent ? getTuitionForGrade(enrollmentFees, selectedStudent.grade) : 0;
  const displayTotalFee = selectedStudent ? (enrollmentPending ? enrollmentFeeAmount : selectedStudent.totalFee) : 0;
  const displayBalance = selectedStudent ? (enrollmentPending ? Math.max(enrollmentFeeAmount - selectedStudent.paid, 0) : selectedStudent.balance) : 0;

  const handleProcessPayment = async () => {
    if (!selectedStudent || !paymentAmount || !schoolYearId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const cashReceived = parseFloat(paymentAmount);
      const totalDue = displayBalance + selectedStudent.penalties;
      // Cash beyond what's actually owed is change, not part of the recorded payment.
      const applied = Math.min(cashReceived, totalDue);

      // Re-fetch the Admin's receipt range fresh (rather than trusting component state,
      // which can go stale between page load and submit). When the Admin has registered a
      // physical OR range for this school year, claim the next number atomically via the
      // claim_or_receipt_number RPC (a SECURITY DEFINER function that locks the row and
      // advances or_next_number server-side), so two concurrent payments can never draw
      // the same number. A client-side compare-and-swap update was tried here previously,
      // but school_years only allows UPDATE from full_admin under RLS — cashiers' updates
      // were silently filtered to zero rows every time, which always exhausted the retry
      // loop and surfaced as "Could not claim a unique receipt number after several
      // attempts." The RPC runs as the function owner and so isn't subject to that policy.
      // When no OR range is configured, fall back to the system's own auto-generated
      // sequence.
      let newReceiptNumber: string;
      const syRow = await getSchoolYearByLabel(schoolYear);
      const hasOrRange = !!(syRow?.or_range_start && syRow?.or_range_end && syRow?.or_next_number);
      if (!hasOrRange) {
        newReceiptNumber = await generateReceiptNumber();
      } else {
        const { data: claimed, error: claimError } = await supabase.rpc('claim_or_receipt_number', {
          p_school_year_id: syRow!.id,
        });
        if (claimError) throw claimError;
        newReceiptNumber = claimed as string;
        const refreshed = await getSchoolYearByLabel(schoolYear);
        setOrRange({ start: syRow!.or_range_start!, end: syRow!.or_range_end!, next: refreshed?.or_next_number ?? syRow!.or_next_number! });
      }

      const { error } = await supabase.from('payments').insert({
        student_id: selectedStudent.id,
        school_year_id: schoolYearId,
        amount: applied,
        method: 'Cash',
        recorded_by: user?.employeeId || null,
        description: paymentCategory === 'enrollment_fee' ? 'Enrollment Fee' : 'Tuition Payment',
        receipt_number: newReceiptNumber,
        category: paymentCategory,
      });
      if (error) throw error;
      setReceiptNumber(newReceiptNumber);
      setAmountApplied(applied);
      setChangeDue(Math.max(0, cashReceived - totalDue));
      setShowReceipt(true);

      // Refresh the roster in the background so the next payment reflects this one.
      loadStudents();
    } catch (e: any) {
      setSubmitError(e?.message || 'Failed to process payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Process Payment</h1>
        <p className="text-[#6b6456]">Record student tuition and fee payments</p>
      </div>

      {/* Penalty Policy Notice */}
      <div className="bg-gradient-to-r from-orange-50 to-red-50 border-l-4 border-orange-600 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">Late Payment Penalty Policy</h3>
            <p className="text-sm text-[#6b6456]">
              A penalty of <span className="font-bold text-orange-600">₱200 per month</span> is automatically applied to accounts with overdue payments. 
              Please ensure timely payment to avoid additional charges.
            </p>
          </div>
        </div>
      </div>

      {!showReceipt ? (
        <div className="space-y-6">
          {/* Student Search & Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">Select Student</h3>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6b6456]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setSelectedStudent(null); }}
                placeholder="Search by name or student ID..."
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#c9a961] focus:ring-4 focus:ring-[#c9a961]/10 outline-none transition-all text-black"
              />
            </div>

            {selectedStudent ? (
              <div className="mt-4 flex items-start justify-between gap-3 p-4 rounded-lg border-2 border-[#c9a961] bg-[#c9a961]/5">
                <div>
                  <p className="font-semibold text-[#1a2b4a]">{selectedStudent.name}</p>
                  <p className="text-sm text-[#6b6456]">{selectedStudent.grade}</p>
                  <p className="text-xs text-[#8b8476] mt-1">ID: {selectedStudent.id}</p>
                </div>
                <button
                  onClick={() => { setSelectedStudent(null); setSearchTerm(''); }}
                  className="shrink-0 text-sm font-medium text-[#1a2b4a] hover:underline"
                >
                  Change
                </button>
              </div>
            ) : searchTerm ? (
              <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                {loading ? (
                  <p className="text-sm text-[#8b8476] text-center py-8">Loading students...</p>
                ) : filteredStudents.length === 0 ? (
                  <p className="text-sm text-[#8b8476] text-center py-8">No students found.</p>
                ) : filteredStudents.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => setSelectedStudent(student)}
                    className="w-full p-4 rounded-lg border-2 border-gray-200 hover:border-[#c9a961]/50 hover:bg-[#faf8f5] transition-all text-left"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-[#1a2b4a]">{student.name}</p>
                        <p className="text-sm text-[#6b6456]">{student.grade}</p>
                        <p className="text-xs text-[#8b8476] mt-1">ID: {student.id}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${(student.balance + student.penalties) === 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ₱{(student.balance + student.penalties).toLocaleString()}
                        </p>
                        <p className="text-xs text-[#8b8476]">Total Due</p>
                        {student.penalties > 0 && (
                          <p className="text-xs text-orange-600 mt-1">+₱{student.penalties.toLocaleString()} penalty</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Payment Form */}
          {selectedStudent && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">Payment Details</h3>

              <div className="space-y-4">
                {/* Student Summary */}
                <div className="p-4 bg-[#faf8f5] rounded-xl border border-gray-200">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#6b6456]">Student:</span>
                      <span className="font-semibold text-[#1a2b4a]">{selectedStudent.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6b6456]">{enrollmentPending ? 'Enrollment Fee:' : 'Total Fee:'}</span>
                      <span className="font-semibold text-[#1a2b4a]">₱{displayTotalFee.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6b6456]">Already Paid:</span>
                      <span className="font-semibold text-green-600">₱{selectedStudent.paid.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6b6456]">Balance Due:</span>
                      <span className="font-semibold text-[#1a2b4a]">₱{displayBalance.toLocaleString()}</span>
                    </div>
                    {selectedStudent.penalties > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[#6b6456]">Late Penalties:</span>
                        <div className="text-right">
                          <span className="font-semibold text-orange-600">₱{selectedStudent.penalties.toLocaleString()}</span>
                          <p className="text-xs text-[#8b8476]">
                            ({selectedStudent.monthsOverdue} {selectedStudent.monthsOverdue === 1 ? 'month' : 'months'} × ₱200)
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-gray-300">
                      <span className="text-[#6b6456] font-semibold">Total Amount Due:</span>
                      <span className="font-bold text-red-600 text-lg">₱{(displayBalance + selectedStudent.penalties).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Payment Amount */}
                <div>
                  <label className="block text-sm font-semibold text-[#1a2b4a] mb-2">
                    Payment Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6b6456] font-semibold">₱</span>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                      max={20000}
                      min={0}
                      className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#c9a961] focus:ring-4 focus:ring-[#c9a961]/10 outline-none transition-all text-lg font-semibold text-black"
                    />
                  </div>
                  <p className="mt-1 text-xs text-[#8b8476]">Cash received may exceed the balance due — change will be computed automatically. Max ₱20,000 per transaction.</p>
                </div>

                {/* Payment For */}
                <div>
                  <label className="block text-sm font-semibold text-[#1a2b4a] mb-2">
                    Payment For
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'tuition', label: 'Tuition' },
                      { value: 'enrollment_fee', label: 'Enrollment Fee' },
                    ].map((c) => (
                      <button
                        key={c.value}
                        disabled={c.value === 'tuition' ? enrollmentPending : !enrollmentPending}
                        onClick={() => {
                          setPaymentCategory(c.value as 'tuition' | 'enrollment_fee');
                          // Clicking Enrollment Fee replaces whatever is in the Payment
                          // Amount field with the admin-configured fee for this student's
                          // grade level — it doesn't add to or combine with anything else.
                          if (c.value === 'enrollment_fee') {
                            setPaymentAmount(String(getTuitionForGrade(enrollmentFees, selectedStudent.grade)));
                          }
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                          paymentCategory === c.value
                            ? 'border-[#c9a961] bg-[#c9a961]/10 text-[#1a2b4a]'
                            : 'border-gray-200 text-[#6b6456] hover:border-[#c9a961]/50'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {enrollmentPending && (
                    <p className="mt-2 text-xs text-amber-700">This student's enrollment is still pending — the enrollment fee must be paid and the registrar must confirm the enrollment before tuition can be collected.</p>
                  )}
                </div>

                {/* Official Receipt Number is issued automatically from the range the Admin
                    registered in System Settings — no manual entry needed. */}
                {!orRange && (
                  <p className="text-xs text-[#8b8476]">No official receipt range is set for this school year — a system-generated number will be issued. Ask the Admin to register one in System Settings.</p>
                )}

                {/* Process Button */}
                {submitError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{submitError}</p>
                )}
                <button
                  onClick={handleProcessPayment}
                  disabled={submitting || !paymentAmount || parseFloat(paymentAmount) <= 0 || parseFloat(paymentAmount) > 20000}
                  className="w-full bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-5 h-5" />
                  {submitting ? 'Processing...' : 'Process Payment'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Receipt */
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border-2 border-[#c9a961] p-8 print-receipt">
            <div className="text-center mb-6 pb-6 border-b-2 border-dashed border-gray-300">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4 print:hidden">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
              <img src={schoolLogo} alt="School Logo" className="w-12 h-12 object-contain mx-auto mb-2 hidden print:block" />
              <p className="font-bold text-[#1a2b4a] hidden print:block">{schoolInfo.school_name}</p>
              <h2 className="text-2xl font-bold text-green-600 mb-2">Payment Successful!</h2>
              <p className="text-[#6b6456]">Official Receipt</p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Receipt No.</p>
                  <p className="font-mono font-bold text-[#1a2b4a]">{receiptNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[#6b6456] mb-1">Date & Time</p>
                  <p className="font-semibold text-[#1a2b4a]">
                    {new Date().toLocaleString('en-US', { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-[#faf8f5] rounded-xl">
                <p className="text-sm text-[#6b6456] mb-2">Student Information</p>
                <p className="font-bold text-[#1a2b4a] text-lg">{selectedStudent?.name}</p>
                <p className="text-sm text-[#8b8476]">{selectedStudent?.grade}</p>
                <p className="text-xs text-[#8b8476] font-mono mt-1">ID: {selectedStudent?.id}</p>
              </div>

              <div className="p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-xl border-2 border-green-200">
                <p className="text-sm text-green-800 mb-2">Payment Details</p>
                <div className="flex justify-between items-center">
                  <span className="text-green-900 font-semibold">Cash Received:</span>
                  <span className="text-3xl font-bold text-green-700">₱{parseFloat(paymentAmount).toLocaleString()}</span>
                </div>
                {changeDue > 0 && (
                  <div className="mt-3 pt-3 border-t border-green-300 flex justify-between items-center">
                    <span className="text-green-900 font-semibold">Change:</span>
                    <span className="text-xl font-bold text-green-700">₱{changeDue.toLocaleString()}</span>
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-green-300 flex justify-between text-sm">
                  <span className="text-green-800">Payment Method:</span>
                  <span className="font-semibold text-green-900">Cash</span>
                </div>
              </div>

              <div className="p-4 bg-[#faf8f5] rounded-xl">
                <div className="flex justify-between mb-2">
                  <span className="text-[#6b6456]">Previous Balance Due:</span>
                  <span className="font-semibold text-[#1a2b4a]">₱{((selectedStudent?.balance ?? 0) + (selectedStudent?.penalties ?? 0)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-[#6b6456]">Amount Applied:</span>
                  <span className="font-semibold text-green-600">-₱{amountApplied.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-300">
                  <span className="font-semibold text-[#1a2b4a]">New Balance:</span>
                  <span className="font-bold text-[#1a2b4a] text-lg">
                    ₱{Math.max(0, (selectedStudent?.balance ?? 0) + (selectedStudent?.penalties ?? 0) - amountApplied).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center text-sm text-blue-800">
                <p className="font-semibold mb-1">{schoolInfo.school_name}</p>
                {schoolInfo.school_motto && <p>{schoolInfo.school_motto}</p>}
                <p className="text-xs mt-2">Academic Year {schoolYear}</p>
              </div>
            </div>

            <div className="flex gap-3 print:hidden">
              <button
                onClick={() => {
                  setShowReceipt(false);
                  setSelectedStudent(null);
                  setSearchTerm('');
                  setPaymentAmount('');
                  setChangeDue(0);
                  setAmountApplied(0);
                  setSubmitError(null);
                }}
                className="flex-1 px-6 py-3 bg-[#1a2b4a] text-white rounded-lg hover:bg-[#2d4263] transition-all font-semibold flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                New Payment
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 px-6 py-3 border-2 border-[#1a2b4a] text-[#1a2b4a] rounded-lg hover:bg-[#faf8f5] transition-all font-semibold flex items-center justify-center gap-2"
              >
                <Printer className="w-5 h-5" />
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Student Accounts
function StudentAccounts({ schoolYear, tuitionFees = DEFAULT_TUITION_FEES }: { schoolYear: string; tuitionFees?: Record<string, number> }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewDetailsStudent, setViewDetailsStudent] = useState<any>(null);
  const [printStatementStudent, setPrintStatementStudent] = useState<any>(null);
  const [receiptPayment, setReceiptPayment] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentsByStudent, setPaymentsByStudent] = useState<Record<string, { date: string; amount: number; method: string; reference: string }[]>>({});
  const [schoolInfo, setSchoolInfo] = useState<SchoolSettings>(DEFAULT_SCHOOL_SETTINGS);
  useEffect(() => {
    let cancelled = false;
    getSchoolSettings().then((s) => { if (!cancelled) setSchoolInfo(s); });
    return () => { cancelled = true; };
  }, []);

  // Each student's tuition is looked up from real student_charges (falling back to
  // the admin-configured tuitionFees for their grade); balance is derived so it
  // stays consistent with what's actually been charged and paid in the database.
  const loadStudents = async () => {
    setLoading(true);
    const syId = await fetchSchoolYearId(schoolYear);
    if (!syId) { setStudents([]); setPaymentsByStudent({}); setLoading(false); return; }

    const [balances, { data: payments }] = await Promise.all([
      fetchStudentBalances(syId, tuitionFees),
      supabase.from('payments').select('student_id, amount, method, receipt_number, paid_at').eq('school_year_id', syId).order('paid_at', { ascending: false }),
    ]);

    const byStudent: Record<string, { date: string; amount: number; method: string; reference: string }[]> = {};
    (payments || []).forEach((p: any) => {
      const list = byStudent[p.student_id] || (byStudent[p.student_id] = []);
      list.push({
        date: new Date(p.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        amount: Number(p.amount),
        method: p.method,
        reference: p.receipt_number || '-',
      });
    });
    setPaymentsByStudent(byStudent);

    setStudents(balances.map(b => ({
      id: b.id,
      name: formatStudentName(b),
      grade: b.section ? `${b.gradeLevel}, ${b.section}` : b.gradeLevel,
      paid: b.paid,
      baseFee: b.baseFee,
      totalFee: b.totalFee,
      balance: b.balance,
      status: b.status,
      lastPayment: b.lastPaymentDate
        ? new Date(b.lastPaymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'No payments yet',
      monthsOverdue: b.monthsOverdue,
      penalties: b.penalties,
    })));
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolYear, tuitionFees]);

  const paymentHistory = paymentsByStudent[(viewDetailsStudent || printStatementStudent)?.id] || [];

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         s.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || s.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Student Accounts</h1>
        <p className="text-[#6b6456]">View and manage student payment accounts</p>
      </div>

      {/* Penalty Policy Notice */}
      <div className="bg-gradient-to-r from-orange-50 to-red-50 border-l-4 border-orange-600 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-[#1a2b4a] mb-1">Late Payment Penalty: ₱200/month</h3>
            <p className="text-sm text-[#6b6456]">
              Students with overdue monthly payments are automatically charged a ₱200 penalty per month. 
              The penalty count is displayed in the Penalties column below.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6b6456]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or student ID..."
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#c9a961] focus:ring-4 focus:ring-[#c9a961]/10 outline-none transition-all text-black"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilterStatus('all')}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                filterStatus === 'all' 
                  ? 'bg-[#1a2b4a] text-white' 
                  : 'bg-[#faf8f5] text-[#6b6456] hover:bg-[#eae7e0]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterStatus('paid')}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                filterStatus === 'paid' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-[#faf8f5] text-[#6b6456] hover:bg-[#eae7e0]'
              }`}
            >
              Paid
            </button>
            <button
              onClick={() => setFilterStatus('partial')}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                filterStatus === 'partial' 
                  ? 'bg-yellow-600 text-white' 
                  : 'bg-[#faf8f5] text-[#6b6456] hover:bg-[#eae7e0]'
              }`}
            >
              Partial
            </button>
            <button
              onClick={() => setFilterStatus('overdue')}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                filterStatus === 'overdue' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-[#faf8f5] text-[#6b6456] hover:bg-[#eae7e0]'
              }`}
            >
              Overdue
            </button>
          </div>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#faf8f5] border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Student</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Total Fee</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Paid</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Penalties</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Balance</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Status</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Last Payment</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-sm text-[#8b8476]">Loading student accounts...</td></tr>
              ) : filteredStudents.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-sm text-[#8b8476]">No students found.</td></tr>
              ) : filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-[#faf8f5] transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-semibold text-[#1a2b4a]">{student.name}</p>
                      <p className="text-xs text-[#8b8476] font-mono">{student.id}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-[#2c2c2c]">₱{student.totalFee.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-semibold text-green-600">₱{student.paid.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    {student.penalties > 0 ? (
                      <div>
                        <p className="font-bold text-red-600">₱{student.penalties.toLocaleString()}</p>
                        <p className="text-xs text-[#8b8476]">{student.monthsOverdue} {student.monthsOverdue === 1 ? 'month' : 'months'} late</p>
                      </div>
                    ) : (
                      <span className="text-[#6b6456]">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-red-600">₱{student.balance.toLocaleString()}</td>
                  <td className="px-6 py-4 text-center">
                    {student.status === 'paid' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        <CheckCircle className="w-3 h-3" />
                        Paid
                      </span>
                    )}
                    {student.status === 'partial' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                        <Clock className="w-3 h-3" />
                        Partial
                      </span>
                    )}
                    {student.status === 'overdue' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                        <AlertCircle className="w-3 h-3" />
                        Overdue
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-[#6b6456]">{student.lastPayment}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setViewDetailsStudent(student)}
                        className="p-2 hover:bg-blue-50 rounded-lg transition-all"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={() => setPrintStatementStudent(student)}
                        className="p-2 hover:bg-[#c9a961]/10 rounded-lg transition-all"
                        title="Print Statement"
                      >
                        <Printer className="w-4 h-4 text-[#c9a961]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Details Modal */}
      {viewDetailsStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-none">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#1a2b4a]">Student Details</h2>
              <button
                onClick={() => setViewDetailsStudent(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              >
                <XCircle className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-[#1a2b4a] to-[#2d4263] rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-[#1a2b4a]">{viewDetailsStudent.name}</p>
                  <p className="text-sm text-[#8b8476] font-mono">{viewDetailsStudent.id}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Grade:</p>
                  <p className="font-semibold text-[#1a2b4a]">{viewDetailsStudent.grade}</p>
                </div>
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Total Fee:</p>
                  <p className="font-semibold text-[#1a2b4a]">₱{viewDetailsStudent.totalFee.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Already Paid:</p>
                  <p className="font-semibold text-green-600">₱{viewDetailsStudent.paid.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Late Payment Penalties:</p>
                  {viewDetailsStudent.penalties > 0 ? (
                    <div>
                      <p className="font-bold text-orange-600">₱{viewDetailsStudent.penalties.toLocaleString()}</p>
                      <p className="text-xs text-[#8b8476] mt-1">
                        ₱200 × {viewDetailsStudent.monthsOverdue} {viewDetailsStudent.monthsOverdue === 1 ? 'month' : 'months'}
                      </p>
                    </div>
                  ) : (
                    <p className="font-semibold text-green-600">₱0</p>
                  )}
                </div>
                <div className="col-span-2 pt-2 border-t border-gray-300">
                  <p className="text-sm text-[#6b6456] mb-1">Total Outstanding Balance:</p>
                  <p className="font-bold text-red-600 text-lg">₱{(viewDetailsStudent.balance + viewDetailsStudent.penalties).toLocaleString()}</p>
                  {viewDetailsStudent.penalties > 0 && (
                    <p className="text-xs text-[#8b8476] mt-1">
                      (Balance: ₱{viewDetailsStudent.balance.toLocaleString()} + Penalties: ₱{viewDetailsStudent.penalties.toLocaleString()})
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-bold text-[#1a2b4a] mb-3">Payment History</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {paymentHistory.length === 0 && (
                    <p className="text-sm text-[#8b8476] py-4 text-center">No payments recorded yet.</p>
                  )}
                  {paymentHistory.map((payment, idx) => (
                    <div key={`${payment.date}-${idx}`} className="flex items-center justify-between px-4 py-2 bg-[#faf8f5] rounded-lg border border-gray-200 hover:shadow-md transition-all gap-3">
                      <div className="flex-1">
                        <div className="grid grid-cols-2 gap-4 mb-1">
                          <div>
                            <p className="text-xs text-[#8b8476] mb-1">Payment</p>
                            <p className="text-lg font-bold text-green-600">₱{payment.amount.toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-[#8b8476] mb-1">Status</p>
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                              <CheckCircle className="w-3 h-3" />
                              Paid
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-[#8b8476]">
                          <span>{viewDetailsStudent.grade}</span>
                          <span>•</span>
                          <span>{payment.method}</span>
                          <span>•</span>
                          <span>{payment.date}</span>
                          <span>•</span>
                          <span className="font-mono">{payment.reference}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setReceiptPayment(payment)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 border-gray-200 text-[#1a2b4a] bg-white hover:border-[#c9a961] transition-all whitespace-nowrap shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Receipt</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {receiptPayment && (
        <ReceiptModal
          studentName={viewDetailsStudent?.name}
          studentId={viewDetailsStudent?.id}
          grade={viewDetailsStudent?.grade}
          reference={receiptPayment.reference}
          amount={receiptPayment.amount}
          method={receiptPayment.method}
          dateLabel={receiptPayment.date}
          schoolYear={schoolYear}
          onClose={() => setReceiptPayment(null)}
        />
      )}

      {/* Print Statement Modal */}
      {printStatementStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-none print-receipt">
            <div className="flex items-center justify-between mb-6 print:hidden">
              <h2 className="text-xl font-bold text-[#1a2b4a]">Print Statement of Accounts</h2>
              <button
                onClick={() => setPrintStatementStudent(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              >
                <XCircle className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4 print:hidden">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-[#1a2b4a] to-[#2d4263] rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-[#1a2b4a]">{printStatementStudent.name}</p>
                  <p className="text-sm text-[#8b8476] font-mono">{printStatementStudent.id}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Grade:</p>
                  <p className="font-semibold text-[#1a2b4a]">{printStatementStudent.grade}</p>
                </div>
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Total Fee:</p>
                  <p className="font-semibold text-[#1a2b4a]">₱{printStatementStudent.totalFee.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Already Paid:</p>
                  <p className="font-semibold text-green-600">₱{printStatementStudent.paid.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Balance Due:</p>
                  <p className="font-semibold text-[#1a2b4a]">₱{printStatementStudent.balance.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Late Penalties:</p>
                  {printStatementStudent.penalties > 0 ? (
                    <div>
                      <p className="font-bold text-orange-600">₱{printStatementStudent.penalties.toLocaleString()}</p>
                      <p className="text-xs text-[#8b8476] mt-1">
                        {printStatementStudent.monthsOverdue} {printStatementStudent.monthsOverdue === 1 ? 'month' : 'months'} × ₱200
                      </p>
                    </div>
                  ) : (
                    <p className="font-semibold text-green-600">₱0</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Status:</p>
                  <p className="font-semibold text-[#1a2b4a]">
                    {printStatementStudent.status === 'paid' && 'Paid'}
                    {printStatementStudent.status === 'partial' && 'Partial'}
                    {printStatementStudent.status === 'overdue' && 'Overdue'}
                  </p>
                </div>
                <div className="col-span-2 pt-2 border-t border-gray-300">
                  <p className="text-sm text-[#6b6456] mb-1">Total Amount Due:</p>
                  <p className="font-bold text-red-600 text-xl">₱{(printStatementStudent.balance + printStatementStudent.penalties).toLocaleString()}</p>
                  {printStatementStudent.penalties > 0 && (
                    <p className="text-xs text-[#8b8476] mt-1">
                      (Balance: ₱{printStatementStudent.balance.toLocaleString()} + Penalties: ₱{printStatementStudent.penalties.toLocaleString()})
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-6">
                <h3 className="text-lg font-bold text-[#1a2b4a] mb-3">Payment History</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {paymentHistory.length === 0 && (
                    <p className="text-sm text-[#8b8476] py-4 text-center">No payments recorded yet.</p>
                  )}
                  {paymentHistory.map((payment, idx) => (
                    <div key={`${payment.date}-${idx}`} className="flex items-center justify-between px-4 py-2 bg-[#faf8f5] rounded-lg border border-gray-200 hover:shadow-md transition-all">
                      
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-[#1a2b4a]">{printStatementStudent.name}</p>
                          <p className="text-lg font-bold text-green-600">₱{payment.amount.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-[#8b8476]">
                          <span>{printStatementStudent.grade}</span>
                          <span>•</span>
                          <span>{payment.method}</span>
                          <span>•</span>
                          <span>{payment.date}</span>
                          <span>•</span>
                          <span className="font-mono">{payment.reference}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => window.print()}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center justify-center gap-2"
                >
                  <Printer className="w-5 h-5" />
                  Print
                </button>
              </div>
            </div>

            {/* Print-only layout — mirrors the school's Statement of Account document.
                Hidden on screen; shown only inside the @media print rule via print:block. */}
            <div className="hidden print:block text-black font-sans text-sm">
              <div className="flex items-start gap-4 border-b-2 border-black pb-4 mb-4">
                <img src={schoolLogo} alt="School Logo" className="w-16 h-16 object-contain shrink-0" />
                <div className="flex-1">
                  <p className="text-xl font-bold uppercase">{schoolInfo.school_name}</p>
                  {schoolInfo.school_motto && <p className="text-xs italic">{schoolInfo.school_motto}</p>}
                  {schoolInfo.school_address && <p className="text-xs">{schoolInfo.school_address}</p>}
                  {(schoolInfo.contact_phone || schoolInfo.contact_email) && (
                    <p className="text-xs">{[schoolInfo.contact_phone, schoolInfo.contact_email].filter(Boolean).join(' • ')}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold uppercase tracking-wide">Statement of Account</p>
                  <p className="text-xs">S.Y. {schoolYear} | Statement for {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-5">
                <div>
                  <p className="text-xs uppercase font-bold tracking-wide mb-1">Student</p>
                  <div className="text-xs space-y-0.5">
                    <p className="flex justify-between"><span className="text-gray-600">Student No.</span><span className="font-mono">{printStatementStudent.id}</span></p>
                    <p className="flex justify-between"><span className="text-gray-600">Name</span><span className="font-semibold">{printStatementStudent.name}</span></p>
                    <p className="flex justify-between"><span className="text-gray-600">Grade</span><span className="font-semibold">{printStatementStudent.grade}</span></p>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase font-bold tracking-wide mb-1">Statement Details</p>
                  <div className="text-xs space-y-0.5">
                    <p className="flex justify-between"><span className="text-gray-600">School Year</span><span className="font-semibold">{schoolYear}</span></p>
                    <p className="flex justify-between"><span className="text-gray-600">Statement Month</span><span className="font-semibold">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span></p>
                    <p className="flex justify-between"><span className="text-gray-600">Status</span><span className="font-semibold">
                      {printStatementStudent.status === 'paid' && 'Paid'}
                      {printStatementStudent.status === 'partial' && 'Partial'}
                      {printStatementStudent.status === 'overdue' && 'Overdue'}
                    </span></p>
                  </div>
                </div>
              </div>

              <div className="mb-5 pb-5 border-b border-gray-300">
                <p className="text-sm font-bold uppercase tracking-wide">
                  Tuition Payment Due — {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
                <p className="text-xs text-gray-500 mb-2">Includes outstanding balance and late surcharge.</p>
                <p className="text-4xl font-bold mb-2">₱{(printStatementStudent.balance + printStatementStudent.penalties).toLocaleString()}</p>
                <div className="text-xs space-y-0.5 max-w-xs">
                  <p className="flex justify-between"><span>Balance Due</span><span>₱{printStatementStudent.balance.toLocaleString()}</span></p>
                  {printStatementStudent.penalties > 0 && (
                    <p className="flex justify-between">
                      <span>Late Surcharge ({printStatementStudent.monthsOverdue} {printStatementStudent.monthsOverdue === 1 ? 'month' : 'months'} × ₱200)</span>
                      <span>₱{printStatementStudent.penalties.toLocaleString()}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-5">
                <div>
                  <p className="text-xs uppercase font-bold tracking-wide mb-1">Account Totals</p>
                  <div className="text-xs space-y-0.5">
                    <p className="flex justify-between"><span>Current Charges</span><span className="font-semibold">₱{printStatementStudent.totalFee.toLocaleString()}</span></p>
                    <p className="flex justify-between"><span>Posted Payments</span><span className="font-semibold">₱{printStatementStudent.paid.toLocaleString()}</span></p>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase font-bold tracking-wide mb-1">Payment Status</p>
                  <div className="text-xs space-y-0.5">
                    <p className="flex justify-between"><span className="text-gray-600">Last Payment</span><span className="font-semibold">{paymentHistory[0]?.date || '—'}</span></p>
                    {paymentHistory[0] && (
                      <>
                        <p className="flex justify-between"><span className="text-gray-600">Receipt</span><span className="font-mono">{paymentHistory[0].reference}</span></p>
                        <p className="flex justify-between"><span className="text-gray-600">Amount</span><span className="font-semibold">₱{paymentHistory[0].amount.toLocaleString()}</span></p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-xs uppercase font-bold tracking-wide mb-2">Payment History</p>
                {paymentHistory.length === 0 ? (
                  <p className="text-xs text-gray-500">No payments recorded yet.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b-2 border-black">
                        <th className="text-left py-1.5 font-semibold">Date</th>
                        <th className="text-left py-1.5 font-semibold">Receipt No.</th>
                        <th className="text-right py-1.5 font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.map((payment, idx) => (
                        <tr key={`${payment.date}-${idx}`} className="border-b border-gray-300">
                          <td className="py-1">{payment.date}</td>
                          <td className="py-1 font-mono">{payment.reference}</td>
                          <td className="py-1 text-right">₱{payment.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <p className="text-center text-xs text-gray-500 italic">
                Please keep this statement for your records. Contact the school office for questions or corrections.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Payment History
function PaymentHistory({ schoolYear, tuitionFees = DEFAULT_TUITION_FEES }: { schoolYear: string; tuitionFees?: Record<string, number> }) {
  const [dateFilter, setDateFilter] = useState('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [receiptPayment, setReceiptPayment] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const syId = await fetchSchoolYearId(schoolYear);
      if (!syId) { if (active) { setPayments([]); setLoading(false); } return; }

      const [{ data: pays }, { data: charges }, { data: employees }] = await Promise.all([
        supabase
          .from('payments')
          .select('id, student_id, amount, method, receipt_number, paid_at, recorded_by, students(first_name, last_name, grade_level, section)')
          .eq('school_year_id', syId)
          .order('paid_at', { ascending: true }),
        supabase.from('student_charges').select('student_id, amount').eq('school_year_id', syId),
        supabase.from('employees').select('id, full_name'),
      ]);
      if (!active) return;

      const chargeTotals = new Map<string, number>();
      (charges || []).forEach((c: any) => chargeTotals.set(c.student_id, (chargeTotals.get(c.student_id) || 0) + Number(c.amount)));
      const employeeNames = new Map<string, string>();
      (employees || []).forEach((e: any) => employeeNames.set(e.id, e.full_name));

      // Track running paid-so-far per student (payments fetched oldest-first) so we
      // can show the balance immediately before each individual payment was made.
      const runningPaid = new Map<string, number>();
      const rows = (pays || []).map((p: any) => {
        const s = p.students;
        const totalFee = chargeTotals.get(p.student_id) ?? getTuitionForGrade(tuitionFees, s?.grade_level || '');
        const paidBefore = runningPaid.get(p.student_id) ?? 0;
        runningPaid.set(p.student_id, paidBefore + Number(p.amount));
        const paidDate = new Date(p.paid_at);
        return {
          id: p.id as string,
          date: paidDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          time: paidDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          student: s ? `${s.first_name} ${s.last_name}` : 'Unknown Student',
          lastName: s?.last_name || '',
          studentId: p.student_id as string,
          grade: s?.grade_level ? (s.section ? `${s.grade_level}, ${s.section}` : s.grade_level) : '—',
          amount: Number(p.amount),
          balance: Math.max(totalFee - paidBefore, 0),
          method: p.method as string,
          cashier: p.recorded_by ? (employeeNames.get(p.recorded_by) || p.recorded_by) : 'Unassigned',
          reference: p.receipt_number || '-',
        };
      }).reverse(); // newest first for display

      setPayments(rows);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [schoolYear, tuitionFees]);

  const latestDate = payments.reduce((latest, p) => {
    const d = new Date(p.date);
    return d > latest ? d : latest;
  }, new Date(0));

  const filteredPayments = payments.filter((p) => {
    if (dateFilter !== 'all') {
      const diffDays = (latestDate.getTime() - new Date(p.date).getTime()) / (1000 * 60 * 60 * 24);
      if (dateFilter === 'today' && diffDays >= 1) return false;
      if (dateFilter === 'week' && diffDays >= 7) return false;
      if (dateFilter === 'month' && diffDays >= 31) return false;
    }
    const q = searchQuery.trim().toLowerCase();
    if (q && !p.reference.toLowerCase().includes(q) && !p.lastName.toLowerCase().includes(q)) return false;
    return true;
  });

  const handleExportReport = () => {
    downloadCsv(
      `payment_history_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Receipt No.', 'Date', 'Time', 'Student', 'Student ID', 'Amount', 'Cashier'],
      filteredPayments.map(p => [p.reference, p.date, p.time, p.student, p.studentId, p.amount, p.cashier])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Payment History</h1>
          <p className="text-[#6b6456]">View all processed payment transactions</p>
        </div>
        <button
          onClick={handleExportReport}
          className="flex items-center gap-2 px-6 py-3 bg-[#1a2b4a] text-white rounded-lg hover:bg-[#2d4263] transition-all font-semibold"
        >
          <Download className="w-5 h-5" />
          Export Report
        </button>
      </div>

      {/* Date Filter + Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="px-4 py-2 rounded-lg font-medium bg-[#faf8f5] text-[#1a2b4a] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by receipt number or student last name…"
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-[#2c2c2c] focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20"
            />
          </div>
        </div>
      </div>

      {/* Payment History Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#faf8f5] border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Receipt No.</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Date & Time</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Student</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Amount</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Cashier</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-[#8b8476]">Loading payment history...</td></tr>
              ) : filteredPayments.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-[#8b8476]">No payments recorded for this period.</td></tr>
              ) : filteredPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-[#faf8f5] transition-colors">
                  <td className="px-6 py-4 font-mono text-sm font-semibold text-[#1a2b4a]">{payment.reference}</td>
                  <td className="px-6 py-4 text-sm text-[#6b6456]">
                    <div>{payment.date}</div>
                    <div className="text-xs text-[#8b8476]">{payment.time}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-semibold text-[#1a2b4a]">{payment.student}</p>
                      <p className="text-xs text-[#8b8476] font-mono">{payment.studentId}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-green-600">₱{payment.amount.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-[#6b6456]">{payment.cashier}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setReceiptPayment(payment)}
                        className="p-2 hover:bg-[#c9a961]/10 rounded-lg transition-all"
                        title="Print Receipt"
                      >
                        <Printer className="w-4 h-4 text-[#c9a961]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Modal (Print action) */}
      {receiptPayment && (
        <ReceiptModal
          studentName={receiptPayment.student}
          studentId={receiptPayment.studentId}
          grade={receiptPayment.grade}
          reference={receiptPayment.reference}
          amount={parseFloat(receiptPayment.amount)}
          method={receiptPayment.method}
          dateLabel={new Date(`${receiptPayment.date} ${receiptPayment.time}`).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
          balanceBefore={receiptPayment.balance}
          schoolYear={schoolYear}
          onClose={() => setReceiptPayment(null)}
        />
      )}
    </div>
  );
}