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

export interface SendMfaCodeResult {
    trusted: boolean;
    error?: string;
}

export async function sendMfaCode(userId: string): Promise<SendMfaCodeResult> {
    const deviceToken = getStoredDeviceToken(userId);
    const { data, error } = await supabase.functions.invoke('mfa-send-code', {
        body: { deviceToken },
    });
    if (error) {
        return { trusted: false, error: 'Could not send verification code. Please try again.' };
    }
    if (data?.error) {
        return { trusted: false, error: data.error };
    }
    return { trusted: !!data?.trusted };
}

export interface VerifyMfaCodeResult {
    success: boolean;
    error?: string;
}

export async function verifyMfaCode(userId: string, code: string, rememberDevice: boolean): Promise<VerifyMfaCodeResult> {
    const { data, error } = await supabase.functions.invoke('mfa-verify-code', {
        body: { code, rememberDevice },
    });
    if (error) {
        return { success: false, error: 'Could not verify code. Please try again.' };
    }
    if (data?.error) {
        return { success: false, error: data.error };
    }
    if (rememberDevice && data?.deviceToken) {
        storeDeviceToken(userId, data.deviceToken);
    }
    return { success: true };
}
