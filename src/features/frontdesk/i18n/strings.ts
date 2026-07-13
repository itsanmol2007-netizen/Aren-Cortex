// AREN Front Desk — central string dictionary (§12 of the design direction).
// Every user-facing string in this feature lives here and is read through the
// t() helper (see ./i18n.tsx). No hardcoded copy in components.
//
// Doctrine (frozen): workflow nouns stay English (patient, save, doctor,
// waiting, visit); Hindi supplies the connective tissue (karo, ho gaya, naya,
// abhi). Roman script only for Hinglish. Devanagari `hi` ships as empty stubs
// and falls back to English at render time until it is populated.
//
// Interpolation: values may contain «token» placeholders that t() replaces,
// e.g. t("toastCreated", { name: "Ramesh", t: "004" }).

export const en = {
    appTitle: "AREN Front Desk",
    appSub: "Reception Workspace",

    langEnglish: "English",
    langHinglish: "Hinglish",
    langHindi: "हिन्दी",
    langSoon: "soon",

    navFrontDesk: "Front Desk",
    navPatients: "Patients",
    navReports: "Reports",
    navSettings: "Settings",
    navSoon: "Soon",
    navToggle: "Open navigation",
    navUser: "Reception",

    launcherPlaceholder: "Search or add patient by name or phone…",
    launcherAddTitle: "Register new patient",
    existingPatients: "Existing Patients",
    registerNewNamed: 'Register new patient "«q»"',
    registerNew: "Register new patient",
    noMatch: "No matching patients",

    statTotal: "Today's Visits",
    statWaiting: "Waiting",
    statConsult: "In Consultation",
    statCompleted: "Completed",

    queueTitle: "Today's Visits",
    tabAll: "All",
    tabWaiting: "Waiting",
    tabConsult: "In Consultation",
    tabCompleted: "Completed",

    stWaiting: "Waiting",
    stConsult: "In Consultation",
    stCompleted: "Completed",
    stCancelled: "Cancelled",
    stReferred: "Referred",

    returning: "Returning",
    returningTip: "«n» visits · Last visit «date»",
    lastVisit: "Last visit",
    waitingFor: "Waiting «m» min",
    waitingNow: "Just arrived",

    greetingMorning: "Good morning",
    greetingAfternoon: "Good afternoon",
    greetingEvening: "Good evening",

    emptyMorningBody: "Your first patient will appear here. Search or add them above.",
    emptyTabWaiting: "No one is waiting right now",
    emptyTabConsult: "No one is with a doctor right now",
    emptyTabCompleted: "Nothing completed yet",
    emptyGeneric: "No patients in this view",
    dayDoneTitle: "All done for today",
    dayDoneBody: "Every visit is completed. Nice work.",

    sumTitle: "Today's Summary",
    currentToken: "Current Token",
    avgWait: "Average Wait",
    min: "min",

    doctorsTitle: "Doctors",
    noDoctors: "No doctors on file",
    queueLabel: "Queue",
    docBusy: "With #«t»",
    docFree: "Free",
    docOff: "Off duty",

    requestsTitle: "Doctor Requests",
    noRequests: "No requests right now",
    simulate: "⚡ Simulate a doctor request",

    back: "Back",
    newVisit: "New Visit",
    registerVisit: "Register Patient",
    intakeEyebrow: "Patient Intake",
    detEyebrow: "Visit Details",
    secPatient: "Patient Details",
    secVisit: "Today's Visit",
    optional: "Optional",
    symCatalog: "Symptom Catalog",
    prefillFrom: "«n» past visit(s)",
    fldName: "Full Name",
    fldPhone: "Phone Number",
    fldAge: "Age",
    fldGender: "Gender",
    fldSymptoms: "Today's Symptoms",
    fldDoctor: "Assigned Doctor",
    phName: "e.g. Ramesh Kumar",
    phPhone: "10-digit mobile",
    phAge: "e.g. 34",
    phSymp: "Search symptoms…",
    noSymptomMatch: "No matching symptom",
    errSymptom: "Add at least one symptom",
    selectGender: "Select",
    male: "Male",
    female: "Female",
    other: "Other",
    cancel: "Cancel",
    save: "Save Visit",
    saving: "Saving…",
    errRequired: "Please fill this",
    errPhone10: "Enter a 10-digit mobile number",

    detSymptoms: "Symptoms",
    noSymptoms: "No symptoms recorded",
    detDoctor: "Assigned Doctor",
    detStatus: "Change Status",
    detPast: "Recent Visits",
    detFullHistory: "Open full patient history",

    menuOpen: "Open Patient",
    menuMove: "Move to Another Doctor",
    menuComplete: "Mark Completed",
    menuCancel: "Cancel Visit",

    toastCreated: "«name» added · #«t»",
    undo: "Undo",
    toastUndone: "Visit removed",
    toastStatus: "«name» → «status»",
    toastAck: "Request cleared",
} as const;

export type StringKey = keyof typeof en;

// Hinglish — Roman-script spoken Hindi. Where a value equals the English one
// (workflow nouns), it is intentionally repeated so nothing falls through.
export const hinglish: Record<StringKey, string> = {
    appTitle: "AREN Front Desk",
    appSub: "Reception Workspace",

    langEnglish: "English",
    langHinglish: "Hinglish",
    langHindi: "हिन्दी",
    langSoon: "jaldi",

    navFrontDesk: "Front Desk",
    navPatients: "Patients",
    navReports: "Reports",
    navSettings: "Settings",
    navSoon: "Jaldi",
    navToggle: "Menu kholo",
    navUser: "Reception",

    launcherPlaceholder: "Patient search karo ya naya add karo…",
    launcherAddTitle: "Naya patient add karo",
    existingPatients: "Purane Patients",
    registerNewNamed: 'Naya patient add karo "«q»"',
    registerNew: "Naya patient add karo",
    noMatch: "Koi patient nahi mila",

    statTotal: "Aaj ke Visits",
    statWaiting: "Waiting",
    statConsult: "Andar",
    statCompleted: "Ho gaya",

    queueTitle: "Aaj ke Visits",
    tabAll: "Sab",
    tabWaiting: "Waiting",
    tabConsult: "Andar",
    tabCompleted: "Ho gaya",

    stWaiting: "Waiting",
    stConsult: "Andar",
    stCompleted: "Ho gaya",
    stCancelled: "Cancel",
    stReferred: "Refer",

    returning: "Purana",
    returningTip: "«n» baar aaye · Pichhli baar «date»",
    lastVisit: "Pichhli baar",
    waitingFor: "«m» min se waiting",
    waitingNow: "Abhi aaya",

    greetingMorning: "Good morning",
    greetingAfternoon: "Namaste",
    greetingEvening: "Good evening",

    emptyMorningBody: "Pehla patient yahan dikhega. Upar se search ya add karo.",
    emptyTabWaiting: "Abhi koi wait nahi kar raha",
    emptyTabConsult: "Abhi koi andar nahi hai",
    emptyTabCompleted: "Abhi tak kuch complete nahi hua",
    emptyGeneric: "Yahan koi patient nahi hai",
    dayDoneTitle: "Aaj ka kaam ho gaya",
    dayDoneBody: "Sab visits complete. Badhiya kaam!",

    sumTitle: "Aaj ka Hisaab",
    currentToken: "Abhi chal raha",
    avgWait: "Average Wait",
    min: "min",

    doctorsTitle: "Doctors",
    noDoctors: "Koi doctor nahi mila",
    queueLabel: "Line",
    docBusy: "#«t» ke saath",
    docFree: "Free",
    docOff: "Aaj nahi",

    requestsTitle: "Doctor ne Manga",
    noRequests: "Abhi kuch nahi",
    simulate: "⚡ Doctor request test karo",

    back: "Wapas",
    newVisit: "Naya Visit",
    registerVisit: "Patient Add Karo",
    intakeEyebrow: "Patient Intake",
    detEyebrow: "Visit Details",
    secPatient: "Patient ki Details",
    secVisit: "Aaj ka Visit",
    optional: "Optional",
    symCatalog: "Symptom List",
    prefillFrom: "«n» baar pehle aaye hain",
    fldName: "Poora Naam",
    fldPhone: "Phone Number",
    fldAge: "Umar",
    fldGender: "Gender",
    fldSymptoms: "Aaj ki Problem",
    fldDoctor: "Doctor",
    phName: "jaise Ramesh Kumar",
    phPhone: "10 digit mobile",
    phAge: "jaise 34",
    phSymp: "Symptom search karo…",
    noSymptomMatch: "Koi symptom nahi mila",
    errSymptom: "Kam se kam ek symptom chuno",
    selectGender: "Chuno",
    male: "Male",
    female: "Female",
    other: "Other",
    cancel: "Rehne do",
    save: "Save Karo",
    saving: "Save ho raha…",
    errRequired: "Yeh bharna zaroori hai",
    errPhone10: "10 digit ka mobile number daalo",

    detSymptoms: "Problem",
    noSymptoms: "Koi problem likhi nahi",
    detDoctor: "Doctor",
    detStatus: "Status Badlo",
    detPast: "Pichhle Visits",
    detFullHistory: "Poori history dekho",

    menuOpen: "Patient Kholo",
    menuMove: "Doosre Doctor ko do",
    menuComplete: "Ho gaya Mark karo",
    menuCancel: "Cancel karo",

    toastCreated: "«name» add ho gaya · #«t»",
    undo: "Wapas",
    toastUndone: "Visit hata diya",
    toastStatus: "«name» → «status»",
    toastAck: "Ho gaya",
};

// Devanagari Hindi — empty stubs for now (architecture slot). Every key is
// present but blank; t() falls back to English until these are filled in.
export const hi: Record<StringKey, string> = Object.fromEntries(
    (Object.keys(en) as StringKey[]).map((k) => [k, ""])
) as Record<StringKey, string>;

export type Lang = "en" | "hinglish" | "hi";

export const DICTS: Record<Lang, Record<StringKey, string>> = {
    en,
    hinglish,
    hi,
};

// Language menu (header dropdown). `soon` marks a not-yet-ready language that
// renders disabled with a "soon" tag. English is the default.
export const LANGS: { code: Lang; labelKey: StringKey; soon?: boolean }[] = [
    { code: "en", labelKey: "langEnglish" },
    { code: "hinglish", labelKey: "langHinglish" },
    { code: "hi", labelKey: "langHindi", soon: true },
];
