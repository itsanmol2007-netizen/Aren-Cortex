// ---------------------------------------------------------------------------
// THE PROVIDER ADAPTER — the seam Meta sits behind.
//
//      AREN Messaging Service        ← service.js: credits, ledger, logging
//              ↓
//        Provider Adapter            ← this directory: one interface
//              ↓
//        Meta Cloud API / BSP        ← meta.js, or whatever replaces it
//
// Anmol's V1 spec: "Create a provider adapter ... so the provider can be
// swapped later without rebuilding Communication."
//
// ── What "swappable" actually costs, and why it is cheap here
//
// The temptation is to make the adapter generic — a `send(anything)` that
// passes a provider-shaped payload through. That is not an abstraction, it is
// a hole with an interface drawn around it: the caller ends up knowing
// Meta's component array anyway, and swapping providers means rewriting every
// call site regardless.
//
// So the interface is stated in AREN's OWN vocabulary — a purpose, a patient,
// a clinic — and each adapter is responsible for turning that into whatever
// its provider wants. `meta.js` builds template components; a BSP adapter
// would build something else; `mock.js` builds nothing at all. The service
// above never learns the difference.
//
// ── The interface
//
//   name: string
//   configured(): boolean          — are this provider's credentials present
//   send(message): Promise<{ providerMessageId, status }>
//
//   where `message` is:
//     { to, purpose, patientName, clinicName, doctorName,
//       documentUrl?, followUpDate?, bodyText? }
//
//   and a failure is a THROW carrying `.providerDetail` when the provider
//   said something specific — the service turns that into a refund and a
//   support alert, and neither of those decisions belongs to an adapter.
// ---------------------------------------------------------------------------

import { metaAdapter } from "./meta.js";
import { fast2smsAdapter } from "./fast2sms.js";
import { mockAdapter } from "./mock.js";

const ADAPTERS = {
    meta: metaAdapter,
    fast2sms: fast2smsAdapter,
    mock: mockAdapter,
};

/**
 * Which provider is in play.
 *
 * `MESSAGING_PROVIDER=fast2sms` (or `meta`, or `mock`) selects one explicitly.
 * An explicitly named provider is never second-guessed: if you asked for
 * fast2sms and its credentials are missing, you get an error, not a silent
 * downgrade to mock that pretends messages were delivered.
 *
 * With nothing set, auto-selection is DELIBERATELY conservative — it will
 * pick `meta` (a direct Meta app whose token is present) or fall back to
 * `mock`, but it will NOT auto-pick `fast2sms` just because a key is in the
 * env. Going live through the BSP is an explicit `MESSAGING_PROVIDER=fast2sms`
 * decision, made only once `npm run check:whatsapp` shows the number healthy
 * and the templates approved — so that merely adding the key to run that
 * read-only check can never, by itself, start putting real messages on a
 * freshly-approved number.
 */
export function resolveProvider() {
    const named = process.env.MESSAGING_PROVIDER;
    if (named) {
        const adapter = ADAPTERS[named];
        if (!adapter) {
            throw new Error(
                `MESSAGING_PROVIDER="${named}" is not a known provider (have: ${Object.keys(ADAPTERS).join(", ")})`
            );
        }
        return adapter;
    }
    if (metaAdapter.configured()) return metaAdapter;
    return mockAdapter;
}
