// ---------------------------------------------------------------------------
// WHAT DID THE PATIENT MEAN?
//
// Buttons first, typing second — the founder decision (2026-09-04) was
// interactive buttons, and this file reflects that priority honestly:
//
//   parseButtonId()  is exact and total. A tap cannot be misread, which is
//                    the entire reason buttons won over free-text parsing.
//   matchKeywords()  is the fallback for the patient who ignores the buttons
//                    and types "kal appointment mil jayega?" anyway. It is
//                    best-effort by construction and says so — an unmatched
//                    message returns null and the flow asks a question
//                    rather than guessing.
//
// No LLM here on purpose. Classifying "book me in" is not worth a network
// hop and a bill per message when a tap already answered it; if intent ever
// outgrows this, the seam is matchKeywords() and nothing else changes.
// ---------------------------------------------------------------------------

/** Button ids we send. Kept short — Meta caps a button id at 256 chars. */
export const BUTTON = {
    BOOK: "book_appt",
    TALK: "talk_clinic",
    DAY_TODAY: "day:today",
    DAY_TOMORROW: "day:tomorrow",
    DAY_WEEK: "day:week",
    /** Clinic disambiguation carries the hospital id: "clinic:<uuid>". */
    CLINIC_PREFIX: "clinic:",
};

/**
 * @typedef {{kind: 'book'} | {kind: 'talk'} | {kind: 'day', day: 'today'|'tomorrow'|'week'} | {kind: 'clinic', hospitalId: string}} Intent
 */

/**
 * Exact interpretation of a tapped button. Total and unambiguous — this is
 * the path we want patients on.
 * @param {string|null|undefined} id
 * @returns {Intent|null}
 */
export function parseButtonId(id) {
    if (!id) return null;
    if (id === BUTTON.BOOK) return { kind: "book" };
    if (id === BUTTON.TALK) return { kind: "talk" };
    if (id === BUTTON.DAY_TODAY) return { kind: "day", day: "today" };
    if (id === BUTTON.DAY_TOMORROW) return { kind: "day", day: "tomorrow" };
    if (id === BUTTON.DAY_WEEK) return { kind: "day", day: "week" };
    if (id.startsWith(BUTTON.CLINIC_PREFIX)) {
        const hospitalId = id.slice(BUTTON.CLINIC_PREFIX.length);
        return hospitalId ? { kind: "clinic", hospitalId } : null;
    }
    return null;
}

// Hinglish is the norm, not the exception — patients type Devanagari, roman
// Hindi and English in the same sentence. Each list is roman + Devanagari for
// the same idea; Devanagari entries are matched as substrings since the fuzzy
// pass below is tuned for latin-script typos.
const BOOK_WORDS = [
    "book", "booking", "appointment", "appointmnt", "apointment", "appt", "apt",
    "slot", "visit", "checkup", "consult", "consultation", "dikhana", "dikhna",
    "milna", "milne", "milunga", "aana", "aaunga", "number", "token",
];
const BOOK_PHRASES_DEVANAGARI = ["अपॉइंटमेंट", "बुक", "मिलना", "दिखाना", "टाइम"];

const TALK_WORDS = ["talk", "call", "help", "query", "question", "baat", "puchna", "poochna", "problem"];
const TALK_PHRASES_DEVANAGARI = ["बात", "मदद", "सवाल"];

const DAY_WORDS = {
    today: ["today", "aaj", "abhi", "now"],
    tomorrow: ["tomorrow", "kal", "tommorow", "tmrw"],
    week: ["week", "hafta", "hafte", "later", "baad", "anytime"],
};
const DAY_DEVANAGARI = { today: ["आज", "अभी"], tomorrow: ["कल"], week: ["हफ्ते", "बाद"] };

/**
 * Levenshtein distance, capped: we only ever ask "is this within 1-2 edits",
 * so there is no reason to compute a full matrix for long strings.
 */
function withinEditDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    if (a === b) return true;

    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const curr = [i];
        let rowMin = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            if (curr[j] < rowMin) rowMin = curr[j];
        }
        // Every remaining row can only add distance, so once the best cell in
        // this row already exceeds the budget the answer is settled.
        if (rowMin > max) return false;
        prev = curr;
    }
    return prev[b.length] <= max;
}

/**
 * Typo tolerance scaled to word length: "apt" must match exactly (one edit
 * from "apt" reaches "act", "opt", "ape" — all different words), while
 * "appointmnt" gets two. Short words are where fuzzy matching does damage.
 */
function fuzzyHit(token, vocabulary) {
    for (const word of vocabulary) {
        const budget = word.length <= 4 ? 0 : word.length <= 7 ? 1 : 2;
        if (withinEditDistance(token, word, budget)) return true;
    }
    return false;
}

/**
 * Best-effort reading of a typed message.
 *
 * Day beats booking when both appear, and that ordering is deliberate: "kal
 * appointment" is someone answering "which day", and treating it as a fresh
 * booking request would restart a flow they are already halfway through.
 *
 * @param {string|null|undefined} text
 * @returns {Intent|null} null when nothing matched — ask, don't assume
 */
export function matchKeywords(text) {
    if (!text) return null;
    const raw = text.toLowerCase().trim();
    if (!raw) return null;

    const tokens = raw.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const hasDevanagari = (list) => list.some((w) => raw.includes(w));

    for (const [day, words] of Object.entries(DAY_WORDS)) {
        if (tokens.some((t) => fuzzyHit(t, words)) || hasDevanagari(DAY_DEVANAGARI[day])) {
            return { kind: "day", day: /** @type {'today'|'tomorrow'|'week'} */ (day) };
        }
    }

    if (tokens.some((t) => fuzzyHit(t, BOOK_WORDS)) || hasDevanagari(BOOK_PHRASES_DEVANAGARI)) {
        return { kind: "book" };
    }
    if (tokens.some((t) => fuzzyHit(t, TALK_WORDS)) || hasDevanagari(TALK_PHRASES_DEVANAGARI)) {
        return { kind: "talk" };
    }
    return null;
}

/**
 * A tapped button if there was one, otherwise whatever the text suggests.
 * @param {{buttonId?: string|null, text?: string|null}} message
 */
export function readIntent(message) {
    return parseButtonId(message.buttonId) ?? matchKeywords(message.text);
}

/**
 * Turns a chosen day into an actual date, in the CLINIC's timezone rather
 * than the server's — "tomorrow" tapped at 00:30 IST is a different date on
 * a UTC box, and getting that wrong books people a day early.
 *
 * `week` deliberately resolves to null: "sometime this week" is not a date,
 * and inventing one would put a specific day in front of front desk that the
 * patient never actually asked for.
 *
 * @param {'today'|'tomorrow'|'week'} day
 * @param {string} [timeZone] IANA zone, default Asia/Kolkata
 * @returns {string|null} ISO yyyy-mm-dd
 */
export function resolvePreferredDate(day, timeZone = "Asia/Kolkata") {
    if (day === "week") return null;

    // en-CA formats as yyyy-mm-dd, which is exactly the shape a Postgres
    // `date` column wants — and doing it via Intl keeps the zone honest
    // instead of hand-rolling an offset that breaks on a DST boundary.
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    });
    const now = new Date();
    if (day === "today") return formatter.format(now);
    return formatter.format(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}
