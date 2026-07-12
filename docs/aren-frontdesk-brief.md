# AREN Front Desk — Design Brief

## What this is
The receptionist's workspace. She opens it every morning. She uses it 
8 hours a day. It has to feel calm, alive, and unmistakably ours.

## Who uses it
Indian receptionist, 18–35, phone-native (Instagram, WhatsApp, Reels), 
not tech-literate in the traditional sense but visually fluent. English 
is her second language. Hinglish is how she actually talks.

## What it does
- Search or create a patient (unified into one bar)
- Register a new visit (existing patient = 2 fields; new patient = full form)
- Show today's queue with clear status
- Change visit status (Waiting → In Consultation → Completed)
- Show which doctor is doing what right now
- Show doctor requests (future — mocked for now)

That's it. This is not a dashboard. This is not analytics. The queue 
IS the product.

## Brand identity — read this carefully
AREN's palette is calm neutrals with restrained semantic color:
- Blue = primary action, In Consultation
- Amber = Waiting
- Green = Completed / free / online
- Soft violet/purple = brand accent (Cortex kinship). Use it. Focus rings, 
  subtle gradients, hover glows, the "AREN" wordmark, decorative touches. 
  Not dominant, not scattered, but PRESENT. This is what makes it feel 
  like AREN and not a generic SaaS template.
- Soft pink = allowed as a warm accent in decorative flourishes, illustrations, 
  or the morning welcome state. Use sparingly.
- Gray = information, structure

The interface should feel like Linear crossed with a warm Indian sensibility. 
Not corporate. Not sterile. Not a hospital admin panel. Something a 24-year-old 
would enjoy opening.

## Workflow reference
`design/aren-frontdesk-v2.html` is the workflow reference. It shows:
- What components exist and where they live
- What clicking each thing does
- What the tabs, filters, modals, and toasts do
- What Hinglish tone sounds like

DO NOT copy the visual design of the prototype. It was a rough draft made 
in a chat. The React version should be genuinely better designed — richer, 
more alive, with real visual identity. Take the workflow, discard the polish, 
build your own.

## The morning problem
Every morning at 9am the queue is empty. Four zeros across the top, empty 
queue panel, dashes in the sidebar. This is the first thing she sees. 
Currently it looks broken. It should feel like an invitation to start the day. 
Design the empty state as a first-class experience, not an afterthought.

Same for the Patient Launcher when idle — it should feel like a warm surface, 
not a blank input field.

## Language
Two languages ship: English and Hinglish (Roman-script spoken Hindi, not 
formal Devanagari). Hinglish tone examples:
- "Patient search karo ya naya add karo" (not "मरीज़ खोजें")
- "Abhi koi wait nahi kar raha" (not "प्रतीक्षारत नहीं है")
- "Save karo" / "Ho gaya" / "Naya patient add karo"
Workflow words stay English (patient, save, doctor, waiting) with Hindi 
connective tissue (karo, ban gaya, naya, abhi).

Third language slot (Devanagari Hindi) should exist in the architecture 
but the strings can be blank / TODO. Add it later.

## Keyboard-ready architecture (not implemented now — just leave room)
No shortcuts needed today. But structure things so they can be added later 
without a rewrite:
- Queue rows: give the row container `role="option"` and the queue wrapper 
  `role="listbox"`, with a `data-token` or similar identifier — so arrow-key 
  navigation can be wired later without touching row markup.
- Visit actions (start consult, complete, cancel, open modal, etc.) should 
  each be a plain callable function on their own (already true via 
  useVisitActions) — not buried inline in JSX handlers — so a future 
  keyboard-shortcut registry can call the same functions a click would.
- Don't build the registry, don't add key listeners, don't add a shortcuts 
  UI. Just don't make future keyboard nav require restructuring components.


## What's frozen vs. what's yours

FROZEN (do not redesign):
- Two-column layout (queue left, sidebar right)
- Patient Launcher as its own dedicated row above the stats
- Four stat cards: Today / Waiting / In Consultation / Completed
- Queue with tabs (All / Waiting / In Consultation / Completed)
- Row content order: token → name → symptoms → doctor → last visit → status
- Sidebar cards: Today's Summary + Doctors + Doctor Requests
- Modals for visit detail and visit creation
- Row status via left border stripe + subtle ambient tint
- Doctor Requests card is mock-only (no DB)

YOURS (design freely):
- Color depth, gradients, glass effects, warm accents
- Typography weight and rhythm
- Decorative SVGs, patterns, illustrations, textures
- Empty states — make them warm and inviting, not sterile
- Icon choices and weights
- Micro-interactions (hover, focus, active, transitions)
- The Patient Launcher's idle "personality"
- Card treatments and depth
- The morning welcome experience
- How the AREN brand feels

You are the designer. Anmol will react to your design. Aim to surprise him.

## Understanding the Real User

Before making any design decisions, remember who this product is actually for.

The primary user is a clinic receptionist in India, typically between 18–35 years old. She is comfortable using smartphones and spends hours every day on apps like WhatsApp, Instagram, YouTube and UPI apps. She is visually fluent and quickly understands modern interfaces, but she is not traditionally "computer literate." She does not think in terms of modules, workflows, or enterprise software.

She isn't interested in learning AREN. She wants to register patients, answer questions, manage the queue, and move to the next person as quickly as possible.

Her environment is busy and frequently interrupted. Patients are waiting, doctors are calling, phones are ringing, and people are asking questions while she is using the software. Attention is constantly divided.

The software should never require her to remember where something lives or how a workflow works. She should always feel confident about what is happening, where she is, and what the next obvious action is.

Most clinics will not have premium hardware. Expect 1366×768 or similar monitors, average keyboards and mice, and ordinary office environments with varying lighting conditions.

The goal is not to impress her with beautiful UI. The goal is for the interface to quietly disappear after a few days of use. If she stops thinking about the software and simply does her job faster and with fewer mistakes, the design has succeeded.

Whenever you make a design decision, optimize for confidence, clarity and continuity rather than novelty. The product should feel approachable on the first day and effortless after the tenth.

## Non-negotiables
- All styling in Tailwind utility classes in the .tsx files. No separate CSS.
  Exception: the row-tint gradients can use inline style=.
- All DB calls stay in src/lib/db/ files.
- All user-facing strings go through a t('key') helper reading from a 
  strings.ts file. No hardcoded English in components.
- Add en and hinglish keys now. Add hi key as empty stubs.
- Language dropdown lives in the header top-right. Default English.
- Touch targets minimum 44px.
- Must look good at 1366×768 and 1920×1080. Test both.

## What already exists (do not rebuild — extend)
Session 33 built the plumbing correctly:
- src/features/frontdesk/ folder with all components scaffolded
- src/features/frontdesk/hooks/useQueue.ts and useVisitActions.ts working
- src/lib/db/patients.ts has all needed DB functions
- Routing in main.tsx to /app/frontdesk works
- DB connection to Supabase confirmed working
- Doctor avatar + availability_status columns wired

Your job is to make the interface look and feel like AREN, and add the 
i18n architecture that was missed.