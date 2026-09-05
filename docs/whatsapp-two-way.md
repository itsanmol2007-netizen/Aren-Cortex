# WhatsApp two-way — how it works, and what it deliberately doesn't do

Written 2026-09-04, when the flow was built. Read this before changing
anything in `server/whatsapp/` or the Communication page.

---

## The shape of it

```
patient  ──► WhatsApp ──► Meta ──► ngrok ──► server/whatsapp/webhook.js
                                                     │
                                    ┌────────────────┴────────────────┐
                                    │                                 │
                          whatsapp_messages                    booking.js
                          (the immutable log)              (the conversation)
                                    │                                 │
                                    │                    whatsapp_conversations
                                    │                        (where we are)
                                    │                                 │
                                    │                      appointment_requests
                                    │                        (what they asked for)
                                    │                                 │
                                    └────────────► Communication page ◄┘
```

A real exchange:

| | |
|---|---|
| patient | *(taps **Book appointment** under their prescription)* |
| AREN | "Sure — when would you like to visit Sunrise Clinic?" **[Today] [Tomorrow] [This week]** |
| patient | *(taps **Tomorrow**)* |
| AREN | "Done — your appointment request for tomorrow has been sent to Sunrise Clinic. They'll confirm your time shortly." |

and a row appears in front desk's **Appointment requests** strip.

---

## Three founder decisions this is built on

Made 2026-09-04. Changing any of them is a redesign, not a tweak.

### 1. One shared AREN WhatsApp number, not one per clinic

Every clinic sends and receives through AREN's single Meta number, read from
`server/.env`. Clinics do zero setup.

The cost is that an inbound message doesn't say which clinic it's for.
`server/whatsapp/routing.js` resolves it: a patient row is per-clinic
(`patients.hospital_id`), so one human attending two clinics has two patient
rows sharing a phone. Zero matches means a stranger, one means done, two or
more means we **ask** rather than guess — routing an appointment to the wrong
clinic is a worse failure than one extra tap.

`hospital_whatsapp_config` exists and is expected to be empty. A missing row
means "enabled, booking on, use the global number". It is there so moving one
clinic onto its own WhatsApp number later is an `INSERT`, not a refactor of
every send path.

### 2. Booking produces a REQUEST, not an appointment

The bot never allocates a slot. It captures intent plus a preferred day, and a
human confirms the actual time.

This is not laziness — real slot allocation needs per-doctor schedules, slot
lengths, leave, holidays and race safety, none of which exist in this schema.
`clinic_hours` has open/close per weekday and nothing else; `doctors` has an
`availability_status` and nothing else. A bot that confidently books a time
the doctor isn't there is worse than one that promises a callback.

When real scheduling lands, `appointment_requests` becomes its inbox rather
than being replaced. `appointment_requests.visit_id` is the seam.

### 3. Interactive buttons, with keyword matching as a fallback

A tap comes back as `interactive.button_reply.id` — the exact id we sent — so
intent arrives unambiguous with nothing to parse. `intent.js` handles the
patient who ignores the buttons and types anyway: fuzzy-matched English,
roman Hindi and Devanagari, with the edit-distance budget scaled to word
length (short words like `apt` must match exactly; one edit reaches `act`,
`opt`, `ape`).

Day beats booking when both appear: "kal appointment" is someone answering
"which day", and treating it as a fresh booking would restart a flow they are
halfway through.

No LLM. Classifying "book me in" isn't worth a network hop and a per-message
bill when a tap already answered it. If intent outgrows this, the seam is
`matchKeywords()` and nothing else changes.

---

## The 24-hour rule, which shapes everything

Meta only permits a free-form (non-template) message within **24 hours of the
patient's last message**. Outside that window the Graph API *rejects* the
send — it does not silently fail.

Consequences, all of them load-bearing:

- **Opening a conversation requires an approved template.** "Here's your
  prescription" is always a template send.
- **Buttons are not templates.** `sendInteractiveButtons` only works once the
  patient has replied. The first tap has to come from a quick-reply button on
  the prescription *template* — which arrives as `button.payload`, a different
  webhook shape than `interactive.button_reply.id`. `readButtonId()` handles
  all three.
- **The inbox shows the window.** `whatsapp_conversations.last_inbound_at` is
  the clock. The Communication page renders "Reply window open · 3h left" or
  "Reply window closed" so a doctor never types a reply that cannot land.

---

## What is not built yet

**Replying from the Communication page.** The page is read-only on purpose.
Sending needs Meta credentials that cannot exist in a browser bundle, so a
reply must go through `server/` — which currently runs on a laptop behind
ngrok, not anywhere a clinic could reach. A dead text box would be worse than
an honest "read-only for now".

The gap is one authenticated `POST /api/whatsapp/reply` endpoint plus a
decision about where `server/` is hosted. **That hosting question is the real
blocker, not the endpoint.** Until the server has a stable public home, the
webhook URL also changes every time ngrok restarts and has to be re-pasted
into Meta's dashboard.

**Turning a confirmed request into a visit.** Confirming records the clinic's
decision and clears the queue. It does not add the patient to `visits` — front
desk's existing flow does that, unchanged. Conflating them would mean a
mis-tap silently adds someone to today's queue.

---

## Operational notes

- **Access tokens from the Meta dashboard are temporary** — observed expiring
  in about two hours, not the documented 24. Swap for a permanent System User
  token before this runs unattended.
- **Meta delivers no webhooks while the account is disabled for billing.** The
  webhook config verifies fine and messages simply never arrive; there is no
  error to see. Check `subscribed_apps` on the WABA and the app's
  `/subscriptions` before suspecting the code.
- **Your app must be subscribed to the WABA**, which is separate from setting
  the callback URL. `POST /{WABA_ID}/subscribed_apps`. The dashboard's
  "WA DevX Webhook Events 1P App" being listed is Meta's own test console, not
  your app — if it's the only entry, inbound messages go nowhere.
