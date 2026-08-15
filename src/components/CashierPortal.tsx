import { useState, useEffect } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { StaffProfileView } from './StaffProfileView';
import { supabase } from '../supabase';
import { getCurrentSchoolYear, getSchoolYearByLabel } from '../lib/schoolYear';
import {
  LayoutDashboard, DollarSign, Users, Search, Filter,
  Receipt, Calendar, User, XCircle, Plus,
  Printer, Edit,
  CheckCircle, AlertCircle, Clock, CreditCard, Eye, Download
} from 'lucide-react';
import { DEFAULT_TUITION_FEES, getTuitionForGrade } from '../lib/tuition';

// A peso-sign icon matching the sizing/API of lucide-react icons (className is forwarded),
// used in place of DollarSign wherever this portal deals in Philippine pesos.
function PesoSignIcon({ className }: { className?: string }) {
  return <span className={`${className ?? ''} inline-flex items-center justify-center font-bold leading-none`}>₱</span>;
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

export type Scholarship = {
  id: string;
  scholarshipType: string;
  amount: number | null;
  percentDiscount: number | null;
  awardedDate: string | null;
  notes: string | null;
};

// Shared per-student balance calculation used by Process Payment and Student
// Accounts: totals up real student_charges (falling back to the admin-configured
// tuitionFees for the student's grade when no charges have been recorded yet),
// deducts any awarded scholarship, against real payments to derive balance,
// status, and overdue penalties. No scholarship on file => the base fee stands.
type StudentBalance = {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  section: string | null;
  baseFee: number;
  scholarship: Scholarship | null;
  scholarshipDeduction: number;
  totalFee: number;
  paid: number;
  balance: number;
  status: 'paid' | 'partial' | 'overdue';
  lastPaymentDate: string | null;
  monthsOverdue: number;
  penalties: number;
};

async function fetchStudentBalances(schoolYearId: string, tuitionFees: Record<string, number>): Promise<StudentBalance[]> {
  const [{ data: students }, { data: charges }, { data: payments }, { data: scholarships }] = await Promise.all([
    supabase.from('students').select('id, first_name, last_name, grade_level, section')
      .eq('school_year_id', schoolYearId).eq('status', 'Active').order('last_name'),
    supabase.from('student_charges').select('student_id, amount, due_date').eq('school_year_id', schoolYearId),
    supabase.from('payments').select('student_id, amount, paid_at').eq('school_year_id', schoolYearId),
    supabase.from('scholarships').select('id, student_id, scholarship_type, amount, percent_discount, awarded_date, notes').eq('school_year_id', schoolYearId),
  ]);

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

  const scholarshipMap = new Map<string, Scholarship>();
  (scholarships || []).forEach((sc: any) => {
    scholarshipMap.set(sc.student_id, {
      id: sc.id,
      scholarshipType: sc.scholarship_type,
      amount: sc.amount != null ? Number(sc.amount) : null,
      percentDiscount: sc.percent_discount != null ? Number(sc.percent_discount) : null,
      awardedDate: sc.awarded_date,
      notes: sc.notes,
    });
  });

  const today = new Date();

  return (students || []).map((s: any): StudentBalance => {
    const chargeInfo = chargeMap.get(s.id);
    const fallbackFee = getTuitionForGrade(tuitionFees, s.grade_level);
    const baseFee = chargeInfo && chargeInfo.total > 0 ? chargeInfo.total : fallbackFee;

    const scholarship = scholarshipMap.get(s.id) ?? null;
    let scholarshipDeduction = 0;
    if (scholarship) {
      scholarshipDeduction = scholarship.amount != null
        ? scholarship.amount
        : scholarship.percentDiscount != null
          ? baseFee * (scholarship.percentDiscount / 100)
          : 0;
    }
    const totalFee = Math.max(baseFee - scholarshipDeduction, 0);

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
      lastName: s.last_name,
      gradeLevel: s.grade_level,
      section: s.section ?? null,
      baseFee,
      scholarship,
      scholarshipDeduction,
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
}

export function CashierPortal({ user, onLogout, tuitionFees = DEFAULT_TUITION_FEES }: CashierPortalProps) {
  const [activeView, setActiveView] = useState('overview');
  const [schoolYear, setSchoolYear] = useState('2025-2026');

  useEffect(() => {
    getCurrentSchoolYear().then((sy) => { if (sy) setSchoolYear(sy.label); });
  }, []);

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
      {activeView === 'process' && <ProcessPayment schoolYear={schoolYear} tuitionFees={tuitionFees} user={user} />}
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
            <DollarSign className="w-10 h-10" />
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
              <div className="relative">
                <button
                  onClick={() => setShowTypeFilter(!showTypeFilter)}
                  className={`px-4 py-2 border rounded-lg transition-all text-sm font-medium ${
                    typeFilter !== 'all' ? 'border-[#c9a961] bg-[#faf8f5] text-[#1a2b4a]' : 'border-gray-200 hover:border-[#c9a961] hover:bg-[#faf8f5]'
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
              </div>
              <button
                onClick={handleExportTodaysPayments}
                className="px-4 py-2 bg-[#1a2b4a] text-white rounded-lg hover:bg-[#2d4263] transition-all text-sm font-medium"
              >
                <Download className="w-4 h-4 inline mr-2" />
                Export
              </button>
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
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
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
function ProcessPayment({ schoolYear, tuitionFees = DEFAULT_TUITION_FEES, user }: { schoolYear: string; tuitionFees?: Record<string, number>; user?: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentCategory, setPaymentCategory] = useState<'tuition' | 'enrollment_fee'>('tuition');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [schoolYearId, setSchoolYearId] = useState<string | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Official Receipt (OR) number, drawn from the range the Admin registered for this
  // school year in System Settings — so the system-recorded number matches the printed
  // physical booklet copy. Editable so the cashier can correct/skip a number by hand.
  const [orRange, setOrRange] = useState<{ start: string; end: string; next: string } | null>(null);
  const [nextReceiptNumber, setNextReceiptNumber] = useState('');
  const [editingReceiptNumber, setEditingReceiptNumber] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sy = await getSchoolYearByLabel(schoolYear);
      if (cancelled) return;
      if (sy?.or_range_start && sy?.or_range_end && sy?.or_next_number) {
        setOrRange({ start: sy.or_range_start, end: sy.or_range_end, next: sy.or_next_number });
        setNextReceiptNumber(sy.or_next_number);
      } else {
        setOrRange(null);
        setNextReceiptNumber('');
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
      name: `${b.firstName} ${b.lastName}`,
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

  const handleProcessPayment = async () => {
    if (!selectedStudent || !paymentAmount || !schoolYearId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // When the Admin has registered a physical OR range for this school year, issue
      // from it (so the system record matches the printed booklet copy); otherwise fall
      // back to the system's own auto-generated sequence.
      const newReceiptNumber = orRange ? (nextReceiptNumber.trim() || orRange.next) : await generateReceiptNumber();
      const { error } = await supabase.from('payments').insert({
        student_id: selectedStudent.id,
        school_year_id: schoolYearId,
        amount: parseFloat(paymentAmount),
        method: 'Cash',
        recorded_by: user?.employeeId || null,
        description: paymentCategory === 'enrollment_fee' ? 'Enrollment Fee' : 'Tuition Payment',
        receipt_number: newReceiptNumber,
        category: paymentCategory,
      });
      if (error) throw error;
      setReceiptNumber(newReceiptNumber);
      setShowReceipt(true);

      if (orRange) {
        // Advance the pointer to the next number in the range (best-effort numeric increment;
        // if the cashier typed a non-numeric override, just re-save what's there).
        const parsed = parseInt(newReceiptNumber, 10);
        const advanced = !isNaN(parsed) ? String(parsed + 1).padStart(newReceiptNumber.length, '0') : newReceiptNumber;
        const syRow = await getSchoolYearByLabel(schoolYear);
        if (syRow) {
          await supabase.from('school_years').update({ or_next_number: advanced }).eq('id', syRow.id);
        }
        setOrRange(prev => prev ? { ...prev, next: advanced } : prev);
        setNextReceiptNumber(advanced);
      }

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Student Search & Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">Select Student</h3>
            
            {/* Search Bar */}
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6b6456]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name or student ID..."
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#c9a961] focus:ring-4 focus:ring-[#c9a961]/10 outline-none transition-all"
              />
            </div>

            {/* Student List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {loading ? (
                <p className="text-sm text-[#8b8476] text-center py-8">Loading students...</p>
              ) : filteredStudents.length === 0 ? (
                <p className="text-sm text-[#8b8476] text-center py-8">No students found.</p>
              ) : filteredStudents.map((student) => (
                <button
                  key={student.id}
                  onClick={() => setSelectedStudent(student)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    selectedStudent?.id === student.id
                      ? 'border-[#c9a961] bg-[#c9a961]/5'
                      : 'border-gray-200 hover:border-[#c9a961]/50 hover:bg-[#faf8f5]'
                  }`}
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
          </div>

          {/* Payment Form */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">Payment Details</h3>

            {selectedStudent ? (
              <div className="space-y-4">
                {/* Student Summary */}
                <div className="p-4 bg-[#faf8f5] rounded-xl border border-gray-200">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#6b6456]">Student:</span>
                      <span className="font-semibold text-[#1a2b4a]">{selectedStudent.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6b6456]">Total Fee:</span>
                      <span className="font-semibold text-[#1a2b4a]">₱{selectedStudent.totalFee.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6b6456]">Already Paid:</span>
                      <span className="font-semibold text-green-600">₱{selectedStudent.paid.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6b6456]">Balance Due:</span>
                      <span className="font-semibold text-[#1a2b4a]">₱{selectedStudent.balance.toLocaleString()}</span>
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
                      <span className="font-bold text-red-600 text-lg">₱{(selectedStudent.balance + selectedStudent.penalties).toLocaleString()}</span>
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
                      max={selectedStudent.balance}
                      min={0}
                      className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#c9a961] focus:ring-4 focus:ring-[#c9a961]/10 outline-none transition-all text-lg font-semibold"
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button 
                      onClick={() => setPaymentAmount(String(selectedStudent.balance))}
                      className="px-3 py-1 bg-[#faf8f5] border border-gray-200 rounded-lg text-xs font-medium hover:bg-[#eae7e0] transition-all"
                    >
                      Full Balance
                    </button>
                    <button 
                      onClick={() => setPaymentAmount(String(selectedStudent.balance / 2))}
                      className="px-3 py-1 bg-[#faf8f5] border border-gray-200 rounded-lg text-xs font-medium hover:bg-[#eae7e0] transition-all"
                    >
                      Half Payment
                    </button>
                  </div>
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
                        onClick={() => setPaymentCategory(c.value as 'tuition' | 'enrollment_fee')}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                          paymentCategory === c.value
                            ? 'border-[#c9a961] bg-[#c9a961]/10 text-[#1a2b4a]'
                            : 'border-gray-200 text-[#6b6456] hover:border-[#c9a961]/50'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Official Receipt Number */}
                <div>
                  <label className="block text-sm font-semibold text-[#1a2b4a] mb-2">Official Receipt No.</label>
                  {orRange ? (
                    <div className="flex items-center gap-2">
                      {editingReceiptNumber ? (
                        <input
                          type="text"
                          value={nextReceiptNumber}
                          onChange={(e) => setNextReceiptNumber(e.target.value)}
                          onBlur={() => setEditingReceiptNumber(false)}
                          autoFocus
                          className="flex-1 px-4 py-3 border-2 border-[#c9a961] rounded-xl font-mono focus:outline-none focus:ring-4 focus:ring-[#c9a961]/10"
                        />
                      ) : (
                        <div className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl font-mono bg-[#faf8f5]">{nextReceiptNumber}</div>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingReceiptNumber(v => !v)}
                        title="Edit receipt number"
                        className="p-3 border-2 border-gray-200 rounded-xl hover:border-[#c9a961] transition-all"
                      >
                        <Edit className="w-4 h-4 text-[#6b6456]" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-[#8b8476]">No official receipt range is set for this school year — a system-generated number will be issued. Ask the Admin to register one in System Settings.</p>
                  )}
                </div>

                {/* Process Button */}
                {submitError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{submitError}</p>
                )}
                <button
                  onClick={handleProcessPayment}
                  disabled={submitting || !paymentAmount || parseFloat(paymentAmount) <= 0 || parseFloat(paymentAmount) > selectedStudent.balance}
                  className="w-full bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-5 h-5" />
                  {submitting ? 'Processing...' : 'Process Payment'}
                </button>
              </div>
            ) : (
              <div className="text-center py-12">
                <User className="w-16 h-16 text-[#6b6456] mx-auto mb-4" />
                <p className="text-[#6b6456] font-medium">Select a student to process payment</p>
                <p className="text-sm text-[#8b8476] mt-1">Search and select from the list on the left</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Receipt */
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border-2 border-[#c9a961] p-8">
            <div className="text-center mb-6 pb-6 border-b-2 border-dashed border-gray-300">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
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
                  <span className="text-green-900 font-semibold">Amount Paid:</span>
                  <span className="text-3xl font-bold text-green-700">₱{parseFloat(paymentAmount).toLocaleString()}</span>
                </div>
                <div className="mt-3 pt-3 border-t border-green-300 flex justify-between text-sm">
                  <span className="text-green-800">Payment Method:</span>
                  <span className="font-semibold text-green-900">Cash</span>
                </div>
              </div>

              <div className="p-4 bg-[#faf8f5] rounded-xl">
                <div className="flex justify-between mb-2">
                  <span className="text-[#6b6456]">Previous Balance:</span>
                  <span className="font-semibold text-[#1a2b4a]">₱{selectedStudent?.balance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-[#6b6456]">Amount Paid:</span>
                  <span className="font-semibold text-green-600">-₱{parseFloat(paymentAmount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-300">
                  <span className="font-semibold text-[#1a2b4a]">New Balance:</span>
                  <span className="font-bold text-[#1a2b4a] text-lg">
                    ₱{(selectedStudent?.balance - parseFloat(paymentAmount)).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center text-sm text-blue-800">
                <p className="font-semibold mb-1">Dumaguete Mission School</p>
                <p>Christian Truth, Shaping Lives...</p>
                <p className="text-xs mt-2">Academic Year {schoolYear}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowReceipt(false);
                  setSelectedStudent(null);
                  setPaymentAmount('');
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
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentsByStudent, setPaymentsByStudent] = useState<Record<string, { date: string; amount: number; method: string; reference: string }[]>>({});
  const [schoolYearId, setSchoolYearId] = useState<string | null>(null);

  // Each student's tuition is looked up from real student_charges (falling back to
  // the admin-configured tuitionFees for their grade), net of any scholarship on
  // file for the year; balance is derived so it stays consistent with what's
  // actually been charged and paid in the database.
  const loadStudents = async () => {
    setLoading(true);
    const syId = await fetchSchoolYearId(schoolYear);
    setSchoolYearId(syId);
    if (!syId) { setStudents([]); setPaymentsByStudent({}); setLoading(false); return; }

    const [balances, { data: payments }] = await Promise.all([
      fetchStudentBalances(syId, tuitionFees),
      supabase.from('payments').select('student_id, amount, method, or_number, paid_at').eq('school_year_id', syId).order('paid_at', { ascending: false }),
    ]);

    const byStudent: Record<string, { date: string; amount: number; method: string; reference: string }[]> = {};
    (payments || []).forEach((p: any) => {
      const list = byStudent[p.student_id] || (byStudent[p.student_id] = []);
      list.push({
        date: new Date(p.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        amount: Number(p.amount),
        method: p.method,
        reference: p.or_number || '-',
      });
    });
    setPaymentsByStudent(byStudent);

    setStudents(balances.map(b => ({
      id: b.id,
      name: `${b.firstName} ${b.lastName}`,
      grade: b.section ? `${b.gradeLevel}, ${b.section}` : b.gradeLevel,
      paid: b.paid,
      baseFee: b.baseFee,
      scholarship: b.scholarship,
      scholarshipDeduction: b.scholarshipDeduction,
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

  const [showScholarshipForm, setShowScholarshipForm] = useState(false);

  // Re-derives just one student's balance (cheaper than a full reload) after a
  // scholarship is added, edited, or removed, and keeps both the list row and
  // the open details modal in sync with the new net tuition.
  const refreshStudent = async (studentId: string) => {
    if (!schoolYearId) return;
    const balances = await fetchStudentBalances(schoolYearId, tuitionFees);
    const b = balances.find(x => x.id === studentId);
    if (!b) return;
    const mapped = {
      id: b.id,
      name: `${b.firstName} ${b.lastName}`,
      grade: b.section ? `${b.gradeLevel}, ${b.section}` : b.gradeLevel,
      paid: b.paid,
      baseFee: b.baseFee,
      scholarship: b.scholarship,
      scholarshipDeduction: b.scholarshipDeduction,
      totalFee: b.totalFee,
      balance: b.balance,
      status: b.status,
      lastPayment: b.lastPaymentDate
        ? new Date(b.lastPaymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'No payments yet',
      monthsOverdue: b.monthsOverdue,
      penalties: b.penalties,
    };
    setStudents(prev => prev.map(s => (s.id === studentId ? mapped : s)));
    setViewDetailsStudent((prev: any) => (prev && prev.id === studentId ? mapped : prev));
  };

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
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#c9a961] focus:ring-4 focus:ring-[#c9a961]/10 outline-none transition-all"
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
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Grade</th>
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
                <tr><td colSpan={9} className="px-6 py-8 text-center text-sm text-[#8b8476]">Loading student accounts...</td></tr>
              ) : filteredStudents.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-8 text-center text-sm text-[#8b8476]">No students found.</td></tr>
              ) : filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-[#faf8f5] transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-semibold text-[#1a2b4a]">{student.name}</p>
                      <p className="text-xs text-[#8b8476] font-mono">{student.id}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-[#6b6456]">{student.grade}</td>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-2xl w-full">
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Grade:</p>
                  <p className="font-semibold text-[#1a2b4a]">{viewDetailsStudent.grade}</p>
                </div>
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Total Fee:</p>
                  <p className="font-semibold text-[#1a2b4a]">₱{viewDetailsStudent.totalFee.toLocaleString()}</p>
                  {viewDetailsStudent.scholarshipDeduction > 0 && (
                    <p className="text-xs text-[#8b8476] mt-1">
                      (Base ₱{viewDetailsStudent.baseFee.toLocaleString()} − Scholarship ₱{viewDetailsStudent.scholarshipDeduction.toLocaleString()})
                    </p>
                  )}
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

              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-[#1a2b4a]">Scholarship</h3>
                  <button
                    onClick={() => setShowScholarshipForm(true)}
                    className="text-xs font-semibold text-[#c9a961] hover:text-[#b8994f]"
                  >
                    {viewDetailsStudent.scholarship ? 'Edit' : 'Add Scholarship'}
                  </button>
                </div>
                {viewDetailsStudent.scholarship ? (
                  <div className="bg-[#faf8f5] border border-gray-200 rounded-lg p-3 text-sm">
                    <p className="font-semibold text-[#1a2b4a]">{viewDetailsStudent.scholarship.scholarshipType}</p>
                    <p className="text-[#6b6456]">
                      {viewDetailsStudent.scholarship.amount != null
                        ? `₱${viewDetailsStudent.scholarship.amount.toLocaleString()} off`
                        : `${viewDetailsStudent.scholarship.percentDiscount}% off`}
                    </p>
                    {viewDetailsStudent.scholarship.notes && (
                      <p className="text-xs text-[#8b8476] mt-1">{viewDetailsStudent.scholarship.notes}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[#8b8476]">No scholarship on file — the original base fee applies.</p>
                )}
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-bold text-[#1a2b4a] mb-2">Payment History</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {paymentHistory.length === 0 && (
                    <p className="text-sm text-[#8b8476] py-4 text-center">No payments recorded yet.</p>
                  )}
                  {paymentHistory.map((payment, idx) => (
                    <div key={`${payment.date}-${idx}`} className="flex items-center justify-between px-4 py-2 bg-[#faf8f5] rounded-lg border border-gray-200 hover:shadow-md transition-all gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-6 h-6 text-white" />
                      </div>
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
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showScholarshipForm && viewDetailsStudent && (
        <ScholarshipFormModal
          studentId={viewDetailsStudent.id}
          studentName={viewDetailsStudent.name}
          schoolYearId={schoolYearId}
          baseFee={viewDetailsStudent.baseFee}
          existing={viewDetailsStudent.scholarship}
          onClose={() => setShowScholarshipForm(false)}
          onSaved={() => { setShowScholarshipForm(false); refreshStudent(viewDetailsStudent.id); }}
        />
      )}

      {/* Print Statement Modal */}
      {printStatementStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#1a2b4a]">Print Statement</h2>
              <button
                onClick={() => setPrintStatementStudent(null)}
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
                <h3 className="text-lg font-bold text-[#1a2b4a]">Payment History</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {paymentHistory.length === 0 && (
                    <p className="text-sm text-[#8b8476] py-4 text-center">No payments recorded yet.</p>
                  )}
                  {paymentHistory.map((payment, idx) => (
                    <div key={`${payment.date}-${idx}`} className="flex items-center justify-between px-4 py-2 bg-[#faf8f5] rounded-lg border border-gray-200 hover:shadow-md transition-all">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-6 h-6 text-white" />
                      </div>
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
          </div>
        </div>
      )}
    </div>
  );
}

// Add/Edit Scholarship — writes directly to the `scholarships` table (student_id,
// school_year_id, scholarship_type, amount OR percent_discount, notes). Only one of
// amount/percent_discount is saved at a time; fetchStudentBalances() picks whichever
// is set to compute the deduction, so switching modes here just nulls out the other.
function ScholarshipFormModal({ studentId, studentName, schoolYearId, baseFee, existing, onClose, onSaved }: {
  studentId: string;
  studentName: string;
  schoolYearId: string | null;
  baseFee: number;
  existing: Scholarship | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scholarshipType, setScholarshipType] = useState(existing?.scholarshipType ?? '');
  const [mode, setMode] = useState<'amount' | 'percent'>(existing?.percentDiscount != null ? 'percent' : 'amount');
  const [amount, setAmount] = useState(existing?.amount != null ? String(existing.amount) : '');
  const [percent, setPercent] = useState(existing?.percentDiscount != null ? String(existing.percentDiscount) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!schoolYearId) return;
    if (!scholarshipType.trim()) { setError('Please enter a scholarship type.'); return; }
    const amountValue = mode === 'amount' ? parseFloat(amount) : null;
    const percentValue = mode === 'percent' ? parseFloat(percent) : null;
    if (mode === 'amount' && (isNaN(amountValue as number) || (amountValue as number) < 0)) {
      setError('Please enter a valid deduction amount.');
      return;
    }
    if (mode === 'percent' && (isNaN(percentValue as number) || (percentValue as number) < 0 || (percentValue as number) > 100)) {
      setError('Please enter a valid percent between 0 and 100.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      student_id: studentId,
      school_year_id: schoolYearId,
      scholarship_type: scholarshipType.trim(),
      amount: amountValue,
      percent_discount: percentValue,
      notes: notes.trim() || null,
    };
    const { error: saveError } = existing
      ? await supabase.from('scholarships').update(payload).eq('id', existing.id)
      : await supabase.from('scholarships').insert(payload);
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    onSaved();
  };

  const handleRemove = async () => {
    if (!existing) return;
    setRemoving(true);
    setError(null);
    const { error: deleteError } = await supabase.from('scholarships').delete().eq('id', existing.id);
    setRemoving(false);
    if (deleteError) { setError(deleteError.message); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#1a2b4a]">{existing ? 'Edit' : 'Add'} Scholarship</h2>
            <p className="text-xs text-[#8b8476]">{studentName} · Base fee ₱{baseFee.toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-all">
            <XCircle className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#6b6456] mb-1">Scholarship Type</label>
            <input
              type="text"
              value={scholarshipType}
              onChange={e => setScholarshipType(e.target.value)}
              placeholder="e.g. Academic Scholarship, Sibling Discount"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setMode('amount')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border ${mode === 'amount' ? 'bg-[#1a2b4a] text-white border-[#1a2b4a]' : 'border-gray-200 text-[#6b6456]'}`}
            >
              Fixed Amount
            </button>
            <button
              onClick={() => setMode('percent')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border ${mode === 'percent' ? 'bg-[#1a2b4a] text-white border-[#1a2b4a]' : 'border-gray-200 text-[#6b6456]'}`}
            >
              Percent Discount
            </button>
          </div>

          {mode === 'amount' ? (
            <div>
              <label className="block text-xs font-medium text-[#6b6456] mb-1">Deduction Amount (₱)</label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-[#6b6456] mb-1">Percent Discount (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={percent}
                onChange={e => setPercent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#6b6456] mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            {existing && (
              <button
                onClick={handleRemove}
                disabled={removing || saving}
                className="px-4 py-2.5 border-2 border-red-200 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-all disabled:opacity-60"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || removing || !schoolYearId}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Scholarship'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Payment History
function PaymentHistory({ schoolYear, tuitionFees = DEFAULT_TUITION_FEES }: { schoolYear: string; tuitionFees?: Record<string, number> }) {
  const [dateFilter, setDateFilter] = useState('today');
  const [viewReceiptPayment, setViewReceiptPayment] = useState<any>(null);
  const [printReceiptPayment, setPrintReceiptPayment] = useState<any>(null);
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
          .select('id, student_id, amount, method, or_number, paid_at, recorded_by, students(first_name, last_name, grade_level, section)')
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
          studentId: p.student_id as string,
          grade: s?.grade_level ? (s.section ? `${s.grade_level}, ${s.section}` : s.grade_level) : '—',
          amount: Number(p.amount),
          balance: Math.max(totalFee - paidBefore, 0),
          method: p.method as string,
          cashier: p.recorded_by ? (employeeNames.get(p.recorded_by) || p.recorded_by) : 'Unassigned',
          reference: p.or_number || '-',
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
    if (dateFilter === 'all') return true;
    const diffDays = (latestDate.getTime() - new Date(p.date).getTime()) / (1000 * 60 * 60 * 24);
    if (dateFilter === 'today') return diffDays < 1;
    if (dateFilter === 'week') return diffDays < 7;
    if (dateFilter === 'month') return diffDays < 31;
    return true;
  });

  const handleExportReport = () => {
    downloadCsv(
      `payment_history_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Receipt No.', 'Date', 'Time', 'Student', 'Student ID', 'Amount', 'Reference', 'Cashier'],
      filteredPayments.map(p => [p.id, p.date, p.time, p.student, p.studentId, p.amount, p.reference, p.cashier])
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

      {/* Date Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex gap-2">
          <button
            onClick={() => setDateFilter('today')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              dateFilter === 'today' ? 'bg-[#1a2b4a] text-white' : 'bg-[#faf8f5] text-[#6b6456] hover:bg-[#eae7e0]'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setDateFilter('week')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              dateFilter === 'week' ? 'bg-[#1a2b4a] text-white' : 'bg-[#faf8f5] text-[#6b6456] hover:bg-[#eae7e0]'
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setDateFilter('month')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              dateFilter === 'month' ? 'bg-[#1a2b4a] text-white' : 'bg-[#faf8f5] text-[#6b6456] hover:bg-[#eae7e0]'
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => setDateFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              dateFilter === 'all' ? 'bg-[#1a2b4a] text-white' : 'bg-[#faf8f5] text-[#6b6456] hover:bg-[#eae7e0]'
            }`}
          >
            All Time
          </button>
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
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Reference</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Cashier</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-sm text-[#8b8476]">Loading payment history...</td></tr>
              ) : filteredPayments.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-sm text-[#8b8476]">No payments recorded for this period.</td></tr>
              ) : filteredPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-[#faf8f5] transition-colors">
                  <td className="px-6 py-4 font-mono text-sm font-semibold text-[#1a2b4a]">{payment.id.slice(0, 8).toUpperCase()}</td>
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
                  <td className="px-6 py-4 text-sm font-mono text-[#6b6456]">{payment.reference}</td>
                  <td className="px-6 py-4 text-sm text-[#6b6456]">{payment.cashier}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setViewReceiptPayment(payment)}
                        className="p-2 hover:bg-blue-50 rounded-lg transition-all"
                        title="View Receipt"
                      >
                        <Eye className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={() => setPrintReceiptPayment(payment)}
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

      {/* View Receipt Modal */}
      {viewReceiptPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#1a2b4a]">Payment Receipt</h2>
              <button
                onClick={() => setViewReceiptPayment(null)}
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
                  <p className="font-semibold text-[#1a2b4a]">{viewReceiptPayment.student}</p>
                  <p className="text-sm text-[#8b8476] font-mono">{viewReceiptPayment.studentId}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Receipt No.</p>
                  <p className="font-mono font-bold text-[#1a2b4a]">{viewReceiptPayment.id.slice(0, 8).toUpperCase()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[#6b6456] mb-1">Date & Time</p>
                  <p className="font-semibold text-[#1a2b4a]">
                    {new Date(`${viewReceiptPayment.date} ${viewReceiptPayment.time}`).toLocaleString('en-US', { 
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
                <p className="font-bold text-[#1a2b4a] text-lg">{viewReceiptPayment.student}</p>
                <p className="text-sm text-[#8b8476]">{viewReceiptPayment.grade}</p>
                <p className="text-xs text-[#8b8476] font-mono mt-1">ID: {viewReceiptPayment.studentId}</p>
              </div>
              <div className="p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-xl border-2 border-green-200">
                <p className="text-sm text-green-800 mb-2">Payment Details</p>
                <div className="flex justify-between items-center">
                  <span className="text-green-900 font-semibold">Amount Paid:</span>
                  <span className="text-3xl font-bold text-green-700">₱{parseFloat(viewReceiptPayment.amount).toLocaleString()}</span>
                </div>
                <div className="mt-3 pt-3 border-t border-green-300 flex justify-between text-sm">
                  <span className="text-green-800">Payment Method:</span>
                  <span className="font-semibold text-green-900 capitalize">{viewReceiptPayment.method.replace('_', ' ')}</span>
                </div>
                {viewReceiptPayment.reference && (
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-green-800">Reference No.:</span>
                    <span className="font-mono font-semibold text-green-900">{viewReceiptPayment.reference}</span>
                  </div>
                )}
              </div>
              <div className="p-4 bg-[#faf8f5] rounded-xl">
                <div className="flex justify-between mb-2">
                  <span className="text-[#6b6456]">Previous Balance:</span>
                  <span className="font-semibold text-[#1a2b4a]">₱{viewReceiptPayment.balance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-[#6b6456]">Amount Paid:</span>
                  <span className="font-semibold text-green-600">-₱{parseFloat(viewReceiptPayment.amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-300">
                  <span className="font-semibold text-[#1a2b4a]">New Balance:</span>
                  <span className="font-bold text-[#1a2b4a] text-lg">
                    ₱{(viewReceiptPayment.balance - parseFloat(viewReceiptPayment.amount)).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center text-sm text-blue-800">
                <p className="font-semibold mb-1">Dumaguete Mission School</p>
                <p>Christian Truth, Shaping Lives...</p>
                <p className="text-xs mt-2">Academic Year {schoolYear}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Receipt Modal */}
      {printReceiptPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#1a2b4a]">Payment Receipt</h2>
              <button
                onClick={() => setPrintReceiptPayment(null)}
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
                  <p className="font-semibold text-[#1a2b4a]">{printReceiptPayment.student}</p>
                  <p className="text-sm text-[#8b8476] font-mono">{printReceiptPayment.studentId}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-[#6b6456] mb-1">Receipt No.</p>
                  <p className="font-mono font-bold text-[#1a2b4a]">{printReceiptPayment.id.slice(0, 8).toUpperCase()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[#6b6456] mb-1">Date & Time</p>
                  <p className="font-semibold text-[#1a2b4a]">
                    {new Date(`${printReceiptPayment.date} ${printReceiptPayment.time}`).toLocaleString('en-US', { 
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
                <p className="font-bold text-[#1a2b4a] text-lg">{printReceiptPayment.student}</p>
                <p className="text-sm text-[#8b8476]">{printReceiptPayment.grade}</p>
                <p className="text-xs text-[#8b8476] font-mono mt-1">ID: {printReceiptPayment.studentId}</p>
              </div>
              <div className="p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-xl border-2 border-green-200">
                <p className="text-sm text-green-800 mb-2">Payment Details</p>
                <div className="flex justify-between items-center">
                  <span className="text-green-900 font-semibold">Amount Paid:</span>
                  <span className="text-3xl font-bold text-green-700">₱{parseFloat(printReceiptPayment.amount).toLocaleString()}</span>
                </div>
                <div className="mt-3 pt-3 border-t border-green-300 flex justify-between text-sm">
                  <span className="text-green-800">Payment Method:</span>
                  <span className="font-semibold text-green-900 capitalize">{printReceiptPayment.method.replace('_', ' ')}</span>
                </div>
                {printReceiptPayment.reference && (
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-green-800">Reference No.:</span>
                    <span className="font-mono font-semibold text-green-900">{printReceiptPayment.reference}</span>
                  </div>
                )}
              </div>
              <div className="p-4 bg-[#faf8f5] rounded-xl">
                <div className="flex justify-between mb-2">
                  <span className="text-[#6b6456]">Previous Balance:</span>
                  <span className="font-semibold text-[#1a2b4a]">₱{printReceiptPayment.balance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-[#6b6456]">Amount Paid:</span>
                  <span className="font-semibold text-green-600">-₱{parseFloat(printReceiptPayment.amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-300">
                  <span className="font-semibold text-[#1a2b4a]">New Balance:</span>
                  <span className="font-bold text-[#1a2b4a] text-lg">
                    ₱{(printReceiptPayment.balance - parseFloat(printReceiptPayment.amount)).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center text-sm text-blue-800">
                <p className="font-semibold mb-1">Dumaguete Mission School</p>
                <p>Christian Truth, Shaping Lives...</p>
                <p className="text-xs mt-2">Academic Year {schoolYear}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}