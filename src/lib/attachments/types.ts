// Shared shapes for the attachment pipeline. Kept separate from
// lib/db/attachments.ts (which touches Supabase) the same way
// lib/synapse/*.ts stays separate from lib/db/synapse.ts — pure types and
// pure logic on one side, the Supabase boundary on the other.

/**
 * Matches the CHECK constraint on visit_attachments.attachment_type
 * (migration extend_visit_attachments_for_r2, 2026-08-08). A small fixed
 * set, not free text — same discipline as every other categorical column in
 * this schema (medicine_composition_map.route, intent_guards.action) — so
 * the UI can pick a consistent icon and the compression profile below can
 * key off it directly, without either drifting into inconsistent spellings.
 */
export type AttachmentType = "xray" | "lab_report" | "photo" | "scan" | "other";

export const ATTACHMENT_TYPES: AttachmentType[] = ["xray", "scan", "lab_report", "photo", "other"];

export const ATTACHMENT_TYPE_LABEL: Record<AttachmentType, string> = {
    xray: "X-ray",
    scan: "Scan (ultrasound, etc.)",
    lab_report: "Lab report",
    photo: "Photo",
    other: "Other",
};

/**
 * Which side, when it matters. A shared mechanism, not a table per
 * specialty — ENT (which ear), eye (which eye), dermatology (site changes
 * steroid potency, not just documentation) and orthopaedics/physio (which
 * joint) all need "which side" and/or "where on the body". That is the same
 * need wearing different clothes. Neither this nor bodyRegion is read by
 * the Synapse engine — same status as observables.system (Synapse handoff
 * §2.3): display and record fields, UI only.
 */
export type Laterality = "left" | "right" | "bilateral";

export const LATERALITY_LABEL: Record<Laterality, string> = {
    left: "Left",
    right: "Right",
    bilateral: "Bilateral",
};

/** One row of visit_attachments, camelCased. */
export interface Attachment {
    id: number;
    visitId: string;
    storagePath: string;
    mimeType: string | null;
    label: string | null;
    attachmentType: AttachmentType | null;
    sizeBytes: number | null;
    uploadedByDoctorId: string | null;
    createdAt: string;
    laterality: Laterality | null;
    bodyRegion: string | null;
}

/** What the file picker is allowed to accept — mirrors attachment-upload-url's ALLOWED_MIME. */
export const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const ACCEPTED_MIME_ACCEPT = ACCEPTED_MIME_TYPES.join(",");
