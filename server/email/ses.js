// ---------------------------------------------------------------------------
// AMAZON SES — the email transport.
//
// This file knows how to put one email on the wire using Amazon SES.
// It knows nothing about recharges, credits or doctors; that is `templates.js`
// (what an email says) and `notify.js` (when one is sent).
//
// Migrated from Zoho REST API to Amazon SES.
//
// Needs in environment / server/.env (or Supabase secrets for Edge Functions):
//   SES_AWS_ACCESS_KEY_ID
//   SES_AWS_SECRET_ACCESS_KEY
//   SES_AWS_REGION       (defaults to ap-south-1 if unset)
//   SES_FROM             (defaults to care@arenode.com if unset)
// ---------------------------------------------------------------------------

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

let sesClient = null;

export function getSesClient() {
    if (!sesClient) {
        const region = process.env.SES_AWS_REGION || "ap-south-1";
        const accessKeyId = process.env.SES_AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.SES_AWS_SECRET_ACCESS_KEY;

        if (!accessKeyId || !secretAccessKey) {
            throw new Error("Missing SES_AWS_ACCESS_KEY_ID or SES_AWS_SECRET_ACCESS_KEY");
        }

        sesClient = new SESClient({
            region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });
    }
    return sesClient;
}

/**
 * True when the SES credentials are present. Lets callers degrade to
 * "log it, don't send it" on a developer machine rather than throwing on
 * every notification.
 */
export function emailConfigured() {
    return Boolean(
        process.env.SES_AWS_ACCESS_KEY_ID &&
        process.env.SES_AWS_SECRET_ACCESS_KEY
    );
}

/**
 * Send one transactional email via Amazon SES.
 */
export async function sendSesMail({ to, subject, html, fromName, replyTo }) {
    const client = getSesClient();
    const fromBare = process.env.SES_FROM || "care@arenode.com";
    const fromAddress = fromName ? `${fromName} <${fromBare}>` : fromBare;

    const command = new SendEmailCommand({
        Source: fromAddress,
        Destination: {
            ToAddresses: Array.isArray(to) ? to : [to],
        },
        Message: {
            Subject: {
                Data: subject,
                Charset: "UTF-8",
            },
            Body: {
                Html: {
                    Data: html,
                    Charset: "UTF-8",
                },
            },
        },
        ReplyToAddresses: replyTo ? (Array.isArray(replyTo) ? replyTo : [replyTo]) : undefined,
    });

    return await client.send(command);
}

// Backward compatibility alias
export const sendEmail = sendSesMail;
export const sendZohoMail = sendSesMail;
