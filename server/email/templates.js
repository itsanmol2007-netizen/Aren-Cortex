// ---------------------------------------------------------------------------
// WHAT AN OPERATIONAL EMAIL SAYS — every one of them, in one file.
//
// Anmol's V1 spec, §7: "All emails should go through one centralized
// function/service, rather than individual pages implementing their own email
// logic." This is the "what it says" half of that; `notify.js` is the "when".
//
// ── The rule every template here obeys
//
// **Enough information to act, in the first screen, without opening anything.**
// An alert that says "a doctor is low on credits" and nothing else costs the
// reader a database lookup before they can do their job, and an alert that
// costs a lookup is an alert that gets triaged later. So every template names
// the doctor, the clinic, the number, and the id to quote back.
//
// ── Why HTML and not text
//
// One reason only: a table renders. These are read on a phone, and "Doctor /
// Clinic / Balance / Request id" as labelled rows is scannable in a way four
// lines of prose is not. The HTML is deliberately plain — inline styles, no
// images, no external CSS — because that is what survives every mail client
// and what keeps a transactional email out of a spam filter.
// ---------------------------------------------------------------------------

/** HTML-escape. Every value below is interpolated through this — a clinic
 *  named "Smith & Sons <Dental>" must not break the email, and a value that
 *  came from a patient must never be able to inject markup. */
function esc(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** IST, spelled out. A UTC timestamp in an alert about an Indian clinic is a
 *  small tax on every read; "06 Sep 2026, 12:30 PM" needs no conversion. */
function istTime(at = new Date()) {
    return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit", month: "short", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
    }).format(at);
}

function credits(n) {
    return new Intl.NumberFormat("en-IN").format(Number(n ?? 0));
}

function rupees(n) {
    return `₹${new Intl.NumberFormat("en-IN").format(Number(n ?? 0))}`;
}

const SHELL = (inner) =>
    `<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1f2937;max-width:560px">${inner}</div>`;

/** The labelled-rows block every template's body is made of. */
function facts(rows) {
    const cells = rows
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(
            ([label, value]) =>
                `<tr>` +
                `<td style="padding:5px 14px 5px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(label)}</td>` +
                `<td style="padding:5px 0;color:#111827;font-weight:600">${esc(value)}</td>` +
                `</tr>`
        )
        .join("");
    return `<table style="border-collapse:collapse;margin:10px 0 14px">${cells}</table>`;
}

/**
 * The band at the top of an actionable email: who, and the reference to quote
 * back. Both were previously just two more rows in the fact table, which made
 * them exactly as prominent as "Time" — and they are the only two a reader
 * needs before deciding whether to act now.
 */
function subject_band({ who, sub, ref, tone = "#1268e8", soft = "#eef4fe" }) {
    return (
        `<table style="border-collapse:separate;width:100%;background:${esc(soft)};` +
        `border-radius:10px;margin:0 0 14px"><tr>` +
        `<td style="padding:12px 14px">` +
        `<div style="font-size:16px;font-weight:700;color:#111827;line-height:1.3">${esc(who)}</div>` +
        (sub ? `<div style="font-size:13px;color:#4b5563;margin-top:2px">${esc(sub)}</div>` : "") +
        `</td>` +
        (ref
            ? `<td align="right" style="padding:12px 14px;white-space:nowrap;vertical-align:top">` +
              `<div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af">Reference</div>` +
              `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;font-weight:700;color:${esc(tone)};margin-top:2px">${esc(ref)}</div>` +
              `</td>`
            : "") +
        `</tr></table>`
    );
}

/** The number the whole email is about, stated once and large. */
function headline_figure(value, label, tone = "#1268e8") {
    return (
        `<div style="margin:0 0 14px">` +
        `<div style="font-size:28px;font-weight:800;color:${esc(tone)};line-height:1.1">${esc(value)}</div>` +
        `<div style="font-size:12px;color:#6b7280;margin-top:2px">${esc(label)}</div>` +
        `</div>`
    );
}

function heading(text, tone = "#1268e8") {
    return `<p style="margin:0 0 4px;font-size:15px;font-weight:700;color:${esc(tone)}">${esc(text)}</p>`;
}

function footer(note) {
    return `<p style="margin:14px 0 0;padding-top:10px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">${esc(note)}</p>`;
}

// ── The templates ──────────────────────────────────────────────────────────
//
// Each returns { subject, html }. `ctx` is whatever `notify.js` resolved from
// the ids it was handed — these functions do no lookups of their own, so a
// template can be read and changed without knowing the schema.

export const TEMPLATES = {
    /**
     * A doctor wants to buy credits. The one email in this file with real
     * urgency attached: until somebody acts on it, a doctor has paid nothing
     * and received nothing, and their balance keeps falling.
     */
    recharge_request(ctx) {
        return {
            subject: `AREN — Credit Recharge Request — ${ctx.doctorName} (${ctx.reference || "new"})`,
            html: SHELL(
                heading("Credit recharge request") +
                subject_band({ who: ctx.doctorName, sub: ctx.clinicName, ref: ctx.reference }) +
                headline_figure(
                    `${credits(ctx.credits)} credits · ${rupees(ctx.amount)}`,
                    ctx.packageLabel ? `Package: ${ctx.packageLabel}` : "Requested"
                ) +
                facts([
                    ["Balance when asked", `${credits(ctx.balance)} credits`],
                    ["Requested at", istTime()],
                    ["Doctor note", ctx.note],
                ]) +
                `<p style="margin:0;color:#374151">Verify the payment, then approve the request — approval is what actually adds the credits.</p>` +
                footer(
                    "Nothing has been credited yet. If nobody actions this within 3 hours the doctor " +
                    "can withdraw it themselves and raise a fresh one."
                )
            ),
        };
    },

    /**
     * The doctor gave up waiting.
     *
     * Its own email rather than a line in a digest, because it means something
     * specific and time-sensitive: somebody asked, nobody called, and they have
     * now taken it back. If AREN was mid-conversation about this request, that
     * conversation is about a request that no longer exists.
     */
    recharge_cancelled(ctx) {
        return {
            subject: `AREN — Recharge Request Withdrawn — ${ctx.doctorName} (${ctx.reference || ""})`,
            html: SHELL(
                heading("Recharge request withdrawn", "#b45309") +
                subject_band({
                    who: ctx.doctorName, sub: ctx.clinicName, ref: ctx.reference,
                    tone: "#b45309", soft: "#fef6e7",
                }) +
                facts([
                    ["Had asked for", `${credits(ctx.credits)} credits · ${rupees(ctx.amount)}`],
                    ["Waited", ctx.waited],
                    ["Balance now", `${credits(ctx.balance)} credits`],
                    ["Withdrawn at", istTime()],
                ]) +
                `<p style="margin:0;color:#374151">They waited three hours without hearing back and withdrew it. ` +
                `They can raise a fresh request immediately — if one has already arrived, action that one instead.</p>` +
                footer("Nothing was charged and no credits moved.")
            ),
        };
    },

    low_credit(ctx) {
        return {
            subject: `AREN — Low Messaging Credits — ${ctx.doctorName}`,
            html: SHELL(
                heading("Low messaging credits", "#b45309") +
                facts([
                    ["Doctor", ctx.doctorName],
                    ["Clinic", ctx.clinicName],
                    ["Remaining credits", credits(ctx.balance)],
                    ["Sent so far", `${credits(ctx.spent)} messages`],
                    ["Time", istTime()],
                ]) +
                `<p style="margin:0;color:#374151">Recharge may be required. They can still send until the balance reaches zero.</p>`
            ),
        };
    },

    /** Balance hit zero. Different email from the one above on purpose: this
     *  one is not a heads-up, it is a doctor who can no longer message. */
    credits_exhausted(ctx) {
        return {
            subject: `AREN — Messaging Credits Exhausted — ${ctx.doctorName}`,
            html: SHELL(
                heading("Messaging credits exhausted", "#b91c1c") +
                facts([
                    ["Doctor", ctx.doctorName],
                    ["Clinic", ctx.clinicName],
                    ["Remaining credits", "0"],
                    ["Time", istTime()],
                ]) +
                `<p style="margin:0;color:#374151">No further prescriptions or follow-ups will send for this doctor until credits are added.</p>`
            ),
        };
    },

    /** One message did not reach a patient. Names the patient, because "a
     *  message failed" is not something anybody can act on. */
    message_failed(ctx) {
        return {
            subject: "AREN — WhatsApp Message Failed",
            html: SHELL(
                heading("WhatsApp message failed", "#b91c1c") +
                facts([
                    ["Patient", ctx.patientName || ctx.phone],
                    ["Doctor", ctx.doctorName],
                    ["Clinic", ctx.clinicName],
                    ["Message type", ctx.purposeLabel],
                    ["Status", "Failed"],
                    ["Reason", ctx.reason],
                    ["Message ID", ctx.reference],
                    ["Time", istTime()],
                ]) +
                footer("The credit for this message has been refunded to the doctor.")
            ),
        };
    },

    /**
     * The provider itself is unhealthy — an expired token, a disabled WABA, a
     * Graph API outage. Distinct from `message_failed`: that is one patient,
     * this is every message from now until somebody fixes it.
     */
    provider_error(ctx) {
        return {
            subject: `AREN — WhatsApp Provider Error (${ctx.provider})`,
            html: SHELL(
                heading("WhatsApp provider error", "#b91c1c") +
                facts([
                    ["Provider", ctx.provider],
                    ["Operation", ctx.operation],
                    ["Clinic", ctx.clinicName],
                    ["Error", ctx.reason],
                    ["Time", istTime()],
                ]) +
                `<p style="margin:0;color:#374151">Every send is affected until this clears, not just this one. Check the access token and the WABA subscription first — both expire quietly.</p>`
            ),
        };
    },

    /** A patient replied. Low urgency by design — V1 does not let a doctor
     *  reply from AREN, so this is a nudge to look, not a task. */
    patient_message(ctx) {
        return {
            subject: `AREN — New Patient Message — ${ctx.clinicName}`,
            html: SHELL(
                heading("New patient message") +
                facts([
                    ["Patient", ctx.patientName || ctx.phone],
                    ["Clinic", ctx.clinicName],
                    ["Time", istTime()],
                ]) +
                (ctx.preview ? `<p style="margin:0 0 12px;color:#374151">“${esc(ctx.preview)}”</p>` : "")
            ),
        };
    },

    /** The catch-all, so a new operational event can be wired in an hour
     *  rather than waiting for its own template. */
    support_request(ctx) {
        return {
            subject: `AREN — Support Request — ${ctx.clinicName}`,
            html: SHELL(
                heading("Support request") +
                facts([
                    ["Doctor", ctx.doctorName],
                    ["Clinic", ctx.clinicName],
                    ["Subject", ctx.topic],
                    ["Time", istTime()],
                ]) +
                (ctx.message ? `<p style="margin:0;color:#374151">${esc(ctx.message)}</p>` : "")
            ),
        };
    },
};

export function renderEmail(kind, ctx) {
    const template = TEMPLATES[kind];
    if (!template) throw new Error(`renderEmail: no template for "${kind}"`);
    return template(ctx);
}
