import { Mail, Phone, MapPin } from 'lucide-react';

function initialsFor(name: string) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('') || '?';
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not on file';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Not on file';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function Field({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-[#8b8476] mb-1">{label}</p>
      <p className={`text-sm ${highlight ? 'font-bold text-[#c9a961]' : 'text-[#2c2c2c]'}`}>{value}</p>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  full_admin: 'Administrator',
  registrar: 'Registrar',
  cashier: 'Cashier',
  teacher: 'Teacher',
  guard: 'Guard',
};

// Shared "My Profile" view for staff roles (Admin, Teacher, Cashier, Registrar, Guard) —
// backed by the same profiles + employees data resolveIdentity() already fetched at login.
export function StaffProfileView({ user, color = '#1a2b4a' }: { user: any; color?: string }) {
  const employee = user.employee ?? {};
  const fullName = user.name || employee.full_name || 'Not on file';
  const roleLabel = ROLE_LABELS[user.role] || user.role || 'Staff';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">My Profile</h1>
        <p className="text-[#6b6456]">View your account and employment information</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-center mb-6">
            <div
              className="w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center text-white text-3xl font-bold"
              style={{ backgroundColor: color }}
            >
              {initialsFor(fullName)}
            </div>
            <h3 className="text-xl font-bold text-[#1a2b4a] mb-1">{fullName}</h3>
            <p className="text-sm text-[#8b8476] mb-2">{employee.position || roleLabel}</p>
            {user.employeeId && <p className="text-xs text-[#6b6456]">Employee ID: {user.employeeId}</p>}
          </div>

          <div className="space-y-3 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-[#8b8476]" />
              <span className="text-[#6b6456]">{user.email || employee.email || 'Not on file'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Phone className="w-4 h-4 text-[#8b8476]" />
              <span className="text-[#6b6456]">{employee.phone || 'Not on file'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="w-4 h-4 text-[#8b8476]" />
              <span className="text-[#6b6456]">{employee.address || 'Not on file'}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">Account Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Full Name" value={fullName} />
              <Field label="Email" value={user.email || 'Not on file'} />
              
              <Field label="Position" value={employee.position || 'Not on file'} />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">Employment Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Employment Type" value={employee.employment_type || 'Not on file'} />
              <Field label="Date Hired" value={formatDate(employee.date_hired)} />
              <Field label="Education" value={employee.education || 'Not on file'} />
              <Field label="License No." value={employee.license_no || 'Not on file'} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
