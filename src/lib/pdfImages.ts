import schoolLogo from "../components/assets/dmgteLogo.jpg";

function loadImageAsDataUrl(src: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                reject(new Error("Canvas context unavailable"));
                return;
            }
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        img.src = src;
    });
}

let cachedSchoolLogoDataUrl: string | null = null;
export async function getSchoolLogoDataUrl(): Promise<string> {
    if (!cachedSchoolLogoDataUrl)
        cachedSchoolLogoDataUrl = await loadImageAsDataUrl(schoolLogo);
    return cachedSchoolLogoDataUrl;
}

export function imageFormatFromDataUrl(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
    if (dataUrl.startsWith("data:image/png")) return "PNG";
    if (dataUrl.startsWith("data:image/webp")) return "WEBP";
    return "JPEG";
}
