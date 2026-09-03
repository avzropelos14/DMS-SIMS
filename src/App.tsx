import { useEffect, useState } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { SetPasswordScreen } from './components/SetPasswordScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { TeacherDashboard } from './components/TeacherDashboard';
import { StudentPortal } from './components/StudentPortal';
import { ParentPortal } from './components/ParentPortal';
import { GuardPortal } from './components/GuardPortal';
import { CashierPortal } from './components/CashierPortal';
import { supabase } from './supabase';
import { resolveIdentity } from './lib/resolveRole';
import { DEFAULT_TUITION_FEES, DEFAULT_ENROLLMENT_FEES } from './lib/tuition';

export type UserRole = 'admin' | 'registrar' | 'teacher' | 'student' | 'parent' | 'guard' | 'cashier' | null;

function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tuitionFees, setTuitionFees] = useState<Record<string, number>>(DEFAULT_TUITION_FEES);
  const [enrollmentFees, setEnrollmentFees] = useState<Record<string, number>>(DEFAULT_ENROLLMENT_FEES);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadTuitionFees = async () => {
      const { data } = await supabase
        .from('tuition_fees')
        .select('grade_level, annual_fee, school_years!inner(is_current)')
        .eq('school_years.is_current', true);
      if (cancelled || !data || data.length === 0) return;
      const fees = Object.fromEntries(data.map((row: any) => [row.grade_level, Number(row.annual_fee)]));
      setTuitionFees({ ...DEFAULT_TUITION_FEES, ...fees });
    };

    const loadEnrollmentFees = async () => {
      const { data } = await supabase
        .from('enrollment_fees')
        .select('grade_level, fee, school_years!inner(is_current)')
        .eq('school_years.is_current', true);
      if (cancelled || !data || data.length === 0) return;
      const fees = Object.fromEntries(data.map((row: any) => [row.grade_level, Number(row.fee)]));
      setEnrollmentFees({ ...DEFAULT_ENROLLMENT_FEES, ...fees });
    };

    const restoreSession = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) {
        if (!cancelled) setIsRestoringSession(false);
        return;
      }
      const identity = await resolveIdentity(user.id);
      if (cancelled) return;
      if (identity) {
        setCurrentRole(identity.role);
        setCurrentUser(identity.userData);
        setNeedsPasswordSetup(user.user_metadata?.password_set === false);
      }
      setIsRestoringSession(false);
    };

    loadTuitionFees();
    loadEnrollmentFees();
    restoreSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setCurrentRole(null);
        setCurrentUser(null);
        setNeedsPasswordSetup(false);
        setPasswordRecoveryMode(false);
      } else if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryMode(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleLogin = (role: UserRole, userData: any, authUser?: { user_metadata?: Record<string, any> }) => {
    setCurrentRole(role);
    setCurrentUser(userData);
    setNeedsPasswordSetup(authUser?.user_metadata?.password_set === false);
  };

  // Returns an error message on failure (so the Admin UI can surface it instead of
  // showing "Saved!" when an RLS rejection or network error silently dropped the write).
  const persistTuitionFees = async (fees: Record<string, number>): Promise<string | null> => {
    const { data: schoolYear } = await supabase
      .from('school_years')
      .select('id')
      .eq('is_current', true)
      .maybeSingle();
    if (!schoolYear) return 'No current school year is set.';
    const { error } = await supabase
      .from('tuition_fees')
      .upsert(
        Object.entries(fees).map(([grade_level, annual_fee]) => ({
          school_year_id: schoolYear.id,
          grade_level,
          annual_fee,
        })),
        { onConflict: 'school_year_id,grade_level' }
      );
    if (error) return error.message;
    setTuitionFees(fees);
    return null;
  };

  const persistEnrollmentFees = async (fees: Record<string, number>): Promise<string | null> => {
    const { data: schoolYear } = await supabase
      .from('school_years')
      .select('id')
      .eq('is_current', true)
      .maybeSingle();
    if (!schoolYear) return 'No current school year is set.';
    const { error } = await supabase
      .from('enrollment_fees')
      .upsert(
        Object.entries(fees).map(([grade_level, fee]) => ({
          school_year_id: schoolYear.id,
          grade_level,
          fee,
        })),
        { onConflict: 'school_year_id,grade_level' }
      );
    if (error) return error.message;
    setEnrollmentFees(fees);
    return null;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentRole(null);
    setCurrentUser(null);
    setNeedsPasswordSetup(false);
    setPasswordRecoveryMode(false);
  };

  if (isRestoringSession) {
    return null;
  }

  if (passwordRecoveryMode) {
    return (
      <SetPasswordScreen
        mode="recovery"
        onDone={async () => {
          const { data } = await supabase.auth.getUser();
          const user = data.user;
          setPasswordRecoveryMode(false);
          if (!user) return;
          const identity = await resolveIdentity(user.id);
          if (identity) {
            setCurrentRole(identity.role);
            setCurrentUser(identity.userData);
          }
        }}
        onSignOut={handleLogout}
      />
    );
  }

  if (!currentRole) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (needsPasswordSetup) {
    return (
      <SetPasswordScreen
        mode="first-login"
        onDone={() => setNeedsPasswordSetup(false)}
        onSignOut={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f3f0]">
      {currentRole === 'admin' && (
        <AdminDashboard user={currentUser} onLogout={handleLogout} accessLevel="full" tuitionFees={tuitionFees} onTuitionFeesChange={persistTuitionFees} enrollmentFees={enrollmentFees} onEnrollmentFeesChange={persistEnrollmentFees} />
      )}
      {currentRole === 'registrar' && (
        <AdminDashboard user={currentUser} onLogout={handleLogout} accessLevel="registrar" tuitionFees={tuitionFees} onTuitionFeesChange={persistTuitionFees} enrollmentFees={enrollmentFees} onEnrollmentFeesChange={persistEnrollmentFees} />
      )}
      {currentRole === 'teacher' && (
        <TeacherDashboard user={currentUser} onLogout={handleLogout} />
      )}
      {currentRole === 'student' && (
        <StudentPortal user={currentUser} onLogout={handleLogout} />
      )}
      {currentRole === 'parent' && (
        <ParentPortal user={currentUser} onLogout={handleLogout} />
      )}
      {currentRole === 'guard' && (
        <GuardPortal user={currentUser} onLogout={handleLogout} />
      )}
      {currentRole === 'cashier' && (
        <CashierPortal user={currentUser} onLogout={handleLogout} tuitionFees={tuitionFees} enrollmentFees={enrollmentFees} />
      )}
    </div>
    

  );
}

export default App;