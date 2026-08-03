// ---------------------------------------------------------------------------
// SEARCH COVERAGE CHECK — does search_intents find what a doctor would type?
//
// The rule count and the two catalogue invariants (dead chips, unreachable
// signals) only prove content EXISTS. They say nothing about whether it is
// reachable by the word a doctor actually types — that gap is how "Enteric
// fever" sat in the database for months unfindable under "typhoid", and how
// searching "flu" surfaced "Gastro-oesophageal reflux disease" instead of
// anything respiratory.
//
// This is a manual list, not a generated one: it is a proxy for "what would
// a doctor in an Indian OPD actually type", which nothing in the schema can
// derive on its own. Extend it whenever a real search miss turns up.
//
// A PASS here does not mean the top match is clinically correct — only that
// something reasonable exists to look at. Read the printed top match for any
// FAIL and any WEAK before deciding what to fix.
//
// Run: node scripts/search-coverage.mjs
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
    const out = {};
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].trim();
    }
    return out;
}

const env = loadEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Common lay/English terms a doctor in an Indian OPD would type, grouped by
// the body system they land in. Not exhaustive — extend as real misses turn up.
const TERMS = [
    // infectious / fever
    "typhoid", "dengue", "malaria", "chickenpox", "chicken pox", "flu", "common cold",
    "food poisoning", "tb", "tuberculosis", "jaundice", "measles", "mumps",
    // GI
    "piles", "hemorrhoids", "gastritis", "acidity", "worms", "loose motion",
    "constipation", "gas", "vomiting",
    // urinary / renal
    "uti", "kidney stone", "burning urination",
    // respiratory
    "pneumonia", "asthma", "bronchitis", "cough", "sinusitis",
    // skin
    "pink eye", "conjunctivitis", "ringworm", "fungal infection", "scabies", "allergy",
    // musculoskeletal
    "frozen shoulder", "sciatica", "slip disc", "arthritis", "gout", "tennis elbow",
    "back pain", "knee pain",
    // cardio/metabolic
    "diabetes", "sugar", "high bp", "hypertension", "thyroid", "anemia", "anaemia",
    "heart attack", "cholesterol", "atrial fibrillation", "afib", "palpitations",
    "murmur", "angina", "valve problem",
    // neuro
    "migraine", "vertigo", "headache",
];

let fail = 0, weak = 0;
for (const term of TERMS) {
    const { data, error } = await supabase.rpc("search_intents", {
        p_query: term,
        p_limit: 3,
        p_types: null,
    });
    if (error) {
        console.log(`ERROR  "${term}" — ${error.message}`);
        fail++;
        continue;
    }
    if (!data || data.length === 0) {
        console.log(`FAIL   "${term}" — no results at all`);
        fail++;
    } else if (data[0].score < 1.0) {
        console.log(`WEAK   "${term}" — best match "${data[0].label}" (${data[0].type}, score ${data[0].score.toFixed(2)})`);
        weak++;
    } else {
        console.log(`ok     "${term}" -> "${data[0].label}" (${data[0].type}, score ${data[0].score.toFixed(2)})`);
    }
}

console.log(`\n${TERMS.length} terms checked — ${fail} with no result, ${weak} with a weak match.`);
if (fail > 0) process.exitCode = 1;
