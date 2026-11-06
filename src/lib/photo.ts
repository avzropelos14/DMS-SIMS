import { supabase } from '../supabase';

// Pickup-verification photos (Phase 5B). Everything is resized and compressed in the
// browser BEFORE upload so the free tier's 1 GB storage / 5 GB egress go a long way:
// at most 400 px on the long side, JPEG, aiming for 60 KB or less. No Supabase image
// transformations are used (they are a paid feature).

export const PHOTO_BUCKET = 'guardian-photos';
const MAX_SIDE = 400;
const TARGET_BYTES = 60 * 1024;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

// Draws any image source onto a <=400 px canvas and lowers JPEG quality until it fits.
export async function compressImage(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process the photo.');
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    let best: Blob | null = null;
    for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
        best = await canvasToBlob(canvas, quality);
        if (best && best.size <= TARGET_BYTES) break;
    }
    if (!best) throw new Error('Could not process the photo.');
    return best;
}

export async function compressImageFile(file: File): Promise<Blob> {
    if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
    const bitmap = await createImageBitmap(file);
    try {
        return await compressImage(bitmap, bitmap.width, bitmap.height);
    } finally {
        bitmap.close();
    }
}

// Folder names must match the database checks (see the Phase 5B migration).
export const safeFolder = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '');
export const photoFileName = () => `${Date.now()}.jpg`;

export async function uploadPhoto(path: string, blob: Blob): Promise<string | null> {
    const { error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    return error ? error.message : null;
}

export async function deletePhoto(path: string | null | undefined): Promise<void> {
    if (!path) return;
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}

// Photos are fetched once per day per device through a 60-second signed URL and kept in
// memory as an object URL, so repeat views (e.g. the same parent every afternoon) cost no
// further download traffic.
const photoCache = new Map<string, { day: string; url: string }>();
const today = () => new Date().toDateString();

export async function getPhotoUrl(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    const cached = photoCache.get(path);
    if (cached && cached.day === today()) return cached.url;
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return null;
    try {
        const res = await fetch(data.signedUrl);
        if (!res.ok) return null;
        const url = URL.createObjectURL(await res.blob());
        if (cached) URL.revokeObjectURL(cached.url);
        photoCache.set(path, { day: today(), url });
        return url;
    } catch {
        return null;
    }
}
