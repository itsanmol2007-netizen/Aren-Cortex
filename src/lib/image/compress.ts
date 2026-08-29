// ---------------------------------------------------------------------------
// Client-side image compression — clinic logo & doctor profile-photo uploads.
//
// The registration pipeline elsewhere in this product runs real background-
// removal models (a 99MB and a 47MB one) plus colour/crop correction. NONE of
// that applies here — a clinic logo or a doctor's photo is uploaded AS IS,
// background included. This is a resize-and-recompress step only, run
// entirely in the browser: nothing leaves the device except the already-
// shrunk result, and nothing is downloaded to run it.
//
// Target: comfortably under 200KB. Both images render at ~52-64px on the
// actual prescription and on screen — there is no legitimate use of this
// asset that needs more than a few hundred source pixels on a side, so the
// quality loop below trades resolution for file size aggressively rather
// than timidly.
// ---------------------------------------------------------------------------

export interface CompressedImage {
    blob: Blob;
    /** Object URL for an immediate `<img>` preview. The CALLER owns its
     *  lifetime — revoke it (`URL.revokeObjectURL`) once a new pick replaces
     *  it or the picker unmounts, or the tab leaks one blob per selection. */
    previewUrl: string;
    width: number;
    height: number;
    /** File extension matching `blob.type` — what the storage upload keys
     *  the object with. */
    ext: "jpg" | "webp";
}

const MAX_DIMENSION = 640;
const TARGET_BYTES = 180_000; // "under 100-200kb"
const MIN_QUALITY = 0.5;

function canEncodeWebp(): boolean {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    return c.toDataURL("image/webp").startsWith("data:image/webp");
}

/**
 * `createImageBitmap(file, { imageOrientation: "from-image" })` applies the
 * file's own EXIF rotation before we ever touch a canvas — without it, a
 * portrait phone photo of a signage board can land on its side with no
 * visual cue anything went wrong (a canvas `drawImage` never reads EXIF on
 * its own). Falls back to a plain `<img>` load for a browser that lacks
 * `createImageBitmap` or the orientation option; that path won't correct
 * rotation, but still compresses correctly.
 */
async function loadSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
    if ("createImageBitmap" in window) {
        try {
            return await createImageBitmap(file, { imageOrientation: "from-image" });
        } catch {
            /* fall through */
        }
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("compressImage: could not decode the file"));
        img.src = URL.createObjectURL(file);
    });
}

function sourceSize(src: ImageBitmap | HTMLImageElement): { w: number; h: number } {
    return "naturalWidth" in src
        ? { w: src.naturalWidth, h: src.naturalHeight }
        : { w: src.width, h: src.height };
}

/**
 * Resize to at most `MAX_DIMENSION` on the long edge, then encode with a
 * quality loop that steps down until the blob clears `TARGET_BYTES` or the
 * quality floor. Aspect ratio is preserved and NOT cropped to a square — the
 * two places this ever renders (`object-contain` for a logo, `object-cover`
 * for a photo) already fit a non-square source into a square box; cropping
 * here too would just be a second, cruder crop with no say in where it falls.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
    if (!file.type.startsWith("image/")) {
        throw new Error("Please choose an image file.");
    }

    const src = await loadSource(file);
    const { w: srcW, h: srcH } = sourceSize(src);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("compressImage: no 2D canvas context");
    // White backing first: a transparent PNG logo re-encoded as JPEG would
    // otherwise pick up canvas' default BLACK behind the transparent pixels.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(src as CanvasImageSource, 0, 0, width, height);
    if ("close" in src) src.close();

    const mime = canEncodeWebp() ? "image/webp" : "image/jpeg";
    const ext: CompressedImage["ext"] = mime === "image/webp" ? "webp" : "jpg";

    let blob: Blob | null = null;
    for (let q = 0.85; q >= MIN_QUALITY; q -= 0.1) {
        // eslint-disable-next-line no-await-in-loop -- each pass depends on
        // whether the previous one already cleared the size target.
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, q));
        if (blob && blob.size <= TARGET_BYTES) break;
    }
    if (!blob) throw new Error("compressImage: encoding failed");

    return { blob, previewUrl: URL.createObjectURL(blob), width, height, ext };
}

/** "142 KB" / "88 KB" — what the picker shows next to a freshly compressed
 *  pick, so "great compression" is a number the doctor can actually see. */
export function formatBytes(bytes: number): string {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
