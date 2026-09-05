import { useState, useEffect } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { supabase } from '../supabase';
import { getCurrentSchoolYear, getSchoolYearByLabel } from '../lib/schoolYear';
import { fetchAssignedTeacherMap } from '../lib/schedule';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  LayoutDashboard, BookOpen, Calendar, Award, Download, User, Mail,
  Phone, MapPin, Clock, X, Eye, AlertCircle, LogOut
} from 'lucide-react';

type SubjectGrade = { subject: string; teacher: string; q1: number | null; q2: number | null; q3: number | null; q4: number | null; final: number | null; color: string };
type ScheduleItem = { time: string | null; subject: string | null; teacher: string | null; room: string | null };

// ---------------------------------------------------------------------------
// Palette cycled across subjects fetched from the DB (grades table has no
// color column, so we assign one client-side by index).
// ---------------------------------------------------------------------------
const SUBJECT_COLORS = [
  '#1a2b4a', '#7d1935', '#c9a961', '#2d4263', '#9b2847',
  '#d4af37', '#3e5776', '#b84860'
];

function computeOverallGPA(grades: SubjectGrade[]) {
  if (!grades.length) return '0.0';
  const total = grades.reduce((sum, g) => sum + (g.final ?? 0), 0);
  return (total / grades.length).toFixed(1);
}

function formatDate(value: any) {
  if (!value) return 'Not on file';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not on file';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function initialsFor(name: string | null | undefined) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export function StudentPortal({ user, onLogout = () => {} }: { user: any; onLogout?: () => void }) {
  const [activeView, setActiveView] = useState('overview');
  const [schoolYear, setSchoolYear] = useState('2025-2026');
  const [subjectGrades, setSubjectGrades] = useState<SubjectGrade[]>([]);

  const studentId = user?.studentId ?? user?.id ?? null;
  const gradeLevel = user?.grade ?? user?.student?.grade_level ?? null;
  const section = user?.student?.section ?? null;

  useEffect(() => {
    let cancelled = false;
    getCurrentSchoolYear().then((sy) => {
      if (!cancelled && sy) setSchoolYear(sy.label);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!studentId || !schoolYear || !gradeLevel || !section) return;
    let cancelled = false;

    (async () => {
      // Grades are tagged per school_years.id, so switching the year selector
      // must re-resolve the selected label to an id and filter by it — otherwise
      // every year shows the same (current-year) rows, including archived ones.
      const sy = await getSchoolYearByLabel(schoolYear);
      if (cancelled) return;
      if (!sy) {
        setSubjectGrades([]);
        return;
      }

      // Every subject assigned to the student's grade/section is listed, whether
      // or not the teacher has entered a grade yet — grades are left-joined in
      // below rather than driving which subjects show up.
      const { data: cssRows, error: cssError } = await supabase
        .from('class_section_subjects')
        .select('id, subjects(name), employees(full_name), class_sections!inner(grade_level, section_name, school_year_id)')
        .eq('class_sections.grade_level', gradeLevel)
        .eq('class_sections.section_name', section)
        .eq('class_sections.school_year_id', sy.id)
        .eq('archived', false);

      if (cancelled) return;
      if (cssError) {
        console.error('Failed to load class subjects', cssError);
        return;
      }

      const { data: gradeRows, error: gradeError } = await supabase
        .from('grades')
        .select('class_section_subject_id, q1, q2, q3, q4, final_grade')
        .eq('student_id', studentId)
        .eq('school_year_id', sy.id);

      if (cancelled) return;
      if (gradeError) {
        console.error('Failed to load grades', gradeError);
        return;
      }

      const gradesByCss = new Map((gradeRows ?? []).map((g: any) => [g.class_section_subject_id, g]));

      const mapped: SubjectGrade[] = (cssRows ?? [])
        .map((row: any, index: number) => {
          const g = gradesByCss.get(row.id);
          return {
            subject: row.subjects?.name ?? 'Subject',
            teacher: row.employees?.full_name ?? 'To Be Assigned',
            q1: g?.q1 != null ? Number(g.q1) : null,
            q2: g?.q2 != null ? Number(g.q2) : null,
            q3: g?.q3 != null ? Number(g.q3) : null,
            q4: g?.q4 != null ? Number(g.q4) : null,
            final: g?.final_grade != null ? Number(g.final_grade) : null,
            color: SUBJECT_COLORS[index % SUBJECT_COLORS.length]
          };
        })
        .sort((a, b) => a.subject.localeCompare(b.subject));

      setSubjectGrades(mapped);
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId, schoolYear, gradeLevel, section]);

  const overallGPA = computeOverallGPA(subjectGrades.filter((g) => g.final != null));

  // Restricts the header year-switcher to years this student actually has an enrollment
  // record for — a new student sees no prior years; a continuing student sees every year
  // back to whichever one they first enrolled in.
  const [availableYears, setAvailableYears] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    if (!studentId) { setAvailableYears(undefined); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('enrollments')
        .select('school_years(label)')
        .eq('student_id', studentId);
      if (cancelled) return;
      const labels = Array.from(new Set((data ?? []).map((r: any) => r.school_years?.label).filter(Boolean)));
      if (schoolYear && !labels.includes(schoolYear)) labels.push(schoolYear);
      setAvailableYears(labels);
    })();
    return () => { cancelled = true; };
  }, [studentId, schoolYear]);

  if (user?.enrollmentConfirmed === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf8f5] px-4">
        <div className="max-w-md text-center bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-[#1a2b4a] mb-2">Enrollment Not Yet Confirmed</h2>
          <p className="text-sm text-[#6b6456] mb-6">
            Your enrollment for the current school year has not been confirmed yet. Please visit the Registrar's Office to complete re-enrollment before accessing your portal.
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
    { id: 'grades', label: 'Grades & Progress', icon: Award },
    { id: 'schedule', label: 'Class Schedule', icon: Calendar },
    { id: 'profile', label: 'My Profile', icon: User }
  ];

  return (
    <DashboardLayout
      user={user}
      role="student"
      navigation={navigation}
      activeView={activeView}
      onViewChange={setActiveView}
      onLogout={onLogout}
      schoolYear={schoolYear}
      onSchoolYearChange={setSchoolYear}
      availableYears={availableYears}
    >
      {activeView === 'overview' && (
        <StudentOverview user={user} schoolYear={schoolYear} onNavigate={setActiveView} />
      )}
      {activeView === 'grades' && (
        <GradesProgress user={user} schoolYear={schoolYear} overallGPA={overallGPA} subjectGrades={subjectGrades} />
      )}
      {activeView === 'schedule' && <ScheduleView user={user} schoolYear={schoolYear} />}
      {activeView === 'profile' && (
        <ProfileView user={user} schoolYear={schoolYear} overallGPA={overallGPA} />
      )}
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------
// Small reusable read-only field for the profile grids
// ---------------------------------------------------------------------------
function Field({ label, value, highlight = false }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#6b6456] mb-2">{label}</label>
      <input
        type="text"
        value={value}
        readOnly
        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20 ${
          highlight
            ? 'border-[#c9a961] bg-[#c9a961]/5 font-semibold text-[#1a2b4a]'
            : 'border-gray-200 text-[#2c2c2c]'
        }`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Student Overview
// ---------------------------------------------------------------------------
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function StudentOverview({ user, onNavigate }: { user: any; schoolYear: string; onNavigate: (view: string) => void }) {
  const firstName = user.name?.split(' ')[0] || 'Student';
  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const todayAbbr = WEEKDAY_ABBR[new Date().getDay()];
  const [todayClasses, setTodayClasses] = useState<ScheduleItem[]>([]);

  const gradeLevel = user?.grade ?? user?.student?.grade_level ?? null;
  const section = user?.student?.section ?? null;

  useEffect(() => {
    if (!gradeLevel) return;
    let cancelled = false;

    (async () => {
      let query = supabase
        .from('schedules')
        .select('id, subject, teacher, days, time_label, room, school_years!inner(is_current)')
        .eq('grade_level', gradeLevel)
        .eq('school_years.is_current', true);

      if (section) {
        query = query.eq('section_name', section);
      }

      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        console.error('Failed to load schedule', error);
        return;
      }

      const teacherMap = await fetchAssignedTeacherMap(gradeLevel, section);
      if (cancelled) return;

      const mapped: ScheduleItem[] = (data ?? [])
        .filter((row: any) => Array.isArray(row.days) && row.days.includes(todayAbbr))
        .map((row: any) => ({
          time: row.time_label,
          subject: row.subject,
          teacher: teacherMap[row.subject] || row.teacher,
          room: row.room
        }));

      setTodayClasses(mapped);
    })();

    return () => {
      cancelled = true;
    };
  }, [gradeLevel, section, todayAbbr]);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-[#1e3a8a] rounded-xl p-5 sm:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Welcome back, {firstName}!</h1>
        <div className="flex items-center gap-4 sm:gap-6 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>{todayLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            <span>{user.grade}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{todayClasses.length} {todayClasses.length === 1 ? 'class' : 'classes'} today</span>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        {/* Today's Schedule */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a]">Today's Classes</h3>
            <button
              onClick={() => onNavigate('schedule')}
              className="text-sm text-[#c9a961] hover:text-[#b8994f] font-medium"
            >
              View Full Schedule
            </button>
          </div>
          <div className="space-y-3">
            {todayClasses.length === 0 && (
              <p className="text-sm text-[#8b8476]">No classes scheduled for today.</p>
            )}
            {todayClasses.map((classItem, index) => (
              <div
                key={index}
                className="flex items-center gap-3 sm:gap-4 p-4 bg-[#faf8f5] rounded-lg border border-gray-200 hover:border-[#c9a961] transition-all"
              >
                <div className="w-16 sm:w-20 flex-shrink-0">
                  <p className="text-xs font-semibold text-[#7d1935]">{formatTimeRange12(classItem.time)}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1a2b4a] truncate">{classItem.subject}</p>
                  <p className="text-sm text-[#6b6456] truncate">{classItem.teacher}</p>
                </div>
                <div className="text-xs text-[#8b8476] flex-shrink-0 max-w-[4.5rem] truncate text-right">{classItem.room}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grades & Progress
// ---------------------------------------------------------------------------
function GradesProgress({ user, schoolYear, overallGPA, subjectGrades }: { user: any; schoolYear: string; overallGPA: string; subjectGrades: SubjectGrade[] }) {
  const [showPreview, setShowPreview] = useState(false);

  const handleDownload = () => {
    const studentName = user?.name ?? 'Student';
    const studentId = user?.studentId ?? user?.id ?? 'Not on file';

    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('DUMAGUETE MISSION SCHOOL', 105, 18, { align: 'center' });

    doc.setFontSize(13);
    doc.text('ACADEMIC PROGRESS REPORT', 105, 27, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Student: ${studentName}`, 14, 40);
    doc.text(`Student ID: ${studentId}`, 14, 47);
    doc.text(`School Year: ${schoolYear}`, 14, 54);
    doc.text(`Overall GPA: ${overallGPA}`, 14, 61);

    autoTable(doc, {
      startY: 69,
      head: [['Subject', 'Teacher', 'Q1', 'Q2', 'Q3', 'Q4', 'Final']],
      body: subjectGrades.map((g) => [
        g.subject,
        g.teacher,
        g.q1 ?? '—',
        g.q2 ?? '—',
        g.q3 ?? '—',
        g.q4 ?? '—',
        g.final ?? '—',
      ]),
    });

    doc.save(`${studentName.replace(/\s+/g, '_')}_Grade_Report_${schoolYear}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Grades & Progress</h1>
        <p className="text-[#6b6456]">Track your academic performance and progress</p>
      </div>

      {/* Detailed Grades Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-[#1a2b4a]">Detailed Grade Report</h3>
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:border-[#fffff] hover:bg-[#1e3a8a] transition-all bg-[#1a2b4a] self-start sm:self-auto"
          >
            <Download className="w-4 h-4 text-white" />
            <span className="text-sm font-medium text-white">Download Report</span>
          </button>
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
              {subjectGrades.length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-center text-sm text-[#8b8476]" colSpan={7}>
                    No grades on file yet for this school year.
                  </td>
                </tr>
              )}
              {subjectGrades.map((grade, index) => (
                <tr key={index} className="hover:bg-[#faf8f5] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: grade.color }}></div>
                      <span className="font-medium text-[#2c2c2c]">{grade.subject}</span>
                    </div>
                  </td>
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
              {/* Overall GPA row — final average across every subject, also
                  shown in the Academic Information grid on My Profile. */}
              <tr className="bg-[#faf8f5]">
                <td className="px-6 py-4 font-bold text-[#1a2b4a]">Overall GPA</td>
                <td className="px-6 py-4" colSpan={5}></td>
                <td className="px-6 py-4 text-center">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-[#1a2b4a] text-white">
                    {overallGPA}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {showPreview && (
        <ReportPreviewModal
          grades={subjectGrades}
          overallGPA={overallGPA}
          schoolYear={schoolYear}
          onClose={() => setShowPreview(false)}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report preview modal — shown before the actual download
// ---------------------------------------------------------------------------
function ReportPreviewModal({ grades, overallGPA, schoolYear, onClose, onDownload }: { grades: SubjectGrade[]; overallGPA: string; schoolYear: string; onClose: () => void; onDownload: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-gray-200 sticky top-0 bg-white">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[#1a2b4a] flex items-center gap-2">
              {/* <Eye className="w-5 h-5 text-[#c9a961]" /> */}
              Report Preview
            </h3>
            <p className="text-xs text-[#8b8476] mt-1">School Year {schoolYear}</p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 -m-2 flex-shrink-0 text-[#8b8476] hover:text-[#7d1935]"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-[#1a2b4a]">Subject</th>
                <th className="text-left py-2 text-[#1a2b4a]">Teacher</th>
                <th className="text-center py-2 text-[#1a2b4a]">Q1</th>
                <th className="text-center py-2 text-[#1a2b4a]">Q2</th>
                <th className="text-center py-2 text-[#1a2b4a]">Q3</th>
                <th className="text-center py-2 text-[#1a2b4a]">Q4</th>
                <th className="text-center py-2 text-[#1a2b4a]">Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {grades.map((g, i) => (
                <tr key={i}>
                  <td className="py-2 text-[#2c2c2c]">{g.subject}</td>
                  <td className="py-2 text-[#6b6456]">{g.teacher}</td>
                  <td className="py-2 text-center text-[#2c2c2c]">{g.q1}</td>
                  <td className="py-2 text-center text-[#2c2c2c]">{g.q2}</td>
                  <td className="py-2 text-center text-[#2c2c2c]">{g.q3}</td>
                  <td className="py-2 text-center text-[#2c2c2c]">{g.q4}</td>
                  <td className="py-2 text-center font-semibold text-[#2c2c2c]">{g.final}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200">
                <td className="py-2 font-bold text-[#1a2b4a]">Overall GPA</td>
                <td className="py-2" colSpan={5}></td>
                <td className="py-2 text-center font-bold text-[#c9a961]">{overallGPA}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 p-4 sm:p-5 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#6b6456] hover:bg-[#faf8f5] rounded-lg"
          >
            Close
          </button>
          <button
            onClick={onDownload}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-[#1a2b4a] text-white text-sm font-medium rounded-lg hover:bg-[#24365c] transition-colors"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schedule View
// ---------------------------------------------------------------------------
// Converts a "HH:MM-HH:MM" 24-hour time_label into a 12-hour "h:mm AM - h:mm AM" range.
function formatTimeRange12(timeLabel: string | null): string {
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

const WEEK_DAYS = [
  { abbr: 'Mon', label: 'Monday' },
  { abbr: 'Tue', label: 'Tuesday' },
  { abbr: 'Wed', label: 'Wednesday' },
  { abbr: 'Thu', label: 'Thursday' },
  { abbr: 'Fri', label: 'Friday' }
];

function ScheduleView({ user }: { user: any; schoolYear: string }) {
  const [scheduleRows, setScheduleRows] = useState<any[]>([]);
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({});

  const gradeLevel = user?.grade ?? user?.student?.grade_level ?? null;
  const section = user?.student?.section ?? null;

  useEffect(() => {
    if (!gradeLevel) return;
    let cancelled = false;

    (async () => {
      let query = supabase
        .from('schedules')
        .select('id, subject, teacher, days, time_label, room, school_years!inner(is_current)')
        .eq('grade_level', gradeLevel)
        .eq('school_years.is_current', true);

      if (section) {
        query = query.eq('section_name', section);
      }

      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        console.error('Failed to load schedule', error);
        return;
      }
      setScheduleRows(data ?? []);

      const map = await fetchAssignedTeacherMap(gradeLevel, section);
      if (cancelled) return;
      setTeacherMap(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [gradeLevel, section]);

  const weeklySchedule = WEEK_DAYS.map(({ abbr, label }) => ({
    label,
    classes: scheduleRows
      .filter((row: any) => Array.isArray(row.days) && row.days.includes(abbr))
      .map((row: any) => ({
        time: row.time_label,
        subject: row.subject,
        teacher: teacherMap[row.subject] || row.teacher,
        room: row.room
      }))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }));

  const sectionLabel = [gradeLevel, section].filter(Boolean).join(', ');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Class Schedule</h1>
        <p className="text-[#6b6456]">Your weekly class schedule{sectionLabel ? ` • ${sectionLabel}` : ''}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <div className="grid grid-flow-col auto-cols-[minmax(200px,1fr)] lg:grid-flow-row lg:grid-cols-5 lg:auto-cols-auto gap-px bg-gray-200">
          {weeklySchedule.map(({ label, classes }) => (
            <div key={label} className="bg-white">
              <div className="bg-[#1e3a8a] p-4 text-center">
                <h3 className="font-semibold text-white">{label}</h3>
              </div>
              <div className="p-4 space-y-3">
                {classes.length === 0 && (
                  <p className="text-xs text-[#8b8476]">No classes.</p>
                )}
                {classes.map((item, index) => (
                  <div
                    key={index}
                    className="p-3 bg-[#faf8f5] rounded-lg border border-gray-200 hover:border-[#c9a961] transition-all"
                  >
                    <p className="text-xs font-semibold text-[#7d1935] mb-2">{formatTimeRange12(item.time)}</p>
                    <p className="text-sm font-medium text-[#1a2b4a] mb-1">{item.subject}</p>
                    <p className="text-xs text-[#8b8476] mb-1">{item.teacher}</p>
                    <p className="text-xs text-[#6b6456]">{item.room}</p>
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

// ---------------------------------------------------------------------------
// Profile View
// ---------------------------------------------------------------------------
function ProfileView({ user, schoolYear, overallGPA }: { user: any; schoolYear: string; overallGPA: string }) {
  // Full row from the `students` table, fetched once at login by
  // resolveIdentity() (src/lib/resolveRole.ts) — no extra Supabase call needed here.
  const student = user.student ?? {};

  const fullName = [student.first_name, student.middle_name, student.last_name]
    .filter(Boolean)
    .join(' ') || user.name || 'Not on file';
  const gradeLevel = [student.grade_level, student.section].filter(Boolean).join(', ') || user.grade || 'Not on file';
  const composeParentName = (p: any) => p ? [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ') || null : null;
  const motherName = composeParentName(student.mother_info);
  const fatherName = composeParentName(student.father_info);
  // guardian_name/guardian_phone on the student row are the *designated portal
  // contact* (may be the mother or father — see EnrollmentSection's handleEnroll),
  // not necessarily an actual Guardian. The real Guardian collected at enrollment,
  // if any, lives in guardian_info; fall back to N/A rather than the portal contact.
  const guardianName = composeParentName(student.guardian_info);
  const hasGuardian = Boolean(guardianName);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">My Profile</h1>
        <p className="text-[#6b6456]">View and manage your profile information</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-center mb-6">
            <div className="w-24 h-24 bg-[#1a2b4a] rounded-full mx-auto mb-4 flex items-center justify-center text-white text-3xl font-bold">
              {initialsFor(fullName)}
            </div>
            <h3 className="text-xl font-bold text-[#1a2b4a] mb-1">{fullName}</h3>
            <p className="text-sm text-[#8b8476] mb-2">{gradeLevel}</p>
            <p className="text-xs text-[#6b6456]">Student ID: {user.id}</p>
          </div>

          <div className="space-y-3 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-[#8b8476]" />
              <span className="text-[#6b6456]">{student.email || user.email || 'Not on file'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Phone className="w-4 h-4 text-[#8b8476]" />
              <span className="text-[#6b6456]">{student.phone || 'Not on file'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="w-4 h-4 text-[#8b8476]" />
              <span className="text-[#6b6456]">{student.home_address || 'Not on file'}</span>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Full Name" value={fullName} />
              <Field label="Date of Birth" value={formatDate(student.date_of_birth)} />
              <Field label="Gender" value={student.gender || 'Not on file'} />
              <Field label="Grade Level" value={gradeLevel} />
              <Field label="Nationality" value={student.nationality || 'Not on file'} />
              <Field label="Religion" value={student.religion || 'Not on file'} />
              <Field label="Home Address" value={student.home_address || 'Not on file'} />
            </div>
          </div>

          {/* Academic Information — Current GPA pulls from the same
              overallGPA computed in Grades & Progress. */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">Academic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Student ID" value={user.id} />
              <Field label="School Year" value={schoolYear} />
            </div>
          </div>

          {/* Parent/Guardian Information — shows Mother and Father details when
              filled up in the Enrollment form; N/A for whichever wasn't, alongside
              the designated Guardian on file (guardian_name/phone/email). */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a] mb-1">Parent/Guardian Information</h3>
            <p className="text-xs text-[#8b8476] mb-5">
              Authorized parent/guardian for student pick-up and communication
            </p>

            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-[#1a2b4a] mb-3">Mother</h4>
                {motherName ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Name" value={motherName} />
                    <Field label="Contact Number" value={student.mother_info?.phone || 'N/A'} />
                    <Field label="Occupation" value={student.mother_info?.occupation || 'N/A'} />
                  </div>
                ) : (
                  <Field label="Name" value="N/A" />
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold text-[#1a2b4a] mb-3">Father</h4>
                {fatherName ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Name" value={fatherName} />
                    <Field label="Contact Number" value={student.father_info?.phone || 'N/A'} />
                    <Field label="Occupation" value={student.father_info?.occupation || 'N/A'} />
                  </div>
                ) : (
                  <Field label="Name" value="N/A" />
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold text-[#1a2b4a] mb-3">Guardian</h4>
                {hasGuardian ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Name" value={guardianName} />
                    <Field label="Relationship" value={student.guardian_info?.relationship || 'N/A'} />
                    <Field label="Contact Number" value={student.guardian_info?.phone || 'N/A'} />
                  </div>
                ) : (
                  <Field label="Name" value="N/A" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}