// ---------------------------------------------------------------------------
// The "edit this with the real editor" redirect to arenode.com — signature,
// avatar background removal, and clinic logo background removal all live
// there already (crop, background removal, ink-lift for a signature),
// polished, and this app has no reason to rebuild any of it.
//
// Cortex's own role is small and deliberately so: mint a short-lived,
// single-use token (a plain INSERT this doctor's own RLS policy allows —
// see the doctor_photo_handoffs migration) and hand the browser a URL.
// Everything else — resolving the token, showing the editor, uploading,
// writing the column — happens on the other side, via its own
// `doctor-photo-handoff` Edge Function. See that function's header comment
// for the full shape; it mirrors this project's own visit-gateway pattern.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";

export type PhotoHandoffField = "avatar" | "signature" | "logo";

const LANDING_ORIGIN = "https://www.arenode.com";

/**
 * Mints a handoff token for one field and returns the full URL to send the
 * doctor to. `returnUrl` is where the landing page sends them back once
 * they've saved (or the page's own "back" affordance, if they bail) —
 * almost always just `window.location.href` at the call site.
 */
export async function requestPhotoHandoff(opts: {
    doctorId: string;
    hospitalId: string;
    field: PhotoHandoffField;
    returnUrl: string;
}): Promise<string> {
    const { data, error } = await supabase
        .from("doctor_photo_handoffs")
        .insert({
            doctor_id: opts.doctorId,
            hospital_id: opts.hospitalId,
            field: opts.field,
            return_url: opts.returnUrl,
        })
        .select("token")
        .single();
    if (error) throw new Error(`requestPhotoHandoff: ${error.message}`);
    return `${LANDING_ORIGIN}/account/photos/${data.token}`;
}
