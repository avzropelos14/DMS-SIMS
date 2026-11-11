import type { UserRole } from '../App';

// Inactivity sign-out. Office accounts that can see or change many records get the
// shortest limit; the gate guard's scanner often sits untouched between pickups.
export const IDLE_LIMIT_MINUTES: Record<Exclude<UserRole, null>, number> = {
  admin: 15,
  registrar: 15,
  cashier: 15,
  teacher: 30,
  parent: 30,
  student: 30,
  guard: 60,
};

// How long before sign-out the warning appears.
export const IDLE_WARNING_SECONDS = 60;

// Shared by every tab of this browser, so activity in one tab keeps the others signed in.
const ACTIVITY_KEY = 'sims-last-activity';

export function readLastActivity(): number | null {
  try {
    const v = Number(localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function writeLastActivity(at = Date.now()) {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    // Storage blocked (private window): this tab still tracks its own activity.
  }
}

export function clearLastActivity() {
  try {
    localStorage.removeItem(ACTIVITY_KEY);
  } catch {
    // Nothing stored.
  }
}
