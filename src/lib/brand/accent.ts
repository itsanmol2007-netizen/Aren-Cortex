// ---------------------------------------------------------------------------
// THE CLINIC'S ACCENT, turned into a usable palette.
//
// `hospitals.accent_color` is one hex, chosen by the clinic at registration.
// It is brand identity, and the prescription is the one artefact of this
// product a patient carries out of the building and keeps, so it is the place
// that colour should actually mean something.
//
// ── What was wrong ─────────────────────────────────────────────────────────
// The accent was read in three places and CONTRADICTED in one of them:
//
//   background: linear-gradient(90deg, transparent, ${accent} 25%,
//                               #7c3aed 50%, #ec4899 75%, transparent)
//
// A clinic that picked forest green got green fading into purple and pink.
// The specialisation pill was hardcoded pink outright. So every clinic's
// prescription came out looking like the same violet house style no matter
// what they chose, which is the opposite of what the field is for.
//
// ── Why a derived ramp rather than the raw hex ─────────────────────────────
// One hex cannot do the work of a palette. A heading, a hairline and a tinted
// band need three different lightnesses of the same hue, and picking them by
// hand per clinic is not possible when the clinic picks the colour.
//
// So the ramp is computed in HSL from the stored value, with one hard rule:
// INK IS CLAMPED FOR CONTRAST. A clinic that chooses pale yellow must not get
// pale yellow headings, because a prescription is a semi-legal document that
// ends up on cheap white stock out of a clinic laser printer. Brand expression
// stops where legibility starts.
// ---------------------------------------------------------------------------

export interface AccentPalette {
    /** the clinic's colour, exactly as stored, for large solid fills */
    base: string;
    /** darkened until it clears ~4.5:1 on white — headings, values, rules */
    ink: string;
    /** mid tone for hairlines, icon strokes, secondary labels */
    mid: string;
    /** a wash for section bands and table headers */
    tint: string;
    /** barely-there ground for watermarks and zebra rows */
    veil: string;
    /** readable text ON the base colour, black or white by luminance */
    onBase: string;
}

const FALLBACK = "#1268e8";

function clampByte(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
    const s = hex.trim().replace(/^#/, "");
    const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
    };
}

const toHex = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("");

/** WCAG relative luminance. */
function luminance(r: number, g: number, b: number): number {
    const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const contrastOnWhite = (r: number, g: number, b: number) =>
    1.05 / (luminance(r, g, b) + 0.05);

function rgbToHsl(r: number, g: number, b: number) {
    const R = r / 255, G = g / 255, B = b / 255;
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
    else if (max === G) h = ((B - R) / d + 2) / 6;
    else h = ((R - G) / d + 4) / 6;
    return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number) {
    if (s === 0) { const v = l * 255; return { r: v, g: v, b: v }; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue = (t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255 };
}

const at = (h: number, s: number, l: number) => {
    const { r, g, b } = hslToRgb(h, s, Math.max(0, Math.min(1, l)));
    return toHex(r, g, b);
};

/**
 * Build the ramp.
 *
 * `ink` walks the lightness down until it clears 4.5:1 on white, so a pale
 * brand colour still yields a readable heading. It stops at l = 0.16 rather
 * than running to black, because a hue crushed that far stops reading as the
 * clinic's colour at all and the point is brand recognition.
 */
export function accentPalette(input?: string | null): AccentPalette {
    const rgb = parseHex(input ?? "") ?? parseHex(FALLBACK)!;
    const base = toHex(rgb.r, rgb.g, rgb.b);
    const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);

    // Saturation floor: a near-grey accent would otherwise produce a ramp with
    // no colour in it at all, which reads as a printer fault rather than a
    // choice.
    const sat = Math.max(0.35, Math.min(0.92, s));

    let ink = base;
    for (let l = rgbToHsl(rgb.r, rgb.g, rgb.b).l; l >= 0.16; l -= 0.02) {
        const c = hslToRgb(h, sat, l);
        ink = toHex(c.r, c.g, c.b);
        if (contrastOnWhite(c.r, c.g, c.b) >= 4.5) break;
    }

    return {
        base,
        ink,
        mid: at(h, Math.min(sat, 0.7), 0.52),
        tint: at(h, Math.min(sat, 0.55), 0.94),
        veil: at(h, Math.min(sat, 0.45), 0.975),
        onBase: luminance(rgb.r, rgb.g, rgb.b) > 0.45 ? "#111827" : "#ffffff",
    };
}
