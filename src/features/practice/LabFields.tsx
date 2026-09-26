// ---------------------------------------------------------------------------
// LAB FIELDS — a preferred lab's name, WhatsApp number, address and map.
//
// Used for adding a lab and for editing one in place. Only the name is
// needed; the rest each switch something on:
//
//   WhatsApp number   "Send to lab" can send this lab an investigation order
//   Address           the patient's prescription page names where to go
//   Google Maps link  the patient's page gets a Navigate button to it
//
// A pasted Maps share link is read (maps-link-resolve: its redirect, not
// the Maps API) and what it names is shown back, and used for the lab's
// name when that is still empty. If nothing can be read the link is kept
// as it is; it still opens the right place.
// ---------------------------------------------------------------------------

import { Check, Loader2, MapPin, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { looksLikeLink, resolveMapsLink } from "../../lib/db/synapse";

export interface LabDraft {
    name: string;
    whatsappPhone: string;
    address: string;
    mapsUrl: string;
}

export const EMPTY_LAB: LabDraft = { name: "", whatsappPhone: "", address: "", mapsUrl: "" };

/** A usable Indian mobile number, or empty (the field is optional). */
export function phoneProblem(raw: string): string | null {
    const d = raw.replace(/\D/g, "");
    if (!d) return null;
    if (d.length === 10 || (d.length === 12 && d.startsWith("91"))) return null;
    return "Enter a 10-digit mobile number";
}

export function LabFields({ value, onChange, onSubmit, autoFocus = false }: {
    value: LabDraft;
    onChange: (next: LabDraft) => void;
    onSubmit?: () => void;
    autoFocus?: boolean;
}) {
    const [found, setFound] = useState<{ state: "idle" | "reading" | "found" | "none"; name?: string | null }>({ state: "idle" });
    const set = (k: keyof LabDraft) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
    const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && onSubmit) { e.preventDefault(); onSubmit(); } };

    // Read the pasted link once it stops changing.
    useEffect(() => {
        const url = value.mapsUrl.trim();
        if (!looksLikeLink(url)) { setFound({ state: "idle" }); return; }
        let live = true;
        setFound({ state: "reading" });
        const t = window.setTimeout(() => {
            resolveMapsLink(url).then((r) => {
                if (!live) return;
                if (r && (r.name || r.lat !== null)) {
                    setFound({ state: "found", name: r.name });
                    if (r.name && !value.name.trim()) onChange({ ...value, name: r.name });
                } else {
                    setFound({ state: "none" });
                }
            });
        }, 500);
        return () => { live = false; window.clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value.mapsUrl]);

    const phoneErr = phoneProblem(value.whatsappPhone);

    return (
        <div className="prac-lab-fields">
            <div className="prac-modal-field">
                <label>Lab name</label>
                <input type="text" value={value.name} placeholder="e.g. City Diagnostics" autoFocus={autoFocus} onChange={set("name")} onKeyDown={enter} />
            </div>
            <div className="prac-modal-field">
                <label><MessageCircle size={11} aria-hidden="true" /> WhatsApp number <em>for sending orders</em></label>
                <input
                    type="text" inputMode="tel" value={value.whatsappPhone} placeholder="98xxxxxxxx"
                    aria-invalid={!!phoneErr} onChange={set("whatsappPhone")} onKeyDown={enter}
                />
                {phoneErr && <span className="prac-lab-err">{phoneErr}</span>}
            </div>
            <div className="prac-modal-field is-wide">
                <label>Address or landmark <em>shown to the patient</em></label>
                <input type="text" value={value.address} placeholder="e.g. Near City Hospital, MI Road, Jaipur" onChange={set("address")} onKeyDown={enter} />
            </div>
            <div className="prac-modal-field is-wide">
                <label><MapPin size={11} aria-hidden="true" /> Google Maps link <em>so the patient can navigate</em></label>
                <input type="text" inputMode="url" value={value.mapsUrl} placeholder="Paste the lab's share link from Google Maps" onChange={set("mapsUrl")} onKeyDown={enter} />
                {found.state === "reading" && (
                    <span className="prac-lab-found is-reading"><Loader2 size={11} className="cs-spin" aria-hidden="true" /> Reading the link…</span>
                )}
                {found.state === "found" && (
                    <span className="prac-lab-found">
                        <Check size={11} strokeWidth={2.6} aria-hidden="true" />
                        {found.name ? <>Found on Google Maps: <b>{found.name}</b></> : "Location found on Google Maps"}
                    </span>
                )}
                {found.state === "none" && (
                    <span className="prac-lab-found is-plain">Link saved. Patients will open it to navigate.</span>
                )}
            </div>
        </div>
    );
}
