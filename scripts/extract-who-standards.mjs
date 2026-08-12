// Converts the four WHO expanded z-score tables (xlsx) into one TS module.
// Run from the scratchpad after the xlsx files are downloaded.
//
// xlsx is a zip of XML; the sheet we want has columns A=Day, B=L, C=M, D=S
// and one row per day of age. We keep MONTHLY samples and interpolate between
// them at runtime — L/M/S are smooth, so the error is far below the precision
// a clinical decision turns on, and it takes the payload from ~11,000 numbers
// to ~366.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DAYS_PER_MONTH = 30.4375; // WHO's own convention
const MAX_MONTH = 60;

function readSheet(xlsxPath) {
    const dir = mkdtempSync(join(tmpdir(), "whox-"));
    execSync(`unzip -o -q "${xlsxPath}" -d "${dir}"`);
    const xml = readFileSync(join(dir, "xl/worksheets/sheet1.xml"), "utf8");

    // Rows look like: <row r="2" ...><c r="A2"><v>0</v></c><c r="B2"><v>0.3487</v></c>...
    const rows = new Map(); // day -> {L,M,S}
    for (const rowM of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
        const rowNum = Number(rowM[1]);
        if (rowNum === 1) continue; // header
        const cells = {};
        for (const cM of rowM[2].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*)>(?:<v>([^<]*)<\/v>)?<\/c>/g)) {
            cells[cM[1]] = cM[2];
        }
        const day = Number(cells.A);
        const L = Number(cells.B), M = Number(cells.C), S = Number(cells.D);
        if (![day, L, M, S].every(Number.isFinite)) continue;
        rows.set(day, { L, M, S });
    }
    return rows;
}

// Pick the row whose day is nearest to each whole month.
function monthly(rows) {
    const out = [];
    for (let m = 0; m <= MAX_MONTH; m++) {
        const target = Math.round(m * DAYS_PER_MONTH);
        let best = null, bestDist = Infinity;
        for (const [day, lms] of rows) {
            const d = Math.abs(day - target);
            if (d < bestDist) { bestDist = d; best = lms; }
        }
        if (!best || bestDist > 3) throw new Error(`no row near month ${m} (target day ${target})`);
        out.push(best);
    }
    return out;
}

const sig = (n) => Number(n.toPrecision(6));
const fmt = (arr) => arr.map((r) => `[${sig(r.L)},${sig(r.M)},${sig(r.S)}]`).join(",");

const sets = {
    wfaBoys: monthly(readSheet("wfa-boys.xlsx")),
    wfaGirls: monthly(readSheet("wfa-girls.xlsx")),
    hfaBoys: monthly(readSheet("lhfa-boys.xlsx")),
    hfaGirls: monthly(readSheet("lhfa-girls.xlsx")),
};

// Sanity: WHO's published median birth weights are ~3.35 kg (boys) and
// ~3.23 kg (girls); median birth length ~49.9 cm both. If the parse drifted,
// these will not land.
const checks = [
    ["wfaBoys month 0 M", sets.wfaBoys[0].M, 3.2, 3.5],
    ["wfaGirls month 0 M", sets.wfaGirls[0].M, 3.1, 3.4],
    ["hfaBoys month 0 M", sets.hfaBoys[0].M, 49, 51],
    ["hfaGirls month 0 M", sets.hfaGirls[0].M, 48, 50],
    ["wfaBoys month 12 M", sets.wfaBoys[12].M, 9.0, 10.0],
    ["wfaBoys month 60 M", sets.wfaBoys[60].M, 17.5, 19.5],
];
for (const [name, got, lo, hi] of checks) {
    if (!(got >= lo && got <= hi)) throw new Error(`sanity check failed: ${name} = ${got}, expected ${lo}–${hi}`);
    console.log(`  ok  ${name} = ${got}`);
}
for (const [k, v] of Object.entries(sets)) {
    if (v.length !== MAX_MONTH + 1) throw new Error(`${k} has ${v.length} rows, expected ${MAX_MONTH + 1}`);
}

const banner = `// GENERATED FILE — DO NOT EDIT BY HAND.
//
// WHO Child Growth Standards (2006), expanded z-score tables.
// Source: https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/
//   weight-for-age/expanded-tables/wfa-{boys,girls}-zscore-expanded-tables.xlsx
//   length-height-for-age/expandable-tables/lhfa-{boys,girls}-zscore-expanded-tables.xlsx
// Retrieved: 2026-08-11 by scripts/../scratchpad/extract-who.mjs
//
// Each entry is [L, M, S] for one whole month of age, 0..60 inclusive.
// WHO publishes these per DAY; monthly samples are taken at the nearest day to
// month * 30.4375 (WHO's own month length) and interpolated at runtime. L, M
// and S are smooth in age, so interpolation error is orders of magnitude below
// anything a clinical decision turns on.
//
// COVERAGE IS 0–60 MONTHS ONLY. Above five years these standards do not apply;
// see growth.ts, which refuses rather than extrapolating.

export type LMS = readonly [L: number, M: number, S: number];

export const WHO_MAX_MONTH = ${MAX_MONTH};
`;

const body = Object.entries(sets)
    .map(([k, v]) => `\nexport const ${k.toUpperCase()}_LMS: readonly LMS[] = [${fmt(v)}];\n`)
    .join("");

writeFileSync("whoStandards.ts", banner + body);
console.log(`\nwrote whoStandards.ts (${(banner + body).length} bytes)`);
