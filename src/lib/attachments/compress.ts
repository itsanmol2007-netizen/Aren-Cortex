// ---------------------------------------------------------------------------
// Client-side compression, before a file ever reaches the upload URL.
//
// Type-aware on purpose, not one universal target. A lab report or a wound
// photo compresses hard — the fine detail doesn't carry information a doctor
// needs back. An X-ray or ultrasound compresses gently — the detail IS the
// point, and over-compressing one destroys exactly what the doctor took the
// picture for. Decided live with Anmol, 2026-08-08.
//
// application/pdf passes through UNCHANGED. Re-compressing a PDF client-side
// needs a real PDF library (re-rasterising pages, rebuilding the document) —
// real work, out of scope tonight. A scanned lab report is usually already a
// modest size; attachment-upload-url's 8MB backstop still catches anything
// absurd, PDF or not.
// ---------------------------------------------------------------------------

import type { AttachmentType } from "./types";

export interface CompressionProfile {
    /** longest edge, in pixels, after resize — never upscales */
    maxDimension: number;
    /** stop stepping quality down once the blob is at or under this many bytes */
    targetBytes: number;
    /**
     * Never step below this JPEG quality, even if still over target. Past
     * this point compression is destroying the image, not just shrinking
     * it — a doctor should see a slightly-too-large file before a
     * clinically useless one.
     */
    qualityFloor: number;
}

const AGGRESSIVE: CompressionProfile = { maxDimension: 1600, targetBytes: 550_000, qualityFloor: 0.5 };
const GENTLE: CompressionProfile = { maxDimension: 2400, targetBytes: 1_500_000, qualityFloor: 0.65 };

/**
 * xray/scan get the gentle profile — diagnostic detail matters and the
 * ceiling is meaningfully higher (~1.5MB vs ~550KB). Everything else
 * (photo/lab_report/other) gets the aggressive one: these are almost always
 * legible well below where JPEG artifacts start costing anything real.
 */
const PROFILE_BY_TYPE: Record<AttachmentType, CompressionProfile> = {
    xray: GENTLE,
    scan: GENTLE,
    photo: AGGRESSIVE,
    lab_report: AGGRESSIVE,
    other: AGGRESSIVE,
};

export interface CompressResult {
    blob: Blob;
    /** what the compressor actually settled on — surfaced so the UI can be
     *  honest when it couldn't hit the target (a genuinely huge, detailed
     *  image bottoming out at the quality floor, still over target) rather
     *  than silently claiming success */
    finalQuality: number;
    hitQualityFloor: boolean;
    originalBytes: number;
    finalBytes: number;
    width: number;
    height: number;
}

/** application/pdf is the one accepted type this never touches — see the file header. */
export function needsCompression(mimeType: string): boolean {
    return mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp";
}

/**
 * Resize to the profile's max dimension, then step JPEG quality down in
 * 0.1 increments from 0.92 until the blob is at or under target — or the
 * quality floor is reached, whichever comes first. Coarse enough to finish
 * in a handful of encodes on an ordinary phone; fine enough that a good
 * stopping point rarely gets skipped over.
 */
export async function compressImage(file: File, attachmentType: AttachmentType): Promise<CompressResult> {
    const profile = PROFILE_BY_TYPE[attachmentType];
    const bitmap = await createImageBitmap(file);

    const scale = Math.min(1, profile.maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        bitmap.close();
        throw new Error("canvas 2d context unavailable");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let quality = 0.92;
    let blob = await encode(canvas, quality);

    while (blob.size > profile.targetBytes && quality > profile.qualityFloor) {
        quality = Math.max(profile.qualityFloor, Math.round((quality - 0.1) * 100) / 100);
        blob = await encode(canvas, quality);
    }

    return {
        blob,
        finalQuality: quality,
        hitQualityFloor: quality <= profile.qualityFloor && blob.size > profile.targetBytes,
        originalBytes: file.size,
        finalBytes: blob.size,
        width,
        height,
    };
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas encode failed"))), "image/jpeg", quality);
    });
}
