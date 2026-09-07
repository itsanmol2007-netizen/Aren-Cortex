// ---------------------------------------------------------------------------
// CSV — the one place a list on screen turns into a file. Deliberately tiny:
// quote whatever needs quoting, join with commas, hand back a string. No
// library, because the whole job is "escape a comma/quote/newline", not
// something worth a dependency for.
// ---------------------------------------------------------------------------

/** One field, CSV-escaped. Wrapped in quotes (with quotes doubled) the
 *  moment it contains a comma, a quote, or a newline — a patient's name is
 *  free text and WILL eventually contain one of those. */
function csvField(value: string | number | null | undefined): string {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows (each a plain object) → a CSV string, header row first. `columns`
 *  fixes both the column order and the header label, since an object's own
 *  key order is not something to trust a spreadsheet with. */
export function toCsv<T extends Record<string, unknown>>(
    rows: T[],
    columns: { key: keyof T; label: string }[]
): string {
    const header = columns.map((c) => csvField(c.label)).join(",");
    const body = rows.map((r) => columns.map((c) => csvField(r[c.key] as string | number | null)).join(","));
    return [header, ...body].join("\r\n");
}

/** Hands the browser a CSV file to save. A plain, static `<a download>`
 *  click — no server round trip, since everything in the file is already in
 *  hand by the time this is called. */
export function downloadCsv(filename: string, csv: string): void {
    // BOM so Excel (still the overwhelmingly likely opener) reads UTF-8
    // correctly instead of mangling anything outside plain ASCII.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
