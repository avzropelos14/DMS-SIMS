import { useState, useEffect } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { supabase } from '../supabase';
import { getCurrentSchoolYear, getSchoolYearByLabel } from '../lib/schoolYear';
import {
  LayoutDashboard, BookOpen, Calendar, Award, Download, User, Mail,
  Phone, MapPin, Clock, X, Eye, AlertCircle, LogOut
} from 'lucide-react';

type SubjectGrade = { subject: string; q1: number | null; q2: number | null; q3: number | null; q4: number | null; final: number | null; color: string };
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

  useEffect(() => {
    let cancelled = false;
    getCurrentSchoolYear().then((sy) => {
      if (!cancelled && sy) setSchoolYear(sy.label);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!studentId || !schoolYear) return;
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

      const { data, error } = await supabase
        .from('grades')
        .select(`
          id, q1, q2, q3, q4, final_grade,
          class_section_subjects (
            subjects ( name )
          )
        `)
        .eq('student_id', studentId)
        .eq('school_year_id', sy.id);

      if (cancelled) return;
      if (error) {
        console.error('Failed to load grades', error);
        return;
      }

      const mapped: SubjectGrade[] = (data ?? [])
        .map((row: any, index: number) => ({
          subject: row.class_section_subjects?.[0]?.subjects?.[0]?.name ?? row.class_section_subjects?.subjects?.name ?? 'Subject',
          q1: row.q1 != null ? Number(row.q1) : null,
          q2: row.q2 != null ? Number(row.q2) : null,
          q3: row.q3 != null ? Number(row.q3) : null,
          q4: row.q4 != null ? Number(row.q4) : null,
          final: row.final_grade != null ? Number(row.final_grade) : null,
          color: SUBJECT_COLORS[index % SUBJECT_COLORS.length]
        }))
        .sort((a, b) => a.subject.localeCompare(b.subject));

      setSubjectGrades(mapped);
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId, schoolYear]);

  const overallGPA = computeOverallGPA(subjectGrades.filter((g) => g.final != null));

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
    >
      {activeView === 'overview' && (
        <StudentOverview user={user} schoolYear={schoolYear} onNavigate={setActiveView} />
      )}
      {activeView === 'grades' && (
        <GradesProgress schoolYear={schoolYear} overallGPA={overallGPA} subjectGrades={subjectGrades} />
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

      const mapped: ScheduleItem[] = (data ?? [])
        .filter((row: any) => Array.isArray(row.days) && row.days.includes(todayAbbr))
        .map((row: any) => ({
          time: row.time_label,
          subject: row.subject,
          teacher: row.teacher,
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
      <div className="bg-[#1e3a8a] rounded-xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Welcome back, {firstName}!</h1>
        <div className="flex items-center gap-6 text-sm flex-wrap">
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
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
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
                className="flex items-center gap-4 p-4 bg-[#faf8f5] rounded-lg border border-gray-200 hover:border-[#c9a961] transition-all"
              >
                <div className="w-20 flex-shrink-0">
                  <p className="text-xs font-semibold text-[#7d1935]">{classItem.time}</p>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[#1a2b4a]">{classItem.subject}</p>
                  <p className="text-sm text-[#6b6456]">{classItem.teacher}</p>
                </div>
                <div className="text-xs text-[#8b8476]">{classItem.room}</div>
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
function GradesProgress({ schoolYear, overallGPA, subjectGrades }: { schoolYear: string; overallGPA: string; subjectGrades: SubjectGrade[] }) {
  const [showPreview, setShowPreview] = useState(false);

  const handleDownload = () => {
    const header = 'Subject,Q1,Q2,Q3,Q4,Final\n';
    const rows = subjectGrades
      .map((g) => `${g.subject},${g.q1 ?? ''},${g.q2 ?? ''},${g.q3 ?? ''},${g.q4 ?? ''},${g.final ?? ''}`)
      .join('\n');
    const footer = `\nOverall GPA,,,,,${overallGPA}`;
    const csvContent = header + rows + footer;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Grade_Report_${schoolYear}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Grades & Progress</h1>
        <p className="text-[#6b6456]">Track your academic performance and progress</p>
      </div>

      {/* Detailed Grades Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#1a2b4a]">Detailed Grade Report</h3>
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:border-[#fffff] hover:bg-[#1e3a8a] transition-all bg-[#1a2b4a]"
          >
            <Download className="w-4 h-4 text-white" />
            <span className="text-sm font-medium text-white">Download Report</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#faf8f5] border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Subject</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Q1</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Q2</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Q3</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Q4</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {subjectGrades.length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-center text-sm text-[#8b8476]" colSpan={6}>
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
                <td className="px-6 py-4" colSpan={4}></td>
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
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white">
          <div>
            <h3 className="text-lg font-semibold text-[#1a2b4a] flex items-center gap-2">
              <Eye className="w-5 h-5 text-[#c9a961]" />
              Report Preview
            </h3>
            <p className="text-xs text-[#8b8476] mt-1">School Year {schoolYear}</p>
          </div>
          <button onClick={onClose} className="text-[#8b8476] hover:text-[#7d1935]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-[#1a2b4a]">Subject</th>
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
                  <td className="py-2 text-center text-[#2c2c2c]">{g.q1}</td>
                  <td className="py-2 text-center text-[#2c2c2c]">{g.q2}</td>
                  <td className="py-2 text-center text-[#2c2c2c]">{g.q3}</td>
                  <td className="py-2 text-center text-[#2c2c2c]">{g.q4}</td>
                  <td className="py-2 text-center font-semibold text-[#2c2c2c]">{g.final}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200">
                <td className="py-2 font-bold text-[#1a2b4a]">Overall GPA</td>
                <td className="py-2" colSpan={4}></td>
                <td className="py-2 text-center font-bold text-[#c9a961]">{overallGPA}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#6b6456] hover:bg-[#faf8f5] rounded-lg"
          >
            Close
          </button>
          <button
            onClick={onDownload}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a2b4a] text-white text-sm font-medium rounded-lg hover:bg-[#24365c] transition-colors"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schedule View
// ---------------------------------------------------------------------------
const WEEK_DAYS = [
  { abbr: 'Mon', label: 'Monday' },
  { abbr: 'Tue', label: 'Tuesday' },
  { abbr: 'Wed', label: 'Wednesday' },
  { abbr: 'Thu', label: 'Thursday' },
  { abbr: 'Fri', label: 'Friday' }
];

function ScheduleView({ user }: { user: any; schoolYear: string }) {
  const [scheduleRows, setScheduleRows] = useState<any[]>([]);

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
        teacher: row.teacher,
        room: row.room
      }))
  }));

  const sectionLabel = [gradeLevel, section].filter(Boolean).join(', ');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Class Schedule</h1>
        <p className="text-[#6b6456]">Your weekly class schedule{sectionLabel ? ` • ${sectionLabel}` : ''}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-px bg-gray-200">
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
                    <p className="text-xs font-semibold text-[#7d1935] mb-2">{item.time}</p>
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
  const hasGuardian = Boolean(student.guardian_name);

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
              <Field label="Blood Type" value={student.blood_type || 'Not on file'} />
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
              <Field label="Current GPA" value={overallGPA} highlight />
            </div>
          </div>

          {/* Guardian Information */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a] mb-1">Guardian Information</h3>
            <p className="text-xs text-[#8b8476] mb-5">
              Authorized parent/guardian for student pick-up and communication
            </p>

            {hasGuardian ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Guardian Name" value={student.guardian_name} />
                <Field label="Relationship" value={student.guardian_relationship || 'Not on file'} />
                <Field label="Contact Number" value={student.guardian_phone || 'Not on file'} />
                <Field label="Email" value={student.guardian_email || 'Not on file'} />
              </div>
            ) : (
              <p className="text-sm text-[#8b8476]">No guardian on file.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}