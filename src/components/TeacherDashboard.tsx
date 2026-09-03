import { useState, useEffect } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { StaffProfileView } from './StaffProfileView';
import { supabase } from '../supabase';
import { getCurrentSchoolYear, getSchoolYearByLabel } from '../lib/schoolYear';
import {
  LayoutDashboard, BookOpen, Users, Calendar, FileText,
  Clock, Edit, X, Download, Search, CheckCircle,
  AlertCircle, Printer, History, User, LayoutGrid, List, Filter
} from 'lucide-react';
import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TeacherDashboardProps {
  user: any;
  onLogout: () => void;
}

export function TeacherDashboard({ user, onLogout }: TeacherDashboardProps) {
  const [activeView, setActiveView] = useState('overview');
  const [schoolYear, setSchoolYear] = useState('2025-2026');

  useEffect(() => {
    getCurrentSchoolYear().then((sy) => { if (sy) setSchoolYear(sy.label); });
  }, []);

  const navigation = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'classes', label: 'My Classes', icon: Users },
    { id: 'schedule', label: 'Class Schedule', icon: Calendar },
    { id: 'profile', label: 'My Profile', icon: User }
  ];

  return (
    <DashboardLayout
      user={user}
      role="teacher"
      navigation={navigation}
      activeView={activeView}
      onViewChange={setActiveView}
      onLogout={onLogout}
      schoolYear={schoolYear}
      onSchoolYearChange={setSchoolYear}
    >
      {activeView === 'overview' && <TeacherOverview user={user} schoolYear={schoolYear} onViewSchedule={() => setActiveView('schedule')} />}
      {activeView === 'classes' && <MyClasses user={user} schoolYear={schoolYear} />}
      {activeView === 'schedule' && <ClassSchedule user={user} schoolYear={schoolYear} />}
      {activeView === 'profile' && <StaffProfileView user={user} color="#7d1935" />}
    </DashboardLayout>
  );
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Teacher Overview
function TeacherOverview({ user, schoolYear, onViewSchedule }: any) {
  const [stats, setStats] = useState([
    { label: 'My Classes', value: '—', icon: BookOpen, color: 'from-[#7d1935] to-[#9b2847]' },
    { label: 'Total Students', value: '—', icon: Users, color: 'from-[#1a2b4a] to-[#2d4263]' }
  ]);
  const [todaySchedule, setTodaySchedule] = useState<{ time: string; class: string; subject: string; room: string }[]>([]);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const sy = schoolYear ? await getSchoolYearByLabel(schoolYear) : await getCurrentSchoolYear();
      if (!sy) return;

      // My Classes + Total Students, scoped to this teacher's assigned class_section_subjects
      const { data: css } = await supabase
        .from('class_section_subjects')
        .select('id, class_sections!inner(grade_level, section_name, school_year_id)')
        .eq('teacher_id', user.employeeId ?? '__none__')
        .eq('class_sections.school_year_id', sy.id)
        .eq('archived', false);

      const classRows = (css ?? []) as any[];
      let totalStudents = 0;
      if (classRows.length > 0) {
        const seenSections = new Set<string>();
        for (const row of classRows) {
          const key = `${row.class_sections.grade_level}::${row.class_sections.section_name}`;
          if (seenSections.has(key)) continue;
          seenSections.add(key);
        }
        const counts = await Promise.all(Array.from(seenSections).map(async (key) => {
          const [gradeLevel, sectionName] = key.split('::');
          const { count } = await supabase
            .from('enrollments')
            .select('student_id, students!inner(status)', { count: 'exact', head: true })
            .eq('school_year_id', sy.id)
            .eq('grade_level', gradeLevel)
            .eq('section', sectionName)
            .eq('students.status', 'Active');
          return count ?? 0;
        }));
        totalStudents = counts.reduce((a, b) => a + b, 0);
      }

      if (active) {
        setStats([
          { label: 'My Classes', value: String(classRows.length), icon: BookOpen, color: 'from-[#7d1935] to-[#9b2847]' },
          { label: 'Total Students', value: String(totalStudents), icon: Users, color: 'from-[#1a2b4a] to-[#2d4263]' }
        ]);
      }

      // Today's schedule, matched by this teacher's name (schedules.teacher is a plain text column)
      const { data: scheduleRows } = await supabase
        .from('schedules')
        .select('*')
        .eq('school_year_id', sy.id)
        .eq('teacher', user.name);

      const todayShort = WEEKDAY_SHORT[new Date().getDay()];
      const todays = (scheduleRows ?? [])
        .filter((row: any) => Array.isArray(row.days) && row.days.includes(todayShort))
        .map((row: any) => ({
          time: row.time_label,
          class: `${row.grade_level} ${row.section_name}`,
          subject: row.subject,
          room: row.room ?? '—'
        }));

      if (active) {
        setTodaySchedule(todays);
        setScheduleLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [user.employeeId, user.name, schoolYear]);

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-[#7d1935] to-[#9b2847] rounded-xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Welcome back, {user.name.split(' ')[1]}!</h1>
        <p className="text-white/90">Here's what's happening in your classes today</p>
        <div className="mt-4 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>{WEEKDAYS[new Date().getDay()]}, {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{scheduleLoaded ? `${todaySchedule.length} class${todaySchedule.length === 1 ? '' : 'es'} scheduled` : 'Loading schedule…'}</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-lg flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-[#2c2c2c] mb-1">{stat.value}</h3>
              <p className="text-sm text-[#8b8476]">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a]">Today's Schedule</h3>
            <button onClick={onViewSchedule} className="text-sm text-[#c9a961] hover:text-[#b8994f] font-medium cursor-pointer">
              View Full Schedule
            </button>
          </div>
          <div className="space-y-3">
            {todaySchedule.length === 0 && (
              <p className="text-sm text-[#8b8476] text-center py-6">
                {scheduleLoaded ? 'No classes scheduled for today.' : 'Loading…'}
              </p>
            )}
            {todaySchedule.map((item, index) => (
              <div key={index} className="flex items-center gap-4 p-4 bg-[#faf8f5] rounded-lg border border-gray-200 hover:border-[#c9a961] transition-all">
                <div className="w-24 flex-shrink-0">
                  <p className="text-xs font-semibold text-[#7d1935]">{formatTimeRange12(item.time)}</p>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[#1a2b4a]">{item.class}</p>
                  <p className="text-sm text-[#6b6456]">{item.subject}</p>
                </div>
                <div className="text-xs text-[#8b8476]">{item.room}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// My Classes Section
function MyClasses({ user, schoolYear }: any) {
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [showHistoricalReport, setShowHistoricalReport] = useState(false);
  const [showCurrentReport, setShowCurrentReport] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [remarksFilter, setRemarksFilter] = useState<'all' | 'passed' | 'failed' | 'pending'>('all');
  const [classListSearch, setClassListSearch] = useState('');
  const [classViewMode, setClassViewMode] = useState<'table' | 'card'>('table');
  const [classGradeFilter, setClassGradeFilter] = useState<string>('all');
  const [showClassFilterPanel, setShowClassFilterPanel] = useState(false);

  type TeacherClass = { id: string; name: string; students: number; schedule: string; room: string; gradeLevel: string; sectionName: string; isAdvisory?: boolean };
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [currentSchoolYearId, setCurrentSchoolYearId] = useState<string | null>(null);

  // Advisory Class: the single section (if any) where the admin assigned this
  // teacher as adviser. Kept separate from subject classes since it isn't tied
  // to a class_section_subject row — the adviser oversees the whole homeroom.
  const [advisoryClasses, setAdvisoryClasses] = useState<TeacherClass[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const sy = schoolYear ? await getSchoolYearByLabel(schoolYear) : await getCurrentSchoolYear();
      if (!sy) return;

      const { data: sections } = await supabase
        .from('class_sections')
        .select('id, grade_level, section_name, room')
        .eq('adviser_id', user.employeeId ?? '__none__')
        .eq('school_year_id', sy.id);

      const built = await Promise.all((sections ?? []).map(async (sec: any) => {
        const { count } = await supabase
          .from('enrollments')
          .select('student_id, students!inner(status)', { count: 'exact', head: true })
          .eq('school_year_id', sy.id)
          .eq('grade_level', sec.grade_level)
          .eq('section', sec.section_name)
          .eq('students.status', 'Active');

        return {
          id: `advisory:${sec.id}`,
          name: `${sec.grade_level} ${sec.section_name} (Advisory Class)`,
          students: count ?? 0,
          schedule: 'Homeroom',
          room: sec.room ?? '—',
          gradeLevel: sec.grade_level,
          sectionName: sec.section_name,
          isAdvisory: true,
        };
      }));

      if (active) setAdvisoryClasses(built);
    })();
    return () => { active = false; };
  }, [user.employeeId, schoolYear]);

  const allClasses = [...advisoryClasses, ...classes];

  useEffect(() => {
    let active = true;
    (async () => {
      const sy = schoolYear ? await getSchoolYearByLabel(schoolYear) : await getCurrentSchoolYear();
      if (!sy) { if (active) setClassesLoaded(true); return; }
      if (active) setCurrentSchoolYearId(sy.id);

      const { data: css } = await supabase
        .from('class_section_subjects')
        .select('id, class_sections!inner(grade_level, section_name, room, school_year_id), subjects(name)')
        .eq('teacher_id', user.employeeId ?? '__none__')
        .eq('class_sections.school_year_id', sy.id)
        .eq('archived', false);

      const rows = (css ?? []) as any[];
      const { data: scheduleRows } = await supabase.from('schedules').select('*').eq('school_year_id', sy.id);

      const built = await Promise.all(rows.map(async (row) => {
        const gradeLevel = row.class_sections.grade_level;
        const sectionName = row.class_sections.section_name;
        const subjectName = row.subjects?.name ?? 'Subject';

        const { count } = await supabase
          .from('enrollments')
          .select('student_id, students!inner(status)', { count: 'exact', head: true })
          .eq('school_year_id', sy.id)
          .eq('grade_level', gradeLevel)
          .eq('section', sectionName)
          .eq('students.status', 'Active');

        const matchingSchedule = (scheduleRows ?? []).find((s: any) =>
          s.grade_level === gradeLevel && s.section_name === sectionName && s.subject === subjectName
        );
        const schedule = matchingSchedule
          ? `${(matchingSchedule.days ?? []).join(', ')} - ${formatTimeRange12(matchingSchedule.time_label)}`
          : 'Not yet scheduled';

        return {
          id: row.id as string,
          name: `${gradeLevel} ${sectionName} ${subjectName}`,
          students: count ?? 0,
          schedule,
          room: row.class_sections.room ?? matchingSchedule?.room ?? '—',
          gradeLevel,
          sectionName,
        };
      }));

      if (active) {
        setClasses(built);
        setClassesLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [user.employeeId, schoolYear]);

  // Teachers input the quarter grade directly, and only the quarter the admin has
  // designated "open" can be entered — every other quarter is locked once a grade has
  // been confirmed for it. A teacher who made a mistake can request the admin reopen a
  // locked quarter instead of editing it directly.
  type QuarterKey = 'q1' | 'q2' | 'q3' | 'q4';
  type QuarterStatus = 'locked' | 'editable' | 'not_open' | 'reopen_requested';
  type QuarterRecord = { status: QuarterStatus; score: number | null };

  // Set by the admin in Academic Configuration (grading_periods table); the
  // teacher dashboard only reads which quarter is currently open for grade input.
  const [adminOpenQuarter, setAdminOpenQuarter] = useState<QuarterKey | null>(null);
  const [gradingPeriodsLoaded, setGradingPeriodsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const sy = schoolYear ? await getSchoolYearByLabel(schoolYear) : await getCurrentSchoolYear();
      if (!sy) { if (active) setGradingPeriodsLoaded(true); return; }
      const { data: gp } = await supabase.from('grading_periods').select('quarter').eq('school_year_id', sy.id).eq('is_open', true).limit(1).maybeSingle();
      if (active) {
        setAdminOpenQuarter((gp?.quarter as QuarterKey | undefined) ?? null);
        setGradingPeriodsLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [schoolYear]);

  const QUARTER_LABELS: Record<QuarterKey, string> = { q1: 'Quarter 1', q2: 'Quarter 2', q3: 'Quarter 3', q4: 'Quarter 4' };

  const lockedQuarter = (score: number): QuarterRecord => ({ status: 'locked', score });
  const isQuarterOpen = (q: QuarterKey): boolean => q === adminOpenQuarter;
  const pendingQuarter = (q: QuarterKey): QuarterRecord => ({ status: isQuarterOpen(q) ? 'editable' : 'not_open', score: null });

  const computeFinal = (quarters: Record<QuarterKey, QuarterRecord>) => {
    const scores = (['q1', 'q2', 'q3', 'q4'] as QuarterKey[]).map(q => quarters[q].score).filter((s): s is number => s !== null);
    if (scores.length === 0) return null;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  };

  type GradeRow = {
    id: string;
    studentId: string;
    student: string;
    grade: string;
    section: string;
    gradeRowId: string | null;
    quarters: Record<QuarterKey, QuarterRecord>;
    final: number | null;
  };

  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [gradesLoaded, setGradesLoaded] = useState(false);

  // Fetch the real roster + grades for the selected class whenever the selection,
  // school year, or admin-open quarter changes.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedClass || !currentSchoolYearId || selectedClass.startsWith('advisory:')) { setGrades([]); return; }
      setGradesLoaded(false);
      const classInfo = classes.find(c => c.id === selectedClass);
      if (!classInfo) { if (active) { setGrades([]); setGradesLoaded(true); } return; }

      const { data: enrollRows } = await supabase
        .from('enrollments')
        .select('student_id, grade_level, section, students!inner(id, first_name, last_name, status)')
        .eq('school_year_id', currentSchoolYearId)
        .eq('grade_level', classInfo.gradeLevel)
        .eq('section', classInfo.sectionName)
        .eq('students.status', 'Active');

      const studentsData = (enrollRows ?? [])
        .map((r: any) => ({ id: r.students.id, first_name: r.students.first_name, last_name: r.students.last_name, grade_level: r.grade_level, section: r.section }))
        .sort((a: any, b: any) => a.last_name.localeCompare(b.last_name));

      const { data: gradesData } = await supabase
        .from('grades')
        .select('*')
        .eq('class_section_subject_id', selectedClass)
        .eq('school_year_id', currentSchoolYearId);

      // Reopen requests the admin has already approved make that one quarter editable again
      // regardless of which quarter is globally open; still-pending ones just flag the cell
      // so the teacher can see the request is in flight.
      const { data: reopenData } = await supabase
        .from('grade_reopen_requests')
        .select('student_id, quarter, status')
        .eq('class_section_subject_id', selectedClass)
        .eq('school_year_id', currentSchoolYearId)
        .in('status', ['pending', 'approved']);

      const reopenByStudentQuarter = new Map((reopenData ?? []).map((r: any) => [`${r.student_id}:${r.quarter}`, r.status]));

      const gradesByStudent = new Map((gradesData ?? []).map((g: any) => [g.student_id, g]));

      const built: GradeRow[] = (studentsData ?? []).map((s: any) => {
        const g = gradesByStudent.get(s.id);
        const quarters = {} as Record<QuarterKey, QuarterRecord>;
        (['q1', 'q2', 'q3', 'q4'] as QuarterKey[]).forEach((q) => {
          const val = g?.[q];
          const reopenStatus = reopenByStudentQuarter.get(`${s.id}:${q}`);
          if (val !== null && val !== undefined && reopenStatus === 'approved') {
            quarters[q] = { status: 'editable', score: Number(val) };
          } else if (val !== null && val !== undefined && reopenStatus === 'pending') {
            quarters[q] = { status: 'reopen_requested', score: Number(val) };
          } else {
            quarters[q] = val !== null && val !== undefined ? lockedQuarter(Number(val)) : pendingQuarter(q);
          }
        });
        const final = g?.final_grade !== null && g?.final_grade !== undefined ? Number(g.final_grade) : computeFinal(quarters);
        return {
          id: s.id,
          studentId: s.id,
          student: `${s.first_name} ${s.last_name}`,
          grade: s.grade_level,
          section: s.section ?? '',
          gradeRowId: g?.id ?? null,
          quarters,
          final,
        };
      });

      if (active) {
        setGrades(built);
        setGradesLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [selectedClass, classes, currentSchoolYearId, gradingPeriodsLoaded, adminOpenQuarter]);

  // Advisory roster + quarter averages: the adviser isn't the subject teacher for any
  // one class_section_subject, so instead of per-subject grade entry, each quarter
  // shows the student's average across all their subjects that quarter.
  type AdvisoryRow = {
    id: string;
    studentId: string;
    student: string;
    grade: string;
    section: string;
    quarters: Record<QuarterKey, number | null>;
    final: number | null;
  };
  const [advisoryRows, setAdvisoryRows] = useState<AdvisoryRow[]>([]);
  const [advisoryRowsLoaded, setAdvisoryRowsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedClass || !selectedClass.startsWith('advisory:') || !currentSchoolYearId) { setAdvisoryRows([]); return; }
      setAdvisoryRowsLoaded(false);
      const info = advisoryClasses.find(c => c.id === selectedClass);
      if (!info) { if (active) { setAdvisoryRows([]); setAdvisoryRowsLoaded(true); } return; }

      const { data: enrollRows } = await supabase
        .from('enrollments')
        .select('student_id, grade_level, section, students!inner(id, first_name, last_name, status)')
        .eq('school_year_id', currentSchoolYearId)
        .eq('grade_level', info.gradeLevel)
        .eq('section', info.sectionName)
        .eq('students.status', 'Active');

      const studentsData = (enrollRows ?? [])
        .map((r: any) => ({ id: r.students.id, first_name: r.students.first_name, last_name: r.students.last_name, grade_level: r.grade_level, section: r.section }))
        .sort((a: any, b: any) => a.last_name.localeCompare(b.last_name));

      const studentIds = (studentsData ?? []).map((s: any) => s.id);
      const { data: gradesData } = studentIds.length
        ? await supabase.from('grades').select('student_id, q1, q2, q3, q4, final_grade').eq('school_year_id', currentSchoolYearId).in('student_id', studentIds)
        : { data: [] as any[] };

      const gradesByStudent = new Map<string, any[]>();
      (gradesData ?? []).forEach((g: any) => {
        const list = gradesByStudent.get(g.student_id) ?? [];
        list.push(g);
        gradesByStudent.set(g.student_id, list);
      });

      const avg = (nums: number[]) => nums.length === 0 ? null : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;

      const built: AdvisoryRow[] = (studentsData ?? []).map((s: any) => {
        const rows = gradesByStudent.get(s.id) ?? [];
        const quarters = {} as Record<QuarterKey, number | null>;
        (['q1', 'q2', 'q3', 'q4'] as QuarterKey[]).forEach((q) => {
          const vals = rows.map((r) => r[q]).filter((v: any): v is number => v !== null && v !== undefined).map(Number);
          quarters[q] = avg(vals);
        });
        const finals = rows.map((r) => r.final_grade).filter((v: any): v is number => v !== null && v !== undefined).map(Number);
        return {
          id: s.id,
          studentId: s.id,
          student: `${s.first_name} ${s.last_name}`,
          grade: s.grade_level,
          section: s.section ?? '',
          quarters,
          final: avg(finals),
        };
      });

      if (active) {
        setAdvisoryRows(built);
        setAdvisoryRowsLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [selectedClass, advisoryClasses, currentSchoolYearId]);

  const [gradeModal, setGradeModal] = useState<{ studentId: string; quarter: QuarterKey } | null>(null);
  const [gradeInput, setGradeInput] = useState(0);
  const [reopenTarget, setReopenTarget] = useState<{ studentId: string; quarter: QuarterKey } | null>(null);

  const openGradeInput = (studentId: string, quarter: QuarterKey) => {
    setGradeModal({ studentId, quarter });
    setGradeInput(50);
    setGradeInputError(null);
  };

  const clampScore = (v: string) => Math.max(0, Math.min(100, parseFloat(v) || 0));

  const [gradeInputError, setGradeInputError] = useState<string | null>(null);

  const confirmGradeInput = async () => {
    if (!gradeModal || !selectedClass || !currentSchoolYearId) return;
    if (gradeInput < 50) {
      setGradeInputError('Grade must be at least 50 to submit.');
      return;
    }
    const target = grades.find(s => s.id === gradeModal.studentId);
    if (!target) return;
    const score = gradeInput;
    const quarters = { ...target.quarters, [gradeModal.quarter]: { status: 'locked' as QuarterStatus, score } };
    const final = computeFinal(quarters);

    const quarterColumns = {
      q1: quarters.q1.score,
      q2: quarters.q2.score,
      q3: quarters.q3.score,
      q4: quarters.q4.score,
    };

    let gradeRowId = target.gradeRowId;
    if (gradeRowId) {
      await supabase.from('grades').update({ ...quarterColumns, final_grade: final }).eq('id', gradeRowId);
    } else {
      const { data: inserted } = await supabase
        .from('grades')
        .insert({
          student_id: target.studentId,
          school_year_id: currentSchoolYearId,
          class_section_subject_id: selectedClass,
          ...quarterColumns,
          final_grade: final,
        })
        .select('id')
        .single();
      gradeRowId = inserted?.id ?? null;
    }

    // Re-entering a grade for a quarter that was reopened via an approved request closes
    // that request out, so it doesn't keep showing as editable indefinitely.
    if (target.quarters[gradeModal.quarter].status === 'editable' && target.quarters[gradeModal.quarter].score !== null) {
      await supabase
        .from('grade_reopen_requests')
        .update({ status: 'fulfilled' })
        .eq('student_id', target.studentId)
        .eq('class_section_subject_id', selectedClass)
        .eq('quarter', gradeModal.quarter)
        .eq('status', 'approved');
    }

    setGrades(prev => prev.map(s => (s.id === gradeModal.studentId ? { ...s, quarters, final, gradeRowId } : s)));
    setGradeModal(null);
  };

  const confirmReopenRequest = async () => {
    if (!reopenTarget || !selectedClass || !currentSchoolYearId) return;
    await supabase.from('grade_reopen_requests').insert({
      student_id: reopenTarget.studentId,
      class_section_subject_id: selectedClass,
      school_year_id: currentSchoolYearId,
      quarter: reopenTarget.quarter,
      requested_by: user.employeeId ?? null,
    });
    setGrades(prev => prev.map(s => {
      if (s.id !== reopenTarget.studentId) return s;
      const quarters = { ...s.quarters, [reopenTarget.quarter]: { ...s.quarters[reopenTarget.quarter], status: 'reopen_requested' as QuarterStatus } };
      return { ...s, quarters };
    }));
    setReopenTarget(null);
  };

  const renderQuarterCell = (student: GradeRow, quarter: QuarterKey) => {
    const q = student.quarters[quarter];
    if (q.status === 'editable') {
      return (
        <button
          onClick={() => openGradeInput(student.id, quarter)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#7d1935] text-white hover:shadow-md transition-all"
        >
          <Edit className="w-3.5 h-3.5" /> Input Grade
        </button>
      );
    }
    if (q.status === 'not_open') {
      return <span className="text-xs text-[#c9c4b8] italic">Not open</span>;
    }
    if (q.status === 'reopen_requested') {
      return (
        <div className="flex flex-col items-center gap-1">
          <span className="text-[#2c2c2c] font-medium">{q.score}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-semibold">Reopen Requested</span>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-[#2c2c2c] font-medium">{q.score}</span>
        <button onClick={() => setReopenTarget({ studentId: student.id, quarter })} className="text-[10px] text-[#7d1935] hover:underline font-semibold">
          Request Edit
        </button>
      </div>
    );
  };

  // Historical + current-year report data, fetched live when a report is requested.
  const [historicalReportData, setHistoricalReportData] = useState<any[]>([]);
  const [currentReportData, setCurrentReportData] = useState<any | null>(null);

  type ReportableStudent = { studentId: string; student: string; grade: string; section: string };

  const handleGenerateHistoricalReport = async (student: ReportableStudent) => {
    setSelectedStudent(student);
    setShowHistoricalReport(true);
    setHistoricalReportData([]);

    const { data: rows } = await supabase
      .from('grades')
      .select('q1, q2, q3, q4, final_grade, school_years(label), class_section_subjects(subjects(name))')
      .eq('student_id', student.studentId);

    const grouped = new Map<string, any>();
    (rows ?? []).forEach((r: any) => {
      const yearLabel = r.school_years?.label ?? 'Unknown Year';
      if (!grouped.has(yearLabel)) grouped.set(yearLabel, { year: yearLabel, grade: student.grade, subjects: [] });
      grouped.get(yearLabel).subjects.push({
        subject: r.class_section_subjects?.subjects?.name ?? 'Subject',
        q1: r.q1, q2: r.q2, q3: r.q3, q4: r.q4, final: r.final_grade,
      });
    });
    setHistoricalReportData(Array.from(grouped.values()));
  };

  const handleGenerateCurrentReport = async (student: ReportableStudent) => {
    setSelectedStudent(student);
    setShowCurrentReport(true);
    setCurrentReportData(null);

    const sy = schoolYear ? await getSchoolYearByLabel(schoolYear) : await getCurrentSchoolYear();
    if (!sy) return;

    const { data: cssRows } = await supabase
      .from('class_section_subjects')
      .select('id, teacher_id, subjects(name), employees(full_name), class_sections!inner(grade_level, section_name, school_year_id)')
      .eq('class_sections.grade_level', student.grade)
      .eq('class_sections.section_name', student.section)
      .eq('class_sections.school_year_id', sy.id)
      .eq('archived', false);

    const { data: gradeRows } = await supabase
      .from('grades')
      .select('*')
      .eq('student_id', student.studentId)
      .eq('school_year_id', sy.id);

    const gradesByCss = new Map((gradeRows ?? []).map((g: any) => [g.class_section_subject_id, g]));

    setCurrentReportData({
      year: sy.label,
      grade: student.grade,
      subjects: (cssRows ?? []).map((row: any) => {
        const g = gradesByCss.get(row.id);
        return {
          subject: row.subjects?.name ?? 'Subject',
          teacher: row.employees?.full_name ?? 'Unassigned',
          q1: g?.q1 ?? null,
          q2: g?.q2 ?? null,
          q3: g?.q3 ?? null,
          q4: g?.q4 ?? null,
          final: g?.final_grade ?? null,
        };
      }),
    });
  };

  const handlePrintReport = () => {
    window.print();
  };

  // Pass/fail remarks derived from the final grade, mirrored across the
  // grades table and both report modals
  const getRemarks = (final: number | null) => (final === null || final === undefined ? '—' : final >= 75 ? 'Passed' : 'Failed');

  // Remarks filter — narrows the roster to students who have passed, failed, or have no
  // final grade yet, alongside the existing name/ID search box.
  const matchesRemarksFilter = (final: number | null) => {
    if (remarksFilter === 'all') return true;
    if (remarksFilter === 'pending') return final === null || final === undefined;
    return getRemarks(final) === (remarksFilter === 'passed' ? 'Passed' : 'Failed');
  };

  const filteredGrades = grades.filter((student) => {
    const query = studentSearch.toLowerCase();
    return (
      (student.student.toLowerCase().includes(query) ||
        student.studentId.toLowerCase().includes(query)) &&
      matchesRemarksFilter(student.final)
    );
  });

  const filteredAdvisoryRows = advisoryRows.filter((student) => {
    const query = studentSearch.toLowerCase();
    return (
      (student.student.toLowerCase().includes(query) ||
        student.studentId.toLowerCase().includes(query)) &&
      matchesRemarksFilter(student.final)
    );
  });

  const handleDownloadCurrentReportPDF = () => {
    if (!selectedStudent) return;
    const currentData = currentReportData;
    if (!currentData) return;

    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('DUMAGUETE MISSION SCHOOL', 105, 18, { align: 'center' });

    doc.setFontSize(13);
    doc.text('CURRENT YEAR GRADE REPORT', 105, 27, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Student: ${selectedStudent.student}`, 14, 40);
    doc.text(`Student ID: ${selectedStudent.studentId}`, 14, 47);
    doc.text(`${currentData.year} - ${currentData.grade}`, 14, 54);

    autoTable(doc, {
      startY: 62,
      head: [['Subject', 'Teacher', 'Q1', 'Q2', 'Q3', 'Q4', 'Final', 'Remarks']],
      body: currentData.subjects.map((subject: any) => [
        subject.subject,
        subject.teacher,
        subject.q1,
        subject.q2,
        subject.q3,
        subject.q4,
        subject.final,
        getRemarks(subject.final)
      ])
    });

    doc.save(`${selectedStudent.student.replace(/\s+/g, '_')}_Current_Report.pdf`);
  };

  const handleDownloadHistoricalReportPDF = () => {
    if (!selectedStudent) return;
    const historicalData = historicalReportData;
    if (!historicalData.length) return;

    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('DUMAGUETE MISSION SCHOOL', 105, 18, { align: 'center' });

    doc.setFontSize(13);
    doc.text('HISTORICAL GRADE REPORT', 105, 27, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Student: ${selectedStudent.student}`, 14, 40);
    doc.text(`Student ID: ${selectedStudent.studentId}`, 14, 47);

    let startY = 55;
    historicalData.forEach((yearData: any) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`${yearData.year} - ${yearData.grade}`, 14, startY);

      autoTable(doc, {
        startY: startY + 4,
        head: [['Subject', 'Q1', 'Q2', 'Q3', 'Q4', 'Final', 'Remarks']],
        body: yearData.subjects.map((subject: any) => [
          subject.subject,
          subject.q1,
          subject.q2,
          subject.q3,
          subject.q4,
          subject.final,
          getRemarks(subject.final)
        ])
      });

      startY = (doc as any).lastAutoTable.finalY + 12;
    });

    doc.save(`${selectedStudent.student.replace(/\s+/g, '_')}_Historical_Report.pdf`);
  };

  // If a class is selected, show the detailed view with grades
  if (selectedClass) {
    const classInfo = allClasses.find(c => c.id === selectedClass);
    const isAdvisory = !!classInfo?.isAdvisory;

    return (
      <div className="space-y-6">
        {/* Back Button and Header */}
        <div className="flex items-start justify-between">
          <div>
            <button 
              onClick={() => setSelectedClass(null)}
              className="flex items-center gap-2 text-[#7d1935] hover:text-[#9b2847] mb-3 font-medium"
            >
              <X className="w-5 h-5" />
              <span>Back to My Classes</span>
            </button>
            <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">{classInfo?.name}</h1>
            <p className="text-[#6b6456]">
              {isAdvisory ? 'View your advisory students and their quarter grades' : 'Manage grades and assessments for this class'}
            </p>
          </div>
          {!isAdvisory && (
            <div className="flex items-center gap-2 px-4 py-3 bg-[#faf8f5] border-2 border-[#c9a961]/30 rounded-lg">
              <Calendar className="w-5 h-5 text-[#c9a961]" />
              <span className="text-sm font-medium text-[#6b6456]">
                {adminOpenQuarter ? `${QUARTER_LABELS[adminOpenQuarter]} open for grade input` : (gradingPeriodsLoaded ? 'No quarter currently open for grade input' : 'Checking grading period…')}
              </span>
            </div>
          )}
        </div>

        {/* Class Info Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-[#7d1935] to-[#9b2847] rounded-lg p-4 text-white">
            <Users className="w-6 h-6 mb-2" />
            <p className="text-2xl font-bold">{classInfo?.students}</p>
            <p className="text-sm text-white/80">Students</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <Calendar className="w-6 h-6 mb-2 text-[#6b6456]" />
            <p className="text-sm font-bold text-[#2c2c2c] mb-1">{classInfo?.schedule}</p>
            <p className="text-sm text-[#8b8476]">{classInfo?.room}</p>
          </div>
        </div>

        {/* Grades Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center gap-3 flex-wrap">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search by name or Student ID..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961] focus:border-transparent"
              />
            </div>
            <select
              value={remarksFilter}
              onChange={(e) => setRemarksFilter(e.target.value as typeof remarksFilter)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-[#2c2c2c] focus:outline-none focus:ring-2 focus:ring-[#c9a961]"
            >
              <option value="all">All Remarks</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="pending">No Final Grade Yet</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            {isAdvisory ? (
              <table className="w-full">
                <thead className="bg-[#faf8f5] border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Student Name</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Q1</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Q2</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Q3</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Q4</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Final Grade</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Remarks</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredAdvisoryRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-sm text-[#8b8476]">
                        {!advisoryRowsLoaded
                          ? 'Loading students…'
                          : advisoryRows.length === 0
                          ? 'No active students are enrolled in this advisory class yet.'
                          : `No students match "${studentSearch}"`}
                      </td>
                    </tr>
                  )}
                  {filteredAdvisoryRows.map((student) => (
                    <tr key={student.id} className="hover:bg-[#faf8f5] transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-[#2c2c2c]">{student.student}</p>
                          <p className="text-xs text-[#8b8476]">{student.studentId}</p>
                        </div>
                      </td>
                      {(['q1', 'q2', 'q3', 'q4'] as QuarterKey[]).map((q) => (
                        <td key={q} className="px-6 py-4 text-center">
                          {student.quarters[q] !== null ? (
                            <span className="text-[#2c2c2c] font-medium">{student.quarters[q]}</span>
                          ) : (
                            <span className="text-xs text-[#c9c4b8] italic">—</span>
                          )}
                        </td>
                      ))}
                      <td className="px-6 py-4 text-center">
                        {student.final !== null ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-[#c9a961]/10 text-[#c9a961]">
                            {student.final}
                          </span>
                        ) : (
                          <span className="text-xs text-[#c9c4b8] italic">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {student.final !== null ? (
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                            getRemarks(student.final) === 'Passed'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {getRemarks(student.final)}
                          </span>
                        ) : (
                          <span className="text-xs text-[#c9c4b8] italic">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleGenerateCurrentReport(student)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#7d1935] text-white hover:shadow-md transition-all"
                            title="View subjects and grades"
                          >
                            <FileText className="w-3.5 h-3.5" /> View
                          </button>
                          <button
                            onClick={() => handleGenerateHistoricalReport(student)}
                            className="p-2 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Historical Report"
                          >
                            <History className="w-4 h-4 text-blue-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full">
                <thead className="bg-[#faf8f5] border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Student Name</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Q1</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Q2</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Q3</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Q4</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Final Grade</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredGrades.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-sm text-[#8b8476]">
                        {!gradesLoaded
                          ? 'Loading students…'
                          : grades.length === 0
                          ? 'No active students are enrolled in this class yet.'
                          : `No students match "${studentSearch}"`}
                      </td>
                    </tr>
                  )}
                  {filteredGrades.map((student) => (
                    <tr key={student.id} className="hover:bg-[#faf8f5] transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-[#2c2c2c]">{student.student}</p>
                          <p className="text-xs text-[#8b8476]">{student.studentId}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">{renderQuarterCell(student, 'q1')}</td>
                      <td className="px-6 py-4 text-center">{renderQuarterCell(student, 'q2')}</td>
                      <td className="px-6 py-4 text-center">{renderQuarterCell(student, 'q3')}</td>
                      <td className="px-6 py-4 text-center">{renderQuarterCell(student, 'q4')}</td>
                      <td className="px-6 py-4 text-center">
                        {student.final !== null ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-[#c9a961]/10 text-[#c9a961]">
                            {student.final}
                          </span>
                        ) : (
                          <span className="text-xs text-[#c9c4b8] italic">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {student.final !== null ? (
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                            getRemarks(student.final) === 'Passed'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {getRemarks(student.final)}
                          </span>
                        ) : (
                          <span className="text-xs text-[#c9c4b8] italic">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Input Grade Modal — direct quarter grade entry for the admin-open quarter */}
        {gradeModal && (() => {
          const targetStudent = grades.find(g => g.id === gradeModal.studentId);
          if (!targetStudent) return null;
          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                <div className="sticky top-0 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Input {QUARTER_LABELS[gradeModal.quarter]} Grade</h3>
                    <p className="text-xs text-white/80">{targetStudent.student} • {targetStudent.studentId}</p>
                  </div>
                  <button onClick={() => setGradeModal(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#6b6456] mb-1">Quarter Grade</label>
                    <input
                      type="number" max={100}
                      value={gradeInput}
                      onChange={(e) => {
                        setGradeInput(clampScore(e.target.value));
                        setGradeInputError(null);
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7d1935]/20 text-black"
                      autoFocus
                    />
                    {gradeInputError && (
                      <p className="text-xs text-red-600 mt-1">{gradeInputError}</p>
                    )}
                  </div>
                  <p className="text-xs text-[#8b8476]">Once confirmed, this grade is locked and cannot be edited again unless you request the admin to reopen it.</p>
                </div>
                <div className="p-6 border-t border-gray-200 flex gap-3">
                  <button onClick={() => setGradeModal(null)} className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#2c2c2c] font-medium hover:border-[#c9a961] transition-all">
                    Cancel
                  </button>
                  <button onClick={confirmGradeInput} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg font-medium hover:shadow-lg transition-all">
                    Confirm Grade
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Request Reopen Modal */}
        {reopenTarget && (() => {
          const targetStudent = grades.find(g => g.id === reopenTarget.studentId);
          if (!targetStudent) return null;
          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 text-yellow-500" />
                  <h3 className="text-lg font-semibold text-[#1a2b4a]">Request Grade Reopen</h3>
                </div>
                <p className="text-sm text-[#6b6456]">
                  Send a request to the admin to reopen <strong>{QUARTER_LABELS[reopenTarget.quarter]}</strong> for <strong>{targetStudent.student}</strong>? The admin must approve this before the grade can be edited again.
                </p>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setReopenTarget(null)} className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#2c2c2c] font-medium hover:border-[#c9a961] transition-all">
                    Cancel
                  </button>
                  <button onClick={confirmReopenRequest} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg font-medium hover:shadow-lg transition-all">
                    Send Request
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Historical Report Modal */}
        {showHistoricalReport && selectedStudent && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto scrollbar-none">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-[#1a2b4a]">Historical Grade Report</h2>
                  <p className="text-sm text-[#6b6456]">{selectedStudent.student} ({selectedStudent.studentId})</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handlePrintReport}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a2b4a] text-white rounded-lg hover:bg-[#2d4263] transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    Print
                  </button>
                  <button 
                    onClick={handleDownloadHistoricalReportPDF}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                  <button 
                    onClick={() => setShowHistoricalReport(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {historicalReportData.length === 0 && (
                  <p className="text-sm text-[#8b8476] text-center py-6">No historical grade records found for this student.</p>
                )}
                {historicalReportData.map((yearData: any, index: number) => (
                  <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-[#faf8f5] p-4 border-b border-gray-200">
                      <h3 className="font-bold text-[#1a2b4a]">{yearData.year} - {yearData.grade}</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Subject</th>
                            <th className="text-center px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Q1</th>
                            <th className="text-center px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Q2</th>
                            <th className="text-center px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Q3</th>
                            <th className="text-center px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Q4</th>
                            <th className="text-center px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Final</th>
                            <th className="text-center px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {yearData.subjects.map((subject: any, subIndex: number) => (
                            <tr key={subIndex}>
                              <td className="px-4 py-3 text-sm font-medium text-[#2c2c2c]">{subject.subject}</td>
                              <td className="px-4 py-3 text-sm text-center text-[#6b6456]">{subject.q1 ?? '—'}</td>
                              <td className="px-4 py-3 text-sm text-center text-[#6b6456]">{subject.q2 ?? '—'}</td>
                              <td className="px-4 py-3 text-sm text-center text-[#6b6456]">{subject.q3 ?? '—'}</td>
                              <td className="px-4 py-3 text-sm text-center text-[#6b6456]">{subject.q4 ?? '—'}</td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-[#c9a961]/10 text-[#c9a961]">
                                  {subject.final ?? '—'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                  getRemarks(subject.final) === 'Passed'
                                    ? 'bg-green-100 text-green-700'
                                    : getRemarks(subject.final) === 'Failed'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {getRemarks(subject.final)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Current Report Modal */}
        {showCurrentReport && selectedStudent && currentReportData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto scrollbar-none">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-[#1a2b4a]">Current Year Grade Report</h2>
                  <p className="text-sm text-[#6b6456]">{selectedStudent.student} ({selectedStudent.studentId})</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handlePrintReport}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a2b4a] text-white rounded-lg hover:bg-[#2d4263] transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    Print
                  </button>
                  <button 
                    onClick={handleDownloadCurrentReportPDF}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                  <button 
                    onClick={() => setShowCurrentReport(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                {(() => {
                  const currentData = currentReportData;
                  return (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-[#faf8f5] p-4 border-b border-gray-200">
                        <h3 className="font-bold text-[#1a2b4a]">{currentData.year} - {currentData.grade}</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Subject</th>
                              <th className="text-left px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Teacher</th>
                              <th className="text-center px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Q1</th>
                              <th className="text-center px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Q2</th>
                              <th className="text-center px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Q3</th>
                              <th className="text-center px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Q4</th>
                              <th className="text-center px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Final</th>
                              <th className="text-center px-4 py-3 text-sm font-semibold text-[#1a2b4a]">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {currentData.subjects.length === 0 && (
                              <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-[#8b8476]">No subjects found for this student's section.</td></tr>
                            )}
                            {currentData.subjects.map((subject: any, index: number) => (
                              <tr key={index}>
                                <td className="px-4 py-3 text-sm font-medium text-[#2c2c2c]">{subject.subject}</td>
                                <td className="px-4 py-3 text-sm text-[#6b6456]">{subject.teacher}</td>
                                <td className="px-4 py-3 text-sm text-center text-[#6b6456]">{subject.q1 ?? '—'}</td>
                                <td className="px-4 py-3 text-sm text-center text-[#6b6456]">{subject.q2 ?? '—'}</td>
                                <td className="px-4 py-3 text-sm text-center text-[#6b6456]">{subject.q3 ?? '—'}</td>
                                <td className="px-4 py-3 text-sm text-center text-[#6b6456]">{subject.q4 ?? '—'}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-[#c9a961]/10 text-[#c9a961]">
                                    {subject.final ?? '—'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                    getRemarks(subject.final) === 'Passed'
                                      ? 'bg-green-100 text-green-700'
                                      : getRemarks(subject.final) === 'Failed'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {getRemarks(subject.final)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {currentData.subjects.length > 0 && (() => {
                              const finals = currentData.subjects
                                .map((s: any) => s.final)
                                .filter((v: any): v is number => v !== null && v !== undefined);
                              const overallGPA = finals.length
                                ? (finals.reduce((sum: number, f: number) => sum + f, 0) / finals.length).toFixed(1)
                                : '—';
                              return (
                                <tr className="bg-[#faf8f5]">
                                  <td className="px-4 py-3 text-sm font-bold text-[#1a2b4a]" colSpan={6}>Overall GPA</td>
                                  <td className="px-4 py-3 text-center" colSpan={2}>
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-[#1a2b4a] text-white">
                                      {overallGPA}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Default view - show all classes
  const classGradeLevels = Array.from(new Set(allClasses.map((c) => c.gradeLevel))).sort();
  const visibleClasses = allClasses.filter((classItem) => {
    if (classGradeFilter !== 'all' && classItem.gradeLevel !== classGradeFilter) return false;
    const query = classListSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      classItem.name.toLowerCase().includes(query) ||
      classItem.room.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">My Classes</h1>
        <p className="text-[#6b6456]">Manage your classes</p>
      </div>

      {classesLoaded && allClasses.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center">
          <BookOpen className="w-10 h-10 text-[#c9c4b8] mx-auto mb-3" />
          <p className="text-[#6b6456] font-medium">No classes have been assigned to you yet.</p>
          <p className="text-sm text-[#8b8476] mt-1">Once an admin assigns you to a class it will appear here.</p>
        </div>
      )}

      {(!classesLoaded || allClasses.length > 0) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center gap-2 flex-wrap">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
              <input
                type="text"
                value={classListSearch}
                onChange={(e) => setClassListSearch(e.target.value)}
                placeholder="Search by class or room..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a961] focus:border-transparent"
              />
            </div>
            <div className="relative">
              <button
                onClick={() => setShowClassFilterPanel((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${classGradeFilter !== 'all' ? 'border-[#c9a961] text-[#1a2b4a] bg-[#c9a961]/10' : 'border-gray-200 text-[#6b6456] hover:border-[#c9a961]/40'}`}
              >
                <Filter className="w-4 h-4" />
                <span>Filter</span>
              </button>
              {showClassFilterPanel && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-3">
                  <label className="block text-xs font-semibold text-[#6b6456] mb-1">Grade Level</label>
                  <select
                    value={classGradeFilter}
                    onChange={(e) => setClassGradeFilter(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
                  >
                    <option value="all">All Grades</option>
                    {classGradeLevels.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex items-center border-2 border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setClassViewMode('table')}
                title="Table view"
                className={`p-2 transition-colors ${classViewMode === 'table' ? 'bg-[#1a2b4a] text-white' : 'bg-white text-[#8b8476] hover:bg-gray-50'}`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setClassViewMode('card')}
                title="Card view"
                className={`p-2 transition-colors ${classViewMode === 'card' ? 'bg-[#1a2b4a] text-white' : 'bg-white text-[#8b8476] hover:bg-gray-50'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
          {classViewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#faf8f5] border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Class</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Students</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Room</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-[#1a2b4a]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleClasses.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-sm text-[#8b8476]">
                      No classes match "{classListSearch}"
                    </td>
                  </tr>
                ) : (
                  visibleClasses.map((classItem) => (
                    <tr key={classItem.id} className="hover:bg-[#faf8f5] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#2c2c2c]">{classItem.name}</span>
                          {classItem.isAdvisory && (
                            <span className="inline-block text-[10px] font-semibold uppercase tracking-wide bg-[#1a2b4a]/10 text-[#1a2b4a] px-2 py-0.5 rounded-full">Advisory</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-semibold text-[#2c2c2c]">{classItem.students}</td>
                      <td className="px-6 py-4 text-[#6b6456]">{classItem.room}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setSelectedClass(classItem.id)}
                          className="px-4 py-2 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg hover:shadow-lg transition-all font-medium text-sm cursor-pointer"
                        >
                          View Class Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          ) : (
          <div className="p-4">
            {visibleClasses.length === 0 ? (
              <p className="text-center text-sm text-[#8b8476] py-8">No classes match "{classListSearch}"</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleClasses.map((classItem) => (
                  <div key={classItem.id} className="border-2 border-gray-200 rounded-xl p-4 hover:border-[#1a2b4a]/30 transition-all">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-[#2c2c2c]">{classItem.name}</span>
                      {classItem.isAdvisory && (
                        <span className="inline-block text-[10px] font-semibold uppercase tracking-wide bg-[#1a2b4a]/10 text-[#1a2b4a] px-2 py-0.5 rounded-full">Advisory</span>
                      )}
                    </div>
                    <p className="text-sm text-[#6b6456] mb-1">Room: {classItem.room}</p>
                    <p className="text-sm text-[#6b6456] mb-3">{classItem.students} students</p>
                    <button
                      onClick={() => setSelectedClass(classItem.id)}
                      className="w-full px-4 py-2 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg hover:shadow-lg transition-all font-medium text-sm cursor-pointer"
                    >
                      View Class Details
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}

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

// Sorts schedule items chronologically by start time so the earliest class sits at the top.
const startMinutesOf = (timeLabel: string): number => {
  const [start] = (timeLabel || '').split('-');
  const [h, m] = (start || '').split(':').map(Number);
  return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
};

// Class Schedule
function ClassSchedule({ user, schoolYear }: any) {
  type ScheduleItem = { time: string; class: string; room: string };
  const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const WEEKDAY_ABBR: Record<string, string> = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri' };
  const WEEKDAY_SHORT: Record<string, string> = { Monday: 'M', Tuesday: 'Tu', Wednesday: 'W', Thursday: 'Th', Friday: 'F' };

  const [schedule, setSchedule] = useState<Record<string, ScheduleItem[]>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const sy = schoolYear ? await getSchoolYearByLabel(schoolYear) : await getCurrentSchoolYear();
      if (!sy) { if (active) setLoaded(true); return; }

      const { data: rows } = await supabase
        .from('schedules')
        .select('*')
        .eq('school_year_id', sy.id)
        .eq('teacher', user.name);

      const byDay: Record<string, ScheduleItem[]> = {};
      WEEKDAY_NAMES.forEach((day) => {
        const abbr = WEEKDAY_ABBR[day];
        byDay[day] = (rows ?? [])
          .filter((row: any) => Array.isArray(row.days) && row.days.includes(abbr))
          .map((row: any) => ({
            time: row.time_label,
            class: `${row.grade_level} ${row.section_name} ${row.subject}`,
            room: row.room ?? '—'
          }))
          .sort((a: ScheduleItem, b: ScheduleItem) => startMinutesOf(a.time) - startMinutesOf(b.time));
      });

      if (active) {
        setSchedule(byDay);
        setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [user.name, schoolYear]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">Class Schedule</h1>
        <p className="text-[#6b6456]">Your weekly teaching schedule</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-px bg-gray-200">
          {WEEKDAY_NAMES.map((day) => (
            <div key={day} className="bg-white">
              <div className="bg-gradient-to-r from-[#7d1935] to-[#9b2847] p-4 text-center">
                <h3 className="font-semibold text-white">{day}</h3>
              </div>
              <div className="p-4 space-y-3">
                {loaded && (schedule[day]?.length ?? 0) === 0 && (
                  <p className="text-xs text-[#8b8476] text-center py-4">No classes</p>
                )}
                {(schedule[day] ?? []).map((item, index) => (
                  <div key={index} className="flex items-start flex-col gap-3 p-3 bg-[#faf8f5] rounded-lg border border-gray-200">
                    <p className="text-xs font-semibold text-[#7d1935] whitespace-nowrap">{formatTimeRange12(item.time)}</p>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a2b4a] mb-1">{item.class}</p>
                      <p className="text-xs text-[#8b8476]">Room {item.room}</p>
                    </div>
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