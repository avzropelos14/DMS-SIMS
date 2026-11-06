import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Upload, X, AlertCircle, RotateCcw } from "lucide-react";
import { compressImage, compressImageFile } from "../../lib/photo";

interface PhotoCaptureModalProps {
    title: string;
    // Shown above the buttons, e.g. a consent line.
    note?: string;
    // Which camera to open first: "user" (front/selfie) or "environment" (back).
    facingMode?: "user" | "environment";
    // Receives the compressed JPEG. Return an error message to keep the window open.
    onSave: (photo: Blob) => Promise<string | null>;
    onClose: () => void;
}

// Take a photo with the device camera (or pick a file), preview it, then hand back a
// compressed JPEG of about 60 KB or less (see lib/photo.ts).
export function PhotoCaptureModal({ title, note, facingMode = "environment", onSave, onClose }: PhotoCaptureModalProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [cameraOn, setCameraOn] = useState(false);
    const [photo, setPhoto] = useState<Blob | null>(null);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCameraOn(false);
    };

    useEffect(() => () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
    }, []);

    const previewUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
    useEffect(() => () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    }, [previewUrl]);

    const startCamera = async () => {
        setError("");
        setPhoto(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
            streamRef.current = stream;
            setCameraOn(true);
            requestAnimationFrame(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    void videoRef.current.play();
                }
            });
        } catch {
            setError("Could not open the camera. Check the camera permission, or choose a photo file instead.");
        }
    };

    const snap = async () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;
        try {
            setPhoto(await compressImage(video, video.videoWidth, video.videoHeight));
            stopCamera();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not take the photo.");
        }
    };

    const onFile = async (file: File | undefined) => {
        if (!file) return;
        setError("");
        stopCamera();
        try {
            setPhoto(await compressImageFile(file));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not read that photo.");
        }
    };

    const save = async () => {
        if (!photo) return;
        setSaving(true);
        setError("");
        const failure = await onSave(photo);
        setSaving(false);
        if (failure) setError(failure);
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-[#1a2b4a]">{title}</h3>
                    <button
                        onClick={() => { stopCamera(); onClose(); }}
                        className="p-2 rounded-lg hover:bg-gray-100"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5 text-[#6b6456]" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="aspect-square w-full max-w-xs mx-auto bg-[#faf8f5] border-2 border-dashed border-gray-300 rounded-2xl overflow-hidden flex items-center justify-center">
                        {cameraOn ? (
                            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                        ) : previewUrl && photo ? (
                            <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <Camera className="w-12 h-12 text-gray-300" />
                        )}
                    </div>

                    {photo && !cameraOn && (
                        <p className="text-xs text-center text-[#8b8476]">Compressed size: {Math.round(photo.size / 1024)} KB</p>
                    )}

                    {note && <p className="text-xs text-[#6b6456] bg-[#faf8f5] rounded-lg p-3">{note}</p>}

                    {error && (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {cameraOn ? (
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={stopCamera} className="py-3 rounded-xl border-2 border-gray-200 text-[#1a2b4a] font-medium">
                                Cancel
                            </button>
                            <button onClick={snap} className="py-3 rounded-xl bg-[#1a2b4a] text-white font-semibold">
                                Take Photo
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={startCamera}
                                className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#1a2b4a] text-[#1a2b4a] font-medium"
                            >
                                {photo ? <RotateCcw className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                                {photo ? "Retake" : "Use Camera"}
                            </button>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 text-[#1a2b4a] font-medium"
                            >
                                <Upload className="w-4 h-4" /> Choose File
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }}
                            />
                        </div>
                    )}

                    <button
                        onClick={save}
                        disabled={!photo || saving || cameraOn}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#c9a961] to-[#d4af37] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? "Saving…" : "Save Photo"}
                    </button>
                </div>
            </div>
        </div>
    );
}
