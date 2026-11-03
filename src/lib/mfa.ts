import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../supabase';

const DEVICE_TOKEN_PREFIX = 'sims_trusted_device_';

export function getStoredDeviceToken(userId: string): string | null {
    try {
        return localStorage.getItem(DEVICE_TOKEN_PREFIX + userId);
    } catch {
        return null;
    }
}

export function storeDeviceToken(userId: string, token: string): void {
    try {
        localStorage.setItem(DEVICE_TOKEN_PREFIX + userId, token);
    } catch {
        // localStorage unavailable (private browsing, etc.) — device just won't be remembered.
    }
}

// Non-2xx responses (400 wrong code, 429 rate limit/lock) carry their reason in the body.
interface FunctionErrorBody {
    error?: string;
    retryAfterSeconds?: number;
    locked?: boolean;
}

async function errorBody(error: unknown): Promise<FunctionErrorBody | null> {
    if (error instanceof FunctionsHttpError) {
        try {
            return await error.context.json();
        } catch {
            return null;
        }
    }
    return null;
}

export interface CheckTrustedDeviceResult {
    trusted: boolean;
    error?: string;
}

// Only asks whether this device is remembered; never sends an email. Used on login and
// on session restore so a page refresh can't burn one of the free daily emails.
export async function checkTrustedDevice(userId: string): Promise<CheckTrustedDeviceResult> {
    const deviceToken = getStoredDeviceToken(userId);
    const { data, error } = await supabase.functions.invoke('mfa-send-code', {
        body: { deviceToken, checkOnly: true },
    });
    if (error) {
        const body = await errorBody(error);
        return { trusted: false, error: body?.error ?? 'Could not check this device. Please try again.' };
    }
    return { trusted: !!data?.trusted };
}

export interface SendMfaCodeResult {
    trusted: boolean;
    sent?: boolean;
    alreadySent?: boolean;
    // Seconds until the Resend button may be used (cooldown or rate limit).
    resendAvailableInSeconds?: number;
    locked?: boolean;
    error?: string;
}

// Called from the MFA screen only. Without `resend`, an unexpired code that was already
// emailed is reused (no new email); `resend` asks for a fresh code.
export async function sendMfaCode(userId: string, options: { resend?: boolean } = {}): Promise<SendMfaCodeResult> {
    const deviceToken = getStoredDeviceToken(userId);
    const { data, error } = await supabase.functions.invoke('mfa-send-code', {
        body: { deviceToken, resend: !!options.resend },
    });
    if (error) {
        const body = await errorBody(error);
        return {
            trusted: false,
            error: body?.error ?? 'Could not send verification code. Please try again.',
            resendAvailableInSeconds: body?.retryAfterSeconds,
            locked: !!body?.locked,
        };
    }
    return {
        trusted: !!data?.trusted,
        sent: !!data?.sent,
        alreadySent: !!data?.alreadySent,
        resendAvailableInSeconds: data?.resendAvailableInSeconds,
    };
}

export interface VerifyMfaCodeResult {
    success: boolean;
    error?: string;
    locked?: boolean;
}

export async function verifyMfaCode(userId: string, code: string, rememberDevice: boolean): Promise<VerifyMfaCodeResult> {
    const { data, error } = await supabase.functions.invoke('mfa-verify-code', {
        body: { code, rememberDevice },
    });
    if (error) {
        const body = await errorBody(error);
        return { success: false, error: body?.error ?? 'Could not verify code. Please try again.', locked: !!body?.locked };
    }
    if (data?.error) {
        return { success: false, error: data.error };
    }
    if (rememberDevice && data?.deviceToken) {
        storeDeviceToken(userId, data.deviceToken);
    }
    return { success: true };
}
