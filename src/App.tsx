import { useEffect, useRef, useState } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { SetPasswordScreen } from './components/SetPasswordScreen';
import { MfaVerifyScreen } from './components/MfaVerifyScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { RegistrarDashboard } from './components/RegistrarDashboard';
import { TeacherDashboard } from './components/TeacherDashboard';
import { StudentPortal } from './components/StudentPortal';
import { ParentPortal } from './components/ParentPortal';
import { GuardPortal } from './components/GuardPortal';
import { CashierPortal } from './components/CashierPortal';
import { supabase } from './supabase';
import { resolveIdentity } from './lib/resolveRole';
import { checkTrustedDevice, getLoginStatus } from './lib/mfa';
import { clearPersistedViews } from './lib/usePersistedView';
import { DEFAULT_TUITION_FEES, DEFAULT_ENROLLMENT_FEES } from './lib/tuition';
import type { User } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'registrar' | 'teacher' | 'student' | 'parent' | 'guard' | 'cashier' | null;

// Read once at load, before the auth client consumes and clears the URL: the page was
// opened from an emailed password reset link (…#access_token=…&type=recovery).
const OPENED_FROM_RESET_LINK =
  typeof window !== 'undefined' && /(^|[#&?])type=recovery(&|$)/.test(window.location.hash + window.location.search);
// An expired or already-used emailed link comes back as …#error_code=otp_expired.
const OPENED_FROM_EXPIRED_LINK =
  typeof window !== 'undefined' && /error_code=otp_expired/.test(window.location.hash + window.location.search);

function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tuitionFees, setTuitionFees] = useState<Record<string, number>>(DEFAULT_TUITION_FEES);
  const [enrollmentFees, setEnrollmentFees] = useState<Record<string, number>>(DEFAULT_ENROLLMENT_FEES);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(OPENED_FROM_RESET_LINK);
  const [mfaPending, setMfaPending] = useState<{ user: User } | null>(null);
  const [loginNotice, setLoginNotice] = useState(
    OPENED_FROM_EXPIRED_LINK
      ? 'This email link has expired or was already used. Please ask the school office to send a new one.'
      : '',
  );
  const lastMfaRecheck = useRef(0);

  // Runs once the session has passed MFA (code, recovery code, remembered device, or an
  // already-verified session on refresh). The database only releases data after MFA, so
  // identity is resolved here and never before. Returns an error message on failure.
  const completeLogin = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return 'Your session has ended. Please sign in again.';
    const status = await getLoginStatus();
    if (!status) return "Couldn't reach the server. Please try again.";
    if (status.mfa_required && !status.mfa_verified) {
      return "Your verification couldn't be completed. Please sign in again.";
    }
    // The server-side flag can't be cleared by the account owner; the metadata flag is
    // kept as a fallback for accounts created before it existed.
    if (status.must_change_password || user.user_metadata?.password_set === false) {
      setCurrentRole(null);
      setCurrentUser(null);
      setNeedsPasswordSetup(true);
      return null;
    }
    const identity = await resolveIdentity(user.id);
    if (!identity) return 'Email is unauthorized. Contact an administrator.';
    setNeedsPasswordSetup(false);
    setLoginNotice('');
    setCurrentRole(identity.role);
    setCurrentUser(identity.userData);
    return null;
  };

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
      const status = await getLoginStatus();
      if (cancelled) return;
      if (status?.provisioned) {
        // A persisted auth session alone doesn't prove this device passed MFA. A session
        // already verified today passes; otherwise a remembered device does (checkOnly:
        // a refresh never emails a code; the MFA screen requests one).
        const passes = status.mfa_verified || (await checkTrustedDevice(user.id)).trusted;
        if (cancelled) return;
        if (passes) {
          const failure = await completeLogin();
          if (cancelled) return;
          if (failure) setLoginNotice(failure);
        } else {
          setMfaPending({ user });
        }
      }
      setIsRestoringSession(false);
    };

    loadTuitionFees();
    loadEnrollmentFees();
    restoreSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearPersistedViews();
        setCurrentRole(null);
        setCurrentUser(null);
        setNeedsPasswordSetup(false);
        setPasswordRecoveryMode(false);
        setMfaPending(null);
      } else if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryMode(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // A verified session lasts one school day. When it lapses while a tab is open, the
  // database starts returning empty results, so re-check whenever the tab comes back
  // into view and every 10 minutes: a remembered device re-verifies silently, otherwise
  // the code screen is shown.
  useEffect(() => {
    if (!currentRole) return;
    let disposed = false;
    const recheck = async (force = false) => {
      if (document.visibilityState !== 'visible') return;
      if (!force && Date.now() - lastMfaRecheck.current < 60_000) return;
      lastMfaRecheck.current = Date.now();
      const status = await getLoginStatus();
      if (disposed || !status || !status.mfa_required || status.mfa_verified) return;
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return;
      const trusted = await checkTrustedDevice(user.id);
      if (!disposed && !trusted.trusted) setMfaPending({ user });
    };
    const onVisible = () => { void recheck(); };
    const interval = window.setInterval(() => { void recheck(true); }, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [currentRole]);

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
    clearPersistedViews();
    setCurrentRole(null);
    setCurrentUser(null);
    setNeedsPasswordSetup(false);
    setPasswordRecoveryMode(false);
    setMfaPending(null);
    setLoginNotice('');
  };

  // For screens shown outside the login form: on failure, sign out and show the reason there.
  const completeLoginOrSignOut = async () => {
    const failure = await completeLogin();
    if (failure) {
      await handleLogout();
      setLoginNotice(failure);
    }
  };

  if (isRestoringSession) {
    return null;
  }

  if (mfaPending) {
    return (
      <MfaVerifyScreen
        userId={mfaPending.user.id}
        userEmail={mfaPending.user.email}
        showOwnRememberCheckbox
        // The reset email already contains a recovery code; don't spend a second email.
        preferRecoveryCode={passwordRecoveryMode}
        onCancel={handleLogout}
        onVerified={() => {
          setMfaPending(null);
          void completeLoginOrSignOut();
        }}
      />
    );
  }

  if (passwordRecoveryMode) {
    return (
      <SetPasswordScreen
        mode="recovery"
        onDone={async () => {
          setPasswordRecoveryMode(false);
          const { data } = await supabase.auth.getSession();
          const user = data.session?.user;
          if (!user) return;
          // A reset link proves the inbox, but the session still has to pass MFA before
          // the database releases data.
          const status = await getLoginStatus();
          if (status && !status.mfa_verified && !(await checkTrustedDevice(user.id)).trusted) {
            setMfaPending({ user });
            return;
          }
          await completeLoginOrSignOut();
        }}
        onSignOut={handleLogout}
      />
    );
  }

  // Shown before any data loads: until the password is changed, the database (once
  // enforcement is on) returns nothing to this account.
  if (needsPasswordSetup) {
    return (
      <SetPasswordScreen
        mode="first-login"
        onDone={() => { void completeLoginOrSignOut(); }}
        onSignOut={handleLogout}
      />
    );
  }

  if (!currentRole) {
    return <LoginScreen initialError={loginNotice} onAuthenticated={completeLogin} />;
  }

  return (
    <div className="min-h-screen bg-[#f5f3f0]">
      {currentRole === 'admin' && (
        <AdminDashboard user={currentUser} onLogout={handleLogout} tuitionFees={tuitionFees} onTuitionFeesChange={persistTuitionFees} enrollmentFees={enrollmentFees} onEnrollmentFeesChange={persistEnrollmentFees} />
      )}
      {currentRole === 'registrar' && (
        <RegistrarDashboard user={currentUser} onLogout={handleLogout} tuitionFees={tuitionFees} onTuitionFeesChange={persistTuitionFees} enrollmentFees={enrollmentFees} onEnrollmentFeesChange={persistEnrollmentFees} />
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