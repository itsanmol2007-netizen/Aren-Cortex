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
import type { Attachment, AttachmentType } from "../attachments/types";

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

export async function deleteAttachment(storagePath: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke("attachment-delete", {
        body: { storagePath },
    });
    if (error) throw new Error(data?.error ?? error.message);
}

export async function listAttachments(visitId: string): Promise<Attachment[]> {
    const { data, error } = await supabase
        .from("visit_attachments")
        .select("id, visit_id, storage_path, mime_type, label, attachment_type, size_bytes, uploaded_by_doctor_id, created_at")
        .eq("visit_id", visitId)
        .order("created_at", { ascending: false });
    if (error) throw new Error(`listAttachments: ${error.message}`);

    return (data ?? []).map((r) => ({
        id: r.id,
        visitId: r.visit_id,
        storagePath: r.storage_path,
        mimeType: r.mime_type,
        label: r.label,
        attachmentType: r.attachment_type as AttachmentType | null,
        sizeBytes: r.size_bytes,
        uploadedByDoctorId: r.uploaded_by_doctor_id,
        createdAt: r.created_at,
    }));
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
    },
    onProgress?: (p: UploadAttachmentProgress) => void
): Promise<Attachment> {
    let toUpload: Blob = opts.file;
    let mimeType = opts.file.type;

    if (needsCompression(opts.file.type)) {
        onProgress?.({ stage: "compressing" });
        const result = await compressImage(opts.file, opts.attachmentType);
        toUpload = result.blob;
        mimeType = "image/jpeg"; // compressImage always re-encodes to JPEG
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
        })
        .select("id, visit_id, storage_path, mime_type, label, attachment_type, size_bytes, uploaded_by_doctor_id, created_at")
        .single();
    if (error) throw new Error(`record attachment: ${error.message}`);

    return {
        id: data.id,
        visitId: data.visit_id,
        storagePath: data.storage_path,
        mimeType: data.mime_type,
        label: data.label,
        attachmentType: data.attachment_type as AttachmentType | null,
        sizeBytes: data.size_bytes,
        uploadedByDoctorId: data.uploaded_by_doctor_id,
        createdAt: data.created_at,
    };
}
