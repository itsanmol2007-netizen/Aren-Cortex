// ---------------------------------------------------------------------------
// Attachments — the Supabase boundary.
//
// Three edge functions do the actual work (attachment-upload-url,
// attachment-view-url, attachment-delete), deployed 2026-08-08. This file is
// the thin client wrapper: it never touches the storage secret (the edge
// functions hold that), and every call goes through supabase.functions.invoke,
// which attaches the caller's own session automatically — the same
// RLS-scoped authorization every function relies on.
//
// uploadAttachment() is the one real entry point for the UI. Everything else
// here is a building block it composes: get a URL, PUT to it, record the
// metadata. A caller that only needs one step (e.g. re-fetching a view URL
// for an already-uploaded file) can reach for the smaller functions directly.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import { compressImage, needsCompression } from "../attachments/compress";
import type { Attachment, AttachmentType, Laterality } from "../attachments/types";

const ATTACHMENT_COLUMNS =
    "id, visit_id, storage_path, mime_type, label, attachment_type, size_bytes, uploaded_by_doctor_id, created_at, laterality, body_region, width, height";

function attachmentFromRow(r: {
    id: number;
    visit_id: string;
    storage_path: string;
    mime_type: string | null;
    label: string | null;
    attachment_type: string | null;
    size_bytes: number | null;
    uploaded_by_doctor_id: string | null;
    created_at: string;
    laterality: string | null;
    body_region: string | null;
    width: number | null;
    height: number | null;
}): Attachment {
    return {
        id: r.id,
        visitId: r.visit_id,
        storagePath: r.storage_path,
        mimeType: r.mime_type,
        label: r.label,
        attachmentType: r.attachment_type as AttachmentType | null,
        sizeBytes: r.size_bytes,
        uploadedByDoctorId: r.uploaded_by_doctor_id,
        createdAt: r.created_at,
        laterality: r.laterality as Laterality | null,
        bodyRegion: r.body_region,
        width: r.width,
        height: r.height,
    };
}

interface UploadUrlResponse {
    uploadUrl: string;
    storagePath: string;
    uploadedByDoctorId: string | null;
    expiresInSeconds: number;
}

async function getUploadUrl(opts: {
    visitId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    attachmentType?: AttachmentType;
}): Promise<UploadUrlResponse> {
    const { data, error } = await supabase.functions.invoke("attachment-upload-url", {
        body: {
            visitId: opts.visitId,
            fileName: opts.fileName,
            mimeType: opts.mimeType,
            sizeBytes: opts.sizeBytes,
            attachmentType: opts.attachmentType,
        },
    });
    // The edge function's own error text (unsupported file type, file too
    // large, "visit not found, or not yours") IS the doctor-facing message —
    // surfaced as-is, same convention as add_medicine's RPC errors.
    if (error) throw new Error(data?.error ?? error.message);
    return data as UploadUrlResponse;
}

export async function getViewUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke("attachment-view-url", {
        body: { storagePath },
    });
    if (error) throw new Error(data?.error ?? error.message);
    return (data as { viewUrl: string }).viewUrl;
}

/**
 * Tagging is deliberately separate from upload — laterality/body region are
 * optional, secondary metadata (per the "structured first, artifact when
 * necessary" philosophy, tagging is even more secondary than the attachment
 * itself), and forcing them into the upload step would slow down the common
 * case (a lab report PDF, where neither applies) for the sake of the cases
 * that need them. A plain RLS-protected update — no edge function, nothing
 * here touches storage or the upload secret.
 */
export async function updateAttachmentTags(
    id: number,
    tags: { laterality?: Laterality | null; bodyRegion?: string | null }
): Promise<Attachment> {
    const patch: Record<string, unknown> = {};
    if ("laterality" in tags) patch.laterality = tags.laterality;
    if ("bodyRegion" in tags) patch.body_region = tags.bodyRegion;

    const { data, error } = await supabase
        .from("visit_attachments")
        .update(patch)
        .eq("id", id)
        .select(ATTACHMENT_COLUMNS)
        .single();
    if (error) throw new Error(`updateAttachmentTags: ${error.message}`);
    return attachmentFromRow(data);
}

export async function deleteAttachment(storagePath: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke("attachment-delete", {
        body: { storagePath },
    });
    if (error) throw new Error(data?.error ?? error.message);
}

export async function listAttachments(visitId: string): Promise<Attachment[]> {
    const { data, error } = await supabase
        .from("visit_attachments")
        .select(ATTACHMENT_COLUMNS)
        .eq("visit_id", visitId)
        .order("created_at", { ascending: false });
    if (error) throw new Error(`listAttachments: ${error.message}`);
    return (data ?? []).map(attachmentFromRow);
}

export interface UploadAttachmentProgress {
    stage: "compressing" | "uploading" | "recording";
}

/**
 * The whole doctor-facing action: compress (when the file type benefits from
 * it — PDFs pass straight through, see compress.ts), get a presigned URL,
 * PUT directly to storage, then write the visit_attachments row through the
 * doctor's own RLS-scoped session — never through the edge function, which
 * holds no elevated database rights and was never meant to.
 *
 * The upload URL and the metadata write are two separate steps on purpose,
 * not one RPC: the presign step needs the storage secret (edge function
 * only), the metadata write needs nothing but RLS (plain client call). Each
 * uses the minimum privilege the step actually needs.
 */
export async function uploadAttachment(
    opts: {
        visitId: string;
        file: File;
        attachmentType: AttachmentType;
        label?: string;
        /** which side — ENT/eye/ortho. Never read by the engine; see attachments/types.ts */
        laterality?: Laterality;
        /** where on the body — dermatology in particular; site changes steroid potency, not just documentation */
        bodyRegion?: string;
    },
    onProgress?: (p: UploadAttachmentProgress) => void
): Promise<Attachment> {
    let toUpload: Blob = opts.file;
    let mimeType = opts.file.type;
    // Known only for images (compressImage decodes onto a canvas as a side
    // effect of resizing anyway, so this costs nothing extra to capture) —
    // stays null for PDFs. Lets a preview render a correctly-shaped skeleton
    // before the file itself has loaded, instead of a generic spinner.
    let dimensions: { width: number; height: number } | null = null;

    if (needsCompression(opts.file.type)) {
        onProgress?.({ stage: "compressing" });
        const result = await compressImage(opts.file, opts.attachmentType);
        toUpload = result.blob;
        mimeType = "image/jpeg"; // compressImage always re-encodes to JPEG
        dimensions = { width: result.width, height: result.height };
    }

    onProgress?.({ stage: "uploading" });
    const { uploadUrl, storagePath, uploadedByDoctorId } = await getUploadUrl({
        visitId: opts.visitId,
        fileName: opts.file.name,
        mimeType,
        sizeBytes: toUpload.size,
        attachmentType: opts.attachmentType,
    });

    const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: toUpload,
    });
    if (!putRes.ok) throw new Error(`upload to storage failed: ${putRes.status}`);

    onProgress?.({ stage: "recording" });
    const { data, error } = await supabase
        .from("visit_attachments")
        .insert({
            visit_id: opts.visitId,
            storage_path: storagePath,
            mime_type: mimeType,
            label: opts.label ?? null,
            attachment_type: opts.attachmentType,
            size_bytes: toUpload.size,
            storage_provider: "b2",
            uploaded_by_doctor_id: uploadedByDoctorId,
            laterality: opts.laterality ?? null,
            body_region: opts.bodyRegion ?? null,
            width: dimensions?.width ?? null,
            height: dimensions?.height ?? null,
        })
        .select(ATTACHMENT_COLUMNS)
        .single();
    if (error) throw new Error(`record attachment: ${error.message}`);

    return attachmentFromRow(data);
}
