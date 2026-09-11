// ---------------------------------------------------------------------------
// HINDI NAME SUGGESTION — a starting guess, never a final answer.
//
// The actual problem (Anmol, 2026-09-11): a doctor/admin has an English
// QWERTY keyboard and needs to get a Devanagari name into `doctors.name_hi` /
// `hospitals.name_hi`. Three ways to get Devanagari into a text field, and
// this file is only responsible for one of them:
//
//   A. Type it on a phone's own keyboard (Gboard/iOS both have a Hindi
//      transliteration mode built in) and paste it here. Zero code, works
//      today — the UI just needs to say so.
//   B. THIS FILE — a live, in-app "type Roman, see a Devanagari suggestion"
//      preview, so a browser with only an English keyboard isn't stuck.
//   C. A real ML transliteration model/API (e.g. AI4Bharat IndicXlit,
//      Azure AI Translator) — meaningfully better guesses, but a paid/
//      hosted dependency for a field that's filled in once per doctor/clinic,
//      ever, and hand-reviewed regardless. Not built; revisit if B's guesses
//      turn out to be annoying in practice.
//
// ── Why plain rule-based transliteration alone is not good enough
// `@indic-transliteration/sanscript`'s ITRANS→Devanagari scheme is
// DETERMINISTIC — it needs the input to already encode things casual English
// spelling throws away: long vs short vowels, retroflex vs dental consonants,
// anusvara. Tested directly against common Indian names before shipping
// anything (2026-09-11):
//   "sharma" -> "शर्म"  (missing the आ — should be "शर्मा")
//   "kumar"  -> "कुमर"  (missing the आ — should be "कुमार")
//   "singh"  -> "सिन्घ" (should be "सिंह" — not even structurally close)
//   "anmol"  -> "अन्मोल" (a stray conjunct — should be "अनमोल")
// That is not "slightly off", that is wrong on the single most common
// surnames a clinic will ever see. So this file checks a CURATED dictionary
// of common first names, surnames and clinic vocabulary FIRST — hand-
// verified correct spellings — and only falls through to the raw phonetic
// engine for a word that isn't in it, where "recognisable skeleton, doctor
// fixes a matra" is an honest bar rather than "usually just wrong".
//
// This is a SUGGESTION engine, full stop. Nothing here writes to the
// database — the doctor/admin sees the guess, edits it if needed, and only
// their own confirmed text is ever stored (see `hiName()` in
// prescriptionLabels.ts, which reads what was confirmed, never this file).
// ---------------------------------------------------------------------------

import sanscriptDefault, * as sanscriptNamed from "@indic-transliteration/sanscript";
// The package's ESM/CJS interop is inconsistent across bundlers — same
// belt-and-suspenders import Sanscript's own docs recommend.
const Sanscript = (sanscriptDefault ?? (sanscriptNamed as unknown)) as {
    t: (input: string, from: string, to: string) => string;
};

/**
 * Common Indian first names, surnames and clinic/medical vocabulary, hand-
 * verified. Lookup is case-insensitive on the whole word. Deliberately not
 * exhaustive — it does not need to cover every name in India, only the
 * common ones well enough that most doctors/clinics get a correct guess with
 * nothing left to fix.
 */
const DICTIONARY: Record<string, string> = {
    // Titles
    "dr": "डॉ.", "dr.": "डॉ.",
    // Common male first names
    anmol: "अनमोल", rahul: "राहुल", amit: "अमित", rohit: "रोहित", vikram: "विक्रम",
    vijay: "विजय", ajay: "अजय", sanjay: "संजय", rajesh: "राजेश", suresh: "सुरेश",
    mahesh: "महेश", ramesh: "रमेश", naresh: "नरेश", dinesh: "दिनेश", manish: "मनीष",
    anil: "अनिल", sunil: "सुनील", deepak: "दीपक", ashok: "अशोक", vinod: "विनोद",
    pradeep: "प्रदीप", sandeep: "संदीप", rakesh: "राकेश", mukesh: "मुकेश", yogesh: "योगेश",
    jitendra: "जितेंद्र", rajendra: "राजेंद्र", mahendra: "महेंद्र", surendra: "सुरेंद्र",
    arvind: "अरविंद", ravindra: "रवींद्र", sachin: "सचिन", saurabh: "सौरभ", gaurav: "गौरव",
    nikhil: "निखिल", aakash: "आकाश", akash: "आकाश", karan: "करण", aditya: "आदित्य",
    rohan: "रोहन", varun: "वरुण", arjun: "अर्जुन", krishna: "कृष्ण", kartik: "कार्तिक",
    siddharth: "सिद्धार्थ", abhishek: "अभिषेक", harsh: "हर्ष", manoj: "मनोज", ravi: "रवि",
    vivek: "विवेक", naveen: "नवीन", praveen: "प्रवीण", sanjeev: "संजीव", rajeev: "राजीव",
    ajit: "अजीत", amol: "अमोल", vishal: "विशाल", nitin: "नितिन", kunal: "कुणाल",
    tarun: "तरुण", puneet: "पुनीत", gopal: "गोपाल", mohan: "मोहन", sohan: "सोहन",
    prakash: "प्रकाश", subhash: "सुभाष", vishwas: "विश्वास", arun: "अरुण", raj: "राज",
    // Common female first names
    priya: "प्रिया", pooja: "पूजा", puja: "पूजा", anjali: "अंजली", neha: "नेहा",
    kavita: "कविता", sunita: "सुनीता", anita: "अनीता", rekha: "रेखा", sarita: "सरिता",
    meena: "मीना", seema: "सीमा", rani: "रानी", sushma: "सुष्मा", nisha: "निशा",
    ritu: "ऋतु", shweta: "श्वेता", deepika: "दीपिका", kiran: "किरण", asha: "आशा",
    usha: "उषा", geeta: "गीता", gita: "गीता", sita: "सीता", radha: "राधा", lata: "लता",
    sarla: "सरला", kamla: "कमला", shanti: "शांति", aarti: "आरती", arti: "आरती",
    swati: "स्वाती", divya: "दिव्या", ekta: "एकता", komal: "कोमल", aparna: "अपर्णा",
    sony: "सोनी", pushpa: "पुष्पा", sarika: "सारिका",
    // Common surnames
    sharma: "शर्मा", verma: "वर्मा", gupta: "गुप्ता", kumar: "कुमार", kumari: "कुमारी",
    singh: "सिंह", agarwal: "अग्रवाल", aggarwal: "अग्रवाल", pandey: "पाण्डेय",
    pande: "पांडे", mishra: "मिश्रा", yadav: "यादव", patel: "पटेल", shah: "शाह",
    jain: "जैन", chopra: "चोपड़ा", malhotra: "मल्होत्रा", kapoor: "कपूर", khanna: "खन्ना",
    bhatia: "भाटिया", arora: "अरोड़ा", mehta: "मेहता", rao: "राव", reddy: "रेड्डी",
    nair: "नायर", iyer: "अय्यर", menon: "मेनन", pillai: "पिल्लई", naidu: "नायडू",
    chatterjee: "चटर्जी", banerjee: "बैनर्जी", mukherjee: "मुखर्जी", ghosh: "घोष",
    bose: "बोस", das: "दास", roy: "रॉय", chauhan: "चौहान", rathore: "राठौर",
    rajput: "राजपूत", thakur: "ठाकुर", tiwari: "तिवारी", tripathi: "त्रिपाठी",
    dubey: "दुबे", shukla: "शुक्ला", chaturvedi: "चतुर्वेदी", bhardwaj: "भारद्वाज",
    saxena: "सक्सेना", srivastava: "श्रीवास्तव", joshi: "जोशी", bhatt: "भट्ट",
    pathak: "पाठक", nigam: "निगम", vyas: "व्यास", trivedi: "त्रिवेदी", rastogi: "रस्तोगी",
    goyal: "गोयल", goel: "गोयल", jindal: "जिंदल", bansal: "बंसल", mittal: "मित्तल",
    khurana: "खुराना", chadha: "चड्ढा", sethi: "सेठी", kohli: "कोहली", ahuja: "आहूजा",
    chandra: "चंद्रा", prasad: "प्रसाद", sinha: "सिन्हा", jha: "झा", thakkar: "ठक्कर",
    desai: "देसाई", mehra: "मेहरा", bhagat: "भगत", pandit: "पंडित",
    // Clinic / medical vocabulary
    clinic: "क्लिनिक", clinc: "क्लिनिक", clinics: "क्लिनिक्स", hospital: "हॉस्पिटल",
    hospitals: "हॉस्पिटल्स", homeo: "होम्यो",
    homeopathy: "होम्योपैथी", care: "केयर", health: "हेल्थ", medical: "मेडिकल",
    center: "सेंटर", centre: "सेंटर", centers: "सेंटर्स", centres: "सेंटर्स",
    multi: "मल्टी", specialist: "स्पेशलिस्ट",
    speciality: "स्पेशलिटी", specialty: "स्पेशलिटी", poly: "पॉली", nursing: "नर्सिंग",
    home: "होम", city: "सिटी", family: "फैमिली", wellness: "वेलनेस", life: "लाइफ",
    new: "न्यू", global: "ग्लोबल", sanjeevani: "संजीवनी", aarogya: "आरोग्य",
    jeevan: "जीवन", solo: "सोलो", ekanki: "एकांकी", diagnostic: "डायग्नोस्टिक",
    diagnostics: "डायग्नोस्टिक्स", dental: "डेंटल", eye: "आई", skin: "स्किन",
    heart: "हार्ट", child: "चाइल्ड", childrens: "चिल्ड्रेन्स", women: "वुमेन",
    maternity: "मैटरनिटी", physio: "फिजियो", physiotherapy: "फिजियोथेरेपी",
    // Common states/cities — clinic addresses and names both carry these
    // often enough ("Bihar Homeo Clinic") that a phonetic fallback getting
    // a place name wrong (seen live: "Bihar" -> "Bइहर") is worth a fixed list.
    bihar: "बिहार", delhi: "दिल्ली", mumbai: "मुंबई", bangalore: "बैंगलोर",
    bengaluru: "बेंगलुरु", kolkata: "कोलकाता", chennai: "चेन्नई", hyderabad: "हैदराबाद",
    pune: "पुणे", jaipur: "जयपुर", lucknow: "लखनऊ", kanpur: "कानपुर", patna: "पटना",
    bhopal: "भोपाल", indore: "इंदौर", nagpur: "नागपुर", surat: "सूरत",
    ahmedabad: "अहमदाबाद", varanasi: "वाराणसी", ranchi: "रांची", gaya: "गया",
    muzaffarpur: "मुजफ्फरपुर", darbhanga: "दरभंगा", up: "यूपी", punjab: "पंजाब",
    haryana: "हरियाणा", rajasthan: "राजस्थान", gujarat: "गुजरात",
};

/** Strips a dangling word-final virama (्) that the ITRANS scheme leaves
 *  behind on any casually-spelled word not ending in an explicit vowel
 *  letter — see the file header's "anmol"/"khaas" examples. Cheap and
 *  strictly an improvement: a half-formed final consonant is never what a
 *  Hindi name actually ends in. */
function stripTrailingVirama(devanagariWord: string): string {
    return devanagariWord.replace(/्$/, "");
}

/** True if `s` contains any leftover ASCII letter. A clean ITRANS→Devanagari
 *  conversion never does — every Latin letter it recognises gets consumed
 *  into a Devanagari syllable. Seeing one left over means the engine
 *  silently gave up partway through the word (observed live: "Bihar" ->
 *  "Bइहर", the leading "B" untouched) rather than raising — that half-
 *  converted, mixed-script result is worse than showing nothing, since it
 *  reads as a typo rather than an unconverted guess. */
function hasLeftoverLatin(s: string): boolean {
    return /[a-zA-Z]/.test(s);
}

function phoneticGuess(word: string): string {
    try {
        // ITRANS is case-SENSITIVE, and gives capital letters a different
        // (usually retroflex) consonant than the lowercase form — "R" is ऱ,
        // "r" is र; "S" is ष, "s" is स. Casual English name spelling doesn't
        // intend that distinction (a name is capitalized because it's a
        // name, not to pick a retroflex sound), so every capitalized word —
        // i.e. every name — was silently getting the wrong consonant
        // (observed live: "Ram" -> "ऱम्", "Sita" -> "षित", both wrong).
        // Lowercasing first makes the engine read plain phonetics instead.
        const converted = stripTrailingVirama(Sanscript.t(word.toLowerCase(), "itrans", "devanagari"));
        if (hasLeftoverLatin(converted)) {
            return word; // partial/garbled conversion — show the plain Roman word instead of mixed script
        }
        return converted;
    } catch {
        return word; // the engine choked on something unexpected — show the Roman word rather than nothing
    }
}

/**
 * The suggestion, from Roman input. Dictionary first (case-insensitive,
 * whole word), the phonetic engine as a fallback for anything not in it.
 * Punctuation attached to a word (a trailing comma, say) rides along
 * unchanged rather than being swallowed.
 */
export function suggestDevanagari(input: string): string {
    return input
        .split(/(\s+)/) // keep the whitespace tokens so multi-space input round-trips
        .map((token) => {
            if (/^\s+$/.test(token) || !token) return token;
            const match = token.match(/^([a-zA-Z]+)([.,!?]*)$/);
            if (!match) return token; // has digits/other punctuation — leave it alone, not a name-shaped word
            const [, word, trailingPunct] = match;
            // A short, ALL-CAPS token ("SK", "MD") is almost certainly
            // initials or an abbreviation, not a spelled-out word — the
            // phonetic engine has no idea what to do with a letter name and
            // produces noise ("SK" -> "ष्ख़"). Initials print fine as Latin
            // letters inside an otherwise-Devanagari name; leave them alone.
            if (word.length <= 4 && word === word.toUpperCase()) {
                return word + trailingPunct;
            }
            const looked = DICTIONARY[word.toLowerCase()];
            if (looked) {
                // "Dr." -> "डॉ." already carries its own period; appending
                // the input's trailing "." too doubled it ("डॉ.."). Drop one
                // leading "." from what we'd otherwise append, only when the
                // dictionary hit already ends in one — a comma/"!" after a
                // period-ending entry still comes through untouched.
                const punct = looked.endsWith(".") ? trailingPunct.replace(/^\./, "") : trailingPunct;
                return looked + punct;
            }
            return phoneticGuess(word) + trailingPunct;
        })
        .join("");
}
