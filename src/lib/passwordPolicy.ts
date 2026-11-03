// Free replacement for Supabase's Pro-only leaked-password protection:
// local rules + bundled list first, then the free Pwned Passwords range API (fail-open).
// commonPasswords.txt holds every 10+ character entry of the SecLists
// "100k-most-used-passwords-NCSC" list (MIT) plus school-specific terms, lower-cased.
// Shorter entries are left out because MIN_PASSWORD_LENGTH already rejects them.

export const MIN_PASSWORD_LENGTH = 10;

// Words that make a weak password even with digits/symbols stuck on either end
// ("Password2024!", "#dgteschool1").
const WEAK_BASE_WORDS = new Set([
    "password", "passw0rd", "qwerty", "qwertyuiop", "admin", "administrator",
    "welcome", "letmein", "iloveyou", "changeme", "abc", "abcdef", "student",
    "teacher", "parent", "registrar", "cashier", "guard", "school", "dgteschool",
    "missionschool", "dumaguete", "dumaguetemission", "dumaguetemissionschool",
    "mission", "dmsis", "sims",
]);

// School terms that may not appear anywhere in a password.
const SCHOOL_TERMS = ["dgteschool", "missionschool", "dumaguetemission", "dmsis"];

// Generic parts of generated login emails (jdelacruz.student@...) that say nothing about the person.
const GENERIC_EMAIL_PARTS = new Set(["student", "parent", "teacher", "admin", "registrar", "cashier", "guard"]);

let commonPasswords: Promise<Set<string>> | null = null;

function loadCommonPasswords(): Promise<Set<string>> {
    commonPasswords ??= import("./commonPasswords.txt?raw")
        .then((m) => new Set(m.default.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)))
        .catch(() => {
            commonPasswords = null; // allow a retry; length and word rules still apply
            return new Set<string>();
        });
    return commonPasswords;
}

function personalParts(email?: string | null, names: (string | null | undefined)[] = []): string[] {
    const parts: string[] = [];
    const local = email?.split("@")[0]?.toLowerCase() ?? "";
    for (const part of local.split(/[._+-]+/)) {
        if (part.length >= 4 && !GENERIC_EMAIL_PARTS.has(part)) parts.push(part);
    }
    for (const name of names) {
        for (const word of (name ?? "").toLowerCase().split(/[^a-z]+/)) {
            if (word.length >= 3) parts.push(word);
        }
    }
    return parts;
}

const PWNED_RANGE_URL = "https://api.pwnedpasswords.com/range/";
const PWNED_TIMEOUT_MS = 5000;

async function sha1HexUpper(input: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Have I Been Pwned "Pwned Passwords" range check (free, no API key).
 * Only the first 5 hex characters of the password's SHA-1 hash leave the device
 * (k-anonymity); the match against the returned suffixes happens locally.
 * Fail-open: returns false when the service can't be reached, so the local list still applies.
 */
async function isPwnedPassword(password: string): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PWNED_TIMEOUT_MS);
    try {
        const hash = await sha1HexUpper(password);
        const prefix = hash.slice(0, 5);
        const suffix = hash.slice(5);
        const res = await fetch(PWNED_RANGE_URL + prefix, {
            headers: { "Add-Padding": "true" },
            signal: controller.signal,
        });
        if (!res.ok) return false;
        const body = await res.text();
        return body.split(/\r?\n/).some((line) => {
            const [lineSuffix, count] = line.trim().split(":");
            return lineSuffix === suffix && Number(count) > 0; // padding rows have count 0
        });
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Checks a new password against the school's policy.
 * Returns a user-facing error message, or null when the password is acceptable.
 * Never logs or stores the password.
 */
export async function checkPasswordPolicy(
    password: string,
    context: { email?: string | null; names?: (string | null | undefined)[] } = {},
): Promise<string | null> {
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
    }

    const lower = password.toLowerCase();
    const base = lower.replace(/^[^a-z]+|[^a-z]+$/g, "");

    if (WEAK_BASE_WORDS.has(base) || SCHOOL_TERMS.some((term) => lower.includes(term))) {
        return "This password is too easy to guess. Avoid common words and the school's name.";
    }

    if (personalParts(context.email, context.names).some((part) => lower.includes(part))) {
        return "Your password must not contain your name or your email address.";
    }

    const common = await loadCommonPasswords();
    if (common.has(lower)) {
        return "This password appears on lists of commonly used passwords. Please choose a different one.";
    }

    if (await isPwnedPassword(password)) {
        return "This password has appeared in a known data breach. Please choose a different one.";
    }

    return null;
}
