// ---------------------------------------------------------------------------
// WHATSAPP — placeholder integration, deliberately.
//
// `cortex-longitudinal-spec.md` §3.2 and aren-cortex-context.md both note
// WhatsApp follow-up reminders are blocked on Anmol choosing a provider (no
// API integration exists). Anmol, 2026-08-23: until that exists, "send via
// WhatsApp" should open WhatsApp Web/the WhatsApp app with a pre-filled
// message — a real, useful action today — with the real API integration
// swapped in later without touching call sites (every caller goes through
// `buildWhatsAppLink`, never constructs the wa.me URL itself).
//
// This is NOT template-based messaging (the spec's real ask) — it's the
// honest, doctor-clicks-send version of the same idea. Real work for later:
// message templates, an actual send-on-behalf-of API, delivery tracking.
// ---------------------------------------------------------------------------

/**
 * India-only for now — every phone number in this product is a bare 10-digit
 * number (see `phoneToAuthEmail`/the login screen), same assumption the auth
 * layer already makes. Strips anything that isn't a digit, then prefixes 91.
 * Returns null for a phone that isn't a plausible 10-digit number rather than
 * building a wa.me link that will silently fail to resolve a contact.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, "");
    const bare = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
    if (bare.length !== 10) return null;
    return `91${bare}`;
}

/**
 * A wa.me deep link — opens WhatsApp Web (desktop) or the app (mobile) with
 * the message pre-filled, nothing sent automatically. Returns null when the
 * phone number isn't usable, so a caller can disable the action honestly
 * instead of opening a broken chat.
 */
export function buildWhatsAppLink(phone: string | null | undefined, message: string): string | null {
    const number = toWhatsAppNumber(phone);
    if (!number) return null;
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
