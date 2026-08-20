

/**
 * "Dr Anmol Pandey" -> "Dr. Anmol Pandey", and "Anmol Pandey" -> the same.
 *
 * `visits.doctor_name` is whatever the doctor typed into their own profile,
 * and a good half of them type the honorific themselves. Three surfaces
 * rendered a hard-coded "Dr. " in front of it and printed "Dr. Dr Anmol
 * Pandey" for those. Normalising here rather than at each call site, so the
 * next surface to show a doctor's name cannot reintroduce it.
 */
export function doctorName(raw: string): string {
    const name = raw.trim().replace(/^d[r]\.?\s+/i, "");
    return name ? `Dr. ${name}` : "";
}
