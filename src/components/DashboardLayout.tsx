import { useState, useEffect, type ReactNode } from 'react';
import {
  LogOut, Settings, Menu, X, ChevronDown,
  HelpCircle, MessageSquare, Calendar
} from 'lucide-react';
import schoolLogo from './assets/dmgteLogo.jpg';
import { listAllSchoolYears } from '../lib/schoolYear';
import { getSchoolSettings, DEFAULT_SCHOOL_SETTINGS } from '../lib/schoolSettings';

type NavItem = {
  id: string;
  label: string;
  icon: any;
  // Sub-pages that expand under this item in the sidebar. The parent id is never
  // itself a navigable view — clicking the parent only toggles the group and,
  // if none of its children is already active, jumps to the first child.
  children?: { id: string; label: string }[];
};

interface DashboardLayoutProps {
  user: any;
  role: 'admin' | 'teacher' | 'student' | 'parent' | 'guard' | 'cashier' | 'registrar';
  children: ReactNode;
  navigation: NavItem[];
  activeView: string;
  onViewChange: (id: string) => void;
  onLogout: () => void;
  schoolYear: string;
  onSchoolYearChange: (year: string) => void;
  onProfileClick?: () => void;
  // Restricts the year-switcher dropdown to a specific set of labels instead of every
  // school year on record — used by the Parent/Student portals so a student only ever
  // sees years they were actually enrolled in (a new student has no prior years to show;
  // a continuing student sees back to whichever year they first enrolled).
  availableYears?: string[];
}

// NOTE: your real project imports the school logo like this:
//   import schoolLogo from './assets/dmgteLogo.jpg';
// That relative asset isn't available in this preview sandbox, so the logo
// spot below uses a plain "DMS" badge placeholder instead. Back in your
// project, swap the placeholder <div> in the header (marked below) for:
//   <img src={schoolLogo} alt="School Logo" className="w-full h-full object-contain" />
// and restore the import above — everything else in this file is unchanged.

export function DashboardLayout({
  user,
  role,
  children,
  navigation,
  activeView,
  onViewChange,
  onLogout,
  schoolYear,
  onSchoolYearChange,
  availableYears
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showYearSelector, setShowYearSelector] = useState(false);
  const [allSchoolYears, setAllSchoolYears] = useState<{ label: string; isCurrent: boolean }[]>([]);
  const [schoolName, setSchoolName] = useState(DEFAULT_SCHOOL_SETTINGS.school_name);
  const [openGroupId, setOpenGroupId] = useState<string | null>(
    () => navigation.find((n) => n.children?.some((c) => c.id === activeView))?.id ?? null
  );

  useEffect(() => {
    let cancelled = false;
    listAllSchoolYears().then((years) => {
      if (cancelled) return;
      setAllSchoolYears(years.map((y) => ({ label: y.label, isCurrent: y.is_current })));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSchoolSettings().then((settings) => {
      if (!cancelled) setSchoolName(settings.school_name);
    });
    return () => { cancelled = true; };
  }, []);

  const schoolYears = availableYears
    ? allSchoolYears.filter((y) => availableYears.includes(y.label))
    : allSchoolYears;

  const roleConfig: Record<DashboardLayoutProps['role'], { title: string; roleLabel: string; color: string; lightColor: string }> = {
    admin: {
      title: 'Administrator Portal',
      roleLabel: 'Administrator',
      color: '#1a2b4a',
      lightColor: '#2d3f5e'
    },
    teacher: {
      title: 'Teacher Portal',
      roleLabel: 'Teacher',
      color: '#7d1935',
      lightColor: '#9b2847'
    },
    student: {
      title: 'Student Portal',
      roleLabel: 'Student',
      color: '#1e3a8a',
      lightColor: '#2a4fa8'
    },
    parent: {
      title: 'Parent Portal',
      roleLabel: 'Parent',
      color: '#1a5c38',
      lightColor: '#236b44'
    },
    guard: {
      title: 'Security Portal',
      roleLabel: 'Guard',
      color: '#3d4a5c',
      lightColor: '#4e5e72'
    },
    cashier: {
      title: 'Cashier Portal',
      roleLabel: 'Cashier',
      color: '#7a5c1e',
      lightColor: '#96722a'
    },
    registrar: {
      title: 'Registrar Portal',
      roleLabel: 'Registrar',
      color: '#1a4a4a',
      lightColor: '#235e5e'
    }
  };

  const config = roleConfig[role];

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      {/* Top Navigation Bar — fixed so it stays put while the page scrolls.
          inset-x-0 keeps it full-width since position:fixed elements don't
          stretch to fill their container the way sticky/static ones do. */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 lg:px-6 h-16">
          {/* Left Section */}
          <div className="flex items-center gap-4">
            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            {/* Logo and School Name */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center">
                <img 
                  src={schoolLogo} 
                  alt="School Logo" 
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="hidden sm:block flex flex-col ">
                <h1 className="text-[14px] font-bold text-[#1a2b4a] " style={{ fontFamily: "'Inter', sans-serif" }}>
                  {schoolName}
                </h1>
                <p className="text-[12px] text-[#8b8476] text-left" style={{ fontFamily: "'Inter', sans-serif" }}>
                  {config.title}
                </p>
              </div>
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2">

            {/* School Year Selector */}
            {onSchoolYearChange && (
              <div className="relative">
                <button
                  onClick={() => setShowYearSelector(!showYearSelector)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Calendar className="w-5 h-5 text-[#8b8476]" />
                  <span className="text-sm text-[#2c2c2c]">{schoolYear}</span>
                  <ChevronDown className="w-4 h-4 text-[#8b8476]" />
                </button>

                {/* Year Selector Dropdown */}
                {showYearSelector && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowYearSelector(false)}
                    ></div>
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 z-50">
                      <div className="p-4 border-b border-gray-200">
                        <h3 className="font-semibold text-[#1a2b4a]">Select School Year</h3>
                      </div>
                      <div className="p-2">
                        {schoolYears.map((year) => (
                          <button
                            key={year.label}
                            onClick={() => {
                              onSchoolYearChange(year.label);
                              setShowYearSelector(false);
                            }}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-[#faf8f5] rounded-lg transition-colors text-left"
                          >
                            <span className="flex items-center gap-3">
                              <Calendar className="w-4 h-4 text-[#8b8476]" />
                              <span className="text-sm text-[#2c2c2c]">{year.label}</span>
                            </span>
                            {year.isCurrent ? (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#1a5c38] bg-[#1a5c38]/10 px-2 py-0.5 rounded-full">Current</span>
                            ) : (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8b8476] bg-gray-100 px-2 py-0.5 rounded-full">Archived</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* User Profile */}
            <div className="relative">
              <button
                onClick={() => setShowProfile(!showProfile)}
                className="flex items-center gap-2 pl-2 pr-3 py-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                  style={{ backgroundColor: config.color }}
                >
                  {user.name.charAt(0)}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-semibold text-[#2c2c2c] leading-tight">
                    {user.name.split(' ').slice(0, 2).join(' ')}
                  </p>
                  <p className="text-xs text-[#8b8476]">
                    {config.roleLabel}
                  </p>
                </div>
                <ChevronDown className="hidden md:block w-4 h-4 text-[#8b8476]" />
              </button>

              {/* Profile Dropdown */}
              {showProfile && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfile(false)}
                  ></div>
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 z-50">
                    <div className="p-4 border-b border-gray-200">
                      <div className="flex items-center gap-3">

                        <div className="flex-1">
                          <p className="font-semibold text-[#2c2c2c]">{user.name}</p>
                          <p className="text-xs text-[#8b8476]">{user.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-2 border-t border-gray-200">
                      <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-50 rounded-lg transition-colors text-left group"
                      >
                        <LogOut className="w-4 h-4 text-[#8b8476] group-hover:text-[#7d1935]" />
                        <span className="text-sm text-[#2c2c2c] group-hover:text-[#7d1935] font-semibold">
                          Sign Out
                        </span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* pt-16 clears the now-fixed header (h-16 = 4rem) so the sidebar and
          main content don't render underneath it. */}
      <div className="flex pt-16">
        {/* Sidebar */}
        <aside className={`
          fixed lg:sticky top-16 bottom-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transition-transform duration-300 lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="sticky top-16 left-0 h-[calc(100vh-4rem)] flex flex-col w-64 z-40">
            {/* Navigation */}
            <nav className="flex-1 p-4 overflow-y-auto ">
              <div className="space-y-1">
                {navigation.map((item: NavItem) => {
                  const Icon = item.icon;
                  const hasChildren = !!item.children?.length;
                  const isChildActive =
                    hasChildren && item.children!.some((c) => c.id === activeView);
                  const isActive = !hasChildren && activeView === item.id;
                  const isOpen = hasChildren && openGroupId === item.id;

                  return (
                    <div key={item.id}>
                      <button
                        onClick={() => {
                          if (hasChildren) {
                            setOpenGroupId((prev) => (prev === item.id ? null : item.id));
                            if (!isChildActive) {
                              onViewChange(item.children![0].id);
                              setSidebarOpen(false);
                            }
                          } else {
                            setOpenGroupId(null);
                            onViewChange(item.id);
                            setSidebarOpen(false);
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                          isActive
                            ? 'text-white shadow-md'
                            : isChildActive
                            ? 'text-[#1a2b4a] font-semibold'
                            : 'text-[#6b6456] hover:bg-[#faf8f5] hover:text-[#1a2b4a]'
                        }`}
                        style={isActive ? { backgroundColor: config.color } : {}}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium text-sm flex-1 text-left">{item.label}</span>
                        {hasChildren && (
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          />
                        )}
                      </button>

                      {hasChildren && isOpen && (
                        <div className="ml-4 mt-1 mb-1 space-y-1 border-l border-gray-200 pl-3">
                          {item.children!.map((child) => {
                            const childActive = activeView === child.id;
                            return (
                              <button
                                key={child.id}
                                onClick={() => {
                                  setOpenGroupId(item.id);
                                  onViewChange(child.id);
                                  setSidebarOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                                  childActive
                                    ? 'text-white shadow-md'
                                    : 'text-[#6b6456] hover:bg-[#faf8f5] hover:text-[#1a2b4a]'
                                }`}
                                style={childActive ? { backgroundColor: config.color } : {}}
                              >
                                {child.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </nav>

            {/* Registrar notice — shown for all non-admin, non-registrar roles */}
            {role !== 'admin' && role !== 'registrar' && (
              <div className="p-4 border-t border-gray-200">
                <div className="bg-[#1a2b4a]/5 border border-[#1a2b4a]/15 rounded-xl p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-[#1a2b4a] shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold text-[#1a2b4a]">Need Assistance?</p>
                  </div>
                  <p className="text-xs text-[#6b6456] leading-relaxed">
                    If you have any concern or inquiry, please visit the{' '}
                    <span className="font-semibold text-[#1a2b4a]">Registrar's Office</span> during school hours.
                  </p>
                  <p className="text-xs text-[#8b8476] mt-2">Mon – Fri, 7:30 AM – 4:30 PM</p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        {/* min-w-0 overrides the flex item's default min-width:auto — without it, any
            descendant with a fixed/min pixel width (a wide table, the schedule grid)
            bubbles up as this item's automatic minimum size and forces the whole page
            wider than the viewport on mobile, instead of just scrolling internally. */}
        <main className="flex-1 min-w-0 min-h-[calc(100vh-4rem)]">
          <div className="p-4 lg:p-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}
    </div>
  );
}