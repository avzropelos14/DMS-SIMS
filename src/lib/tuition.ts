// Shared tuition-by-grade-level model used by the Admin System Settings (where the
// amounts are configured) and the Cashier Portal (where they're applied to students).

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export const TUITION_GRADE_GROUPS: { label: string; grades: string[] }[] = [
  { label: 'Primary Level', grades: ['Kinder 1', 'Kinder 2'] },
  { label: 'Elementary Level', grades: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'] },
  { label: 'High School Level', grades: ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'] },
];

export const ALL_TUITION_GRADE_LEVELS = TUITION_GRADE_GROUPS.flatMap(g => g.grades);

export const DEFAULT_TUITION_FEES: Record<string, number> = {
  'Kinder 1': 1000,
  'Kinder 2': 1000,
  'Grade 1': 2400,
  'Grade 2': 2400,
  'Grade 3': 2400,
  'Grade 4': 2400,
  'Grade 5': 2400,
  'Grade 6': 2400,
  'Grade 7': 4500,
  'Grade 8': 4500,
  'Grade 9': 4500,
  'Grade 10': 4500,
};

// Per-grade enrollment fee, admin-configured the same way as tuition (see
// enrollment_fees table). Defaults to 0 until an Admin sets real amounts in
// System Settings, so the Cashier never auto-fills a guessed figure.
export const DEFAULT_ENROLLMENT_FEES: Record<string, number> = Object.fromEntries(
  ALL_TUITION_GRADE_LEVELS.map(g => [g, 0])
);

// Pulls the canonical "Grade N" / "Kinder N" level out of labels like
// "Grade 4, Section A" or "Grade 4-A" so it can be looked up in the tuition map.
export function extractGradeLevel(label: string): string | null {
  const match = label.match(/(kinder|grade)\s*(\d+)/i);
  if (!match) return null;
  const word = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  return `${word} ${match[2]}`;
}

export function getTuitionForGrade(fees: Record<string, number>, label: string, fallback = 0): number {
  const key = extractGradeLevel(label);
  if (key && fees[key] != null) return fees[key];
  return fallback;
}

// Per-child tuition breakdown, split into one installment per month of the school
// year (from start_date through end_date), plus the Enrollment Fee as its own line.
// Shared by the Parent Portal's Billing & Payments detail table and its dashboard
// Tuition Details summary, so the totals/balances shown in both places always match.
export type TuitionBreakdownItem = { label: string; amount: number; remark: string; datePaid: string | null; dueDate: string | null };
export type TuitionBreakdown = { items: TuitionBreakdownItem[]; total: number; balance: number };

const LATE_PENALTY = 200;

export function useTuitionBreakdown(children: any[], schoolYear: string): Record<string, TuitionBreakdown> {
  const [breakdownByChild, setBreakdownByChild] = useState<Record<string, TuitionBreakdown>>({});

  useEffect(() => {
    let cancelled = false;

    function monthsInRange(startDate: string, endDate: string): { label: string; year: number; month: number }[] {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const months: { label: string; year: number; month: number }[] = [];
      let cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cur <= last) {
        months.push({ label: cur.toLocaleString('en-US', { month: 'short' }), year: cur.getFullYear(), month: cur.getMonth() });
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }
      return months;
    }

    // Applies `payments` (oldest first) against `amounts` in order, returning each
    // line's remark and the date it became fully paid. Used for the single-line
    // Enrollment Fee, where there's no "which month" to match against.
    function allocateWaterfall(payments: { amount: number; paid_at: string }[], amounts: number[]) {
      const results: { remark: string; datePaid: string | null }[] = [];
      let payIdx = 0;
      let payRemaining = payments[0]?.amount ?? 0;
      for (const amount of amounts) {
        let need = amount;
        let covered = 0;
        let datePaid: string | null = null;
        while (need > 0.01 && payIdx < payments.length) {
          const take = Math.min(payRemaining, need);
          covered += take;
          need -= take;
          payRemaining -= take;
          if (need <= 0.01) datePaid = payments[payIdx].paid_at;
          if (payRemaining <= 0.01) {
            payIdx++;
            payRemaining = payments[payIdx]?.amount ?? 0;
          }
        }
        const remark = need <= 0.01 ? 'PAID' : covered > 0 ? 'PARTIAL' : 'UNPAID';
        results.push({ remark, datePaid: remark === 'PAID' ? datePaid : null });
      }
      return results;
    }

    // Matches each tuition payment to the calendar month it was actually paid in
    // (paid_at's year/month), then compares what was paid that month against that
    // month's installment amount — so the parent's payment date, not payment order,
    // decides which month's line it settles.
    function allocateByMonth(payments: { amount: number; paid_at: string }[], months: { year: number; month: number }[], amounts: number[]) {
      const paidByKey = new Map<string, number>();
      const lastDateByKey = new Map<string, string>();
      payments.forEach((p) => {
        const d = new Date(p.paid_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        paidByKey.set(key, (paidByKey.get(key) ?? 0) + p.amount);
        if (!lastDateByKey.has(key) || p.paid_at > (lastDateByKey.get(key) as string)) lastDateByKey.set(key, p.paid_at);
      });
      return months.map((m, idx) => {
        const key = `${m.year}-${m.month}`;
        const paidForMonth = paidByKey.get(key) ?? 0;
        const amount = amounts[idx];
        const remark = paidForMonth >= amount - 0.01 ? 'PAID' : paidForMonth > 0 ? 'PARTIAL' : 'UNPAID';
        return { remark, datePaid: remark === 'PAID' ? (lastDateByKey.get(key) ?? null) : null };
      });
    }

    async function loadBreakdown() {
      const childIds = children.map((c: any) => c.id);
      if (childIds.length === 0) return;
      const { data: yearRow } = await supabase.from('school_years').select('id, start_date, end_date').eq('label', schoolYear).maybeSingle();
      const schoolYearId = yearRow?.id;

      const [{ data: payments }, { data: tuitionFees }, { data: enrollmentFees }] = await Promise.all([
        supabase.from('payments').select('student_id, amount, description, paid_at').in('student_id', childIds).eq('school_year_id', schoolYearId ?? '').order('paid_at', { ascending: true }),
        schoolYearId
          ? supabase.from('tuition_fees').select('grade_level, annual_fee').eq('school_year_id', schoolYearId)
          : Promise.resolve({ data: null } as any),
        schoolYearId
          ? supabase.from('enrollment_fees').select('grade_level, fee').eq('school_year_id', schoolYearId)
          : Promise.resolve({ data: null } as any),
      ]);
      if (cancelled) return;

      const months = yearRow?.start_date && yearRow?.end_date ? monthsInRange(yearRow.start_date, yearRow.end_date) : [];

      // Payments are tagged by description ('Enrollment Fee' vs 'Tuition Payment' — see
      // CashierPortal's ProcessPayment), so each pays down its own set of lines.
      const paymentsByChild = new Map<string, { amount: number; paid_at: string }[]>();
      const enrollmentPaymentsByChild = new Map<string, { amount: number; paid_at: string }[]>();
      (payments || []).forEach((p: any) => {
        const bucket = p.description === 'Enrollment Fee' ? enrollmentPaymentsByChild : paymentsByChild;
        const list = bucket.get(p.student_id) ?? [];
        list.push({ amount: Number(p.amount || 0), paid_at: p.paid_at });
        bucket.set(p.student_id, list);
      });

      const tuitionFeesMap = { ...DEFAULT_TUITION_FEES, ...Object.fromEntries((tuitionFees ?? []).map((f: any) => [f.grade_level, Number(f.annual_fee)])) };
      const enrollmentFeesMap = { ...DEFAULT_ENROLLMENT_FEES, ...Object.fromEntries((enrollmentFees ?? []).map((f: any) => [f.grade_level, Number(f.fee)])) };

      const result: Record<string, TuitionBreakdown> = {};
      children.forEach((child: any) => {
        const tuitionAnnual = getTuitionForGrade(tuitionFeesMap, child.gradeLevel);
        const enrollmentFeeAmount = getTuitionForGrade(enrollmentFeesMap, child.gradeLevel);

        // Split the annual tuition evenly across the school year's months; the last
        // month absorbs whatever peso remainder rounding leaves behind, so the
        // installments always sum back to the exact annual amount.
        const installmentAmounts = months.map((_, idx) => {
          const base = Math.floor(tuitionAnnual / (months.length || 1));
          return idx === months.length - 1 ? tuitionAnnual - base * (months.length - 1) : base;
        });

        const enrollmentPayments = enrollmentPaymentsByChild.get(child.id) ?? [];
        const [enrollmentResult] = enrollmentFeeAmount > 0 ? allocateWaterfall(enrollmentPayments, [enrollmentFeeAmount]) : [];

        const tuitionPayments = paymentsByChild.get(child.id) ?? [];
        const installmentResults = tuitionAnnual > 0 ? allocateByMonth(tuitionPayments, months, installmentAmounts) : [];

        const items: TuitionBreakdownItem[] = [];
        if (tuitionAnnual > 0) items.push({ label: 'Tuition Fee', amount: tuitionAnnual, remark: '', datePaid: null, dueDate: null });
        if (enrollmentFeeAmount > 0) items.push({ label: 'Enrollment Fee', amount: enrollmentFeeAmount, remark: enrollmentResult.remark, datePaid: enrollmentResult.datePaid, dueDate: null });

        // Each monthly installment is due the last day of its month; if it's still not
        // fully paid once that due date passes, a flat late penalty is tacked onto
        // that month's line and folded into the running total/balance. Transferees
        // and late enrollees aren't liable for penalties on months before they were
        // actually enrolled — they were never late for a due date they weren't around for.
        const today = new Date();
        const enrolledAt = child.enrolledDate ? new Date(child.enrolledDate) : null;
        let totalPenalty = 0;
        months.forEach((m, idx) => {
          const monthEnd = new Date(m.year, m.month + 1, 0);
          const dueDate = monthEnd;
          const remark = installmentResults[idx]?.remark ?? 'UNPAID';
          const wasEnrolledThatMonth = !enrolledAt || enrolledAt <= monthEnd;
          const isOverdue = remark !== 'PAID' && today > dueDate && wasEnrolledThatMonth;
          const amount = installmentAmounts[idx] + (isOverdue ? LATE_PENALTY : 0);
          if (isOverdue) totalPenalty += LATE_PENALTY;
          items.push({
            label: `${m.label} Installment`,
            amount,
            remark: isOverdue ? 'OVERDUE' : remark,
            datePaid: installmentResults[idx]?.datePaid ?? null,
            dueDate: dueDate.toISOString(),
          });
        });

        const total = enrollmentFeeAmount + tuitionAnnual + totalPenalty;
        const paidTotal = enrollmentPayments.reduce((s, p) => s + p.amount, 0) + tuitionPayments.reduce((s, p) => s + p.amount, 0);

        result[child.id] = { items, total, balance: Math.max(total - paidTotal, 0) };
      });
      setBreakdownByChild(result);
    }
    loadBreakdown();
    return () => { cancelled = true; };
  }, [children, schoolYear]);

  return breakdownByChild;
}
