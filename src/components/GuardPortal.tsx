import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { usePersistedView } from '../lib/usePersistedView';
import BarcodeScanner from 'react-qr-barcode-scanner';
import {
  QrCode, History, Shield, CheckCircle, XCircle, Clock,
  User, Search, ArrowLeft, AlertCircle, Scan, KeyRound, Footprints, School
} from 'lucide-react';
import { ChangePasswordModal } from './shared/ChangePasswordModal';
import { getPhotoUrl } from '../lib/photo';
import { SelfDismissalTab } from './guard/SelfDismissalTab';
import { CampusTab } from './guard/CampusTab';

// Pickup QR codes (v2) hold only a secret: {"v":2,"s":"..."}. The guard's scan is sent as-is
// to verify_pickup_qr(), which looks up the student and guardian; nothing is recorded until
// the guard compares the person with the details and presses Confirm (confirm_pickup()).

// What verify_pickup_qr() / confirm_pickup() return about a scanned code.
interface PickupQrInfo {
  status: string; // 'ok' | 'suspended' | 'already_picked_up' | an error code
  kind?: 'permanent' | 'temporary';
  student_id?: string;
  student_name?: string;
  grade_level?: string;
  guardian_name?: string;
  relationship?: string | null;
  previous_pickup_at?: string | null;
  previous_pickup_by?: string | null;
  guardian_photo_path?: string | null; // approved photo only; never set for temporary QRs
  student_photo_path?: string | null;
}

// A pickup photo, fetched once per day through a 60-second signed URL (lib/photo.ts).
function PickupPhoto({ path, label }: { path: string | null | undefined; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  useEffect(() => {
    let cancelled = false;
    if (!path) return;
    getPhotoUrl(path).then((u) => {
      if (cancelled) return;
      setUrl(u);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [path]);
  return (
    <div className="text-center">
      <div className="aspect-square w-full rounded-2xl bg-white border-2 border-[#eae7e0] overflow-hidden flex items-center justify-center">
        {url ? (
          <img src={url} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="text-xs text-[#8b8476] px-2">{loading ? 'Loading photo…' : 'No photo on file'}</div>
        )}
      </div>
      <div className="text-xs text-[#6b6456] mt-1">{label}</div>
    </div>
  );
}

// Rows returned by the guard_pickup_history() database function.
interface GuardHistoryRow {
  id: string;
  student_id: string;
  student_name: string;
  grade_level: string;
  guardian_name: string;
  relationship: string | null;
  guardian_id: string | null;
  scanned_at: string;
}

const SCAN_ERROR_MESSAGES: Record<string, string> = {
  invalid_code: 'This QR code is not a valid pickup code for this system. Please scan again.',
  legacy_qr: 'This is an old pickup QR code and is no longer accepted. Ask the parent to open the Parent Portal for their current code.',
  unknown_code: 'This pickup QR code is not recognized. It may have been cancelled by the school office.',
  pickup_not_allowed: 'This guardian is not allowed to pick up this student. Please contact the school office.',
  authorization_revoked: 'This temporary QR code has been revoked by the parent.',
  authorization_expired: 'This temporary QR code has expired. Ask the parent for a new one.',
  student_inactive: 'This student is not currently active in the system. Please contact the school office.',
};

const formatTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

interface GuardPortalProps {
  user: any;
  onLogout: () => void;
}

interface PickupRecord {
  id: string;
  studentName: string;
  studentId: string;
  studentGrade: string;
  parentName: string;
  parentId: string;
  timestamp: Date;
  status: 'completed' | 'pending';
  guardName: string;
}

export function GuardPortal({ user, onLogout }: GuardPortalProps) {
  // Restoring 'scan' only shows the scan page: the camera starts when the guard presses
  // Start Scanning (`scanning` is never persisted), so a refresh can't turn it on.
  const [activeView, setActiveView] = usePersistedView<'home' | 'scan' | 'history' | 'dismissal' | 'campus'>(
    'guard', user?.id, ['home', 'scan', 'history', 'dismissal', 'campus'], 'home',
  );
  const [scanning, setScanning] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [validating, setValidating] = useState(false);
  const [scanResult, setScanResult] = useState<PickupRecord | null>(null);
  const [pickupHistory, setPickupHistory] = useState<PickupRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [historyLoading, setHistoryLoading] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  // A scanned code waiting for the guard's Confirm / Reject decision.
  const [pendingScan, setPendingScan] = useState<{ qr: string; info: PickupQrInfo } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Guards against the scanner firing onUpdate again for the same code while a
  // previous decode is still being validated/recorded.
  const processingRef = useRef(false);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Guards have no direct access to student/guardian/pickup tables; the database returns
  // just what this screen shows through guard_pickup_history().
  const loadPickupHistory = async () => {
    setHistoryLoading(true);
    const { data, error } = await supabase.rpc('guard_pickup_history', { p_limit: 100 });

    if (!error && data) {
      const records: PickupRecord[] = (data as GuardHistoryRow[]).map((row) => ({
        id: row.id,
        studentName: row.student_name,
        studentId: row.student_id,
        studentGrade: row.grade_level,
        parentName: row.guardian_name,
        parentId: row.guardian_id ?? (row.relationship ? row.relationship : '—'),
        timestamp: new Date(row.scanned_at),
        status: 'completed',
        guardName: user.name,
      }));
      setPickupHistory(records);
    }
    setHistoryLoading(false);
  };

  // Load real pickup history from Supabase
  useEffect(() => {
    loadPickupHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startScanning = () => {
    setScanError(null);
    setNotice(null);
    setPendingScan(null);
    setScanResult(null);
    processingRef.current = false;
    setScanning(true);
  };

  const stopScanning = () => {
    setScanning(false);
    setValidating(false);
    processingRef.current = false;
  };

  // Called on every camera frame; `result` is only set when a code was actually decoded.
  // Step 1: look the code up. Nothing is recorded yet.
  const handleDecode = async (_err: unknown, result?: { getText(): string }) => {
    if (!result || processingRef.current) return;
    const qr = result.getText();

    processingRef.current = true;
    setValidating(true);
    setScanError(null);

    try {
      const { data, error } = await supabase.rpc('verify_pickup_qr', { p_qr: qr });
      const info = data as PickupQrInfo | null;
      if (error || !info) {
        setScanError('Could not check this QR code. Please try again.');
        return;
      }
      if (!['ok', 'suspended', 'already_picked_up'].includes(info.status)) {
        setScanError(SCAN_ERROR_MESSAGES[info.status] ?? SCAN_ERROR_MESSAGES.invalid_code);
        return;
      }
      setPendingScan({ qr, info });
      setRejecting(false);
      setRejectReason('');
      setScanning(false);
    } finally {
      setValidating(false);
      processingRef.current = false;
    }
  };

  // Step 2: the guard compared the person with the details and confirms the release.
  const handleConfirm = async () => {
    if (!pendingScan) return;
    setActionBusy(true);
    setScanError(null);
    try {
      const { data, error } = await supabase.rpc('confirm_pickup', { p_qr: pendingScan.qr });
      const res = data as { record?: PickupQrInfo & { id: string; scanned_at: string }; error?: string } | null;
      if (error || !res?.record) {
        setScanError(
          (res?.error && (SCAN_ERROR_MESSAGES[res.error] ?? 'This pickup can no longer be confirmed. Please scan again.')) ??
            'Could not record this pickup. Please try again.',
        );
        setPendingScan(null);
        return;
      }
      const record = res.record;
      const newPickup: PickupRecord = {
        id: record.id,
        studentName: record.student_name ?? '',
        studentId: record.student_id ?? '',
        studentGrade: record.grade_level ?? '—',
        parentName: record.guardian_name ?? '',
        parentId: record.relationship ?? '—',
        timestamp: new Date(record.scanned_at),
        status: 'completed',
        guardName: user.name,
      };
      setPendingScan(null);
      setScanResult(newPickup);
      setPickupHistory(prev => [newPickup, ...prev]);
    } finally {
      setActionBusy(false);
    }
  };

  // The guard refuses the release: reported to the office through the audit log.
  const handleReject = async () => {
    if (!pendingScan) return;
    setActionBusy(true);
    try {
      const { data, error } = await supabase.rpc('reject_pickup', { p_qr: pendingScan.qr, p_reason: rejectReason.trim() });
      if (error) {
        setScanError('Could not send the report. Please tell the school office directly.');
        return;
      }
      // Email the QR owner in the background (the parents' in-app notice is already saved).
      if (data?.audit_id) {
        void supabase.functions.invoke('notify-pickup-rejected', { body: { audit_id: data.audit_id } });
      }
      setPendingScan(null);
      setRejecting(false);
      setRejectReason('');
      setNotice('Pickup refused and reported to the school office.');
    } finally {
      setActionBusy(false);
    }
  };

  const confirmPickup = () => {
    setScanResult(null);
    setActiveView('home');
  };

  const filteredHistory = pickupHistory.filter(record => 
    record.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    record.parentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    record.studentId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const todayPickups = pickupHistory.filter(record => {
    const today = new Date();
    const recordDate = new Date(record.timestamp);
    return recordDate.toDateString() === today.toDateString();
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a2b4a] via-[#2d4263] to-[#1a2b4a] flex items-center justify-center sm:p-4">
      {/* App container: fills the real viewport on phones; on wider screens it's a centered "phone" card */}
      <div className="w-full h-screen sm:h-auto sm:max-w-md bg-white sm:rounded-3xl sm:shadow-2xl overflow-hidden flex flex-col sm:max-h-[90vh]">

        {/* Header */}
        <div className="shrink-0 bg-gradient-to-r from-[#1a2b4a] to-[#7d1935] p-6 text-white relative overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#c9a961] rounded-full opacity-10 blur-2xl"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white rounded-full opacity-5 blur-xl"></div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-lg rounded-2xl flex items-center justify-center">
                  <Shield className="w-6 h-6 text-[#c9a961]" />
                </div>
                <div>
                  <div className="text-xs text-white/70 uppercase tracking-wider">Security Portal</div>
                  <div className="font-bold text-lg">{user.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowChangePassword(true)}
                  aria-label="Change Password"
                  title="Change Password"
                  className="px-3 py-2 bg-white/10 backdrop-blur-lg rounded-xl text-xs font-medium hover:bg-white/20 transition-all flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Password</span>
                </button>
                <button
                  onClick={onLogout}
                  className="px-4 py-2 bg-white/10 backdrop-blur-lg rounded-xl text-xs font-medium hover:bg-white/20 transition-all"
                >
                  Logout
                </button>
              </div>
            </div>

            {/* Time Display */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-white/70 mb-1">Current Time</div>
                  <div className="text-2xl font-bold">
                    {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/70 mb-1">Today</div>
                  <div className="text-sm font-medium">
                    {currentTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeView === 'home' && (
            <div className="p-6 space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-[#1a2b4a] to-[#2d4263] rounded-2xl p-4 text-white">
                  <CheckCircle className="w-8 h-8 mb-2 text-[#c9a961]" />
                  <div className="text-2xl font-bold">{todayPickups.length}</div>
                  <div className="text-xs text-white/70">Pickups Today</div>
                </div>
                <div className="bg-gradient-to-br from-[#7d1935] to-[#9b2847] rounded-2xl p-4 text-white">
                  <Clock className="w-8 h-8 mb-2 text-[#c9a961]" />
                  <div className="text-2xl font-bold">{pickupHistory.length}</div>
                  <div className="text-xs text-white/70">Total Records</div>
                </div>
              </div>

              {/* Main Actions */}
              <div className="space-y-4">
                <button
                  onClick={() => setActiveView('scan')}
                  className="w-full bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-white/20 backdrop-blur-lg rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <QrCode className="w-8 h-8" />
                      </div>
                      <div className="text-left">
                        <div className="text-xl font-bold mb-1">Scan QR Code</div>
                        <div className="text-sm text-white/80">Verify parent pickup</div>
                      </div>
                    </div>
                    <Scan className="w-6 h-6 opacity-50" />
                  </div>
                </button>

                <button
                  onClick={() => setActiveView('history')}
                  className="w-full bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-white/20 backdrop-blur-lg rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <History className="w-8 h-8" />
                      </div>
                      <div className="text-left">
                        <div className="text-xl font-bold mb-1">View History</div>
                        <div className="text-sm text-white/80">Pickup records log</div>
                      </div>
                    </div>
                    <History className="w-6 h-6 opacity-50" />
                  </div>
                </button>

                <button
                  onClick={() => setActiveView('dismissal')}
                  className="w-full bg-white border-2 border-[#1a2b4a]/15 text-[#1a2b4a] p-5 rounded-2xl shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-[#1a2b4a]/5 rounded-2xl flex items-center justify-center">
                      <Footprints className="w-7 h-7" />
                    </div>
                    <div className="text-left">
                      <div className="text-lg font-bold">Self-Dismissal</div>
                      <div className="text-sm text-[#6b6456]">Students allowed to leave on their own</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveView('campus')}
                  className="w-full bg-white border-2 border-[#1a2b4a]/15 text-[#1a2b4a] p-5 rounded-2xl shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-[#1a2b4a]/5 rounded-2xl flex items-center justify-center">
                      <School className="w-7 h-7" />
                    </div>
                    <div className="text-left">
                      <div className="text-lg font-bold">Students on Campus</div>
                      <div className="text-sm text-[#6b6456]">Late pickups, call list, close the day</div>
                    </div>
                  </div>
                </button>
              </div>

              {/* Recent Pickups */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-[#1a2b4a]">Recent Pickups</h3>
                  <span className="text-xs text-[#6b6456]">{todayPickups.length} today</span>
                </div>
                <div className="space-y-2">
                  {todayPickups.slice(0, 3).map((record) => (
                    <div 
                      key={record.id}
                      className="bg-[#faf8f5] rounded-xl p-4 border border-[#eae7e0]"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-[#1a2b4a] mb-1">
                            {record.studentName}
                          </div>
                          <div className="text-xs text-[#6b6456] space-y-0.5">
                            <div>Parent: {record.parentName}</div>
                            <div>Time: {new Date(record.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-xs font-medium">Completed</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeView === 'dismissal' && <SelfDismissalTab onBack={() => setActiveView('home')} />}
          {activeView === 'campus' && <CampusTab onBack={() => setActiveView('home')} />}

          {activeView === 'scan' && (
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => {
                    setActiveView('home');
                    setScanResult(null);
                    stopScanning();
                  }}
                  className="w-11 h-11 bg-[#faf8f5] rounded-xl flex items-center justify-center hover:bg-[#eae7e0] transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-[#1a2b4a]" />
                </button>
                <h2 className="text-xl font-bold text-[#1a2b4a]">Scan QR Code</h2>
              </div>

              {!scanning && !scanResult && !pendingScan && (
                <div className="space-y-6">
                  {scanError && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                      <span className="text-sm text-red-700">{scanError}</span>
                    </div>
                  )}
                  {notice && !scanError && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                      <span className="text-sm text-amber-800">{notice}</span>
                    </div>
                  )}
                  {/* Scanner Frame */}
                  <div className="relative aspect-square bg-gradient-to-br from-[#1a2b4a] to-[#2d4263] rounded-3xl overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="relative w-64 h-64">
                        {/* Corner brackets */}
                        <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-[#c9a961] rounded-tl-2xl"></div>
                        <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-[#c9a961] rounded-tr-2xl"></div>
                        <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-[#c9a961] rounded-bl-2xl"></div>
                        <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-[#c9a961] rounded-br-2xl"></div>
                        
                        {/* Center icon */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <QrCode className="w-24 h-24 text-white/30" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="bg-[#faf8f5] rounded-2xl p-6 border border-[#eae7e0]">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-[#c9a961]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="w-5 h-5 text-[#c9a961]" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-[#1a2b4a] mb-2">Instructions</h4>
                        <ul className="text-sm text-[#6b6456] space-y-2">
                          <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 bg-[#c9a961] rounded-full mt-1.5"></span>
                            <span>Ask the parent to show their QR code</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 bg-[#c9a961] rounded-full mt-1.5"></span>
                            <span>Position the QR code within the frame</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 bg-[#c9a961] rounded-full mt-1.5"></span>
                            <span>Verify student information matches</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 bg-[#c9a961] rounded-full mt-1.5"></span>
                            <span>Confirm pickup completion</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Scan Button */}
                  <button
                    onClick={startScanning}
                    className="w-full bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Scan className="w-6 h-6" />
                    Start Scanning
                  </button>
                </div>
              )}

              {scanning && (
                <div className="space-y-6">
                  {scanError && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                      <span className="text-sm text-red-700">{scanError}</span>
                    </div>
                  )}
                  <div className="relative aspect-square bg-black rounded-3xl overflow-hidden">
                    <div className="absolute inset-0">
                      <BarcodeScanner
                        onUpdate={handleDecode}
                        onError={() => setScanError('Could not access the camera. Please check camera permissions and try again.')}
                        facingMode="environment"
                        delay={400}
                      />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="relative w-64 h-64">
                        <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-[#c9a961] rounded-tl-2xl"></div>
                        <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-[#c9a961] rounded-tr-2xl"></div>
                        <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-[#c9a961] rounded-bl-2xl"></div>
                        <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-[#c9a961] rounded-br-2xl"></div>
                      </div>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 bg-[#c9a961]/10 px-6 py-3 rounded-full">
                      <div className="w-2 h-2 bg-[#c9a961] rounded-full animate-pulse"></div>
                      <span className="text-[#1a2b4a] font-medium">{validating ? 'Verifying…' : 'Point the camera at the QR code'}</span>
                    </div>
                  </div>

                  <button
                    onClick={stopScanning}
                    className="w-full bg-[#faf8f5] text-[#1a2b4a] py-3 rounded-2xl font-semibold border-2 border-[#eae7e0] hover:bg-[#eae7e0] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {pendingScan && (() => {
                const info = pendingScan.info;
                const suspended = info.status === 'suspended';
                const alreadyPickedUp = info.status === 'already_picked_up';
                return (
                  <div className="space-y-5">
                    {suspended ? (
                      <div className="bg-red-600 text-white rounded-2xl p-5 text-center">
                        <XCircle className="w-10 h-10 mx-auto mb-2" />
                        <div className="text-xl font-extrabold tracking-wide">ACCESS SUSPENDED</div>
                        <div className="text-sm mt-1 text-white/90">Do not release the student. Verify in person with the school office.</div>
                      </div>
                    ) : alreadyPickedUp ? (
                      <div className="bg-amber-500 text-white rounded-2xl p-5 text-center">
                        <AlertCircle className="w-10 h-10 mx-auto mb-2" />
                        <div className="text-xl font-extrabold">ALREADY PICKED UP TODAY</div>
                        <div className="text-sm mt-1 text-white/95">
                          At {formatTime(info.previous_pickup_at)}
                          {info.previous_pickup_by ? ` by ${info.previous_pickup_by}` : ''}. Contact the school office before releasing.
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[#1a2b4a] text-white rounded-2xl p-5 text-center">
                        <Shield className="w-10 h-10 mx-auto mb-2 text-[#c9a961]" />
                        <div className="text-xl font-bold">Verify before releasing</div>
                        <div className="text-sm mt-1 text-white/85">
                          Compare with the person in front of you and check their government ID.
                        </div>
                      </div>
                    )}

                    <div className="bg-[#faf8f5] rounded-2xl p-6 border border-[#eae7e0] space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <PickupPhoto
                          path={info.guardian_photo_path}
                          label={info.kind === 'temporary' ? 'Temporary pickup (no photo)' : 'Guardian'}
                        />
                        <PickupPhoto path={info.student_photo_path} label="Student" />
                      </div>
                      <div>
                        <div className="text-xs text-[#6b6456] mb-1">
                          {info.kind === 'temporary' ? 'Temporary pickup person' : 'Parent/Guardian'}
                        </div>
                        <div className="text-2xl font-bold text-[#7d1935]">{info.guardian_name}</div>
                        <div className="text-sm font-semibold text-[#1a2b4a]">{info.relationship || '—'}</div>
                      </div>
                      <div className="pt-4 border-t border-[#eae7e0]">
                        <div className="text-xs text-[#6b6456] mb-1">Student</div>
                        <div className="text-lg font-bold text-[#1a2b4a]">{info.student_name}</div>
                        <div className="text-sm text-[#6b6456]">{info.grade_level} · {info.student_id}</div>
                      </div>
                      {!info.guardian_photo_path && (
                        <p className="text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                          No approved photo: verify with a government ID and notify the office.
                        </p>
                      )}
                    </div>

                    {scanError && (
                      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{scanError}</div>
                    )}

                    {rejecting ? (
                      <div className="space-y-3">
                        <label className="block text-sm font-semibold text-[#1a2b4a]">What's wrong? (optional)</label>
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          maxLength={500}
                          rows={3}
                          placeholder="e.g. ID didn't match, person refused to show ID"
                          className="w-full rounded-2xl border-2 border-[#eae7e0] p-3 text-sm text-black focus:outline-none focus:border-[#7d1935]"
                        />
                        <button
                          onClick={handleReject}
                          disabled={actionBusy}
                          className="w-full bg-[#7d1935] text-white py-4 rounded-2xl font-bold disabled:opacity-60"
                        >
                          {actionBusy ? 'Reporting…' : 'Refuse & Report to Office'}
                        </button>
                        <button
                          onClick={() => setRejecting(false)}
                          disabled={actionBusy}
                          className="w-full bg-[#faf8f5] text-[#1a2b4a] py-3 rounded-2xl font-semibold border-2 border-[#eae7e0]"
                        >
                          Back
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {!suspended && !alreadyPickedUp && (
                          <button
                            onClick={handleConfirm}
                            disabled={actionBusy}
                            className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg disabled:opacity-60"
                          >
                            {actionBusy ? 'Recording…' : 'Confirm — Release Student'}
                          </button>
                        )}
                        <button
                          onClick={() => setRejecting(true)}
                          disabled={actionBusy}
                          className="w-full bg-white text-[#7d1935] py-4 rounded-2xl font-bold border-2 border-[#7d1935] disabled:opacity-60"
                        >
                          Reject / Report
                        </button>
                        <button
                          onClick={() => { setPendingScan(null); setScanError(null); }}
                          disabled={actionBusy}
                          className="w-full bg-[#faf8f5] text-[#1a2b4a] py-3 rounded-2xl font-semibold border-2 border-[#eae7e0]"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {scanResult && (
                <div className="space-y-6">
                  {/* Success Icon */}
                  <div className="flex justify-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                      <CheckCircle className="w-12 h-12 text-white" />
                    </div>
                  </div>

                  <div className="text-center">
                    <h3 className="text-2xl font-bold text-[#1a2b4a] mb-2">Pickup Recorded</h3>
                    <p className="text-[#6b6456]">The student may be released</p>
                  </div>

                  {/* Pickup Details */}
                  <div className="bg-[#faf8f5] rounded-2xl p-6 border border-[#eae7e0] space-y-4">
                    <div>
                      <div className="text-xs text-[#6b6456] mb-1">Student Name</div>
                      <div className="text-lg font-bold text-[#1a2b4a]">{scanResult.studentName}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-[#6b6456] mb-1">Student ID</div>
                        <div className="font-semibold text-[#1a2b4a]">{scanResult.studentId}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#6b6456] mb-1">Grade</div>
                        <div className="font-semibold text-[#1a2b4a]">{scanResult.studentGrade}</div>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-[#eae7e0]">
                      <div className="text-xs text-[#6b6456] mb-1">Parent/Guardian</div>
                      <div className="text-lg font-bold text-[#7d1935]">{scanResult.parentName}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#6b6456] mb-1">Relationship</div>
                      <div className="font-semibold text-[#1a2b4a]">{scanResult.parentId}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#6b6456] mb-1">Pickup Time</div>
                      <div className="font-semibold text-[#1a2b4a]">
                        {new Date(scanResult.timestamp).toLocaleString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Confirm Button */}
                  <button
                    onClick={confirmPickup}
                    className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl transition-all"
                  >
                    Confirm Pickup
                  </button>

                  <button
                    onClick={() => setScanResult(null)}
                    className="w-full bg-[#faf8f5] text-[#1a2b4a] py-4 rounded-2xl font-semibold border-2 border-[#eae7e0] hover:bg-[#eae7e0] transition-all"
                  >
                    Scan Again
                  </button>
                </div>
              )}
            </div>
          )}

          {activeView === 'history' && (
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setActiveView('home')}
                  className="w-11 h-11 bg-[#faf8f5] rounded-xl flex items-center justify-center hover:bg-[#eae7e0] transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-[#1a2b4a]" />
                </button>
                <h2 className="text-xl font-bold text-[#1a2b4a]">Pickup History</h2>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6b6456]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by student, parent, or ID..."
                  className="w-full pl-12 pr-4 py-3 bg-[#faf8f5] border-2 border-[#eae7e0] rounded-2xl focus:border-[#c9a961] focus:ring-4 focus:ring-[#c9a961]/10 outline-none transition-all"
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-[#1a2b4a] to-[#2d4263] rounded-xl p-4 text-white">
                  <div className="text-xl font-bold">{todayPickups.length}</div>
                  <div className="text-xs text-white/70">Today</div>
                </div>
                <div className="bg-gradient-to-br from-[#7d1935] to-[#9b2847] rounded-xl p-4 text-white">
                  <div className="text-xl font-bold">{filteredHistory.length}</div>
                  <div className="text-xs text-white/70">Total Found</div>
                </div>
              </div>

              {/* History List */}
              <div className="space-y-3">
                {historyLoading && (
                  <div className="text-center py-12">
                    <p className="text-[#6b6456] font-medium">Loading pickup records…</p>
                  </div>
                )}
                {!historyLoading && filteredHistory.map((record) => {
                  const isToday = new Date(record.timestamp).toDateString() === new Date().toDateString();
                  
                  return (
                    <div 
                      key={record.id}
                      className={`rounded-xl p-4 border-2 transition-all ${
                        isToday 
                          ? 'bg-gradient-to-br from-[#c9a961]/5 to-[#d4af37]/5 border-[#c9a961]/20' 
                          : 'bg-[#faf8f5] border-[#eae7e0]'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <User className="w-4 h-4 text-[#1a2b4a]" />
                            <span className="font-bold text-[#1a2b4a]">{record.studentName}</span>
                          </div>
                          <div className="text-xs text-[#6b6456]">
                            {record.studentId} • {record.studentGrade}
                          </div>
                        </div>
                        {isToday && (
                          <span className="px-2 py-1 bg-[#c9a961] text-white text-xs font-medium rounded-lg">
                            Today
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-[#6b6456]">
                          <User className="w-3.5 h-3.5" />
                          <span>Parent: {record.parentName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[#6b6456]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {new Date(record.timestamp).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-[#eae7e0] flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-xs font-medium">Completed</span>
                        </div>
                        <span className="text-xs text-[#6b6456]">ID: {record.id}</span>
                      </div>
                    </div>
                  );
                })}

                {!historyLoading && filteredHistory.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-[#faf8f5] rounded-full flex items-center justify-center mx-auto mb-4">
                      <History className="w-8 h-8 text-[#6b6456]" />
                    </div>
                    <p className="text-[#6b6456] font-medium">
                      {pickupHistory.length === 0 ? 'No pickups recorded yet' : 'No records found'}
                    </p>
                    <p className="text-sm text-[#8b8476] mt-1">
                      {pickupHistory.length === 0 ? 'Scanned pickups will appear here' : 'Try adjusting your search'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CSS for scanning animation */}
      <style>{`
        @keyframes scan {
          0% { top: 0; }
          50% { top: 100%; }
          100% { top: 0; }
        }
      `}</style>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
